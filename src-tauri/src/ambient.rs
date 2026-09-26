use crate::ambient_sampler::{
    apply_vibrance, build_segment_sample_points, mean_luma, sample_bgr_samples,
    spatial_smooth_segments, suppress_dark_noise, temporal_attack_release, Oklab,
    MAX_SEGMENT_COUNT, MIN_SEGMENT_COUNT,
};
use crate::mpv_manager::MpvManager;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::Emitter;

pub use crate::ambient_sampler::SampleWidths as AmbientSampleWidths;

const MIN_SMOOTHING_ATTACK_MS: u32 = 50;
const MIN_SMOOTHING_RELEASE_MS: u32 = 100;
/// Проходов пространственного сглаживания между соседними сегментами.
const SPATIAL_SMOOTH_PASSES: u32 = 2;
/// Ниже этой средней светлоты грань считается «тёмной» и шум в ней гасится.
const DARK_NOISE_LUMA_THRESHOLD: f32 = 0.035;
/// Усиление малонасыщенных цветов (vibrance), 0..1.
const VIBRANCE_AMOUNT: f32 = 0.22;
/// Скачок средней светлоты, после которого сцена считается сменой.
const SCENE_CUT_LUMA_JUMP: f32 = 0.12;
/// Время атаки при обнаруженной смене сцены.
const SCENE_CUT_ATTACK_MS: f32 = 60.0;

fn default_segment_count() -> u8 {
    7
}

fn default_sample_interval_ms() -> u32 {
    100
}

fn default_smoothing_attack_ms() -> u32 {
    180
}

fn default_smoothing_release_ms() -> u32 {
    650
}

fn default_segment_spread() -> f32 {
    130.0
}

fn default_segment_gap() -> f32 {
    0.0
}

fn default_sample_widths() -> AmbientSampleWidths {
    AmbientSampleWidths::default()
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AmbientMode {
    #[default]
    Off,
    Blur,
    Color,
    Ambilight,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct AmbientSettings {
    pub mode: AmbientMode,
    pub blur_radius: u32,
    pub color: String,
    #[serde(default = "default_100")]
    pub brightness: u32,
    #[serde(default = "default_100")]
    pub saturation: u32,
    #[serde(default = "default_segment_count")]
    pub segment_count: u8,
    #[serde(default = "default_sample_widths")]
    pub sample_widths: AmbientSampleWidths,
    #[serde(default = "default_sample_interval_ms")]
    pub sample_interval_ms: u32,
    #[serde(default = "default_smoothing_attack_ms")]
    pub smoothing_attack_ms: u32,
    #[serde(default = "default_smoothing_release_ms")]
    pub smoothing_release_ms: u32,
    #[serde(default = "default_segment_spread")]
    pub segment_spread: f32,
    #[serde(default = "default_segment_gap")]
    pub segment_gap: f32,
}

fn default_100() -> u32 {
    100
}

impl Default for AmbientSettings {
    fn default() -> Self {
        Self {
            mode: AmbientMode::Off,
            blur_radius: 100,
            color: "#7fc7ff".to_string(),
            brightness: 100,
            saturation: 100,
            segment_count: default_segment_count(),
            sample_widths: AmbientSampleWidths::default(),
            sample_interval_ms: default_sample_interval_ms(),
            smoothing_attack_ms: default_smoothing_attack_ms(),
            smoothing_release_ms: default_smoothing_release_ms(),
            segment_spread: default_segment_spread(),
            segment_gap: default_segment_gap(),
        }
    }
}

fn finite_clamp(value: f32, min: f32, max: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        fallback
    }
}

impl AmbientSettings {
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.blur_radius = value.blur_radius.clamp(5, 150);
        value.brightness = if value.brightness == 0 {
            100
        } else {
            value.brightness.clamp(20, 150)
        };
        value.saturation = value.saturation.clamp(0, 150);
        value.segment_count = value
            .segment_count
            .clamp(MIN_SEGMENT_COUNT as u8, MAX_SEGMENT_COUNT as u8);
        value.sample_widths = value.sample_widths.normalized();
        value.sample_interval_ms = value.sample_interval_ms.clamp(100, 500);
        value.smoothing_attack_ms = value
            .smoothing_attack_ms
            .clamp(MIN_SMOOTHING_ATTACK_MS, 2000);
        value.smoothing_release_ms = value
            .smoothing_release_ms
            .clamp(MIN_SMOOTHING_RELEASE_MS, 5000);
        value.segment_spread = finite_clamp(value.segment_spread, 100.0, 200.0, 130.0);
        value.segment_gap = finite_clamp(value.segment_gap, 0.0, 50.0, 0.0);
        value
    }

    pub fn normalize(&mut self) {
        *self = self.normalized();
    }
}

