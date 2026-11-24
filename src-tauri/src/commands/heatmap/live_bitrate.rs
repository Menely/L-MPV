//! Модуль расчёта мгновенного битрейта видеопотока, синхронизированного с текущим временем кадра (`PTS`).
//!
//! Решает фундаментальную проблему встроенного свойства `mpv` `video-bitrate`, которое вычисляется
//! только на границах ключевых кадров (per-GOP) и поэтому отображает битрейт уже прошедшей сцены
//! поверх следующей статичной сцены с задержкой в несколько секунд.
//!
//! Архитектура:
//! - Демультиплексирует заголовки видеопакетов (`-c copy -f framecrc`) без декодирования видео;
//! - Группирует размеры пакетов строго по их временным меткам презентации (`PTS`) в полусекундные корзины (`0.5` с);
//! - Учитывает переупорядочивание B-кадров (`REORDER_SAFETY_SEC`) перед публикацией закрытых корзин;
//! - Потоково отдаёт готовый срез для текущей позиции `position` и истории `Sparkline` за десятки миллисекунд,
//!   параллельно кэшируя окно вперёд в оперативной памяти для мгновенных (`O(1)`) последующих чтений.

use super::build_ffmpeg_command;
use super::resolve_ffmpeg_path;
use super::video_bitrate::{parse_framecrc_line, parse_framecrc_timebase};
use super::video_profile::MAX_VIDEO_DURATION;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, UNIX_EPOCH};
use tauri::State;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;
use tokio::sync::Notify;

/// Длительность одной корзины мгновенного битрейта в секундах (500 мс).
pub const LIVE_BITRATE_BIN_SEC: f64 = 0.5;

/// Запас по времени `PTS` (в секундах) для гарантии получения всех переупорядоченных B-кадров корзины.
const REORDER_SAFETY_SEC: f64 = 0.75;

/// Запас отступа назад (в секундах) перед началом окна истории при индексном поиске `-ss`
/// (покрывает стандартный 10-секундный GOP `keyint=240..250` с запасом на B-frame reordering).
const SEEK_BACKWARD_MARGIN_SEC: f64 = 12.0;

/// Порог начала окна (в секундах), ниже которого чтение выполняется от самого начала файла (`0.0` с).
const READ_FROM_ZERO_THRESHOLD_SEC: f64 = 15.0;

/// Длительность окна упреждающего чтения вперёд от текущей позиции (в секундах).
const WINDOW_AHEAD_SEC: f64 = 75.0;

/// Порог оставшихся покрытых корзин впереди (15 секунд = 30 корзин), при котором запускается фоновая докачка.
const PREFETCH_THRESHOLD_BINS: usize = 30;

/// Количество точек истории для графика `Sparkline` по умолчанию (12.5 секунд).
const DEFAULT_HISTORY_BINS: usize = 25;

/// Максимальное время ожидания первичного заполнения окна в рамках одного IPC-запроса.
const INITIAL_WAIT_TIMEOUT: Duration = Duration::from_millis(1500);

/// Максимальное число полусекундных корзин в памяти (до ~36 часов видео).
const MAX_CACHED_BINS: usize = 262_144;

/// Сериализуемый ответ с точным мгновенным битрейтом и историей для текущей позиции видео.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LiveVideoBitrateResponse {
    /// Битрейт текущей полусекундной корзины в бит/с.
    pub bitrate_bps: f64,
    /// Хронологическая история битрейта в бит/с вплоть до текущей корзины (для `Sparkline`).
    pub history_bps: Vec<f64>,
    /// Индекс текущей полусекундной корзины (`floor(position / 0.5)`).
    pub bin_index: usize,
    /// Длительность одной корзины в секундах (`0.5`).
    pub bin_duration_sec: f64,
    /// Признак того, что данные для текущей позиции достоверно рассчитаны по пакетам.
    pub ready: bool,
}

/// Уникальный идентификатор открытого медиафайла и выбранной видеодорожки.
#[derive(Debug, Clone, PartialEq, Eq)]
struct SourceIdentity {
    path: String,
    file_size: u64,
    modified_ns: u128,
    video_track_idx: usize,
}

impl SourceIdentity {
    /// Преобразует 1-базовый номер видеодорожки `mpv` в 0-базовый индекс потока `FFmpeg`.
    #[inline]
    fn normalize_track_idx(video_track: Option<i64>) -> usize {
        video_track.unwrap_or(1).max(1) as usize - 1
    }

