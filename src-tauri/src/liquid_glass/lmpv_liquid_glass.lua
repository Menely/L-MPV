local mp = require "mp"
local utils = require "mp.utils"
local base = utils.split_path(debug.getinfo(1, "S").source:sub(2))
package.path = utils.join_path(base, "?.lua") .. ";" .. package.path

local glass = require("glass").new(base)

local READY = "user-data/lmpv-liquid-glass-ready"
local dimensions = mp.get_property_native("osd-dimensions")
local loaded_media = not mp.get_property_bool("idle-active", true)
local config = nil

local function refresh()
    if not (config and config.active and loaded_media) then
        glass.clear()
        return
    end
    glass.update(
        dimensions,
        config.surfaces,
        config.viewportW,
        config.viewportH,
        config.dpr,
        config.blur,
        config.topBlur,
        config.tint
    )
end

mp.register_script_message("config", function(json)
    local parsed = utils.parse_json(json)
    if type(parsed) ~= "table" or not parsed.active then
        config = nil
        glass.clear()
        return
    end
    config = {
        active = true,
        blur = math.max(0, math.min(100, tonumber(parsed.blur) or 90)),
        viewportW = tonumber(parsed.viewportW) or 0,
        viewportH = tonumber(parsed.viewportH) or 0,
        dpr = tonumber(parsed.dpr) or 1,
        surfaces = type(parsed.surfaces) == "table" and parsed.surfaces or {},
        topBlur = type(parsed.topBlur) == "table" and parsed.topBlur or nil,
        tint = type(parsed.tint) == "table" and parsed.tint or nil,
    }
    if mp.get_property_native("video-out-params") then
        loaded_media = true
    end
    refresh()
end)

mp.observe_property("osd-dimensions", "native", function(_, value)
    dimensions = value
    refresh()
end)

mp.observe_property("video-out-params", "native", function(_, value)
    if value then
        loaded_media = true
    end
    refresh()
end)

mp.observe_property("current-vo", "string", function()
    refresh()
end)

mp.register_event("file-loaded", function()
    loaded_media = true
    refresh()
end)

mp.register_event("end-file", function()
    loaded_media = false
    glass.clear()
end)

mp.register_event("shutdown", function()
    glass.shutdown()
end)

mp.set_property_native(READY, true)