fn parse_hex_color(color: &str) -> Option<&str> {
    let bytes = color.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' {
        return None;
    }
    if bytes[1..].iter().all(|b| b.is_ascii_hexdigit()) {
        Some(color)
    } else {
        None
    }
}

fn hex_to_rgb(hex: &str) -> Option<(f32, f32, f32)> {
    let bytes = hex.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' {
        return None;
    }
    let bytes = hex.as_bytes();
    let component = |index: usize| {
        u8::from_str_radix(std::str::from_utf8(&bytes[index..index + 2]).ok()?, 16)
            .ok()
            .map(|value| value as f32 / 255.0)
    };
    Some((component(1)?, component(3)?, component(5)?))
}

fn rgb_to_hex(r: f32, g: f32, b: f32) -> String {
    let component = |value: f32| (value.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!(
        "#{:02X}{:02X}{:02X}",
        component(r),
        component(g),
        component(b)
    )
}

pub fn adjust_color(base_hex: &str, brightness: u32, saturation: u32) -> Option<String> {
    if brightness == 100 && saturation == 100 {
        return parse_hex_color(base_hex).map(str::to_string);
    }
    let (r, g, b) = hex_to_rgb(base_hex)?;
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let saturation_factor = saturation.clamp(0, 150) as f32 / 100.0;
    let (mut red, mut green, mut blue) = (
        luma + (r - luma) * saturation_factor,
        luma + (g - luma) * saturation_factor,
        luma + (b - luma) * saturation_factor,
    );
    let brightness_factor = if brightness == 0 {
        1.0
    } else {
        brightness.clamp(20, 150) as f32 / 100.0
    };
    red *= brightness_factor;
    green *= brightness_factor;
    blue *= brightness_factor;
    Some(rgb_to_hex(red, green, blue))
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct AmbientPalette {
    pub generation: u64,
    pub visible: bool,
    pub reset: bool,
    pub segment_count: u8,
    pub colors: Vec<u8>,
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
    pub spread: f32,
    pub gap: f32,
    pub attack_ms: u32,
    pub release_ms: u32,
    /// Размер OSD в пикселях, в котором заданы доли `top/right/bottom/left`.
    /// Фронтенд использует его, чтобы маска свечения точно совпала с кадром.
    pub osd_width: f32,
    pub osd_height: f32,
}

impl Default for AmbientPalette {
    fn default() -> Self {
        Self {
            generation: 0,
            visible: false,
            reset: false,
            segment_count: default_segment_count(),
            colors: vec![0; default_segment_count() as usize * 4 * 3],
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
            spread: default_segment_spread(),
            gap: default_segment_gap(),
            attack_ms: default_smoothing_attack_ms(),
            release_ms: default_smoothing_release_ms(),
            osd_width: 0.0,
            osd_height: 0.0,
        }
    }
}

impl AmbientPalette {
    fn blank(settings: &AmbientSettings, generation: u64, visible: bool, reset: bool) -> Self {
        Self {
            generation,
            visible,
            reset,
            segment_count: settings.segment_count,
            colors: vec![0; settings.segment_count as usize * 4 * 3],
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
            spread: settings.segment_spread,
            gap: settings.segment_gap,
            attack_ms: settings.smoothing_attack_ms,
            release_ms: settings.smoothing_release_ms,
            osd_width: 0.0,
            osd_height: 0.0,
        }
    }
}

struct AmbientRuntime {
    app: Mutex<Option<tauri::AppHandle>>,
    settings: Mutex<AmbientSettings>,
    generation: AtomicU64,
    palette: Mutex<Option<AmbientPalette>>,
    active: AtomicBool,
    stop: AtomicBool,
    wake: Mutex<bool>,
    signal: Condvar,
}

impl AmbientRuntime {
    fn new(settings: AmbientSettings) -> Self {
        Self {
            app: Mutex::new(None),
            settings: Mutex::new(settings),
            generation: AtomicU64::new(0),
            palette: Mutex::new(None),
            active: AtomicBool::new(false),
            stop: AtomicBool::new(false),
            wake: Mutex::new(false),
            signal: Condvar::new(),
        }
    }

    fn settings(&self) -> AmbientSettings {
        self.settings_with_generation().0
    }

    fn settings_with_generation(&self) -> (AmbientSettings, u64) {
        let settings = self
            .settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        (settings.clone(), self.generation.load(Ordering::SeqCst))
    }

    fn replace_settings(&self, settings: AmbientSettings, active: bool) -> u64 {
        let mut current = self
            .settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *current = settings;
        self.active.store(active, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn is_active(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }

    fn current_generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    fn notify(&self) {
        let mut wake = self
            .wake
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *wake = true;
        self.signal.notify_all();
    }

    fn sleep(&self, duration: Duration) {
        let wake = self
            .wake
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let (mut wake, _) = self
            .signal
            .wait_timeout(wake, duration)
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *wake = false;
    }

    fn attach_app(&self, app: tauri::AppHandle) {
        *self
            .app
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(app);
        self.notify();
    }

    fn emit(&self, palette: &AmbientPalette) {
        let app = self
            .app
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        if let Some(app) = app {
            let _ = app.emit("ambient-palette", palette.clone());
        }
    }

    fn sync_palette(
        &self,
        generation: u64,
        settings: &AmbientSettings,
        visible: bool,
        reset: bool,
        thickness: Option<[f32; 4]>,
    ) -> Option<AmbientPalette> {
        let mut palette = self
            .palette
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if self.current_generation() != generation {
            return None;
        }
        if palette.is_none() && visible {
            *palette = Some(AmbientPalette::blank(settings, generation, visible, reset));
        }
        let result = palette.as_mut()?;
        result.generation = generation;
        result.visible = visible;
        result.reset = reset;
        result.segment_count = settings.segment_count;
        result.spread = settings.segment_spread;
        result.gap = settings.segment_gap;
        result.attack_ms = settings.smoothing_attack_ms;
        result.release_ms = settings.smoothing_release_ms;
        let required = settings.segment_count as usize * 4 * 3;
        if result.colors.len() != required {
            result.colors.resize(required, 0);
        }
        if let Some([top, right, bottom, left]) = thickness {
            result.top = top.clamp(0.0, 1.0);
            result.right = right.clamp(0.0, 1.0);
            result.bottom = bottom.clamp(0.0, 1.0);
            result.left = left.clamp(0.0, 1.0);
        }
        Some(result.clone())
    }

    fn publish(&self, palette: AmbientPalette) {
        let _current_settings = self
            .settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        self.publish_locked(palette);
    }

    fn publish_locked(&self, palette: AmbientPalette) {
        if self.current_generation() != palette.generation {
            return;
        }
        let mut current = self
            .palette
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if current
            .as_ref()
            .map(|value| value.generation != palette.generation)
            .unwrap_or(false)
        {
            return;
        }
        *current = Some(palette.clone());
        drop(current);
        self.emit(&palette);
    }

    fn invalidate(&self) {
        let current = self
            .settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let settings = current.clone();
        let visible = self.is_active() && settings.mode == AmbientMode::Ambilight;
        let _ = self.sync_palette(generation, &settings, visible, true, None);
        if visible {
            let palette = {
                let mut cached = self
                    .palette
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                cached.as_mut().map(|palette| {
                    palette.colors.fill(0);
                    palette.top = 0.0;
                    palette.right = 0.0;
                    palette.bottom = 0.0;
                    palette.left = 0.0;
                    palette.clone()
                })
            };
            if let Some(palette) = palette {
                self.publish_locked(palette);
            }
        }
        drop(current);
        self.notify();
    }
}

pub struct AmbientController {
    mpv: Arc<MpvManager>,
    last_applied: Mutex<Option<AmbientSettings>>,
    runtime: Arc<AmbientRuntime>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl AmbientController {
    pub fn new(mpv: Arc<MpvManager>, initial: AmbientSettings) -> Self {
        let normalized = initial.normalized();
        Self {
            mpv,
            last_applied: Mutex::new(None),
            runtime: Arc::new(AmbientRuntime::new(normalized)),
            worker: Mutex::new(None),
        }
    }

    pub fn attach_app(&self, app: tauri::AppHandle) {
        self.runtime.attach_app(app);
    }

    pub fn start_worker(&self) {
        let mut worker = self
            .worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if worker.is_some() {
            return;
        }
        let runtime = self.runtime.clone();
        let mpv = self.mpv.clone();
        let handle = std::thread::Builder::new()
            .name("lmpv-ambilight".to_string())
            .spawn(move || ambient_worker(mpv, runtime))
            .ok();
        *worker = handle;
    }

    pub fn stop_worker(&self) {
        self.runtime.stop.store(true, Ordering::SeqCst);
        *self
            .runtime
            .app
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
        self.runtime.notify();
        let handle = self
            .worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take();
        if let Some(handle) = handle {
            let _ = handle.join();
        }
    }

    pub fn get_settings(&self) -> AmbientSettings {
        self.runtime.settings()
    }

    pub fn get_palette(&self) -> Option<AmbientPalette> {
        self.runtime
            .palette
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn invalidate(&self) {
        self.runtime.invalidate();
    }

    fn has_bars(mpv: &MpvManager) -> bool {
        let video_width = mpv.get_property_double("video-params/dw").unwrap_or(0.0);
        let video_height = mpv.get_property_double("video-params/dh").unwrap_or(0.0);
        let osd_width = mpv.get_property_double("osd-width").unwrap_or(0.0);
        let osd_height = mpv.get_property_double("osd-height").unwrap_or(0.0);
        if video_width <= 0.0 || video_height <= 0.0 || osd_width <= 0.0 || osd_height <= 0.0 {
            return true;
        }
        ((video_width / video_height) - (osd_width / osd_height)).abs() > 0.02
    }

    pub fn apply(&self, settings: &AmbientSettings) -> Result<(), String> {
        let normalized = settings.normalized();
        let mut effective = normalized.clone();
        if effective.mode != AmbientMode::Off
            && effective.mode != AmbientMode::Ambilight
            && !Self::has_bars(&self.mpv)
        {
            effective.mode = AmbientMode::Off;
        }

        let mut last_guard = self
            .last_applied
            .lock()
            .map_err(|_| "Ошибка блокировки кэша Ambient".to_string())?;
        let previous = last_guard.clone();
        let mode_changed = previous
            .as_ref()
            .map(|value| value.mode != effective.mode)
            .unwrap_or(true);

        match effective.mode {
            AmbientMode::Off => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "color")?;
                    self.mpv
                        .set_property_string("background-color", "#000000")?;
                }
            }
            AmbientMode::Blur => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "blur")?;
                }
                let radius_changed = previous
                    .as_ref()
                    .map(|value| mode_changed || value.blur_radius != effective.blur_radius)
                    .unwrap_or(true);
                if radius_changed {
                    self.mpv.set_property_string(
                        "background-blur-radius",
                        &effective.blur_radius.to_string(),
                    )?;
                }
            }
            AmbientMode::Color => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "color")?;
                }
                let color_changed = previous
                    .as_ref()
                    .map(|value| {
                        mode_changed
                            || value.color != effective.color
                            || value.brightness != effective.brightness
                            || value.saturation != effective.saturation
                    })
                    .unwrap_or(true);
                if color_changed {
                    let tuned =
                        adjust_color(&effective.color, effective.brightness, effective.saturation)
                            .ok_or_else(|| {
                                format!(
                                    "Некорректный HEX-цвет подсветки: '{}', ожидается #rrggbb",
                                    effective.color
                                )
                            })?;
                    self.mpv.set_property_string("background-color", &tuned)?;
                }
            }
            AmbientMode::Ambilight => {
                if mode_changed {
                    self.mpv.set_property_string("border-background", "color")?;
                    self.mpv
                        .set_property_string("background-color", "#000000")?;
                }
            }
        }

        let was_ambilight = previous
            .as_ref()
            .map(|value| value.mode == AmbientMode::Ambilight)
            .unwrap_or(false);
        let active = effective.mode == AmbientMode::Ambilight;
        let generation = self.runtime.replace_settings(normalized, active);
        let had_palette = self
            .runtime
            .palette
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_some();
        let palette =
            self.runtime
                .sync_palette(generation, &self.get_settings(), active, true, None);
        if let Some(mut palette) = palette {
            if active && !was_ambilight {
                palette.colors.fill(0);
                palette.top = 0.0;
                palette.right = 0.0;
                palette.bottom = 0.0;
                palette.left = 0.0;
            }
            if active || was_ambilight || had_palette {
                self.runtime.publish(palette);
            }
        }
        self.runtime.notify();
        *last_guard = Some(effective);
        Ok(())
    }

    pub fn cycle_mode(current: &AmbientMode) -> AmbientMode {
        match current {
            AmbientMode::Off => AmbientMode::Blur,
            AmbientMode::Blur => AmbientMode::Color,
            AmbientMode::Color => AmbientMode::Ambilight,
            AmbientMode::Ambilight => AmbientMode::Off,
        }
    }
}

