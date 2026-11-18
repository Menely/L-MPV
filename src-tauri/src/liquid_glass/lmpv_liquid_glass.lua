local mp = require "mp"
local utils = require "mp.utils"
local base = utils.split_path(debug.getinfo(1, "S").source:sub(2))
package.path = utils.join_path(base, "?.lua") .. ";" .. package.path

local glass = require("glass").new(base)
local layout_util = require "classic.layout"
local draw = require "classic.draw"
local input_module = require "classic.input"

local BOUNDS = "user-data/lmpv-liquid-glass-bounds"
local ACTIONS = "user-data/lmpv-liquid-glass-actions"
local overlay = mp.create_osd_overlay("ass-events")
local state = {
    duration = 0, time = 0, pause = true, volume = 100, max_volume = 100, mute = false, seek_step = 10,
    can_prev = false, can_next = false, tracks = {},
    labels = { audio = "Audio", subtitles = "Subtitles", off = "Off" },
}
local options, dimensions, rendered_dimensions, layout, menu, clip
local geometry_dirty = true
local material_dirty = true
local active = false
local loaded_media = not mp.get_property_bool("idle-active", true)
local last_bounds
local actions, action_id = {}, 0
local timer

local function request_render()
    if not timer:is_enabled() then timer:resume() end
end

local function publish_actions()
    mp.set_property_native(ACTIONS, actions)
end

local input = input_module.new(request_render, function(name)
    if #actions >= 32 then return end
    action_id = action_id + 1
    actions[#actions + 1] = { id = action_id, name = name }
    publish_actions()
end)

local function publish_bounds()
    local regions = {}
    if active then
        local function add(rect, kind)
            regions[#regions + 1] = {
                x = rect.x / dimensions.w, y = rect.y / dimensions.h,
                w = rect.w / dimensions.w, h = rect.h / dimensions.h, kind = kind,
            }
        end
        add(layout.panel, "panel")
        if menu then add(menu.rect, "menu") end
    end
    local json = utils.format_json(regions)
    if last_bounds ~= json then
        mp.set_property_native(BOUNDS, regions)
        last_bounds = json
    end
end

local function track_entries(kind)
    local entries = {}
    if kind == "subtitles" then
        entries[1] = { id = "no", label = state.labels.off, selected = true }
    end
    local expected = kind == "audio" and "audio" or "sub"
    for _, track in ipairs(state.tracks) do
        if track.type == expected and track.id then
            local fallback = track.lang or ("#" .. track.id)
            entries[#entries + 1] = {
                id = tostring(track.id), label = track.title and track.title ~= "" and track.title or fallback,
                selected = track.selected,
            }
            if kind == "subtitles" and track.selected then entries[1].selected = false end
        end
    end
    return entries
end

local function hide()
    if not active then return end
    active = false
    input.reset()
    layout, menu, clip, rendered_dimensions = nil, nil, nil, nil
    geometry_dirty, material_dirty = true, true
    glass.clear()
    overlay:remove()
    publish_bounds()
end

local function render()
    if not (options and options.visible and loaded_media and dimensions and dimensions.w > 0 and dimensions.h > 0) then
        hide()
        return
    end
    if geometry_dirty then
        layout = layout_util.panel(dimensions.w, dimensions.h, options.width, options.docked, state.duration)
        rendered_dimensions = dimensions
        geometry_dirty = false
        material_dirty = true
    end
    local former = menu and menu.rect
    menu = input.menu and layout_util.menu(layout, track_entries(input.menu), input.offset) or nil
    if not menu then input.menu = nil end
    local current = menu and menu.rect
    local bounds_changed = material_dirty or (former == nil) ~= (current == nil)
        or (former and current and former.h ~= current.h)
    if bounds_changed then
        clip = glass.update(dimensions, { layout.panel, current }, layout.scale, options.blur)
        material_dirty = false
    end
    local showing = not active
    local data = draw.render(layout, state, input, menu, clip)
    -- remove() clears mpv's overlay while the Lua object still holds its last data.
    if showing or overlay.res_x ~= dimensions.w or overlay.res_y ~= dimensions.h or overlay.data ~= data then
        overlay.res_x, overlay.res_y, overlay.data, overlay.hidden = dimensions.w, dimensions.h, data, false
        overlay:update()
    end
    active = true
    if showing or bounds_changed then publish_bounds() end
end

timer = mp.add_timeout(1 / 60, render, true)

mp.register_script_message("config", function(json)
    local config = utils.parse_json(json)
    if type(config) ~= "table" then
        options = nil
        hide()
        return
    end
    options = {
        visible = config.visible == true,
        docked = config.docked == true,
        width = math.max(0, tonumber(config.width) or 0),
        blur = math.max(0, math.min(100, tonumber(config.blur) or 30)),
    }
    state.fullscreen = config.fullscreen == true
    state.seek_step = math.max(1, math.min(300, math.floor(tonumber(config.seekStep) or 10)))
    for key, value in pairs(config.labels or {}) do
        if state.labels[key] and type(value) == "string" then state.labels[key] = value end
    end
    geometry_dirty = true
    if not options.visible then hide() else request_render() end
end)

mp.register_script_message("pointer", function(kind, x, y)
    local nx, ny = tonumber(x), tonumber(y)
    if active and nx and ny then
        input.handle(kind, nx * rendered_dimensions.w, ny * rendered_dimensions.h, layout, state, menu)
    end
end)

mp.register_script_message("ack", function(id)
    local acknowledged = tonumber(id) or 0
    local remaining = {}
    for _, action in ipairs(actions) do
        if action.id > acknowledged then remaining[#remaining + 1] = action end
    end
    actions = remaining
    publish_actions()
end)

mp.observe_property("osd-dimensions", "native", function(_, value)
    dimensions = value
    geometry_dirty = true
    request_render()
end)
mp.observe_property("video-out-params", "native", function()
    material_dirty = true
    request_render()
end)
mp.observe_property("current-vo", "string", function()
    material_dirty = true
    request_render()
end)
mp.observe_property("duration", "number", function(_, value)
    state.duration = value or 0
    geometry_dirty = true
    request_render()
end)
mp.observe_property("track-list", "native", function(_, value)
    state.tracks = value or {}
    request_render()
end)
local function playlist_changed()
    local position = mp.get_property_number("playlist-pos", -1)
    local count = mp.get_property_number("playlist-count", 0)
    state.can_prev, state.can_next = position > 0, position >= 0 and position + 1 < count
    request_render()
end
mp.observe_property("playlist-pos", "number", playlist_changed)
mp.observe_property("playlist-count", "number", playlist_changed)

for _, property in ipairs({
    { "time-pos", "number", "time", 0 }, { "volume", "number", "volume", 100 },
    { "volume-max", "number", "max_volume", 100 }, { "pause", "bool", "pause", true },
    { "mute", "bool", "mute", false },
}) do
    local name, format, key, default = property[1], property[2], property[3], property[4]
    mp.observe_property(name, format, function(_, value)
        state[key] = value == nil and default or value
        request_render()
    end)
end

mp.register_event("file-loaded", function()
    loaded_media = true
    material_dirty = true
    request_render()
end)
mp.register_event("end-file", function()
    loaded_media = false
    hide()
end)
mp.register_event("shutdown", function()
    hide()
    glass.shutdown()
end)

publish_bounds()
publish_actions()
