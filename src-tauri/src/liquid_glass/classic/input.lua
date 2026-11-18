local mp = require "mp"
local layout_util = require "classic.layout"

local Input = {}

function Input.new(request_render, shell_action)
    local input = { x = -1, y = -1, offset = 0 }

    function input.reset()
        input.x, input.y, input.hover, input.drag, input.pressed = -1, -1, nil, nil, nil
        input.menu, input.offset = nil, 0
    end

    local function toggle_menu(kind)
        input.menu = input.menu ~= kind and kind or nil
        input.offset = 0
    end

    local function hit(layout, x, y)
        for name, box in pairs(layout.buttons) do
            if layout_util.contains(box, x, y) then return name end
        end
    end

    local function adjust(name, layout, state, exact)
        local box = layout[name]
        local fraction = math.min(1, math.max(0, (input.x - box.x) / box.w))
        if name == "volume" then
            mp.set_property_number("volume", math.floor(fraction * state.max_volume + 0.5))
            if state.mute then mp.set_property_bool("mute", false) end
        elseif state.duration > 0 then
            local amount = fraction * state.duration
            if exact or not input.last_seek or math.abs(input.last_seek - amount) >= 0.15 then
                mp.commandv("seek", amount, exact and "absolute+exact" or "absolute+keyframes")
                input.last_seek = amount
            end
        end
    end

    local function activate(name, state)
        if name == "audio" or name == "subtitles" then
            toggle_menu(name)
            return
        end
        input.menu = nil
        if name == "sound" then
            mp.commandv("cycle", "mute")
        elseif name == "back" or name == "forward" then
            mp.commandv("seek", name == "back" and -state.seek_step or state.seek_step, "relative+exact")
        elseif name == "play" or name == "fullscreen"
            or (name == "prev" and state.can_prev) or (name == "next" and state.can_next) then
            shell_action(name)
        end
    end

    function input.handle(kind, x, y, layout, state, menu)
        if kind == "audio" or kind == "subtitles" then
            toggle_menu(kind)
        elseif kind == "dismiss" then
            input.menu = nil
        elseif kind == "cancel" or kind == "leave" then
            input.x, input.y, input.hover = -1, -1, nil
            if kind == "cancel" then input.drag, input.pressed = nil, nil end
        else
            input.x, input.y = x, y
            input.hover = hit(layout, x, y)
            if kind == "move" and input.drag then
                adjust(input.drag, layout, state, false)
            elseif kind == "up" then
                if input.drag then
                    adjust(input.drag, layout, state, true)
                elseif input.pressed and input.pressed == input.hover then
                    activate(input.pressed, state)
                end
                input.drag, input.pressed = nil, nil
            elseif kind == "down" then
                if menu and layout_util.contains(menu.rect, x, y) then
                    for _, entry in ipairs(menu.rows) do
                        if layout_util.contains(entry.rect, x, y) then
                            mp.set_property(input.menu == "audio" and "aid" or "sid", entry.track.id)
                            input.menu = nil
                            break
                        end
                    end
                elseif layout_util.contains(layout.timeline, x, y) or layout_util.contains(layout.volume, x, y) then
                    input.menu = nil
                    input.drag = layout_util.contains(layout.timeline, x, y) and "timeline" or "volume"
                    input.last_seek = nil
                    adjust(input.drag, layout, state, false)
                else
                    input.pressed = input.hover
                    if input.pressed ~= "audio" and input.pressed ~= "subtitles" then input.menu = nil end
                end
            elseif menu and layout_util.contains(menu.rect, x, y) then
                local step = kind == "wheel-up" and -1 or kind == "wheel-down" and 1 or 0
                input.offset = math.max(0, math.min(menu.limit, menu.offset + step))
            end
        end
        request_render()
    end

    return input
end

return Input
