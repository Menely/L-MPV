//! Hold only initial CLI playback until the visible frontend has committed its video surface.
use super::types::PlayerState;
use tauri::{Manager, State};

fn same_path(a: &str, b: &str) -> bool {
    a.replace('\\', "/").eq_ignore_ascii_case(&b.replace('\\', "/"))
}

pub fn arm_startup_playback(state: &PlayerState, path: &str) -> Result<(), String> {
    let mut pending = state.startup_playback.lock().map_err(|e| e.to_string())?;
    // An explicit pause from mpv.conf is user intent, not our temporary hold.
    if state.mpv.get_property_bool("pause")? {
        return Ok(());
    }
    state.mpv.set_property_string("pause", "yes")?;
    *pending = Some(path.to_owned());
    println!("[Startup] playback held until window is visible");
    Ok(())
}

/// Explicit pause/transport input owns playback after this point.
pub fn cancel_startup_playback(state: &PlayerState, resume: bool) -> Result<(), String> {
    let mut pending = state.startup_playback.lock().map_err(|e| e.to_string())?;
    if pending.is_some() {
        if resume { state.mpv.set_property_string("pause", "no")?; }
        *pending = None;
    }
    Ok(())
}

pub fn cancel_startup_for_other_file(state: &PlayerState, path: &str) -> Result<(), String> {
    let mut pending = state.startup_playback.lock().map_err(|e| e.to_string())?;
    if pending.as_deref().is_some_and(|target| !same_path(target, path)) {
        state.mpv.set_property_string("pause", "no")?;
        *pending = None;
    }
    Ok(())
}

/// true = completed or no pending startup; false = still waiting for this file.
#[tauri::command]
pub fn complete_startup_playback(app: tauri::AppHandle, state: State<'_, PlayerState>) -> Result<bool, String> {
    let mut pending = state.startup_playback.lock().map_err(|e| e.to_string())?;
    let Some(target) = pending.as_deref() else { return Ok(true); };
    let visible = app.get_webview_window("main").is_some_and(|window| window.is_visible().unwrap_or(false));
    let current = state.mpv.get_property_string("path").unwrap_or_default();
    let output = state.mpv.video_output_status_for(target);
    let audio_only = output.video_track.is_some() && !output.has_video;
    if !visible || !same_path(target, &current) || !(output.ready || audio_only) {
        return Ok(false);
    }
    state.mpv.set_property_string("pause", "no")?;
    *pending = None;
    println!("[Startup] visible frontend ready; playback released");
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::same_path;
    #[test]
    fn startup_target_matches_mpv_path_without_matching_another_file() {
        assert!(same_path(r"F:\Movie\фильм.mkv", "f:/Movie/фильм.mkv"));
        assert!(!same_path(r"F:\Movie\first.mkv", "F:/Movie/second.mkv"));
        assert!(!same_path("F:/Movie/file.mkv", ""));
    }
}
