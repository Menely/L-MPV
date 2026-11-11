-- L-MPV transport adapter. The upstream thumbfast.lua follows this prefix
-- unchanged; it owns seeking/timing/filter choices. Decoding stays in this process.
local utils = require "mp.utils"
local options = require "mp.options"
local original_read = options.read_options
options.read_options = function(o, name, ...)
    original_read(o, name, ...)
    if name == "thumbfast" then
        o.mpv_path = bridge.exe
        o.thumbnail = bridge.base
        o.socket = bridge.socket
        o.max_width, o.max_height = 320, 180
        o.hwdec, o.direct_io = true, true
        o.spawn_first = false
        o.quit_after_inactivity = 30
    end
end

local script = mp.get_script_name()
local request, requested_time, info, sequence = nil, nil, nil, 0
local previous, older
local retry
-- Adapt only subprocess transport: the original script keeps seek scheduling,
-- filters and refinement. The host runs its decoder in an owned Rust thread.
local original_async = mp.command_native_async
local original_abort = mp.abort_async_command
local worker_sequence = 0
local pending = {}
local function packet(name, value)
    local path = bridge.dir .. "/" .. name
    local f = io.open(path .. ".part", "w")
    if not f then return false end
    f:write(utils.format_json(value)); f:close()
    os.remove(path)
    return os.rename(path .. ".part", path)
end
mp.command_native_async = function(command, callback)
    if command.name == "subprocess" and command.args and command.args[1] == bridge.exe then
        worker_sequence = worker_sequence + 1
        local args = {"--lmpv-thumbnail-parent=" .. bridge.parent}
        for i = 2, #command.args do args[#args + 1] = command.args[i] end
        pending[worker_sequence] = callback or function() end
        packet("worker-request.json", {sequence=worker_sequence, args=args})
        return -worker_sequence
    end
    return original_async(command, callback)
end
mp.abort_async_command = function(id)
    if type(id) == "number" and id < 0 then
        local sequence = -id
        if pending[sequence] then packet("worker-stop.json", {sequence=sequence}) end
        pending[sequence] = nil
        return
    end
    return original_abort(id)
end
local worker_timer = mp.add_periodic_timer(0.02, function()
    for sequence, callback in pairs(pending) do
        local path = bridge.dir .. "/worker-result-" .. sequence .. ".json"
        local f = io.open(path, "r")
        if f then
            local result = utils.parse_json(f:read("*a")); f:close()
            if result then
                os.remove(path)
                pending[sequence] = nil
                callback(true, {status=result.status, stdout="", stderr=""}, nil)
            end
        end
    end
end)

mp.register_script_message("thumbfast-render", function(json)
    info = utils.parse_json(json)
    if not request or not info then return end
    local raw = info.thumbnail .. ".bgra"
    local stat = utils.file_info(raw)
    if not stat then return end
    local f = io.open(raw, "rb")
    if not f then return end
    local bytes = f:read("*a"); f:close()
    if not bytes or #bytes ~= info.width * info.height * 4 then return end
    sequence = sequence + 1
    local name = "frame-" .. sequence .. ".bgra"
    f = io.open(bridge.dir .. "/" .. name, "wb")
    if not f then return end
    f:write(bytes); f:close()
    local reply = utils.format_json({id=request, width=info.width, height=info.height,
        frame=name, socket=info.socket})
    f = io.open(bridge.dir .. "/reply.tmp", "w")
    if not f then return end
    f:write(reply); f:close()
    os.remove(bridge.dir .. "/reply.json")
    os.rename(bridge.dir .. "/reply.tmp", bridge.dir .. "/reply.json")
    if older then os.remove(bridge.dir .. "/" .. older) end
    older, previous = previous, name
    if retry then retry:kill() end
end)

retry = mp.add_periodic_timer(0.1, function()
    if request then mp.commandv("script-message-to", script, "thumb", requested_time, "", "", script) end
end)
retry:kill()

mp.register_script_message("lmpv-thumb", function(id, time)
    request = id
    -- For a repeated position, the existing upstream frame is already usable.
    local repeated = requested_time == time
    requested_time = time
    retry:resume()
    mp.commandv("script-message-to", script, "thumb", time, "", "", script)
    if repeated and info then
        mp.commandv("script-message-to", script, "thumbfast-render", utils.format_json(info))
    end
end)

mp.register_script_message("lmpv-shutdown", function()
    request = nil
    retry:kill()
    worker_timer:kill()
    pending = {}
    mp.keep_running = false
end)