impl Drop for AmbientController {
    fn drop(&mut self) {
        self.stop_worker();
    }
}

fn log_ambient_error(context: &str, error: &str, last_logged: &mut Option<Instant>) {
    let now = Instant::now();
    if last_logged
        .map(|last| now.duration_since(last) >= Duration::from_secs(5))
        .unwrap_or(true)
    {
        eprintln!("Ambient {}: {}", context, error);
        crate::log_error(context, error);
        *last_logged = Some(now);
    }
}

fn ambient_worker(mpv: Arc<MpvManager>, runtime: Arc<AmbientRuntime>) {
    let mut smoothed = Vec::<Oklab>::new();
    let mut smooth_generation = None;
    let mut last_sample = None::<Instant>;
    let mut observed_path = None::<String>;
    let mut observed_generation = 0u64;
    let mut sampled_generation = 0u64;
    let mut sampled_frame = None::<i64>;
    let mut sampled_video_track = None::<String>;
    let mut sampled_geometry = None::<(f32, f32, f32, f32, f32, f32)>;
    let mut last_paused_sample = None::<Instant>;
    let mut last_capture_attempt = None::<Instant>;
    let mut last_error_logged = None::<Instant>;
    while !runtime.stop.load(Ordering::SeqCst) {
        let (settings, snapshot_generation) = runtime.settings_with_generation();
        if !runtime.is_active() || settings.mode != AmbientMode::Ambilight {
            last_capture_attempt = None;
            runtime.sleep(Duration::from_millis(200));
            continue;
        }
        let interval = Duration::from_millis(settings.sample_interval_ms as u64);
        if let Some(last_attempt) = last_capture_attempt {
            let elapsed = last_attempt.elapsed();
            if elapsed < interval {
                runtime.sleep(interval - elapsed);
                continue;
            }
        }
        let path = mpv.get_property_string("path").unwrap_or_default();
        if path.trim().is_empty() {
            runtime.sleep(interval);
            continue;
        }
        let current_generation = runtime.current_generation();
        let path_changed = observed_path
            .as_ref()
            .map(|previous| previous != &path)
            .unwrap_or(false);
        if path_changed && observed_generation == current_generation {
            runtime.invalidate();
        }
        observed_path = Some(path.clone());
        observed_generation = runtime.current_generation();
        let capture_generation = snapshot_generation;
        if capture_generation != runtime.current_generation() {
            runtime.sleep(interval);
            continue;
        }
        let geometry = match mpv.get_ambient_geometry() {
            Ok(Some(value)) => value,
            Ok(None) => {
                runtime.sleep(interval);
                continue;
            }
            Err(error) => {
                log_ambient_error("geometry", &error, &mut last_error_logged);
                runtime.sleep(interval);
                continue;
            }
        };
        let paused = mpv.get_property_bool("pause").unwrap_or(true)
            || mpv.get_property_bool("eof-reached").unwrap_or(false);
        let frame_number = mpv
            .get_property_double("estimated-frame-number")
            .unwrap_or(0.0) as i64;
        let video_track = mpv.get_property_string("vid").unwrap_or_default();
        let geometry_key = (
            geometry.display_width,
            geometry.display_height,
            geometry.video_rect.x,
            geometry.video_rect.y,
            geometry.video_rect.width,
            geometry.video_rect.height,
        );
        let should_sample = !paused
            || sampled_generation != capture_generation
            || sampled_frame != Some(frame_number)
            || sampled_video_track.as_deref() != Some(video_track.as_str())
            || sampled_geometry != Some(geometry_key)
            || (paused
                && last_paused_sample
                    .map(|value| value.elapsed() >= Duration::from_secs(1))
                    .unwrap_or(true));
        if !should_sample {
            runtime.sleep(interval);
            continue;
        }
        let segment_count = settings.segment_count as usize;
        let sample_widths = settings.sample_widths;
        last_capture_attempt = Some(Instant::now());
        let frame_samples = match mpv.screenshot_raw_samples(|width, height| {
            build_segment_sample_points(width, height, segment_count, sample_widths)
        }) {
            Ok(value) => value,
            Err(error) => {
                log_ambient_error("screenshot-raw", &error, &mut last_error_logged);
                continue;
            }
        };
        let path_after = mpv.get_property_string("path").unwrap_or_default();
        let video_track_after = mpv.get_property_string("vid").unwrap_or_default();
        let frame_after = mpv
            .get_property_double("estimated-frame-number")
            .unwrap_or(0.0) as i64;
        let geometry_after = mpv.get_ambient_geometry().ok().flatten();
        let geometry_stable = geometry_after
            .map(|value| {
                (
                    value.display_width,
                    value.display_height,
                    value.video_rect.x,
                    value.video_rect.y,
                    value.video_rect.width,
                    value.video_rect.height,
                )
            })
            .as_ref()
            == Some(&geometry_key);
        if path_after != path
            || video_track_after != video_track
            || (paused && frame_after != frame_number)
            || !geometry_stable
        {
            continue;
        }
        let generation = runtime.current_generation();
        if capture_generation != generation || !runtime.is_active() {
            continue;
        }
        let target = match sample_bgr_samples(&frame_samples, segment_count) {
            Ok(value) => value,
            Err(error) => {
                log_ambient_error("segment sampling", &error, &mut last_error_logged);
                continue;
            }
        };
        let now = Instant::now();
        let delta_ms = last_sample
            .map(|value| now.duration_since(value).as_secs_f32() * 1000.0)
            .unwrap_or(0.0);
        let reset = smooth_generation != Some(generation) || smoothed.len() != target.len();
        // Смена сцены: при большом скачке светлоты ускоряем атаку, иначе
        // свечение «отстаёт» от резкой смены кадра.
        let attack_ms = if reset {
            settings.smoothing_attack_ms as f32
        } else {
            let previous_mean = mean_luma(&smoothed);
            let target_mean = mean_luma(&target);
            if (target_mean - previous_mean).abs() > SCENE_CUT_LUMA_JUMP {
                SCENE_CUT_ATTACK_MS.min(settings.smoothing_attack_ms as f32)
            } else {
                settings.smoothing_attack_ms as f32
            }
        };
        if reset {
            smoothed = target;
            smooth_generation = Some(generation);
        } else {
            for (index, value) in target.into_iter().enumerate() {
                smoothed[index] = temporal_attack_release(
                    smoothed[index],
                    value,
                    delta_ms,
                    attack_ms,
                    settings.smoothing_release_ms as f32,
                );
            }
        }
        // Пространственное сглаживание убирает «ступеньки» между сегментами,
        // подавление тёмного шума — дрожание на почти чёрных сценах.
        if smoothed.len() == segment_count * 4 {
            spatial_smooth_segments(&mut smoothed, segment_count, SPATIAL_SMOOTH_PASSES);
            suppress_dark_noise(&mut smoothed, segment_count, DARK_NOISE_LUMA_THRESHOLD);
        }
        let mut colors = Vec::with_capacity(smoothed.len() * 3);
        for value in &smoothed {
            let adjusted = crate::ambient_sampler::apply_brightness_saturation(
                *value,
                settings.brightness as f32,
                settings.saturation as f32,
            );
            let adjusted = apply_vibrance(adjusted, VIBRANCE_AMOUNT);
            colors.extend_from_slice(&crate::ambient_sampler::oklab_to_rgb_bytes(adjusted));
        }
        let thickness = geometry.edge_thickness();
        let palette = AmbientPalette {
            generation,
            visible: true,
            reset,
            segment_count: settings.segment_count,
            colors,
            top: thickness[0],
            right: thickness[1],
            bottom: thickness[2],
            left: thickness[3],
            spread: settings.segment_spread,
            gap: settings.segment_gap,
            attack_ms: settings.smoothing_attack_ms,
            release_ms: settings.smoothing_release_ms,
            osd_width: geometry.display_width,
            osd_height: geometry.display_height,
        };
        if generation == runtime.current_generation() && runtime.is_active() {
            runtime.publish(palette);
            sampled_generation = generation;
            sampled_frame = Some(frame_number);
            sampled_video_track = Some(video_track);
            sampled_geometry = Some(geometry_key);
            last_paused_sample = paused.then_some(now);
        }
        last_sample = Some(now);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_settings_receive_new_defaults() {
        let settings: AmbientSettings =
            serde_json::from_str(r##"{"mode":"color","blur_radius":35,"color":"#000000"}"##)
                .unwrap();
        assert_eq!(settings.segment_count, 7);
        assert_eq!(settings.sample_widths.top, 3);
        assert_eq!(settings.sample_interval_ms, 100);
        assert_eq!(settings.smoothing_attack_ms, 180);
        assert_eq!(settings.smoothing_release_ms, 650);
        assert_eq!(settings.segment_spread, 130.0);
        assert_eq!(settings.segment_gap, 0.0);
    }

    #[test]
    fn smoothing_never_drops_to_instant_response() {
        let settings = AmbientSettings {
            smoothing_attack_ms: 0,
            smoothing_release_ms: 0,
            ..AmbientSettings::default()
        }
        .normalized();
        assert_eq!(settings.smoothing_attack_ms, 50);
        assert_eq!(settings.smoothing_release_ms, 100);
    }

    #[test]
    fn settings_are_clamped() {
        let settings = AmbientSettings {
            segment_count: 1,
            sample_widths: AmbientSampleWidths {
                top: 0,
                right: 99,
                bottom: 1,
                left: 15,
            },
            sample_interval_ms: 1,
            smoothing_attack_ms: 9000,
            smoothing_release_ms: 9000,
            segment_spread: f32::NAN,
            segment_gap: -1.0,
            ..AmbientSettings::default()
        }
        .normalized();
        assert_eq!(settings.segment_count, 3);
        assert_eq!(settings.sample_widths.top, 1);
        assert_eq!(settings.sample_widths.right, 15);
        assert_eq!(settings.sample_interval_ms, 100);
        assert_eq!(settings.smoothing_attack_ms, 2000);
        assert_eq!(settings.smoothing_release_ms, 5000);
        assert_eq!(settings.segment_spread, 130.0);
        assert_eq!(settings.segment_gap, 0.0);
    }

    #[test]
    fn palette_payload_has_contract_shape() {
        let palette = AmbientPalette {
            generation: 4,
            visible: true,
            reset: true,
            segment_count: 3,
            colors: vec![1; 36],
            top: 0.1,
            right: 0.2,
            bottom: 0.3,
            left: 0.4,
            spread: 130.0,
            gap: 0.0,
            attack_ms: 100,
            release_ms: 400,
            osd_width: 1920.0,
            osd_height: 1080.0,
        };
        let value = serde_json::to_value(palette).unwrap();
        let object = value.as_object().unwrap();
        assert_eq!(object.len(), 15);
        assert_eq!(object["colors"].as_array().unwrap().len(), 36);
        assert_eq!(object["generation"], 4);
        assert_eq!(object["osd_width"], 1920.0);
    }

    #[test]
    fn malformed_unicode_color_is_rejected_without_panicking() {
        assert!(adjust_color("#éabcd", 80, 120).is_none());
    }

    #[test]
    fn mode_cycle_includes_ambilight() {
        assert_eq!(
            AmbientController::cycle_mode(&AmbientMode::Color),
            AmbientMode::Ambilight
        );
        assert_eq!(
            AmbientController::cycle_mode(&AmbientMode::Ambilight),
            AmbientMode::Off
        );
    }
}
