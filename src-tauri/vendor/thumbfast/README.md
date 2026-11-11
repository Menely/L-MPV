# thumbfast

`thumbfast.lua` is the unmodified upstream source at commit
`0f711de3138c9bd6718209d819ac54022c23ded2`:
https://github.com/iiiGerardoiii/thumbfast

License: Mozilla Public License 2.0 (the notice is retained in the source).
https://mozilla.org/MPL/2.0/

L-MPV's transport/configuration adapter lives separately in
`src/commands/thumbnails/thumbfast_bridge.lua`. The upstream script is unchanged.

The adapter intercepts upstream's thumbnail subprocess request and serves it with
one owned Rust worker thread in the existing player process. The original Lua
code still owns seeking/refinement and consumes BGRA through its normal native
mpv IPC channel. No second player process is launched for ordinary previews.

`src/thumbnail_worker/` validates arguments and opens a private context from the
existing sibling `libmpv-2.dll`. Copy-back decoding and filter threads are limited;
startup and live filter changes use one graph, with HDR scaling before float
conversion. The main playback context is independent and is never sought.

The host joins an old worker before replacement and on teardown. Idle sessions
are released after five seconds. PreviewCore uses synchronous native termination
to wait for IPC clients and decoder resources. Integration tests verify that the
IPC PID matches the host and the endpoint disappears after release.

The original private CLI diagnostic mode remains available for the worker
regression script, but is not used by the application's thumbnail path.
