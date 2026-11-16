use crate::{commands::{dir_scan, history, types::{escape_mpv_path, PlayerState}}, mpv_manager::MpvManager};
use tauri::Emitter;

fn prepare_queue(paths: &[String], selected: usize) -> Result<(Vec<String>, usize), String> {
    let selected_path = paths.get(selected).ok_or("Недопустимый индекс файла плейлиста")?;
    if !std::path::Path::new(selected_path).is_file() { return Err("Выбранный файл плейлиста не найден или недоступен".into()); }
    let mut queue = Vec::new();
    let mut index = None;
    for (original, path) in paths.iter().enumerate() {
        if std::path::Path::new(path).is_file() {
            if original == selected { index = Some(queue.len()); }
            queue.push(path.clone());
        }
    }
    // Recheck the selected slot: a disappearing file must never select its neighbour.
    let index = index.ok_or("Выбранный файл плейлиста больше недоступен")?;
    Ok((queue, index))
}

fn queue_commands(paths: &[String], selected: usize) -> Vec<String> {
    let mut commands = vec![format!("loadfile \"{}\" replace", escape_mpv_path(&paths[selected]))];
    for (index, path) in paths[..selected].iter().enumerate() {
        commands.push(format!("loadfile \"{}\" append", escape_mpv_path(path)));
        // Move a newly appended predecessor before the current file; mpv keeps
        // playing the selected entry while updating its playlist index.
        commands.push(format!("playlist-move {} {}", index + 1, index));
    }
    for path in &paths[selected + 1..] { commands.push(format!("loadfile \"{}\" append", escape_mpv_path(path))); }
    commands
}

struct PauseGuard<'a> { mpv: &'a MpvManager, paused: bool }
impl Drop for PauseGuard<'_> { fn drop(&mut self) { let _ = self.mpv.set_property_string("pause", if self.paused { "yes" } else { "no" }); } }

fn queue_matches(mpv: &MpvManager, paths: &[String]) -> bool {
    let count = mpv.get_property_double("playlist/count").unwrap_or(-1.0);
    count == paths.len() as f64 && paths.iter().enumerate().all(|(index, path)| {
        mpv.get_property_string(&format!("playlist/{index}/filename")).is_ok_and(|actual|
            crate::commands::background_io::same_path(&actual, path))
    })
}

fn load_external_tracks(
    app: &tauri::AppHandle, mpv: std::sync::Arc<MpvManager>, target: String, previous: String,
    generation: u64, opening: crate::commands::background_io::OpenWork,
) {
    let app = app.clone();
    let _ = std::thread::Builder::new().name("lmpv-saved-tracks".into()).spawn(move || {
        let settings = crate::commands::types::AppSettings::load_portable();
        if !settings.auto_load_tracks { return; }
        if !settings.auto_select_external_audio { opening.audio_selected(); }
        if !crate::commands::background_io::wait_for_open(&mpv, &target, &previous, generation, false) { return; }
        if let Err(error) = crate::commands::tracks::load_external_tracks_internal(
            &mpv, std::path::Path::new(&target), settings.auto_select_external_audio, Some(generation), &previous,
        ) { eprintln!("[L-MPV] Ошибка внешних дорожек сохранённого плейлиста: {error}"); }
        opening.audio_selected();
        if dir_scan::current_open_generation() == generation {
            // Existing frontend consumers refresh both the queue and tracks.
            let _ = app.emit("playlist-updated", ());
        }
        // Dropping opening releases the gate. This job never populates a queue.
    });
}

