local assdraw = require "mp.assdraw"
local M = {}

function M.color(hex, fallback)
    local rgb = type(hex) == "string" and hex:match("^#(%x%x%x%x%x%x)$")
    if not rgb then return fallback or "FFFFFF" end
    return rgb:sub(5, 6) .. rgb:sub(3, 4) .. rgb:sub(1, 2)
end

local function alpha(value)
    return ("%02X"):format(255 - math.floor(255 * math.max(0, math.min(1, value)) + 0.5))
end

function M.new()
    return assdraw.ass_new()
end

function M.box(ass, r, tint, opacity, border)
    if r.w <= 0 or r.h <= 0 then return end
    ass:new_event()
    ass:pos(0, 0)
    ass:append(("{\\an7\\bord%.2f\\shad0\\1c&H%s&\\1a&H%s&\\3c&HFAF7F4&\\3a&H%s&}"):format(
        border or 0, tint, alpha(opacity), alpha(border and 0.46 or 0)))
    ass:draw_start()
    ass:round_rect_cw(r.x, r.y, r.x + r.w, r.y + r.h, math.min(r.radius or 0, r.w / 2, r.h / 2))
    ass:draw_stop()
end

local function truncate(text, width, size)
    local result, advance = {}, 0
    for char in text:gmatch("[%z\1-\127\194-\244][\128-\191]*") do
        local factor = #char >= 3 and 1.04 or char:match("[ ilI.,:!]") and 0.30 or 0.61
        advance = advance + size * factor
        if advance > width - size * 0.65 then
            return table.concat(result) .. "…"
        end
        result[#result + 1] = char
    end
    return table.concat(result)
end

function M.label(ass, x, y, width, text, size, tint, bold)
    if type(text) ~= "string" or text == "" or width <= 0 then return end
    local clean = truncate(text:gsub("[{}\\\r\n]", " "), width, size)
    ass:new_event()
    ass:pos(x, y)
    ass:append(("{\\an4\\fnSegoe UI\\fs%.2f\\b%d\\bord0\\shad0\\1c&H%s&\\clip(%d,%d,%d,%d)}%s"):format(
        size, bold and 600 or 400, tint, math.floor(x), math.floor(y - size), math.ceil(x + width),
        math.ceil(y + size), clean))
end

function M.icon(ass, path, x, y, size, tint)
    if not path then return end
    ass:new_event()
    ass:pos(x, y)
    ass:append(("{\\an7\\bord0\\shad0\\1c&H%s&\\fscx%.3f\\fscy%.3f\\p1}"):format(
        tint, size * 100 / 24, size * 100 / 24))
    ass:append(path .. " m 0 0 l 24 0 24 24 0 24 m 0 0 l 0 24 24 24 24 0{\\p0}")
end

return M
