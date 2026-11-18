-- Layout for L-MPV Classic (floating). All numbers are in the Lua overlay's
-- logical coordinates, independent of browser styling and component layout.
local M = {}

local function rect(x, y, w, h, radius)
    return { x = x, y = y, w = w, h = h, radius = radius }
end
M.rect = rect

function M.hit(r, x, y)
    return r and x >= r.x and x <= r.x + r.w and y >= r.y and y <= r.y + r.h
end

function M.build(w, h, scale, radius, time_position, time_width, skip, buttons, subtitles_active)
    local s = math.min(scale, math.max(0.63, w / 680))
    local panel = rect(14 * s, h - 12 * s - 70 * s, w - 28 * s, 70 * s, radius * s)
    local left, right = panel.x + 16 * s, panel.x + panel.w - 16 * s
    local row_y, btn = panel.y + 29 * s, 34 * s
    local time = rect(right - time_width, panel.y + 7 * s, time_width, 17 * s)
    if time_position == "timeline_left" then
        time.x = left
    elseif time_position == "toolbar_right" or time_position == "volume_right" then
        time.y = row_y + 8 * s
        if time_position == "volume_right" then time.x = left + 131 * s end
    elseif time_position == "timeline_floating_center" then
        time.x, time.y = (w - time_width) / 2, panel.y - 23 * s
    elseif time_position == "titlebar" then
        time = nil -- The application's titlebar owns this position.
    end
    local gap = 12 * s
    local seek_left = time_position == "timeline_left" and left + time_width + gap or left
    local seek_right = time_position == "timeline_right" and right - time_width - gap or right
    local timeline = rect(seek_left, panel.y + 5 * s, math.max(1, seek_right - seek_left), 22 * s)
    local controls = {}
    local function button(id, x, size)
        local r = rect(x, row_y, size or btn, btn, 8 * s)
        r.id = id
        controls[#controls + 1] = r
        return r.x + r.w
    end
    local center_ids = skip and { "previous", "back", "play", "forward", "next" } or { "previous", "play", "next" }
    local step = btn + 8 * s
    local cx = (w - (#center_ids * step - 8 * s)) / 2
    for _, id in ipairs(center_ids) do
        button(id, cx)
        cx = cx + step
    end
    local right_ids = {}
    if w >= 820 * s and buttons.skipOpening ~= false then right_ids[#right_ids + 1] = "skip-opening" end
    if buttons.playlist ~= false then right_ids[#right_ids + 1] = "playlist" end
    right_ids[#right_ids + 1] = "more"
    if buttons.fullscreen ~= false then right_ids[#right_ids + 1] = "fullscreen" end
    local rx = right - #right_ids * btn
    if time and time_position == "toolbar_right" then
        time.x = rx - time_width - 5 * s
        if time.x < cx then
            time.x, time.y = right - time_width, panel.y + 7 * s
            timeline.w = math.max(1, time.x - gap - timeline.x)
        end
    end
    for _, id in ipairs(right_ids) do rx = button(id, rx) end
    local show_names = w >= 800 * s and buttons.showNames
    local center_left = (w - (#center_ids * step - 8 * s)) / 2
    local subtitle_width = show_names and (subtitles_active and 94 or 60) * s or btn
    local audio_width = show_names and math.max(btn, math.min(180 * s,
        center_left - left - subtitle_width - btn - 80 * s)) or btn
    local lx = button("audio", left, audio_width)
    lx = button("subtitle", lx + 4 * s, subtitle_width)
    lx = button("mute", lx + 4 * s)
    local rail_width = math.min(64 * s, center_left - lx - 13 * s)
    local volume = rail_width >= 30 * s and rect(lx + 3 * s, row_y + 5 * s, rail_width, 24 * s) or nil
    if time and time_position == "volume_right" then
        time.x = (volume and volume.x + volume.w or lx) + 6 * s
        if time.x + time.w > center_left then time.y, time.x = panel.y + 7 * s, right - time.w; timeline.w = math.max(1, time.x - gap - timeline.x) end
    end
    return { panel = panel, timeline = timeline, controls = controls, volume = volume, time = time, scale = s }
end

return M
