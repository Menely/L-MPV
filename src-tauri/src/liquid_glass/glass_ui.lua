local mp = require "mp"
local assdraw = require "mp.assdraw"
local overlay = mp.create_osd_overlay("ass-events")
local status = "user-data/lmpv-liquid-glass-ui"
local M = {}
local visible = false

local function color(value, fallback)
    if type(value) ~= "string" then return fallback, 1 end
    local hex = value:match("^#(%x%x%x%x%x%x)$")
    if hex then return hex:sub(5, 6) .. hex:sub(3, 4) .. hex:sub(1, 2), 1 end
    local r, g, b, alpha = value:match("^rgba?%(([%d.]+),%s*([%d.]+),%s*([%d.]+),?%s*([%d.]*)%)$")
    if not r then return fallback, 1 end
    local byte = function(x) return math.max(0, math.min(255, math.floor(tonumber(x) + 0.5))) end
    return ("%02X%02X%02X"):format(byte(b), byte(g), byte(r)), tonumber(alpha) or 1
end

local function alpha(opacity)
    return ("%02X"):format(255 - math.floor(255 * math.min(1, math.max(0, opacity)) + 0.5))
end

local function box(ass, x, y, w, h, radius, tint, opacity, outline)
    if w <= 0 or h <= 0 then return end
    ass:new_event()
    ass:pos(0, 0)
    ass:append(("{\\an7\\shad0\\bord%.1f\\1c&H%s&\\1a&H%s&\\3c&HECEFFF&\\3a&H%s&}"):format(
        outline or 0, tint, alpha(opacity), alpha(opacity * 2.5)))
    ass:draw_start()
    ass:round_rect_cw(x, y, x + w, y + h, math.min(radius, w / 2, h / 2))
    ass:draw_stop()
end

local function polygon(ass, points)
    ass:move_to(points[1], points[2])
    for i = 3, #points, 2 do ass:line_to(points[i], points[i + 1]) end
end

local function icon(ass, item, opacity)
    local tint = color(item.color, "FFFFFF")
    local sx, sy = item.w / 24, item.h / 24
    ass:new_event()
    ass:pos(0, 0)
    ass:append(("{\\an7\\bord0\\shad0\\1c&H%s&\\1a&H%s&}"):format(tint, alpha(opacity)))
    ass:draw_start()
    for _, path in ipairs(item.paths) do
        local points = {}
        for i = 1, #path.points, 2 do
            points[i] = item.x + path.points[i] * sx
            points[i + 1] = item.y + path.points[i + 1] * sy
        end
        if path.filled and #points >= 6 then
            polygon(ass, points)
        else
            for i = 1, #points - 2, 2 do
                local x, y, ex, ey = points[i], points[i + 1], points[i + 2], points[i + 3]
                local dx, dy = ex - x, ey - y
                local length = math.sqrt(dx * dx + dy * dy)
                if length > 0.01 then
                    local r = 0.86 * math.min(sx, sy)
                    dx, dy = dx * r / length, dy * r / length
                    polygon(ass, { x - dx - dy, y - dy + dx, x - dx + dy, y - dy - dx,
                        ex + dx + dy, ey + dy - dx, ex + dx - dy, ey + dy + dx })
                end
            end
        end
    end
    ass:draw_stop()
end

function M.clear()
    if not visible then return end
    overlay:remove()
    visible = false
    mp.set_property_native(status, false)
end

function M.render(frame, surfaces)
    if #surfaces == 0 or type(frame) ~= "table" or frame.width <= 0 or frame.height <= 0
        or not mp.get_property_native("video-out-params") then
        M.clear()
        return
    end
    local ass = assdraw.ass_new()
    local tint, tint_alpha = color(frame.tint, "181510")
    for _, surface in ipairs(surfaces) do
        local height = surface.h * frame.height
        if surface.y + surface.h >= 0.999 and surface.bottom_radius == 0 then
            height = height + surface.top_radius * frame.height
        end
        box(ass, surface.x * frame.width, surface.y * frame.height, surface.w * frame.width,
            height, surface.top_radius * frame.height,
            tint, surface.opacity * tint_alpha * 0.35, 0.75)
    end
    for _, item in ipairs(frame.boxes) do
        local fill, coverage = color(item.color, "FFFFFF")
        box(ass, item.x, item.y, item.w, item.h, item.radius, fill, coverage * frame.opacity)
    end
    for _, item in ipairs(frame.icons) do icon(ass, item, frame.opacity) end
    for _, item in ipairs(frame.labels) do
        local fill = color(item.color, "FFFFFF")
        local label = item.text:gsub("[{}\\\r\n]", " ")
        ass:new_event()
        ass:pos(item.x, item.y + item.h / 2)
        if item.clip or item.track then
            ass:append(("{\\clip(%d,%d,%d,%d)}"):format(
                math.floor(item.x), math.floor(item.y - 4), math.ceil(item.x + item.w), math.ceil(item.y + item.h + 4)))
        end
        ass:append(("{\\an4\\fnSegoe UI\\fs%.1f\\b%d\\bord0\\shad0\\1c&H%s&\\1a&H%s&}%s"):format(
            item.size, item.weight or 400, fill, alpha(frame.opacity), label))
    end
    overlay.res_x, overlay.res_y, overlay.data = frame.width, frame.height, ass.text
    overlay:update()
    if not visible then
        visible = true
        mp.set_property_native(status, true)
    end
end

return M