pub(super) fn play(app: &tauri::AppHandle, state: &PlayerState, paths: &[String], selected: usize, requested_generation: u64) -> Result<(), String> {
    let (queue, selected) = prepare_queue(paths, selected)?;
    let commands = queue_commands(&queue, selected);
    let transition = dir_scan::lock_open_transition()?;
    if dir_scan::current_open_generation() != requested_generation {
        return Err("Запрос плейлиста отменён: уже открыт другой файл".into());
    }
    crate::commands::startup::cancel_startup_playback(state, true)?;
    let matches = queue_matches(&state.mpv, &queue);
    let previous = state.mpv.get_property_string("path").unwrap_or_default();
    // Even an already selected saved queue owns its order after this command:
    // a stale automatic folder job must not append more neighbours afterwards.
    let generation = dir_scan::next_open_generation();
    let opening = crate::commands::background_io::OpenWork::begin(generation, true);
    if matches && state.mpv.get_property_double("playlist-pos").unwrap_or(-1.0) == selected as f64 {
        drop(transition);
        load_external_tracks(app, state.mpv.clone(), queue[selected].clone(), previous, generation, opening);
        return Ok(());
    }
    history::save_current_playback_position(state);
    history::save_history_to_disk();
    if matches {
        let _ = history::apply_resume_start(state, &queue[selected]);
        state.mpv.set_property_string("playlist-pos", &selected.to_string())?;
        state.ambient_controller.invalidate();
        drop(transition);
        load_external_tracks(app, state.mpv.clone(), queue[selected].clone(), previous, generation, opening);
        let _ = app.emit("playlist-updated", ());
        return Ok(());
    }
    let pause = PauseGuard { mpv: &state.mpv, paused: state.mpv.get_property_bool("pause").unwrap_or(false) };
    state.mpv.set_property_string("pause", "yes")?;
    let _ = history::apply_resume_start(state, &queue[selected]);
    for command in commands { state.mpv.command(&command)?; }
    let _ = state.mpv.set_property_double("video-zoom", 0.0);
    let _ = state.mpv.set_property_double("video-pan-x", 0.0);
    let _ = state.mpv.set_property_double("video-pan-y", 0.0);
    state.ambient_controller.invalidate();
    drop(pause);
    drop(transition);
    load_external_tracks(app, state.mpv.clone(), queue[selected].clone(), previous, generation, opening);
    let _ = app.emit("playlist-updated", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::saved_playlists::tests::Fixture;

    #[test]
    fn filters_missing_entries_and_maps_selected_duplicate_by_original_index() {
        let fixture = Fixture::new();
        let a = fixture.media("a.mp3"); let b = fixture.media("b.mkv");
        std::fs::write(&a, b"fixture").unwrap(); std::fs::write(&b, b"fixture").unwrap();
        let paths = vec![fixture.media("missing.mp4"), a.clone(), b.clone(), a.clone()];
        assert_eq!(prepare_queue(&paths, 3).unwrap(), (vec![a.clone(), b, a], 2));
        assert!(prepare_queue(&paths, 0).is_err());
        assert!(prepare_queue(&paths, paths.len()).is_err());
        assert!(prepare_queue(&[], 0).is_err());
    }

    #[test]
    fn queue_activation_starts_selected_only_and_preserves_original_order() {
        let paths: Vec<_> = ["a", "b", "c", "d"].into_iter().map(str::to_owned).collect();
        for selected in 0..paths.len() {
            let mut actual = Vec::new();
            let mut current = String::new();
            for command in queue_commands(&paths, selected) {
                if command.starts_with("loadfile") {
                    let path = command.split('"').nth(1).unwrap().to_owned();
                    if command.ends_with("replace") { actual.clear(); current = path.clone(); }
                    actual.push(path);
                } else {
                    let mut args = command.split_whitespace().skip(1).map(|value| value.parse::<usize>().unwrap());
                    let from = args.next().unwrap(); let to = args.next().unwrap();
                    let entry = actual.remove(from); actual.insert(to, entry);
                }
            }
            assert_eq!(actual, paths); assert_eq!(current, paths[selected]);
        }
        let escaped = queue_commands(&["C:\\Vídeo\\part; name \"quoted\".mkv".into()], 0);
        assert_eq!(escaped, [r#"loadfile "C:/Vídeo/part; name \"quoted\".mkv" replace"#]);
    }
}
