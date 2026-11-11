// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(result) = l_mpv_lib::thumbnail_worker::dispatch() {
        if let Err(error) = result {
            l_mpv_lib::log_error("thumbnail worker", &error);
            std::process::exit(1);
        }
        return;
    }
    l_mpv_lib::run()
}
