local mp = require("mp")
local utils = require("mp.utils")

local math_max = math.max
local math_min = math.min
local string_format = string.format
local table_concat = table.concat
local tonumber = tonumber
local type = type

---@class GlassSurfaceRect
---@field x number
---@field y number
---@field w number
---@field h number
---@field r number|nil
---@field a number|nil
---@field f number|nil
---@field dockedBottom boolean|nil

---@class GlassMaterial
---@field clear fun()
---@field update fun(dimensions: table|nil, surfaces: GlassSurfaceRect[]|nil, viewport_h: number|nil, blur: number|nil): boolean
---@field shutdown fun()

local Glass = {}
local STATUS = "user-data/lmpv-liquid-glass"
local SUPPORTED = "user-data/lmpv-liquid-glass-supported"
local MAX_SLOTS = 24
local REDRAW_OVERLAY_ID = 63

local function noop() end

local SLOT_PREFIXES = {}
for slot = 0, MAX_SLOTS - 1 do
    SLOT_PREFIXES[slot] = "mzg_" .. slot
end

---@param directory string
---@return GlassMaterial
function Glass.new(directory)
    local shader = utils.join_path(directory, "floating_glass.glsl")
    local loaded = false
    local active = false
    local last_sig = nil
    local unload_timer = nil
    local redraw_toggle = false
    ---@type GlassMaterial
    local material = {}

    local function send(...)
        mp.command_native_async({ "change-list", ... }, noop)
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
        }, noop)
    end

    local function clear_redraw_overlay()
        mp.command_native_async({
            name = "osd-overlay",
            id = REDRAW_OVERLAY_ID,
            format = "none",
            data = "",
        }, noop)
    end

    ---@return boolean
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

    ---@param dimensions table|nil
    ---@param surfaces GlassSurfaceRect[]|nil
    ---@param viewport_h number|nil
    ---@param blur number|nil
    ---@return boolean
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
        local parts = {
            string_format("lg_blur=%.2f", math_max(0, math_min(100, blur or 90)) / 100),
            "mzg_lens=1",
            "mzg_on=1",
            "mzg_shadow=1",
            "mzg_strength=1.0",
            "mzg_tone=1",
            string_format("mzg_unit=%.6f", sy / vh),
        }
        local n_parts = 7

        local overlaps = false
        for slot = 0, MAX_SLOTS - 1 do
            local rect = list[slot + 1]
            local prefix = SLOT_PREFIXES[slot]
            if rect and rect.w and rect.h and rect.w > 0 and rect.h > 0 then
                local sx = rect.x * W
                local sy_px = rect.y * H
                local sw = rect.w * W
                local sh = rect.h * H
                local sr = math_max(0, tonumber(rect.r) or 0) * sy
                if rect.dockedBottom and sr > 0 then
                    sh = sh + sr
                end
                local nx = (sx - ml) / vw
                local ny = (sy_px - mt) / vh
                local nw = sw / vw
                local nh = sh / vh
                local nr = sr / vh
                local na = math_max(0, math_min(1, tonumber(rect.a) or 1))
                local nf = math_max(0, math_min(1, tonumber(rect.f) or 0))
                if na > 0.005 and nx < 1 and ny < 1 and nx + nw > 0 and ny + nh > 0 then
                    overlaps = true
                    n_parts = n_parts + 1
                    parts[n_parts] = string_format(
                        "%sx=%.5f,%sy=%.5f,%sw=%.5f,%sh=%.5f,%sr=%.5f,%sa=%.2f,%sf=%.2f",
                        prefix, nx, prefix, ny, prefix, nw, prefix, nh, prefix, nr, prefix, na, prefix, nf
                    )
                else
                    n_parts = n_parts + 1
                    parts[n_parts] = prefix .. "w=0"
                end
            else
                n_parts = n_parts + 1
                parts[n_parts] = prefix .. "w=0"
            end
        end

        if not overlaps then
            material.clear()
            return supported
        end

        local sig = table_concat(parts, ",")

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