    /// Формирует дескриптор источника по пути к файлу и номеру видеодорожки `mpv`.
    fn from_path(path: &Path, path_str: &str, video_track: Option<i64>) -> Option<Self> {
        let meta = fs::metadata(path).ok()?;
        if !meta.is_file() {
            return None;
        }
        let modified_ns = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        Some(Self {
            path: path_str.to_string(),
            file_size: meta.len(),
            modified_ns,
            video_track_idx: Self::normalize_track_idx(video_track),
        })
    }
}

/// Кэшированная шкала полусекундных значений битрейта активного видеофайла.
#[derive(Debug, Clone)]
struct CachedBitrateTrack {
    identity: SourceIdentity,
    duration_sec: f64,
    bins_bps: Vec<f64>,
    covered: Vec<bool>,
    eof_reached: bool,
}

impl CachedBitrateTrack {
    /// Создаёт новый пустой кэш для указанного источника.
    fn new(identity: SourceIdentity, duration_sec: f64) -> Self {
        let clean_dur = if duration_sec.is_finite()
            && duration_sec > 0.0
            && duration_sec <= MAX_VIDEO_DURATION
        {
            duration_sec
        } else {
            0.0
        };
        let initial_len = ((clean_dur / LIVE_BITRATE_BIN_SEC).ceil() as usize).min(MAX_CACHED_BINS);
        Self {
            identity,
            duration_sec: clean_dur,
            bins_bps: vec![0.0; initial_len],
            covered: vec![false; initial_len],
            eof_reached: false,
        }
    }

    /// Проверяет, покрыта ли целевая корзина `target_bin` в кэше.
    fn is_bin_ready(&self, target_bin: usize) -> bool {
        if let Some(&true) = self.covered.get(target_bin) {
            return true;
        }
        if self.eof_reached && !self.covered.is_empty() && target_bin >= self.covered.len() {
            return self.covered.last().copied().unwrap_or(false);
        }
        false
    }

    /// Подсчитывает количество непрерывно покрытых корзин впереди `target_bin`.
    fn covered_bins_ahead(&self, target_bin: usize) -> usize {
        if target_bin >= self.covered.len() {
            return 0;
        }
        self.covered[target_bin..]
            .iter()
            .take_while(|&&c| c)
            .count()
    }

    /// Извлекает готовый срез мгновенного битрейта и истории для корзины `target_bin`.
    fn build_response(
        &self,
        target_bin: usize,
        history_len: usize,
    ) -> Option<LiveVideoBitrateResponse> {
        if self.covered.is_empty() || !self.is_bin_ready(target_bin) {
            return None;
        }
        let max_idx = self.bins_bps.len().saturating_sub(1);
        let clamped_target = target_bin.min(max_idx);
        let count = history_len.clamp(2, 120);
        let start_bin = clamped_target.saturating_sub(count - 1);

        let mut history_bps = Vec::with_capacity(clamped_target - start_bin + 2);
        for b in start_bin..=clamped_target {
            if *self.covered.get(b).unwrap_or(&false) {
                let val = self.bins_bps[b];
                history_bps.push(if val.is_finite() && val > 0.0 {
                    val
                } else {
                    1.0
                });
            }
        }
        if history_bps.is_empty() {
            return None;
        }
        let current_bps = *history_bps.last().unwrap_or(&0.0);
        if history_bps.len() == 1 {
            history_bps.push(current_bps);
        }

        Some(LiveVideoBitrateResponse {
            bitrate_bps: current_bps,
            history_bps,
            bin_index: clamped_target,
            bin_duration_sec: LIVE_BITRATE_BIN_SEC,
            ready: true,
        })
    }

    /// Записывает рассчитанный блок полусекундных корзин в кэш.
    fn merge_bins(&mut self, start_bin: usize, values_bps: &[f64], mark_eof: bool) {
        let end_bin = (start_bin + values_bps.len()).min(MAX_CACHED_BINS);
        if end_bin > self.bins_bps.len() {
            self.bins_bps.resize(end_bin, 0.0);
            self.covered.resize(end_bin, false);
        }
        for (offset, &bps) in values_bps.iter().enumerate() {
            let idx = start_bin + offset;
            if idx >= MAX_CACHED_BINS {
                break;
            }
            self.bins_bps[idx] = bps.max(1.0);
            self.covered[idx] = true;
        }
        if mark_eof && end_bin > 0 {
            self.bins_bps.truncate(end_bin);
            self.covered.truncate(end_bin);
            self.eof_reached = true;
        }
    }
}

/// Описание текущей выполняющейся фоновой задачи чтения пакетов.
#[derive(Debug, Clone)]
struct ActiveProbeJob {
    identity: SourceIdentity,
    generation: u64,
    cover_from_bin: usize,
    cover_to_bin: usize,
}

