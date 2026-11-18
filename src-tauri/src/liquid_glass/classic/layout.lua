local Layout = {}
-- Classic keeps L-MPV's groups and uses the ModernGlass default glass metrics.
Layout.CLOCK_SIZE = 24
Layout.CLOCK_GAP = 12
local CLOCK_DIGIT_ADVANCE = 0.42
local CLOCK_COLON_ADVANCE = 0.20
local CLOCK_SEPARATOR_ADVANCE = 0.80
local BUTTON = 36
local PLAY_BUTTON = 44
local TRANSPORT = { "prev", "back", "play", "forward", "next" }
local TRANSPORT_GAP = 10
local GROUP_GAP = 16
local MENU = { row = 32, header = 32, padding = 7, radius = 24, gap = 10, limit = 9 }

---@class GlassRect
---@field x number
---@field y number
---@field w number
---@field h number
---@field radius number

function Layout.rect(x, y, w, h, radius)
    return { x = x, y = y, w = w, h = h, radius = radius or 0 }
end

function Layout.contains(rect, x, y)
    return rect and x >= rect.x and x < rect.x + rect.w and y >= rect.y and y < rect.y + rect.h
end

function Layout.clock(seconds)
    local value = math.floor(math.max(0, seconds))
    local minutes, rest = math.floor(value / 60), value % 60
    if minutes >= 60 then
        return ("%d:%02d:%02d"):format(math.floor(minutes / 60), minutes % 60, rest)
    end
    return ("%d:%02d"):format(minutes, rest)
end

function Layout.panel(width, height, viewport_width, docked, duration)
    local css_width = viewport_width > 0 and viewport_width or width
    local scale = math.min(width / css_width, width / 580, height / 212)
    local radius = 34
    local corner_inset = radius - BUTTON / 2
    local margin = (docked and 0 or 20) * scale
    local seek_offset = 24
    local panel_h = (seek_offset + 32 + corner_inset + BUTTON / 2) * scale
    local panel = Layout.rect(margin, height - margin - panel_h, width - 2 * margin,
        panel_h, (docked and 0 or radius) * scale)
    local padding = (corner_inset + 8) * scale
    local time_x = panel.x + panel.w - padding
    local stamp = Layout.clock(duration)
    local _, colons = stamp:gsub(":", "")
    local stamp_width = (#stamp - colons) * CLOCK_DIGIT_ADVANCE + colons * CLOCK_COLON_ADVANCE
    local time_width = (2 * stamp_width + CLOCK_SEPARATOR_ADVANCE) * Layout.CLOCK_SIZE * scale
    local seek_x = panel.x + padding
    local timeline = Layout.rect(seek_x, panel.y + (seek_offset - 9) * scale,
        math.max(scale, time_x - time_width - Layout.CLOCK_GAP * scale - seek_x), 18 * scale)
    local button_width = BUTTON * scale
    local center_y = panel.y + (seek_offset + 32) * scale
    local buttons = {}
    local function button(name, x, size)
        buttons[name] = Layout.rect(x, center_y - size / 2, size, size, size / 2)
    end
    local left = panel.x + corner_inset * scale
    local side_step = (BUTTON + 4) * scale
    button("audio", left, button_width)
    button("subtitles", left + side_step, button_width)
    button("sound", left + 2 * side_step, button_width)
    local sound = buttons.sound
    local volume = Layout.rect(sound.x + sound.w, center_y - 6 * scale, 72 * scale, 12 * scale)
    local right = panel.x + panel.w - (corner_inset + BUTTON) * scale
    local transport_width = (4 * BUTTON + PLAY_BUTTON + 4 * TRANSPORT_GAP) * scale
    local transport_x = math.min(
        math.max((width - transport_width) / 2, volume.x + volume.w + GROUP_GAP * scale),
        right - transport_width - GROUP_GAP * scale)
    for _, name in ipairs(TRANSPORT) do
        local size = name == "play" and PLAY_BUTTON * scale or button_width
        button(name, transport_x, size)
        transport_x = transport_x + size + TRANSPORT_GAP * scale
    end
    button("fullscreen", right, button_width)
    return {
        scale = scale, panel = panel, timeline = timeline, volume = volume, buttons = buttons, time_right = time_x,
    }
end

function Layout.menu(layout, entries, offset)
    local scale = layout.scale
    local row_height = MENU.row * scale
    local available = layout.panel.y / scale - (12 + MENU.gap + MENU.header + MENU.padding)
    local rows = math.min(#entries, MENU.limit, math.max(0, math.floor(available / MENU.row)))
    if rows == 0 then return nil end
    local start = math.max(0, math.min(offset, #entries - rows))
    local height = (MENU.header + MENU.padding + rows * MENU.row) * scale
    local menu = Layout.rect(layout.buttons.audio.x, layout.panel.y - MENU.gap * scale - height,
        math.min(270 * scale, layout.panel.w - 32 * scale), height, MENU.radius * scale)
    local visible = {}
    for index = 1, rows do
        visible[index] = {
            track = entries[index + start],
            rect = Layout.rect(menu.x + MENU.padding * scale, menu.y + MENU.header * scale + (index - 1) * row_height,
                menu.w - 2 * MENU.padding * scale, row_height, (MENU.radius - MENU.padding) * scale),
        }
    end
    return { rect = menu, rows = visible, offset = start, limit = #entries - rows }
end

return Layout
