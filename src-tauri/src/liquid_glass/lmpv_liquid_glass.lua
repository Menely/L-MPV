-- GPU material based on the approach in Demetter/ModernGlass: map OSC
-- surfaces into the video rectangle and refract at the rounded edge.
local mp = require "mp"
local utils = require "mp.utils"
local base = utils.split_path(debug.getinfo(1, "S").source:sub(2))
local shader = utils.join_path(base, "glass-output.glsl")
local ui = dofile(utils.join_path(base, "glass_ui.lua"))
local status = "user-data/lmpv-liquid-glass"
local count = 10
local suffixes = { "x", "y", "w", "h", "t", "b", "a" }
local last, installed, signature = {}, nil, nil
local blur = 30

local function generate_shader()
    local template = assert(io.open(utils.join_path(base, "glass.glsl"), "rb"))
    local source = template:read("*a")
    template:close()
    local declarations = {
        "//!PARAM lg_unit\n//!TYPE DYNAMIC float\n0.001\n",
        "//!PARAM lg_capture\n//!TYPE DYNAMIC float\n0.0\n",
        "//!PARAM lg_blur\n//!TYPE DYNAMIC float\n0.3\n",
    }
    local calls = {}
    for i = 0, count - 1 do
        for _, name in ipairs(suffixes) do
            declarations[#declarations + 1] = ("//!PARAM lg_%s%d\n//!TYPE DYNAMIC float\n0.0\n"):format(name, i)
        end
        calls[#calls + 1] = ("SURFACE(%d)"):format(i)
    end
    local output = assert(io.open(shader, "wb"))
    local body = source:gsub("@SURFACES@", table.concat(calls, "\n    "))
    assert(output:write(table.concat(declarations), body))
    assert(output:close())
end

local function publish(value)
    if mp.get_property_native(status) ~= value then
        mp.set_property_native(status, value)
    end
end

local function clear()
    if installed then
        mp.commandv("change-list", "glsl-shaders", "remove", installed)
    end
    installed, signature = nil, nil
    publish("idle")
end

local function is_installed(shader_path)
    for _, path in ipairs(mp.get_property_native("glsl-shaders") or {}) do
        if path == shader_path then return true end
    end
    return false
end

local function update()
    local d = mp.get_property_native("osd-dimensions")
    if #last == 0 or not d or mp.get_property("current-vo") ~= "gpu-next"
        or not mp.get_property_native("video-out-params")
        or mp.get_property_number("video-out-params/rotate", 0) % 360 ~= 0 then
        clear()
        return
    end
    local width, height = d.w - d.ml - d.mr, d.h - d.mt - d.mb
    if width <= 0 or height <= 0 then
        clear()
        return
    end

    local opts = {
        ("lg_unit=%.7f"):format(d.h / (720 * height)),
        ("lg_blur=%.2f"):format(blur / 100),
    }
    local overlaps = false
    for i = 0, count - 1 do
        local r = last[i + 1]
        if r then
            local x, y = (r.x * d.w - d.ml) / width, (r.y * d.h - d.mt) / height
            local w, h = r.w * d.w / width, r.h * d.h / height
            overlaps = overlaps or (x < 1 and x + w > 0 and y < 1 and y + h > 0)
            local values = { x, y, w, h, r.top_radius * d.h / height, r.bottom_radius * d.h / height, r.opacity }
            for j, name in ipairs(suffixes) do
                opts[#opts + 1] = ("lg_%s%d=%.6f"):format(name, i, values[j])
            end
        else
            opts[#opts + 1] = "lg_w" .. i .. "=0"
        end
    end
    if not overlaps then
        clear()
        return
    end

    local nextSignature = table.concat(opts, ",")
    if signature ~= nextSignature then
        if not mp.commandv("change-list", "glsl-shader-opts", "add", nextSignature) then return end
        signature = nextSignature
    end
    if not is_installed(shader) then
        installed = mp.commandv("change-list", "glsl-shaders", "append", shader) and shader or nil
    end
    publish(installed and "active" or "idle")
end

local ok, error_message = pcall(generate_shader)
if not ok then
    mp.msg.error(error_message)
    publish("failed")
    return
end
mp.register_script_message("surfaces", function(json, amount, controls)
    last = utils.parse_json(json) or {}
    blur = math.min(100, math.max(0, tonumber(amount) or 30))
    local frame = controls and utils.parse_json(controls)
    update()
    local rendered, render_error = pcall(ui.render, frame, last)
    if not rendered then
        ui.clear()
        mp.msg.warn("Liquid Glass controls: " .. tostring(render_error))
    end
end)
mp.observe_property("osd-dimensions", "native", update)
mp.observe_property("video-out-params", "native", update)
mp.register_event("end-file", function()
    last = {}
    clear()
    ui.clear()
end)
publish("idle")
