local mp = require "mp"
local assdraw = require "mp.assdraw"
local icons = require "classic.icons"
local layout_util = require "classic.layout"

local Draw = {}
local WHITE = "FFFFFF"
local MUTED_TEXT = "C4B7AE"
local GLASS_FALLBACK = "1C1817"
local ICON_FRAME = " m 0 0 l 24 0 24 24 0 24 m 0 0 l 0 24 24 24 24 0"
local ICON_SIZE = 22
local ICON_SIZES = { play = 30, prev = 24, back = 24, forward = 24, next = 24 }
local icon_cache = {}
local cached_scale

local function begin(ass, color, alpha)
    ass:new_event()
    ass:append(("{\\bord0\\shad0\\1c&H%s&\\1a&H%02X&}"):format(color, alpha or 0))
end

local function rect(ass, x, y, w, h, radius, color, alpha, clip)
    if w <= 0 or h <= 0 then return end
    begin(ass, color, alpha)
    if clip then
        ass:append(("{\\iclip(%.0f,%.0f,%.0f,%.0f)}"):format(clip[1], clip[2], clip[3], clip[4]))
    end
    ass:an(7)
    ass:pos(0, 0)
    ass:draw_start()
    ass:round_rect_cw(x, y, x + w, y + h, math.min(radius, w / 2, h / 2))
    ass:draw_stop()
end

local function text(ass, x, y, value, size, align, color, clip)
    begin(ass, color or WHITE)
    ass:an(align)
    ass:pos(x, y)
    ass:append(("{\\fnSegoe UI\\fs%.2f}"):format(size))
    if clip then
        ass:append(("{\\clip(%.0f,%.0f,%.0f,%.0f)}"):format(
            clip.x, clip.y, clip.x + clip.w, clip.y + clip.h))
    end
    ass:append(mp.command_native({ "escape-ass", value }) or "")
end

local function clock(ass, layout, current, duration)
    local seek = layout.timeline
    begin(ass, WHITE)
    ass:an(6)
    ass:pos(layout.time_right, seek.y + seek.h / 2)
    ass:append(("{\\fnSegoe UI\\fs%.2f\\b600\\bord%.2f\\3c&H000000&\\3a&H70&}"):format(
        layout_util.CLOCK_SIZE * layout.scale, 0.85 * layout.scale))
    ass:append(layout_util.clock(current) .. " / " .. layout_util.clock(duration))
end

local function icon(ass, name, box, size, alpha)
    local key = name .. "@" .. size
    if not icon_cache[key] then
        -- p4 gives the 24-unit paths an eighth-pixel coordinate grid.
        icon_cache[key] = (icons[name] .. ICON_FRAME):gsub("%-?%d+%.?%d*", function(number)
            return ("%.0f"):format(tonumber(number) * size * 8 / 24)
        end)
    end
    begin(ass, WHITE, alpha)
    ass:an(7)
    ass:pos(box.x + (box.w - size) / 2, box.y + (box.h - size) / 2)
    ass:append("{\\p4}" .. icon_cache[key] .. "{\\p0}")
end

local function slider(ass, box, fraction, thickness, handle)
    local x, y, w = box.x, box.y + box.h / 2, box.w
    local filled = w * math.max(0, math.min(1, fraction))
    rect(ass, x, y - thickness / 2, w, thickness, thickness / 2, WHITE, 0xB4)
    rect(ass, x, y - thickness / 2, filled, thickness, thickness / 2, WHITE)
    if handle then
        local radius = box.h * 0.4
        local center = math.max(radius, math.min(w - radius, filled))
        rect(ass, x + center - radius, y - radius, 2 * radius, 2 * radius, radius, WHITE)
    end
end

function Draw.render(layout, state, input, menu, video_clip)
    local ass = assdraw.ass_new()
    local scale, panel = layout.scale, layout.panel
    if cached_scale ~= scale then
        icon_cache, cached_scale = {}, scale
    end
    rect(ass, panel.x, panel.y, panel.w, panel.h, panel.radius, GLASS_FALLBACK, 0x61, video_clip)
    local seek = layout.timeline
    slider(ass, seek, state.duration > 0 and state.time / state.duration or 0, 6 * scale,
        input.drag == "timeline" or layout_util.contains(seek, input.x, input.y))
    clock(ass, layout, state.time, state.duration)
    local names = {
        audio = "audio", subtitles = "subtitles",
        sound = state.mute and "speaker_mute" or state.volume == 0 and "speaker_0"
            or state.volume < 50 and "speaker_1" or "speaker_2",
        prev = "previous", back = state.seek_step == 10 and "back_10" or "back",
        play = state.pause and "play" or "pause",
        forward = state.seek_step == 10 and "forward_10" or "forward", next = "next",
        fullscreen = state.fullscreen and "minimize" or "maximize",
    }
    for name, box in pairs(layout.buttons) do
        local disabled = name == "prev" and not state.can_prev or name == "next" and not state.can_next
        if not disabled and (input.hover == name or input.menu == name) then
            rect(ass, box.x, box.y, box.w, box.h, box.radius, WHITE, 0xE6)
        end
        local size = (ICON_SIZES[name] or ICON_SIZE) * scale
        icon(ass, names[name], box, size, disabled and 145 or 0)
    end
    local volume = layout.volume
    slider(ass, volume, state.mute and 0 or state.volume / state.max_volume, 4 * scale,
        input.drag == "volume" or layout_util.contains(volume, input.x, input.y))

    if menu then
        local box = menu.rect
        rect(ass, box.x, box.y, box.w, box.h, box.radius, GLASS_FALLBACK, 0x24, video_clip)
        text(ass, box.x + 12 * scale, box.y + 16 * scale, state.labels[input.menu], 12.5 * scale, 4, MUTED_TEXT)
        for _, entry in ipairs(menu.rows) do
            local row, track = entry.rect, entry.track
            if track.selected or layout_util.contains(row, input.x, input.y) then
                rect(ass, row.x, row.y, row.w, row.h, row.radius, WHITE, 0xE6)
            end
            if track.selected then
                icon(ass, "check", layout_util.rect(row.x + 7 * scale, row.y, 16 * scale, row.h), 16 * scale)
            end
            local inset = 26 * scale
            local clip = layout_util.rect(row.x + inset, row.y, row.w - inset - 7 * scale, row.h)
            text(ass, clip.x, row.y + row.h / 2, track.label, 14 * scale, 4, WHITE, clip)
        end
    end
    return ass.text
end

return Draw
