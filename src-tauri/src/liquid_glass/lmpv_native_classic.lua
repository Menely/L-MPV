local mp = require "mp"
local utils = require "mp.utils"
local base = utils.split_path(debug.getinfo(1, "S").source:sub(2))
local draw = dofile(utils.join_path(base, "classic_draw.lua"))
local layout = dofile(utils.join_path(base, "classic_layout.lua"))
local icons = dofile(utils.join_path(base, "floating_icons.lua"))
local shader = utils.join_path(base, "floating_glass.glsl")
local overlay = mp.create_osd_overlay("ass-events")
local bounds_key = "user-data/lmpv-native-classic-bounds"
local action_key = "user-data/lmpv-native-classic-action"
local material_key = "user-data/lmpv-classic-material"
local options, current, menu, pressed = nil, nil, nil, nil
local cursor, installed, material_signature, bounds_signature = {}, false, nil, ""
local queued = nil
local action_serial, track_offset = 0, 0

local function clamp(value, min, max)
    return math.min(max, math.max(min, value))
end

local function publish_bounds(rects)
    local json = utils.format_json(rects)
    if json == bounds_signature then return end
    bounds_signature = json
    mp.set_property_native(bounds_key, rects)
end

local function shell_action(name)
    action_serial = action_serial + 1
    mp.set_property_native(action_key, { id = action_serial, name = name })
end

local function remove_material()
    if installed then
        mp.commandv("change-list", "glsl-shaders", "remove", shader)
        mp.set_property_native(material_key, false)
    end
    installed, material_signature = false, nil
end

local function apply_material(panel, d, w, h)
    local vw, vh = d.w - d.ml - d.mr, d.h - d.mt - d.mb
    if vw <= 0 or vh <= 0 or mp.get_property("current-vo") ~= "gpu-next"
        or mp.get_property_number("video-out-params/rotate", 0) % 360 ~= 0 then
        remove_material()
        return false
    end
    local x, y = (panel.x * d.w / w - d.ml) / vw, (panel.y * d.h / h - d.mt) / vh
    local bw, bh = panel.w * d.w / w / vw, panel.h * d.h / h / vh
    if x >= 1 or y >= 1 or x + bw <= 0 or y + bh <= 0 then
        remove_material()
        return false
    end
    local blur = clamp(options.blur or 30, 0, 100) / 100
    local settings = ("mzg_on=1,mzg_lens=0.65,mzg_shadow=0,mzg_tone=0.68,lg_blur=%.2f,"
        .. "mzg_unit=%.7f,mzg_0x=%.6f,mzg_0y=%.6f,mzg_0w=%.6f,mzg_0h=%.6f,mzg_0r=%.6f,mzg_0a=%.6f,mzg_0f=%.3f"):format(
        blur, d.h / h / vh, x, y, bw, bh, panel.radius * d.h / h / vh,
        clamp(options.opacity or 0.88, 0.1, 1), blur)
    if material_signature ~= settings then
        if not mp.commandv("change-list", "glsl-shader-opts", "add", settings) then return false end
        material_signature = settings
    end
    if not installed then
        installed = not not mp.commandv("change-list", "glsl-shaders", "append", shader)
        mp.set_property_native(material_key, installed)
    end
    return installed
end

local function format_time(seconds)
    local n = math.max(0, math.floor(seconds))
    if n >= 3600 then return ("%d:%02d:%02d"):format(math.floor(n / 3600), math.floor(n / 60) % 60, n % 60) end
    return ("%02d:%02d"):format(math.floor(n / 60), n % 60)
end

local function time_label(position, duration)
    if duration <= 0 then return "" end
    local left = math.max(0, duration - position)
    if options.timeFormat == "remaining_only" then return "-" .. format_time(left) end
    if options.timeFormat == "elapsed_remaining" then return format_time(position) .. " / -" .. format_time(left) end
    if options.timeFormat == "finish_time" then
        return os.date("%H:%M", os.time() + math.floor(left / math.max(0.01, mp.get_property_number("speed", 1))))
    end
    return format_time(position) .. " / " .. format_time(duration)
end

