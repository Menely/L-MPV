local mp = require "mp"
local utils = require "mp.utils"

local Glass = {}
local STATUS = "user-data/lmpv-liquid-glass"

function Glass.new(directory)
    local shader = utils.join_path(directory, "floating_glass.glsl")
    local loaded, active, signature = false, false, nil
    local material = {}

    function material.clear()
        if active then
            mp.commandv("change-list", "glsl-shader-opts", "add", "mzg_on=0")
            active, signature = false, nil
            mp.set_property_native(STATUS, "idle")
        end
    end

    function material.update(dimensions, surfaces, scale, blur)
        if mp.get_property("current-vo") ~= "gpu-next"
            or not mp.get_property_native("video-out-params")
            or mp.get_property_number("video-out-params/rotate", 0) % 360 ~= 0 then
            material.clear()
            return nil
        end

        local left, top = dimensions.ml or 0, dimensions.mt or 0
        local right = dimensions.w - (dimensions.mr or 0)
        local bottom = dimensions.h - (dimensions.mb or 0)
        local width, height = right - left, bottom - top
        if width <= 0 or height <= 0 then
            material.clear()
            return nil
        end

        local values = {
            ("mzg_on=1,mzg_lens=1,mzg_shadow=0,mzg_tone=1,lg_blur=%.2f,mzg_unit=%.7f")
                :format(blur / 100, scale / height),
        }
        local overlaps = false
        for slot = 0, 1 do
            local surface = surfaces[slot + 1]
            local prefix = "mzg_" .. slot
            if surface then
                local x, y = (surface.x - left) / width, (surface.y - top) / height
                local w, h = surface.w / width, surface.h / height
                overlaps = overlaps or (x < 1 and y < 1 and x + w > 0 and y + h > 0)
                values[#values + 1] = ("%sx=%.7f,%sy=%.7f,%sw=%.7f,%sh=%.7f,%sr=%.7f,%sf=%d")
                    :format(prefix, x, prefix, y, prefix, w, prefix, h,
                        prefix, surface.radius / height, prefix, slot)
            else
                values[#values + 1] = prefix .. "w=0"
            end
        end
        if not overlaps then
            material.clear()
            return nil
        end

        local next_signature = table.concat(values, ",")
        if signature ~= next_signature then
            if not mp.commandv("change-list", "glsl-shader-opts", "add", next_signature) then
                material.clear()
                return nil
            end
            signature = next_signature
        end
        if not loaded then
            loaded = not not mp.commandv("change-list", "glsl-shaders", "append", shader)
        end
        if loaded and not active then
            active = true
            mp.set_property_native(STATUS, "active")
        end
        return loaded and { left, top, right, bottom } or nil
    end

    function material.shutdown()
        material.clear()
        if loaded then
            mp.commandv("change-list", "glsl-shaders", "remove", shader)
        end
    end

    mp.set_property_native(STATUS, "idle")
    return material
end

return Glass
