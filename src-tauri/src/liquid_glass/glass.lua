local mp = require "mp"
local utils = require "mp.utils"

local Glass = {}
local STATUS = "user-data/lmpv-liquid-glass"
local SUPPORTED = "user-data/lmpv-liquid-glass-supported"
local MAX_SLOTS = 16
local REDRAW_OVERLAY_ID = 63

function Glass.new(directory)
    local shader = utils.join_path(directory, "floating_glass.glsl")
    local loaded = false
    local active = false
    local last_sig = nil
    local unload_timer = nil
    local redraw_toggle = false
    local material = {}

    local function send(...)
        mp.command_native_async({"change-list", ...}, function() end)
    end

    -- Невидимый 0-пиксельный ASS-вызов будит vo=gpu-next сразу после обновления glsl-shader-opts,
    -- не дожидаясь следующего PTS 24fps-кадра при быстром перемещении превью и анимациях.
    local function nudge_redraw()
        redraw_toggle = not redraw_toggle
        local data = redraw_toggle
            and "{\\p1\\alpha&HFF&\\bord0\\shad0}m 0 0"
            or "{\\p1\\alpha&HFF&\\bord0\\shad0}m 0 0 "
        mp.command_native_async({
            name = "osd-overlay",
            id = REDRAW_OVERLAY_ID,
            format = "ass-events",
            data = data,
        }, function() end)
    end

    local function clear_redraw_overlay()
        mp.command_native_async({
            name = "osd-overlay",
            id = REDRAW_OVERLAY_ID,
            format = "none",
            data = "",
        }, function() end)
    end

    local function is_supported()
        if mp.get_property("current-vo") ~= "gpu-next" then
            return false
        end
        if not mp.get_property_native("video-out-params") then
            return false
        end
        if mp.get_property_number("video-out-params/rotate", 0) % 360 ~= 0 then
            return false
        end
        return true
    end

    function material.clear()
        if active or (last_sig ~= nil and last_sig ~= "mzg_on=0") then
            if loaded then
                send("glsl-shader-opts", "add", "mzg_on=0")
                clear_redraw_overlay()
                if not unload_timer then
                    unload_timer = mp.add_timeout(5, function()
                        unload_timer = nil
                        if loaded and last_sig == "mzg_on=0" then
                            send("glsl-shaders", "remove", shader)
                            loaded = false
                        end
                    end)
                end
            end
            active = false
            last_sig = "mzg_on=0"
            mp.set_property_native(STATUS, "idle")
        end
    end

    function material.update(dimensions, surfaces, viewport_h, blur)
        local supported = is_supported()
        mp.set_property_native(SUPPORTED, supported)

        if not supported or not dimensions then
            material.clear()
            return supported
        end

        local W, H = dimensions.w or 0, dimensions.h or 0
        local ml, mr, mt, mb = dimensions.ml or 0, dimensions.mr or 0, dimensions.mt or 0, dimensions.mb or 0
        local vw, vh = W - ml - mr, H - mt - mb
        if W <= 0 or H <= 0 or vw <= 0 or vh <= 0 then
            material.clear()
            return supported
        end

        local list = type(surfaces) == "table" and surfaces or {}
        local sy = (viewport_h and viewport_h > 0) and (H / viewport_h) or 1
        local kv = {
            mzg_on = "1",
            mzg_strength = "1.0",
            mzg_lens = "1",
            mzg_shadow = "1",
            mzg_tone = "1",
            lg_blur = string.format("%.2f", math.max(0, math.min(100, blur or 80)) / 100),
            mzg_unit = string.format("%.6f", sy / vh),
        }

        local overlaps = false
        for slot = 0, MAX_SLOTS - 1 do
            local rect = list[slot + 1]
            local prefix = "mzg_" .. slot
            if rect and rect.w and rect.h and rect.w > 0 and rect.h > 0 then
                local sx = rect.x * W
                local sy_px = rect.y * H
                local sw = rect.w * W
                local sh = rect.h * H
                local sr = math.max(0, tonumber(rect.r) or 0) * sy
                if rect.dockedBottom and sr > 0 then
                    sh = sh + sr
                end
                local nx = (sx - ml) / vw
                local ny = (sy_px - mt) / vh
                local nw = sw / vw
                local nh = sh / vh
                local nr = sr / vh
                local na = math.max(0, math.min(1, tonumber(rect.a) or 1))
                local nf = math.max(0, math.min(1, tonumber(rect.f) or 0))
                if na > 0.005 and nx < 1 and ny < 1 and nx + nw > 0 and ny + nh > 0 then
                    overlaps = true
                    kv[prefix .. "x"] = string.format("%.5f", nx)
                    kv[prefix .. "y"] = string.format("%.5f", ny)
                    kv[prefix .. "w"] = string.format("%.5f", nw)
                    kv[prefix .. "h"] = string.format("%.5f", nh)
                    kv[prefix .. "r"] = string.format("%.5f", nr)
                    kv[prefix .. "a"] = string.format("%.2f", na)
                    kv[prefix .. "f"] = string.format("%.2f", nf)
                else
                    kv[prefix .. "w"] = "0"
                end
            else
                kv[prefix .. "w"] = "0"
            end
        end

        if not overlaps then
            material.clear()
            return supported
        end

        local keys = {}
        for k in pairs(kv) do
            keys[#keys + 1] = k
        end
        table.sort(keys)
        local parts = {}
        for _, k in ipairs(keys) do
            parts[#parts + 1] = k .. "=" .. kv[k]
        end
        local sig = table.concat(parts, ",")

        if sig ~= last_sig then
            last_sig = sig
            if unload_timer then
                unload_timer:kill()
                unload_timer = nil
            end
            send("glsl-shader-opts", "add", sig)
            nudge_redraw()
        end

        if not loaded then
            send("glsl-shaders", "append", shader)
            loaded = true
        end

        if not active then
            active = true
            mp.set_property_native(STATUS, "active")
        end

        return supported
    end

    function material.shutdown()
        if unload_timer then
            unload_timer:kill()
            unload_timer = nil
        end
        if active or loaded then
            send("glsl-shader-opts", "add", "mzg_on=0")
            clear_redraw_overlay()
        end
        if loaded then
            send("glsl-shaders", "remove", shader)
            loaded = false
        end
        active = false
        last_sig = nil
        mp.set_property_native(STATUS, "idle")
    end

    mp.set_property_native(STATUS, "idle")
    mp.set_property_native(SUPPORTED, is_supported())
    return material
end

return Glass