local function track_items(kind)
    local items = {}
    if kind == "sub" then
        items[1] = { title = options.labels.off, id = "no", selected = mp.get_property("sid", "no") == "no" }
    end
    for _, item in ipairs(mp.get_property_native("track-list") or {}) do
        if item.type == kind then
            local title = item.title and item.title ~= "" and item.title or item.lang or ("#" .. item.id)
            items[#items + 1] = { title = title, id = item.id, selected = item.selected }
        end
    end
    return items
end

local action_icons = {
    previous = "fluent_previous", next = "fluent_next", audio = "fluent_audio",
    subtitle = "fluent_subtitles", playlist = "fluent_playlist", more = "menu_more",
    ["skip-opening"] = "fluent_fast_forward",
}

local function icon_for(id, volume)
    if id == "play" then return mp.get_property_bool("pause") and "fluent_play_filled" or "fluent_pause_filled" end
    if id == "mute" then
        if mp.get_property_bool("mute", false) or volume == 0 then return "fluent_speaker_mute" end
        return volume < 50 and "fluent_speaker_1" or "fluent_speaker_2"
    end
    if id == "fullscreen" then return options.fullscreen and "fluent_arrow_minimize" or "fluent_arrow_maximize" end
    if id == "back" or id == "forward" then
        local step = options.seek
        if step == 5 or step == 10 or step == 30 then
            return ("fluent_skip_%s_%d"):format(id, step)
        end
        return id == "back" and "fluent_replay" or "fluent_fast_forward"
    end
    return action_icons[id]
end

local function menus()
    if menu == "audio" or menu == "sub" then return track_items(menu) end
    local result = {
        { title = options.labels.audio, id = "audio" }, { title = options.labels.subtitles, id = "sub" },
        { title = options.labels.speed, id = "speed" },
        { title = options.labels.chapters, id = "chapters" },
        { title = options.labels.screenshot, id = "screenshot" },
        { title = options.labels.settings, id = "settings" },
    }
    if menu == "speed" then
        result = {}
        for _, speed in ipairs({ 0.5, 0.75, 1, 1.25, 1.5, 2 }) do
            result[#result + 1] = { title = ("%g×"):format(speed), id = speed, selected = mp.get_property_number("speed", 1) == speed }
        end
    end
    return result
end

local function render_menu(ass, state, accent)
    if not menu then return end
    local items = menus()
    local s = state.scale
    local row_height = 29 * s
    local count = math.min(7, #items, math.max(1, math.floor((state.panel.y - 18 * s) / row_height)))
    if count <= 0 then return end
    track_offset = clamp(track_offset, 0, #items - count)
    local menu_width = math.min(270 * s, state.panel.w)
    local anchor = state.panel.x + state.panel.w - menu_width
    if menu == "audio" or menu == "sub" then anchor = state.panel.x end
    local box = layout.rect(anchor, state.panel.y - 8 * s - (count * row_height + 12 * s), menu_width,
        count * row_height + 12 * s, 12 * s)
    box.y = math.max(2, box.y)
    draw.box(ass, box, "211E1A", 0.87, 0.6)
    state.menu, state.items, state.menu_count, state.row_height = box, items, count, row_height
    for index = 1, count do
        local item = items[index + track_offset]
        local row = layout.rect(box.x + 5 * s, box.y + 6 * s + (index - 1) * row_height,
            box.w - 10 * s, row_height, 6 * s)
        if item.selected or layout.hit(row, cursor.x or -1, cursor.y or -1) then
            draw.box(ass, row, item.selected and accent or "FFFFFF", item.selected and 0.2 or 0.1)
        end
        draw.label(ass, row.x + 8 * s, row.y + row.h / 2, row.w - 16 * s,
            item.title, 13 * s, item.selected and accent or "FFFFFF")
    end
end

local function render()
    queued = nil
    local d = mp.get_property_native("osd-dimensions")
    if not options or not options.visible or not d or d.w <= 0 or d.h <= 0
        or not mp.get_property_native("video-out-params") then
        if current then overlay:remove() end
        current, menu, pressed = nil, nil, nil
        remove_material()
        publish_bounds({})
        return
    end
    local w, h = options.width, options.height
    if not w or not h or w <= 0 or h <= 0 then return end
    local position = mp.get_property_number("time-pos", 0)
    local duration = mp.get_property_number("duration", 0)
    local volume = mp.get_property_number("volume", 100)
    local stamp = time_label(position, duration)
    local scale = clamp(options.scale or 1, 0.65, 1.6)
    local state = layout.build(w, h, scale, clamp(options.radius or 16, 0, 36),
        options.timePosition, math.max(52, #stamp * 8) * scale, options.buttons.seekButtons ~= false,
        options.buttons, mp.get_property("sid", "no") ~= "no")
    local s, p, timeline = state.scale, state.panel, state.timeline
    local accent = draw.color(options.accent, "FFC77F")
    local frosted = apply_material(p, d, w, h)
    local ass = draw.new()
    -- One thin neutral rim. The video shader supplies the visible glass colour.
    draw.box(ass, p, draw.color(options.tint, "171513"), frosted and 0.038 or 0.72, 0.65)
    local rail = layout.rect(timeline.x, timeline.y + 9 * s, timeline.w, 4.5 * s, 3 * s)
    local segments = mp.get_property_native("chapter-list") or {}
    local gap = #segments > 1 and 3 * s or 0
    local start = 0
    local function segment(finish)
        if duration <= 0 or finish <= start then return end
        local x = rail.x + start / duration * rail.w
        local width = (finish - start) / duration * rail.w
        local r = layout.rect(x, rail.y, math.max(0, width - gap), rail.h, rail.radius)
        draw.box(ass, r, "FFFFFF", 0.25)
        r.w = math.max(0, math.min(r.w, (position - start) / duration * rail.w))
        draw.box(ass, r, accent, 1)
        start = finish
    end
    if duration > 0 then
        for _, chapter in ipairs(segments) do segment(math.min(duration, chapter.time or 0)) end
        segment(duration)
        if layout.hit(timeline, cursor.x or -1, cursor.y or -1) or pressed == "timeline" then
            local x = rail.x + clamp(position / duration, 0, 1) * rail.w
            draw.box(ass, layout.rect(x - 5 * s, rail.y - 2.75 * s, 10 * s, 10 * s, 5 * s), accent, 1)
        end
    else
        draw.box(ass, rail, "FFFFFF", 0.16)
    end
    if state.time then
        draw.label(ass, state.time.x, state.time.y + state.time.h / 2, state.time.w,
            stamp, 12 * s, accent, true)
    end
    for _, control in ipairs(state.controls) do
        if layout.hit(control, cursor.x or -1, cursor.y or -1) then draw.box(ass, control, "FFFFFF", 0.12) end
        local size = (control.id == "play" and 22 or 18) * s
        local x = control.w > 40 * s and control.x + 7 * s or control.x + (control.w - size) / 2
        draw.icon(ass, icons[icon_for(control.id, volume)], x, control.y + (control.h - size) / 2,
            size, control.id == "play" and accent or "FFFFFF")
        if control.w > 40 * s and (control.id == "audio" or control.id == "subtitle") then
            local selected
            for _, track in ipairs(track_items(control.id == "audio" and "audio" or "sub")) do
                if track.selected then selected = track.title; break end
            end
            local tx = x + size + 6 * s
            draw.label(ass, tx, control.y + control.h / 2, control.x + control.w - tx - 4 * s,
                selected, 12 * s, "FFFFFF")
        end
    end
    if state.volume then
        local r = layout.rect(state.volume.x, state.volume.y + 10 * s, state.volume.w, 4 * s, 2 * s)
        draw.box(ass, r, "FFFFFF", 0.28)
        r.w = r.w * clamp(volume / 150, 0, 1)
        draw.box(ass, r, accent, 1)
    end
    render_menu(ass, state, accent)
    overlay.res_x, overlay.res_y, overlay.data = w, h, ass.text
    overlay:update()
    current = state
    local function normalized(r, kind)
        return { x = r.x / w, y = r.y / h, w = r.w / w, h = r.h / h, kind = kind }
    end
    local bounds = { normalized(p, "panel") }
    if state.menu then bounds[#bounds + 1] = normalized(state.menu, "menu") end
    if state.time and state.time.y < p.y then bounds[#bounds + 1] = normalized(state.time, "time") end
    publish_bounds(bounds)
end

local function request_render()
    if options and options.visible and not queued then queued = mp.add_timeout(0, render) end
end

local function action(id)
    if id == "play" then mp.commandv("cycle", "pause")
    elseif id == "back" or id == "forward" then
        mp.commandv("seek", (id == "back" and -1 or 1) * (options.seek or 10), "relative")
    elseif id == "previous" then shell_action("playlistPrev")
    elseif id == "next" then shell_action("playlistNext")
    elseif id == "mute" then
        mp.set_property_number("volume", mp.get_property_number("volume", 100) > 0 and 0 or 100)
    elseif id == "audio" or id == "subtitle" or id == "more" then
        local next_menu = id == "subtitle" and "sub" or id
        if menu == next_menu then menu = nil else menu = next_menu end
        track_offset = 0
    elseif id == "skip-opening" then shell_action("skipOpening")
    elseif id == "playlist" or id == "fullscreen" then shell_action(id)
    elseif id == "time" then shell_action("timeFormat")
    end
end

local function hit(x, y)
    if layout.hit(current.menu, x, y) then return "menu" end
    if layout.hit(current.time, x, y) then return "time" end
    if layout.hit(current.timeline, x, y) then return "timeline" end
    if layout.hit(current.volume, x, y) then return "volume" end
    for _, control in ipairs(current.controls) do
        if layout.hit(control, x, y) then return control.id end
    end
end

mp.register_script_message("pointer", function(kind, px, py)
    if not options or not current then return end
    if kind == "dismiss" then
        menu, pressed = nil, nil
        request_render()
        return
    end
    if kind == "audio-menu" or kind == "subtitle-menu" then
        action(kind == "audio-menu" and "audio" or "subtitle")
        request_render()
        return
    end
    local x, y = (tonumber(px) or 0) * options.width, (tonumber(py) or 0) * options.height
    if kind == "leave" or kind == "cancel" then
        cursor = {}
        if kind == "cancel" then pressed = nil end
        request_render()
        return
    end
    cursor = { x = x, y = y }
    local target = hit(x, y)
    if kind == "down" then
        pressed = target
        if menu and target ~= "menu" and target ~= "audio" and target ~= "subtitle" and target ~= "more" then menu = nil end
    end
    if pressed == "timeline" and kind == "up" then
        mp.commandv("seek", clamp((x - current.timeline.x) / current.timeline.w, 0, 1) * 100, "absolute-percent")
    elseif pressed == "volume" and current.volume then
        mp.set_property_number("volume", 150 * clamp((x - current.volume.x) / current.volume.w, 0, 1))
    elseif kind == "up" and pressed == target and target == "menu" and current.menu then
        local row = math.floor((y - current.menu.y - 6 * current.scale) / current.row_height) + 1
        local item = row >= 1 and row <= current.menu_count and current.items[row + track_offset]
        if item then
            local selected_menu = menu
            menu, track_offset = nil, 0
            if selected_menu == "audio" then mp.set_property("aid", tostring(item.id))
            elseif selected_menu == "sub" then mp.set_property("sid", tostring(item.id))
            elseif selected_menu == "speed" then mp.set_property_number("speed", item.id)
            elseif item.id == "audio" or item.id == "sub" or item.id == "speed" then menu = item.id
            else shell_action(item.id) end
        end
    elseif kind == "up" and pressed and pressed == target then
        action(target)
    elseif kind == "wheel-up" or kind == "wheel-down" then
        local delta = kind == "wheel-up" and 1 or -1
        if target == "menu" then track_offset = track_offset - delta
        elseif target == "volume" or target == "mute" then
            mp.set_property_number("volume", clamp(mp.get_property_number("volume", 100) + delta * 5, 0, 150))
        end
    end
    if kind == "up" then pressed = nil end
    request_render()
end)

mp.register_script_message("config", function(json)
    local next_options = utils.parse_json(json)
    options = type(next_options) == "table" and next_options or nil
    if queued then queued:kill(); queued = nil end
    render()
end)

for _, property in ipairs({ "osd-dimensions", "video-out-params", "time-pos", "duration", "pause",
    "volume", "mute", "speed", "track-list", "aid", "sid", "chapter-list" }) do
    mp.observe_property(property, "native", request_render)
end
mp.observe_property("glsl-shaders", "native", function(_, paths)
    if not installed then return end
    for _, path in ipairs(paths or {}) do
        if path == shader then return end
    end
    installed = false
    mp.set_property_native(material_key, false)
    request_render()
end)
mp.register_event("end-file", function()
    if current then overlay:remove() end
    current, menu, pressed = nil, nil, nil
    remove_material()
    publish_bounds({})
end)
publish_bounds({})