/// Внутреннее состояние кэша и активной задачи.
#[derive(Default)]
struct LiveBitrateCache {
    track: Option<CachedBitrateTrack>,
    active_job: Option<ActiveProbeJob>,
}

/// Аккумулятор пакетов одного прохода чтения окна `framecrc`.
#[derive(Default)]
pub struct WindowBitrateAccumulator {
    bytes_per_bin: Vec<f64>,
    counts_per_bin: Vec<u32>,
    min_pts: Option<f64>,
    max_pts: Option<f64>,
    last_published_bin: Option<usize>,
}

impl WindowBitrateAccumulator {
    /// Добавляет видеопакет с временной меткой показа `pts_sec`, длительностью `dur_sec` и размером `bytes`.
    pub fn add_packet(&mut self, pts_sec: f64, dur_sec: f64, bytes: u64) -> Result<(), String> {
        if !pts_sec.is_finite() || pts_sec >= MAX_VIDEO_DURATION {
            return Err("InvalidVideoTimestamp".to_string());
        }
        if pts_sec < -0.000001 {
            return Ok(());
        }
        let pts = pts_sec.max(0.0);
        let dur = if dur_sec.is_finite() && dur_sec > 0.0 && dur_sec <= 60.0 {
            dur_sec
        } else {
            0.0
        };

        self.min_pts = Some(self.min_pts.map_or(pts, |m| m.min(pts)));
        let packet_end = pts + dur;
        self.max_pts = Some(self.max_pts.map_or(packet_end, |m| m.max(packet_end)));

        if dur > LIVE_BITRATE_BIN_SEC {
            let start_bin = ((pts / LIVE_BITRATE_BIN_SEC).floor() as usize).min(MAX_CACHED_BINS - 1);
            let end_bin = (((packet_end - 1e-9).max(pts) / LIVE_BITRATE_BIN_SEC).floor() as usize)
                .min(MAX_CACHED_BINS - 1);
            self.ensure_capacity(end_bin + 1);
            for b in start_bin..=end_bin {
                let bin_start = b as f64 * LIVE_BITRATE_BIN_SEC;
                let bin_end = bin_start + LIVE_BITRATE_BIN_SEC;
                let overlap = (packet_end.min(bin_end) - pts.max(bin_start)).max(0.0);
                if overlap > 0.0 {
                    self.bytes_per_bin[b] += bytes as f64 * (overlap / dur);
                    self.counts_per_bin[b] = self.counts_per_bin[b].saturating_add(1);
                }
            }
        } else {
            let bin = ((pts / LIVE_BITRATE_BIN_SEC).floor() as usize).min(MAX_CACHED_BINS - 1);
            self.ensure_capacity(bin + 1);
            self.bytes_per_bin[bin] += bytes as f64;
            self.counts_per_bin[bin] = self.counts_per_bin[bin].saturating_add(1);
        }
        Ok(())
    }

    fn ensure_capacity(&mut self, required_len: usize) {
        if self.bytes_per_bin.len() < required_len {
            self.bytes_per_bin.resize(required_len, 0.0);
            self.counts_per_bin.resize(required_len, 0);
        }
    }

    /// Вычисляет достоверный диапазон закрытых корзин `(start_bin, values_bps)`, готовых к публикации.
    pub fn take_ready_bins(
        &mut self,
        seek_from_zero: bool,
        duration_hint: f64,
        is_final: bool,
        reached_eof: bool,
    ) -> Option<(usize, Vec<f64>)> {
        let min_pts = self.min_pts?;
        let max_pts = self.max_pts?;

        let first_valid_bin = if seek_from_zero {
            0
        } else {
            ((min_pts + LIVE_BITRATE_BIN_SEC) / LIVE_BITRATE_BIN_SEC).floor() as usize
        };

        let safe_end_pts = if is_final && reached_eof {
            max_pts
        } else if is_final {
            (max_pts - 0.25).max(min_pts)
        } else {
            max_pts - REORDER_SAFETY_SEC
        };

        if safe_end_pts < first_valid_bin as f64 * LIVE_BITRATE_BIN_SEC {
            return None;
        }

        let last_safe_bin = (safe_end_pts / LIVE_BITRATE_BIN_SEC).floor() as usize;
        if last_safe_bin < first_valid_bin || self.bytes_per_bin.is_empty() {
            return None;
        }

        let max_available_bin = self.bytes_per_bin.len().saturating_sub(1);
        let end_bin = last_safe_bin.min(max_available_bin);
        if end_bin < first_valid_bin {
            return None;
        }

        let publish_from = match self.last_published_bin {
            Some(prev) if prev >= end_bin => return None,
            Some(prev) => (prev + 1).max(first_valid_bin),
            None => first_valid_bin,
        };

        let mut out = Vec::with_capacity(end_bin - publish_from + 1);
        let valid_dur = if duration_hint.is_finite() && duration_hint > 0.0 {
            duration_hint
        } else {
            0.0
        };

        for b in publish_from..=end_bin {
            let bin_start = b as f64 * LIVE_BITRATE_BIN_SEC;
            let span = if valid_dur > bin_start {
                (valid_dur - bin_start).clamp(0.05, LIVE_BITRATE_BIN_SEC)
            } else {
                LIVE_BITRATE_BIN_SEC
            };
            let bytes = self.bytes_per_bin[b];
            let bps = if bytes > 0.0 {
                (bytes * 8.0) / span
            } else {
                1.0
            };
            out.push(bps.max(1.0));
        }

        self.last_published_bin = Some(end_bin);
        Some((publish_from, out))
    }
}

