//! Stable adapter identity for upstream's subprocess request, intercepted in Lua.
use std::path::PathBuf;
pub(super) fn executable() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| e.to_string())
}
