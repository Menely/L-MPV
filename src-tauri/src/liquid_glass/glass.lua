local mp = require("mp")
local utils = require("mp.utils")

local math_abs = math.abs
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
---@field update fun(dimensions: table|nil, surfaces: GlassSurfaceRect[]|nil, viewport_w: number|nil, viewport_h: number|nil, dpr: number|nil, blur: number|nil, top_blur: table|nil, tint: table|nil, refraction: number|nil, dispersion: number|nil): boolean
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
            end
            active = false
            last_sig = "mzg_on=0"
            mp.set_property_native(STATUS, "idle")
        end
    end

    ---@param dimensions table|nil
    ---@param surfaces GlassSurfaceRect[]|nil
    ---@param viewport_w number|nil
    ---@param viewport_h number|nil
    ---@param dpr number|nil
    ---@param blur number|nil
    ---@param top_blur table|nil
    ---@param tint table|nil
    ---@param refraction number|nil
    ---@param dispersion number|nil
    ---@return boolean
    function material.update(dimensions, surfaces, viewport_w, viewport_h, dpr, blur, top_blur, tint, refraction, dispersion)
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
        local vw_css = (viewport_w and viewport_w > 0) and viewport_w or W
        local vh_css = (viewport_h and viewport_h > 0) and viewport_h or H
        local raw_sx = W / vw_css
        local raw_sy = H / vh_css
        local base_dpr = (dpr and dpr > 0) and dpr or raw_sy
        local in_sync = (math_abs(raw_sx - base_dpr) / base_dpr < 0.04)
            and (math_abs(raw_sy - base_dpr) / base_dpr < 0.04)
        local sy = in_sync and raw_sy or base_dpr
        local ref_deg = math_max(0, math_min(10, tonumber(refraction) or 5))
        local ref_scale = ref_deg <= 5
            and (ref_deg * 0.2)
            or (1.0 + (ref_deg - 5) * 0.24)
        local disp_deg = math_max(0, math_min(10, tonumber(dispersion) or 5))
        local disp_scale = disp_deg <= 5
            and (disp_deg * 0.2)
            or (1.0 + (disp_deg - 5) * 0.24)
        local parts = {
            string_format("lg_blur=%.2f", math_max(0, math_min(100, blur or 90)) / 100),
            string_format("lg_disp=%.3f", disp_scale),
            string_format("lg_refraction=%.3f", ref_scale),
            "mzg_lens=1",
            "mzg_on=1",
            "mzg_strength=1.0",
            "mzg_tone=1",
            string_format("mzg_unit=%.6f", sy / vh),
        }
        local n_parts = 8

        local overlaps = false
        for slot = 0, MAX_SLOTS - 1 do
            local rect = list[slot + 1]
            local prefix = SLOT_PREFIXES[slot]
            if rect and rect.w and rect.h and rect.w > 0 and rect.h > 0 then
                local sx, sy_px, sw, sh
                if in_sync then
                    sx = rect.x * W
                    sy_px = rect.y * H
                    sw = rect.w * W
                    sh = rect.h * H
                else
                    local w_px = (rect.w * vw_css) * sy
                    local h_px = (rect.h * vh_css) * sy
                    sh = h_px
                    if rect.y + rect.h > 0.65 then
                        local bottom_margin = (1.0 - (rect.y + rect.h)) * vh_css * sy
                        sy_px = H - bottom_margin - sh
                    elseif rect.y < 0.35 then
                        sy_px = (rect.y * vh_css) * sy
                    else
                        sy_px = (H - sh) * 0.5
                    end

                    if rect.w > 0.82 then
                        local left_margin = (rect.x * vw_css) * sy
                        local right_margin = ((1.0 - (rect.x + rect.w)) * vw_css) * sy
                        sx = left_margin
                        sw = math_max(1, W - left_margin - right_margin)
                    elseif rect.x + rect.w > 0.85 and rect.x > 0.40 then
                        sw = w_px
                        local right_margin = ((1.0 - (rect.x + rect.w)) * vw_css) * sy
                        sx = W - right_margin - sw
                    elseif math_abs((rect.x + rect.w * 0.5) - 0.5) < 0.08 then
                        sw = w_px
                        sx = (W - sw) * 0.5
                    else
                        sw = w_px
                        sx = (rect.x * vw_css) * sy
                    end
                end
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
                local nf = math_max(0, math_min(2, tonumber(rect.f) or 0))
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

        if type(top_blur) == "table" and top_blur.h and top_blur.h > 0 then
            local ty_px = in_sync and ((tonumber(top_blur.y) or 0) * H) or ((tonumber(top_blur.y) or 0) * vh_css * sy)
            local th_px = in_sync and (top_blur.h * H) or (top_blur.h * vh_css * sy)
            local ta = math_max(0, math_min(1, tonumber(top_blur.a) or 0))
            local ny_t = (ty_px - mt) / vh
            local nh_t = th_px / vh
            if ta > 0.005 and ny_t < 1 and ny_t + nh_t > 0 then
                overlaps = true
                n_parts = n_parts + 1
                parts[n_parts] = string_format(
                    "mzg_top_y=%.5f,mzg_top_h=%.5f,mzg_top_a=%.3f",
                    ny_t, nh_t, ta
                )
            else
                n_parts = n_parts + 1
                parts[n_parts] = "mzg_top_y=0.00000,mzg_top_h=0.00000,mzg_top_a=0.000"
            end
        else
            n_parts = n_parts + 1
            parts[n_parts] = "mzg_top_y=0.00000,mzg_top_h=0.00000,mzg_top_a=0.000"
        end

        if type(tint) == "table" then
            local tr = math_max(0, math_min(1, tonumber(tint.r) or 0))
            local tg = math_max(0, math_min(1, tonumber(tint.g) or 0))
            local tb = math_max(0, math_min(1, tonumber(tint.b) or 0))
            local ta = math_max(0, math_min(1, tonumber(tint.a) or 0))
            n_parts = n_parts + 1
            parts[n_parts] = string_format(
                "mzg_tint_r=%.3f,mzg_tint_g=%.3f,mzg_tint_b=%.3f,mzg_tint_a=%.3f",
                tr, tg, tb, ta
            )
        else
            n_parts = n_parts + 1
            parts[n_parts] = "mzg_tint_r=0.000,mzg_tint_g=0.000,mzg_tint_b=0.000,mzg_tint_a=0.000"
        end

        if not overlaps then
            material.clear()
            return supported
        end

        local sig = table_concat(parts, ",")

        if not loaded then
            send("glsl-shaders", "append", shader)
            loaded = true
        end

        if sig ~= last_sig then
            last_sig = sig
            send("glsl-shader-opts", "add", sig)
            nudge_redraw()
        end

        if not active then
            active = true
            mp.set_property_native(STATUS, "active")
        end

        return supported
    end

    function material.shutdown()
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

    send("glsl-shader-opts", "add", "mzg_on=0")
    send("glsl-shaders", "append", shader)
    loaded = true
    last_sig = "mzg_on=0"
    mp.set_property_native(STATUS, "idle")
    mp.set_property_native(SUPPORTED, is_supported())
    return material
end

return Glass