/// Сервис управления потоковым расчётом и кэшированием мгновенного битрейта видео.
#[derive(Clone, Default)]
pub struct LiveVideoBitrateService {
    inner: Arc<StdMutex<LiveBitrateCache>>,
    notify: Arc<Notify>,
    generation: Arc<AtomicU64>,
}

impl LiveVideoBitrateService {
    /// Создаёт новый экземпляр сервиса мгновенного битрейта.
    pub fn new() -> Self {
        Self::default()
    }

    /// Немедленно прерывает активный фоновый процесс анализа и очищает состояние при закрытии окна.
    pub fn shutdown(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut guard) = self.inner.lock() {
            guard.active_job = None;
            guard.track = None;
        }
        self.notify.notify_waiters();
    }

    /// Мгновенное чтение кэшированного битрейта для текущей позиции и дорожки без запуска фоновых задач.
    pub fn peek_cached_bitrate(
        &self,
        path: &str,
        video_track: Option<i64>,
        position: f64,
    ) -> Option<f64> {
        if path.is_empty() || !position.is_finite() || position < 0.0 {
            return None;
        }
        let track_idx = SourceIdentity::normalize_track_idx(video_track);
        let target_bin = (position / LIVE_BITRATE_BIN_SEC).floor() as usize;
        let guard = self.inner.lock().ok()?;
        let track = guard.track.as_ref()?;
        if track.identity.path != path
            || track.identity.video_track_idx != track_idx
            || !track.is_bin_ready(target_bin)
        {
            return None;
        }
        let idx = target_bin.min(track.bins_bps.len().saturating_sub(1));
        track.bins_bps.get(idx).copied().filter(|&v| v > 1.0)
    }

    /// Возвращает точный битрейт и историю для позиции `position`, при необходимости запуская чтение окна.
    pub async fn get_window(
        &self,
        path: String,
        video_track: Option<i64>,
        position: f64,
        duration_hint: Option<f64>,
        history_len: usize,
    ) -> Result<LiveVideoBitrateResponse, String> {
        let media_path = PathBuf::from(&path);
        let Some(identity) = SourceIdentity::from_path(&media_path, &path, video_track) else {
            return Err("MediaFileNotFound".to_string());
        };

        let pos = if position.is_finite() && position >= 0.0 {
            position
        } else {
            0.0
        };
        let dur = duration_hint.unwrap_or(0.0);
        let count = history_len.clamp(2, 120);
        let target_bin = ((pos / LIVE_BITRATE_BIN_SEC).floor() as usize).min(MAX_CACHED_BINS - 1);
        let start_bin = target_bin.saturating_sub(count - 1);

        // 1. Проверяем наличие готового ответа в памяти и необходимость фоновой докачки вперёд
        if let Some((response, prefetch_range)) =
            self.check_cache_and_plan_prefetch(&identity, dur, target_bin, count)
        {
            if let Some((pf_from_bin, pf_to_bin)) = prefetch_range {
                self.spawn_probe_job(identity, media_path, dur, pf_from_bin, pf_to_bin);
            }
            return Ok(response);
        }

        // 2. Если целевая корзина ещё не покрыта, запускаем задачу чтения окна (если она ещё не идёт)
        let ahead_bins = (WINDOW_AHEAD_SEC / LIVE_BITRATE_BIN_SEC).ceil() as usize;
        let desired_end_bin = (target_bin + ahead_bins).min(MAX_CACHED_BINS - 1);
        self.ensure_probe_job_running(
            &identity,
            &media_path,
            dur,
            start_bin,
            target_bin,
            desired_end_bin,
        );

        // 3. Ожидаем готовности целевой корзины `target_bin` с защитой от потери уведомлений (enable до проверки)
        let deadline = tokio::time::Instant::now() + INITIAL_WAIT_TIMEOUT;
        loop {
            let notified = self.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();

            if let Some(resp) = self.try_read_response(&identity, target_bin, count) {
                return Ok(resp);
            }
            if !self.is_job_covering(&identity, target_bin) {
                if let Some(resp) = self.try_read_response(&identity, target_bin, count) {
                    return Ok(resp);
                }
                return Err("BitrateWindowUnavailable".to_string());
            }
            let now = tokio::time::Instant::now();
            if now >= deadline {
                if let Some(resp) = self.try_read_response(&identity, target_bin, count) {
                    return Ok(resp);
                }
                return Err("BitrateProbeTimeout".to_string());
            }
            let _ = tokio::time::timeout(deadline - now, notified).await;
        }
    }

    fn check_cache_and_plan_prefetch(
        &self,
        identity: &SourceIdentity,
        duration_sec: f64,
        target_bin: usize,
        history_len: usize,
    ) -> Option<(LiveVideoBitrateResponse, Option<(usize, usize)>)> {
        let mut guard = self.inner.lock().ok()?;
        let reset_needed = guard
            .track
            .as_ref()
            .is_none_or(|t| &t.identity != identity);
        if reset_needed {
            guard.track = Some(CachedBitrateTrack::new(identity.clone(), duration_sec));
            guard.active_job = None;
            return None;
        }

        let no_active_job = guard.active_job.is_none();
        let track = guard.track.as_mut()?;
        if duration_sec > track.duration_sec && duration_sec <= MAX_VIDEO_DURATION {
            track.duration_sec = duration_sec;
        }

        if !track.is_bin_ready(target_bin) {
            return None;
        }

        let response = track.build_response(target_bin, history_len)?;
        let start_bin = target_bin.saturating_sub(history_len.clamp(2, 120) - 1);
        let ahead = track.covered_bins_ahead(target_bin);
        let prefetch = if no_active_job {
            if !track.is_bin_ready(start_bin) {
                Some((start_bin, (target_bin + 2).min(MAX_CACHED_BINS - 1)))
            } else if !track.eof_reached && ahead < PREFETCH_THRESHOLD_BINS {
                let pf_start = target_bin + ahead;
                let pf_end = (pf_start + (WINDOW_AHEAD_SEC / LIVE_BITRATE_BIN_SEC).ceil() as usize)
                    .min(MAX_CACHED_BINS - 1);
                Some((pf_start, pf_end))
            } else {
                None
            }
        } else {
            None
        };

        Some((response, prefetch))
    }

    fn try_read_response(
        &self,
        identity: &SourceIdentity,
        target_bin: usize,
        history_len: usize,
    ) -> Option<LiveVideoBitrateResponse> {
        let guard = self.inner.lock().ok()?;
        let track = guard.track.as_ref()?;
        if &track.identity != identity || !track.is_bin_ready(target_bin) {
            return None;
        }
        track.build_response(target_bin, history_len)
    }

    fn is_job_covering(&self, identity: &SourceIdentity, target_bin: usize) -> bool {
        let Ok(guard) = self.inner.lock() else {
            return false;
        };
        guard.active_job.as_ref().is_some_and(|job| {
            &job.identity == identity
                && target_bin >= job.cover_from_bin
                && target_bin <= job.cover_to_bin
        })
    }

    fn ensure_probe_job_running(
        &self,
        identity: &SourceIdentity,
        media_path: &Path,
        duration_sec: f64,
        start_bin: usize,
        target_bin: usize,
        desired_end_bin: usize,
    ) {
        let should_spawn = {
            let Ok(guard) = self.inner.lock() else {
                return;
            };
            !guard.active_job.as_ref().is_some_and(|job| {
                &job.identity == identity
                    && target_bin >= job.cover_from_bin
                    && target_bin <= job.cover_to_bin
            })
        };
        if should_spawn {
            self.spawn_probe_job(
                identity.clone(),
                media_path.to_path_buf(),
                duration_sec,
                start_bin,
                desired_end_bin,
            );
        }
    }

    fn spawn_probe_job(
        &self,
        identity: SourceIdentity,
        media_path: PathBuf,
        duration_sec: f64,
        cover_from_bin: usize,
        cover_to_bin: usize,
    ) {
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;

        if let Ok(mut guard) = self.inner.lock() {
            if guard
                .track
                .as_ref()
                .is_none_or(|t| t.identity != identity)
            {
                guard.track = Some(CachedBitrateTrack::new(identity.clone(), duration_sec));
            }
            guard.active_job = Some(ActiveProbeJob {
                identity: identity.clone(),
                generation: gen,
                cover_from_bin,
                cover_to_bin,
            });
        }

        let service = self.clone();
        tauri::async_runtime::spawn(async move {
            service
                .run_probe_worker(
                    identity,
                    media_path,
                    duration_sec,
                    cover_from_bin,
                    cover_to_bin,
                    gen,
                )
                .await;
        });
    }

    async fn run_probe_worker(
        &self,
        identity: SourceIdentity,
        media_path: PathBuf,
        duration_sec: f64,
        cover_from_bin: usize,
        cover_to_bin: usize,
        gen: u64,
    ) {
        let need_start_sec = cover_from_bin as f64 * LIVE_BITRATE_BIN_SEC;
        let mut seek_start_sec = if need_start_sec <= READ_FROM_ZERO_THRESHOLD_SEC {
            0.0
        } else {
            (need_start_sec - SEEK_BACKWARD_MARGIN_SEC).max(0.0)
        };
        let window_end_sec = (cover_to_bin + 4) as f64 * LIVE_BITRATE_BIN_SEC;

        loop {
            if self.generation.load(Ordering::SeqCst) != gen {
                break;
            }
            let res = self
                .execute_ffmpeg_pass(
                    &identity,
                    &media_path,
                    duration_sec,
                    seek_start_sec,
                    need_start_sec,
                    window_end_sec,
                    gen,
                )
                .await;
            match res {
                Err(ref e) if e == "SeekSkippedTarget" && seek_start_sec > 0.0 => {
                    seek_start_sec = if seek_start_sec <= 30.0 {
                        0.0
                    } else {
                        seek_start_sec - 30.0
                    };
                }
                _ => break,
            }
        }

        if let Ok(mut guard) = self.inner.lock() {
            if guard
                .active_job
                .as_ref()
                .is_some_and(|job| job.generation == gen)
            {
                guard.active_job = None;
            }
        }
        self.notify.notify_waiters();
    }

    async fn execute_ffmpeg_pass(
        &self,
        identity: &SourceIdentity,
        media_path: &Path,
        duration_sec: f64,
        seek_start_sec: f64,
        need_start_sec: f64,
        window_end_sec: f64,
        gen: u64,
    ) -> Result<(), String> {
        let ffmpeg_bin = resolve_ffmpeg_path();
        let mut cmd = build_ffmpeg_command(&ffmpeg_bin);
        cmd.args(["-hide_banner", "-loglevel", "error"]);

        let seek_from_zero = seek_start_sec <= 0.001;
        if !seek_from_zero {
            cmd.arg("-ss").arg(format!("{:.3}", seek_start_sec));
        }

        let read_until_eof = duration_sec.is_finite()
            && duration_sec > 0.0
            && window_end_sec >= duration_sec;
        if !read_until_eof {
            cmd.arg("-to").arg(format!("{:.3}", window_end_sec));
        }

        cmd.args(["-copyts", "-start_at_zero", "-i"])
            .arg(media_path)
            .arg("-map")
            .arg(format!("0:v:{}", identity.video_track_idx))
            .args([
                "-c",
                "copy",
                "-copytb",
                "1",
                "-avoid_negative_ts",
                "disabled",
                "-f",
                "framecrc",
                "-",
            ]);

        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        let stdout = match child.stdout.take() {
            Some(out) => out,
            None => {
                Self::terminate_child(&mut child).await;
                return Err("MissingStdout".to_string());
            }
        };

        let mut reader = BufReader::with_capacity(128 * 1024, stdout);
        let mut line = String::with_capacity(256);
        let mut time_base: Option<f64> = None;
        let mut acc = WindowBitrateAccumulator::default();
        let mut packets_since_flush = 0usize;
        let mut checked_first_pts = seek_from_zero;
        let required_first_pts_limit = (need_start_sec - LIVE_BITRATE_BIN_SEC).max(0.0);

        loop {
            if self.generation.load(Ordering::SeqCst) != gen {
                Self::terminate_child(&mut child).await;
                return Err("Cancelled".to_string());
            }

            let read_res = match tokio::time::timeout(
                Duration::from_millis(200),
                reader.read_line(&mut line),
            )
            .await
            {
                Ok(res) => res,
                Err(_) => continue,
            };

            let n = match read_res {
                Ok(bytes) => bytes,
                Err(e) => {
                    Self::terminate_child(&mut child).await;
                    return Err(e.to_string());
                }
            };
            if n == 0 {
                break;
            }
            let trimmed = line.trim();
            if let Some(tb) = parse_framecrc_timebase(trimmed) {
                time_base = Some(tb);
                line.clear();
                continue;
            }
            if let Some((pts_sec, dur_sec, size_bytes)) =
                parse_framecrc_line(&line, time_base.unwrap_or(0.0))
            {
                line.clear();
                if !checked_first_pts && pts_sec >= 0.0 {
                    checked_first_pts = true;
                    if pts_sec > required_first_pts_limit {
                        Self::terminate_child(&mut child).await;
                        return Err("SeekSkippedTarget".to_string());
                    }
                }
                if let Err(err) = acc.add_packet(pts_sec, dur_sec, size_bytes) {
                    Self::terminate_child(&mut child).await;
                    return Err(err);
                }
                packets_since_flush += 1;
                if packets_since_flush >= 16 {
                    packets_since_flush = 0;
                    if let Some((from_bin, values)) =
                        acc.take_ready_bins(seek_from_zero, duration_sec, false, false)
                    {
                        self.publish_bins(identity, from_bin, &values, false);
                    }
                }
            } else {
                line.clear();
            }
        }

        let _ = child.wait().await;
        if self.generation.load(Ordering::SeqCst) != gen {
            return Err("Cancelled".to_string());
        }

        let reached_eof = read_until_eof
            || acc
                .max_pts
                .is_some_and(|max_p| max_p + 1.0 < window_end_sec);
        if let Some((from_bin, values)) =
            acc.take_ready_bins(seek_from_zero, duration_sec, true, reached_eof)
        {
            self.publish_bins(identity, from_bin, &values, reached_eof);
        }
        Ok(())
    }

    /// Гарантированное завершение дочернего процесса `FFmpeg` с освобождением системного дескриптора.
    async fn terminate_child(child: &mut Child) {
        let _ = child.kill().await;
        let _ = child.wait().await;
    }

    fn publish_bins(
        &self,
        identity: &SourceIdentity,
        start_bin: usize,
        values: &[f64],
        mark_eof: bool,
    ) {
        if let Ok(mut guard) = self.inner.lock() {
            if let Some(track) = guard.track.as_mut() {
                if &track.identity == identity {
                    track.merge_bins(start_bin, values, mark_eof);
                }
            }
        }
        self.notify.notify_waiters();
    }
}

/// IPC-команда получения точного мгновенного битрейта и истории `Sparkline` по времени кадра (`position`).
#[tauri::command]
pub async fn get_live_video_bitrate(
    path: String,
    video_track: Option<i64>,
    position: f64,
    duration_hint: Option<f64>,
    history_len: Option<usize>,
    service: State<'_, LiveVideoBitrateService>,
) -> Result<LiveVideoBitrateResponse, String> {
    service
        .get_window(
            path,
            video_track,
            position,
            duration_hint,
            history_len.unwrap_or(DEFAULT_HISTORY_BINS),
        )
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dynamic_to_static_transition_drops_immediately_without_gop_delay() {
        let mut acc = WindowBitrateAccumulator::default();
        // 0.0 .. 4.0 с (бины 0..7): тяжёлая динамическая сцена (~96 КБ на кадр при 24 fps = ~18.4 Мбит/с)
        for frame in 0..96 {
            let pts = frame as f64 / 24.0;
            acc.add_packet(pts, 1.0 / 24.0, 96_000).unwrap();
        }
        // 4.0 .. 8.0 с (бины 8..15): резкий переход на статичную сцену (25 байт на кадр = ~4.8 кбит/с)
        for frame in 96..192 {
            let pts = frame as f64 / 24.0;
            acc.add_packet(pts, 1.0 / 24.0, 25).unwrap();
        }

        let (start_bin, bins) = acc.take_ready_bins(true, 8.0, true, true).unwrap();
        assert_eq!(start_bin, 0);
        assert_eq!(bins.len(), 16);

        // В бинах 0..7 (0.0 .. 4.0 с) высокий битрейт тяжёлой сцены (> 18 Мбит/с)
        for b in 0..8 {
            assert!(
                bins[b] > 18_000_000.0,
                "Ожидался высокий битрейт в бине {b}, получено {}",
                bins[b]
            );
        }

        // Ровно с бина 8 (4.0 .. 4.5 с — первая же полусекунда статичной сцены!) битрейт мгновенно падает
        for b in 8..16 {
            assert!(
                bins[b] < 10_000.0,
                "Ожидалось мгновенное падение битрейта в бине {b}, получено {}",
                bins[b]
            );
        }
    }

    #[test]
    fn b_frame_reordering_waits_for_safety_horizon_before_publishing_bin() {
        let mut acc = WindowBitrateAccumulator::default();
        // Подаём пакеты в порядке декодирования (DTS): сначала опорный P-кадр на 0.60 с,
        // а B-кадры первой полусекунды [0.0..0.5) ещё не все пришли
        acc.add_packet(0.00, 0.04, 50_000).unwrap();
        acc.add_packet(0.60, 0.04, 40_000).unwrap();

        // Так как max_pts = 0.64 < 0.5 + REORDER_SAFETY_SEC (1.25 с), бин 0 ещё не должен закрыться досрочно
        assert!(acc.take_ready_bins(true, 10.0, false, false).is_none());

        // Досылаем запоздавший по порядку чтения B-кадр для бина 0 (PTS = 0.20 с)
        acc.add_packet(0.20, 0.04, 30_000).unwrap();
        // Продвигаем горизонт чтения за пределы 0.5 + 0.75 = 1.25 с
        acc.add_packet(1.30, 0.04, 10_000).unwrap();

        let (start_bin, bins) = acc.take_ready_bins(true, 10.0, false, false).unwrap();
        assert_eq!(start_bin, 0);
        // Оба пакета бина 0 (50_000 + 30_000 = 80_000 байт за 0.5 с = 1_280_000 бит/с) учтены без потерь
        assert!((bins[0] - 1_280_000.0).abs() < 1.0);
    }

    #[test]
    fn real_ffmpeg_long_gop_and_scenecut_resolve_instant_bitrate_at_exact_position() {
        let ffmpeg = resolve_ffmpeg_path();
        assert!(ffmpeg.exists(), "FFmpeg должен быть найден: {:?}", ffmpeg);
        let temp_file = std::env::temp_dir().join(format!(
            "lmpv_live_bitrate_test_{}.mp4",
            std::process::id()
        ));
        let status = std::process::Command::new(&ffmpeg)
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "nullsrc=s=640x360:r=24:d=4,geq=random(1)*255:128:128[v0];color=c=black:s=640x360:r=24:d=6[v1];[v0][v1]concat=n=2:v=1:a=0",
                "-c:v",
                "libx264",
                "-g",
                "240",
                "-sc_threshold",
                "0",
                "-pix_fmt",
                "yuv420p",
                "-y",
            ])
            .arg(&temp_file)
            .status();

        assert!(status.is_ok_and(|s| s.success()));

        tauri::async_runtime::block_on(async {
            let service = LiveVideoBitrateService::new();
            let path_str = temp_file.to_string_lossy().to_string();

            // 1. Замер внутри тяжёлой динамичной сцены (t = 3.6 с, бин 7: [3.5 .. 4.0))
            let dynamic_resp = service
                .get_window(path_str.clone(), Some(1), 3.6, Some(10.0), 25)
                .await
                .expect("Должен рассчитаться битрейт тяжёлой сцены");
            assert!(dynamic_resp.ready);
            assert_eq!(dynamic_resp.bin_index, 7);
            assert!(
                dynamic_resp.bitrate_bps > 5_000_000.0,
                "На динамичной сцене ожидался высокий битрейт (> 5 Мбит/с), получено: {}",
                dynamic_resp.bitrate_bps
            );

            // 2. Замер сразу после перехода на статичную сцену (t = 4.2 с, бин 8: [4.0 .. 4.5))
            // Несмотря на отсутствие ключевого кадра (-g 240 -sc_threshold 0), битрейт падает мгновенно!
            let static_resp = service
                .get_window(path_str.clone(), Some(1), 4.2, Some(10.0), 25)
                .await
                .expect("Должен рассчитаться битрейт статичной сцены");
            assert!(static_resp.ready);
            assert_eq!(static_resp.bin_index, 8);
            assert!(
                static_resp.bitrate_bps < dynamic_resp.bitrate_bps * 0.05,
                "На статичной сцене (t = 4.2 с) битрейт должен мгновенно упасть (>20x), но dynamic={}, static={}",
                dynamic_resp.bitrate_bps,
                static_resp.bitrate_bps
            );
            // В истории Sparkline предыдущие бины (0..7) содержат пик тяжёлой сцены, а последний бин (8) — падение
            assert_eq!(static_resp.history_bps.len(), 9);
            assert!(static_resp.history_bps[7] > 5_000_000.0);
            assert_eq!(*static_resp.history_bps.last().unwrap(), static_resp.bitrate_bps);

            // 3. Проверка peek_cached_bitrate и фильтрации по номеру видеодорожки
            assert!(service.peek_cached_bitrate(&path_str, Some(1), 3.6).is_some());
            assert!(service.peek_cached_bitrate(&path_str, Some(2), 3.6).is_none());

            // 4. Проверка корректного завершения и очистки состояния при shutdown()
            service.shutdown();
            assert!(service.peek_cached_bitrate(&path_str, Some(1), 3.6).is_none());
        });

        let _ = std::fs::remove_file(&temp_file);
    }
}
