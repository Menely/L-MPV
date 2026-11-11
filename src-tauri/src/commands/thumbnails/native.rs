#[cfg(test)]
use super::decoder;
use super::SourceRequest;
use crate::mpv_manager::preview::PreviewCore;
use std::{
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

#[derive(Default)]
pub(super) struct NativeDecoder {
    core: Option<PreviewCore>,
    identity: String,
    last_used: Option<Instant>,
    snapshot_failed_identity: Option<String>,
    coarse: super::coarse_cache::CoarseCache,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expired_fallback_deadline_never_initializes_another_context() {
        let mut decoder = NativeDecoder::default();
        let source = SourceRequest {
            path: "not-opened".into(),
            stream: "0:0".into(),
            vid: "1".into(),
            seconds: 0.0,
            hdr: None,
            transforms: Default::default(),
            profile: super::super::profile::DecodeProfile::Snapshot,
        };
        assert_eq!(
            decoder
                .extract_until(
                    Path::new("not-opened"),
                    &source,
                    false,
                    &AtomicBool::new(false),
                    &AtomicBool::new(false),
                    Instant::now() - Duration::from_millis(1)
                )
                .unwrap_err(),
            "THUMBNAIL_MPV_TIMEOUT"
        );
        assert!(decoder.core.is_none());
    }

    #[test]
    #[ignore = "requires LMPV_THUMB_ROOT, LMPV_THUMB_ANAMORPHIC, LMPV_THUMB_NO_GPU, LMPV_THUMB_HDR_FIXTURE"]
    fn snapshot_preserves_sar_and_protected_hdr() {
        let root = std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_ROOT").unwrap());
        let cancelled = AtomicBool::new(false);
        let stopped = AtomicBool::new(false);
        let mut decoder = NativeDecoder::default();
        let mut source = SourceRequest {
            path: std::env::var_os("LMPV_THUMB_ANAMORPHIC").unwrap().into(),
            stream: "0:0".into(),
            vid: "1".into(),
            seconds: 0.0,
            hdr: None,
            transforms: Default::default(),
            profile: super::super::profile::DecodeProfile::Snapshot,
        };
        let bytes = decoder
            .extract(&root, &source, true, &cancelled, &stopped)
            .unwrap();
        let frame = image::load_from_memory(&bytes).unwrap().to_rgb8();
        assert!(
            frame.get_pixel(10, 10)[0] > 200 && frame.get_pixel(310, 170)[0] > 200,
            "anamorphic16:9 must fill the frame"
        );
        assert!(decoder.snapshot_failed_identity.is_none());
        source.path = std::env::var_os("LMPV_THUMB_HDR_FIXTURE").unwrap().into();
        source.seconds = 2.5;
        for hdr in [decoder::HdrTransfer::Pq, decoder::HdrTransfer::Hlg] {
            source.hdr = Some(hdr);
            source.profile = super::super::profile::DecodeProfile::Snapshot;
            let gpu = decoder
                .extract(&root, &source, true, &cancelled, &stopped)
                .unwrap();
            assert!(
                decoder.snapshot_failed_identity.is_none(),
                "HDR must use the precision-preserving copy-back path"
            );
            source.profile = super::super::profile::DecodeProfile::Hardware;
            let cpu = decoder
                .extract(&root, &source, true, &cancelled, &stopped)
                .unwrap();
            let gpu = image::load_from_memory(&gpu).unwrap().to_rgb8();
            let cpu = image::load_from_memory(&cpu).unwrap().to_rgb8();
            let error: f64 = gpu
                .as_raw()
                .iter()
                .zip(cpu.as_raw())
                .map(|(a, b)| (*a as f64 - *b as f64).abs())
                .sum::<f64>()
                / gpu.as_raw().len() as f64;
            println!("Protected HDR/copyback mean RGB error: {error}");
            assert!(error < 15.0, "HDR conversion diverged: {error}");
        }
        source.path = std::env::var_os("LMPV_THUMB_NO_GPU").unwrap().into();
        source.seconds = 0.0;
        source.hdr = None;
        source.profile = super::super::profile::DecodeProfile::Snapshot;
        let bytes = decoder
            .extract(&root, &source, true, &cancelled, &stopped)
            .unwrap();
        // mpv can transparently decode unsupported hardware codecs in software;
        // snapshot resizing remains valid without a forced pipeline failure.
        assert!(decoder.snapshot_failed_identity.is_none());
        assert!(
            image::load_from_memory(&bytes)
                .unwrap()
                .to_rgb8()
                .get_pixel(160, 90)[0]
                > 200
        );
        decoder
            .extract(&root, &source, true, &cancelled, &stopped)
            .unwrap();
    }

    #[test]
    #[ignore = "requires LMPV_THUMB_ROOT and LMPV_THUMB_GEOMETRY"]
    fn preserves_rotation_crop_and_mirror() {
        let root = std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_ROOT").unwrap());
        let path = std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_GEOMETRY").unwrap());
        let cancelled = AtomicBool::new(false);
        let stopped = AtomicBool::new(false);
        let mut decoder = NativeDecoder::default();
        let mut source = SourceRequest {
            path,
            stream: "0:0".into(),
            vid: "1".into(),
            seconds: 0.0,
            hdr: None,
            transforms: Default::default(),
            profile: super::super::profile::DecodeProfile::Snapshot,
        };
        for rotation in ["0", "90", "180", "270"] {
            source.transforms.rotation = rotation.into();
            let bytes = decoder
                .extract(&root, &source, true, &cancelled, &stopped)
                .unwrap();
            let frame = image::load_from_memory(&bytes).unwrap().to_rgb8();
            assert_eq!(frame.dimensions(), (320, 180));
            let a = frame.get_pixel(160, 45).0;
            let b = frame.get_pixel(160, 135).0;
            if rotation == "90" {
                assert!(a[0] > 150 && b[2] > 150, "{rotation}: {a:?} {b:?}");
            }
            if rotation == "270" {
                assert!(a[2] > 150 && b[0] > 150, "{rotation}: {a:?} {b:?}");
            }
        }
        if let Some(path) = std::env::var_os("LMPV_THUMB_PORTRAIT") {
            let original = source.path.clone();
            source.path = path.into();
            source.transforms.rotation = "90".into();
            let bytes = decoder
                .extract(&root, &source, true, &cancelled, &stopped)
                .unwrap();
            let frame = image::load_from_memory(&bytes).unwrap().to_rgb8();
            assert!(
                frame.get_pixel(20, 90)[0] > 200 && frame.get_pixel(300, 90)[0] > 200,
                "rotated portrait must fill the preview"
            );
            source.path = original;
        }
        assert!(
            decoder.snapshot_failed_identity.is_none(),
            "snapshot path should not silently fall back on the plain geometry fixture"
        );
        source.transforms.rotation = "0".into();
        source.transforms.filters = "hflip,".into();
        let bytes = decoder
            .extract(&root, &source, true, &cancelled, &stopped)
            .unwrap();
        let frame = image::load_from_memory(&bytes).unwrap().to_rgb8();
        assert!(frame.get_pixel(80, 90)[2] > 200);
        source.transforms.filters = "crop=160:180:160:0,".into();
        let bytes = decoder
            .extract(&root, &source, true, &cancelled, &stopped)
            .unwrap();
        assert!(
            image::load_from_memory(&bytes)
                .unwrap()
                .to_rgb8()
                .get_pixel(160, 90)[2]
                > 200
        );
        source.transforms.filters.clear();
        source.transforms.crop = "160x180+160+0".into();
        let bytes = decoder
            .extract(&root, &source, true, &cancelled, &stopped)
            .unwrap();
        let frame = image::load_from_memory(&bytes).unwrap().to_rgb8();
        assert!(frame.get_pixel(160, 90)[2] > 200);
    }

    #[test]
    #[ignore = "requires LMPV_THUMB_ROOT and LMPV_THUMB_LONG_GOP"]
    fn long_gop_exact_is_not_a_keyframe_and_cancel_does_not_poison_next_seek() {
        let root = std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_ROOT").unwrap());
        let path = std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_LONG_GOP").unwrap());
        let cancelled = AtomicBool::new(false);
        let stopped = AtomicBool::new(false);
        let mut decoder = NativeDecoder::default();
        let mut source = SourceRequest {
            path,
            stream: "0:0".into(),
            vid: "1".into(),
            seconds: 3.1,
            hdr: None,
            transforms: Default::default(),
            profile: super::super::profile::DecodeProfile::Snapshot,
        };
        let center = |bytes: Vec<u8>| {
            image::load_from_memory(&bytes)
                .unwrap()
                .to_rgb8()
                .get_pixel(160, 90)
                .0
        };
        let main = PreviewCore::new(
            &root,
            &decoder::preview_filter(None),
            "1",
            0.4,
            true,
            crate::mpv_manager::preview::PreviewBackend::Software,
        )
        .unwrap();
        main.command(&["loadfile", source.path.to_str().unwrap()])
            .unwrap();
        wait_restart(
            &main,
            &cancelled,
            &stopped,
            None,
            Instant::now() + Duration::from_secs(3),
        )
        .unwrap();
        let main_position = main.position().unwrap();
        let coarse = center(
            decoder
                .extract(&root, &source, false, &cancelled, &stopped)
                .unwrap(),
        );
        let precise = center(
            decoder
                .extract(&root, &source, true, &cancelled, &stopped)
                .unwrap(),
        );
        assert!(
            coarse[0] > 200 && coarse[1] < 50,
            "keyframe should be red: {coarse:?}"
        );
        assert!(
            precise[1] > 200 && precise[0] < 50,
            "exact should be green: {precise:?}"
        );
        source.seconds = 1.0;
        let position = decoder.core.as_ref().unwrap().position().unwrap();
        let cached = center(
            decoder
                .extract(&root, &source, false, &cancelled, &stopped)
                .unwrap(),
        );
        assert!(cached[0] > 200 && cached[1] < 50);
        assert_eq!(
            decoder.core.as_ref().unwrap().position().unwrap(),
            position,
            "coarse interval hit must not seek the decoder"
        );
        decoder
            .extract(&root, &source, true, &cancelled, &stopped)
            .unwrap();
        assert!(
            (decoder.core.as_ref().unwrap().position().unwrap() - 1.0).abs() < 0.08,
            "exact must not reuse an approximate interval frame"
        );
        source.seconds = 3.1;
        // Drop the idle context; cancel during initialization/file loading, not
        // before extract. Its events must never be reused by the next request.
        decoder.last_used = Some(Instant::now() - Duration::from_secs(6));
        decoder.release_if_idle();
        assert!(decoder.core.is_none());
        std::thread::scope(|scope| {
            scope.spawn(|| {
                std::thread::sleep(Duration::from_millis(1));
                cancelled.store(true, Ordering::Release);
            });
            assert_eq!(
                decoder
                    .extract(&root, &source, true, &cancelled, &stopped)
                    .unwrap_err(),
                "THUMBNAIL_CANCELLED"
            );
        });
        assert!(decoder.core.is_none());
        cancelled.store(false, Ordering::Release);
        source.seconds = 4.2;
        let next = center(
            decoder
                .extract(&root, &source, true, &cancelled, &stopped)
                .unwrap(),
        );
        assert!(
            next[2] > 200 && next[0] < 50,
            "next exact should be blue: {next:?}"
        );
        assert!(
            (main.position().unwrap() - main_position).abs() < 0.001,
            "preview must not seek playback"
        );
    }

    #[test]
    #[ignore = "requires LMPV_THUMB_ROOT and LMPV_THUMB_FIXTURE"]
    fn persistent_libmpv_reuses_seeks_tracks_and_cancellation() {
        let root = std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_ROOT").unwrap());
        let path = std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_FIXTURE").unwrap())
            .canonicalize()
            .unwrap();
        let cancelled = AtomicBool::new(false);
        let stopped = AtomicBool::new(false);
        let mut decoder = NativeDecoder::default();
        let mut source = SourceRequest {
            path,
            stream: "0:0".into(),
            vid: "1".into(),
            seconds: 0.0,
            hdr: None,
            transforms: Default::default(),
            profile: super::super::profile::DecodeProfile::Snapshot,
        };
        // A rapid pointer move may cancel the first request before file-loaded.
        cancelled.store(true, Ordering::Release);
        assert_eq!(
            decoder
                .extract(&root, &source, false, &cancelled, &stopped)
                .unwrap_err(),
            "THUMBNAIL_CANCELLED"
        );
        cancelled.store(false, Ordering::Release);
        for (time, exact, color) in [
            (0.0, true, 0),
            (3.1, true, 2),
            (0.1, false, 0),
            (4.2, true, 1),
        ] {
            source.seconds = time;
            let began = Instant::now();
            let bytes = decoder
                .extract(&root, &source, exact, &cancelled, &stopped)
                .unwrap();
            println!("native {time} exact={exact}: {:?}", began.elapsed());
            let image = image::load_from_memory(&bytes).unwrap().to_rgb8();
            assert_eq!(image.dimensions(), (320, 180));
            assert!(image.get_pixel(160, 90).0[color] > 100);
        }
        source.profile = super::super::profile::DecodeProfile::Software;
        source.seconds = 3.1;
        let software = decoder
            .extract(&root, &source, true, &cancelled, &stopped)
            .unwrap();
        assert!(
            image::load_from_memory(&software)
                .unwrap()
                .to_rgb8()
                .get_pixel(160, 90)[2]
                > 100
        );
        source.stream = "0:1".into();
        source.vid = "2".into();
        source.seconds = 3.1;
        let bytes = decoder
            .extract(&root, &source, true, &cancelled, &stopped)
            .unwrap();
        let yellow = image::load_from_memory(&bytes)
            .unwrap()
            .to_rgb8()
            .get_pixel(160, 90)
            .0;
        assert!(
            yellow[0] > 200 && yellow[1] > 200 && yellow[2] < 50,
            "{yellow:?}"
        );
        cancelled.store(true, Ordering::Release);
        assert_eq!(
            decoder
                .extract(&root, &source, false, &cancelled, &stopped)
                .unwrap_err(),
            "THUMBNAIL_CANCELLED"
        );
        cancelled.store(false, Ordering::Release);
        decoder
            .extract(&root, &source, false, &cancelled, &stopped)
            .unwrap();
        if let Some(path) = std::env::var_os("LMPV_THUMB_HDR_FIXTURE") {
            source.path = path.into();
            source.profile = super::super::profile::DecodeProfile::Hardware;
            source.stream = "0:0".into();
            source.vid = "1".into();
            for hdr in [decoder::HdrTransfer::Pq, decoder::HdrTransfer::Hlg] {
                source.hdr = Some(hdr);
                for (time, exact) in [(0.0, false), (2.5, false), (1.2, false), (2.5, true)] {
                    source.seconds = time;
                    let began = Instant::now();
                    let bytes = decoder
                        .extract(&root, &source, exact, &cancelled, &stopped)
                        .unwrap();
                    println!("4K native {time} exact={exact}: {:?}", began.elapsed());
                    assert_eq!(image::load_from_memory(&bytes).unwrap().width(), 320);
                }
            }
        }
        if let Some(path) = std::env::var_os("LMPV_THUMB_REAL_FIXTURE") {
            source.path = path.into();
            source.hdr = None;
            source.stream = "0:0".into();
            source.vid = "1".into();
            source.profile = super::super::profile::DecodeProfile::Snapshot;
            for (time, exact) in [
                (60.5, false),
                (180.2, false),
                (300.0, false),
                (90.1, false),
                (180.2, true),
            ] {
                source.seconds = time;
                let began = Instant::now();
                let bytes = decoder
                    .extract(&root, &source, exact, &cancelled, &stopped)
                    .unwrap();
                println!("real 4K {time} exact={exact}: {:?}", began.elapsed());
                assert!(
                    decoder.snapshot_failed_identity.as_ref() != Some(&decoder.identity),
                    "real SDR4K must use post-seek snapshot resizing, not silently fall back"
                );
                assert_eq!(image::load_from_memory(&bytes).unwrap().width(), 320);
            }
        }
        assert!(decoder.core.is_some());
    }
}

impl NativeDecoder {
    /// Очистка неактивного контекста libmpv по истечении 5 секунд бездействия.
    /// Возвращает true, если декодер еще активен, или false, если освобожден.
    pub fn release_if_idle(&mut self) -> bool {
        if self
            .last_used
            .is_some_and(|time| time.elapsed() >= Duration::from_secs(5))
        {
            self.core = None;
            self.last_used = None;
            false
        } else {
            self.core.is_some()
        }
    }

    pub fn extract(
        &mut self,
        root: &Path,
        source: &SourceRequest,
        exact: bool,
        cancelled: &AtomicBool,
        stopped: &AtomicBool,
    ) -> Result<Vec<u8>, String> {
        self.extract_until(
            root,
            source,
            exact,
            cancelled,
            stopped,
            Instant::now() + Duration::from_secs(3),
        )
    }

    fn extract_until(
        &mut self,
        root: &Path,
        source: &SourceRequest,
        exact: bool,
        cancelled: &AtomicBool,
        stopped: &AtomicBool,
        deadline: Instant,
    ) -> Result<Vec<u8>, String> {
        // Identity includes file metadata, track and conversion, but not seek position.
        if cancelled.load(Ordering::Acquire) || stopped.load(Ordering::Acquire) {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        if Instant::now() >= deadline {
            return Err("THUMBNAIL_MPV_TIMEOUT".into());
        }
        let identity = super::cache::cache_key(
            &source.path,
            &source.cache_stream(),
            source.hdr.map_or(0, |h| h as u8),
            0.0,
            false,
        )?;
        if self.identity != identity {
            self.core = None;
            self.coarse.clear();
            self.identity = identity.clone();
        }
        if let Some(bytes) = self.coarse.get(source.seconds, exact) {
            self.last_used = Some(Instant::now());
            return Ok(bytes);
        }
        let using_snapshot = source.profile == super::profile::DecodeProfile::Snapshot
            && self.snapshot_failed_identity.as_ref() != Some(&identity)
            && source.transforms.is_identity()
            && source.hdr.is_none();
        let profile =
            if source.profile == super::profile::DecodeProfile::Snapshot && !using_snapshot {
                super::profile::DecodeProfile::Hardware
            } else {
                source.profile
            };
        let fresh = self.core.is_none();
        self.last_used = Some(Instant::now());
        let result = (|| {
            if fresh {
                self.core = None;
                let filter = if using_snapshot {
                    String::new()
                } else {
                    source.transforms.filter(source.hdr)
                };
                self.core = Some(PreviewCore::new(
                    root,
                    &filter,
                    &source.vid,
                    source.seconds,
                    exact,
                    profile.backend(),
                )?);
                self.core
                    .as_ref()
                    .unwrap()
                    .set_property("video-rotate", &source.transforms.rotation)?;
                if !source.transforms.crop.is_empty() {
                    self.core
                        .as_ref()
                        .unwrap()
                        .set_property("video-crop", &source.transforms.crop)?;
                }
                let path = source.path.to_str().ok_or("THUMBNAIL_PATH")?;
                self.core.as_ref().unwrap().command(&["loadfile", path])?;
            }
            let core = self.core.as_ref().ok_or("THUMBNAIL_MPV_UNAVAILABLE")?;
            let mut frame = || {
                let actual = verified_position(core, source.seconds, exact)?;
                // Forward hovers can land on the same keyframe beyond the last
                // proven interval. Seek proves that bound, but downloading and
                // encoding the identical frame again would waste CPU/GPU work.
                if !exact {
                    if let Some(bytes) = self.coarse.get(actual, true) {
                        return Ok(bytes);
                    }
                }
                if using_snapshot {
                    core.validate_snapshot()?;
                }
                core.jpeg()
            };
            if fresh {
                wait_restart(core, cancelled, stopped, None, deadline)?;
                return frame();
            }
            {
                while core.event()? != 0 {}
                core.command(&[
                    "seek",
                    &format!("{:.3}", source.seconds),
                    if exact {
                        "absolute+exact"
                    } else {
                        "absolute+keyframes"
                    },
                ])?;
            }
            wait_restart(core, cancelled, stopped, Some((source.seconds, exact)), deadline)?;
            frame()
        })();
        if !exact {
            if let Ok(bytes) = &result {
                if let Some(actual) = self.core.as_ref().and_then(|core| core.position().ok()) {
                    self.coarse.insert(actual, source.seconds, bytes);
                }
            }
        }
        if let Err(err) = &result {
            // Контекст декодера уничтожается только если сбой произошёл на этапе
            // первоначальной загрузки файла (fresh == true), либо при неисправимой ошибке декодера.
            // При штатной отмене сика в уже прогретом декодере контекст сохраняется живым!
            let is_fatal = fresh || (err != "THUMBNAIL_CANCELLED" && err != "THUMBNAIL_MPV_TIMEOUT");
            if is_fatal {
                self.core = None;
                if using_snapshot
                    && err != "THUMBNAIL_CANCELLED"
                    && err != "THUMBNAIL_MPV_TIMEOUT"
                {
                    #[cfg(test)]
                    eprintln!("Snapshot fallback: {:?}", err);
                    self.snapshot_failed_identity = Some(identity);
                    return self.extract_until(root, source, exact, cancelled, stopped, deadline);
                }
            }
        }
        self.last_used = Some(Instant::now());
        result
    }
}

fn wait_restart(
    core: &PreviewCore,
    cancelled: &AtomicBool,
    stopped: &AtomicBool,
    target: Option<(f64, bool)>,
    deadline: Instant,
) -> Result<(), String> {
    let mut seeking = target.is_none();
    loop {
        if cancelled.load(Ordering::Acquire) || stopped.load(Ordering::Acquire) {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        if Instant::now() >= deadline {
            return Err("THUMBNAIL_MPV_TIMEOUT".into());
        }
        match core.wait_event(0.01)? {
            20 => seeking = true,
            21 if seeking => {
                if let Some((requested, exact)) = target {
                    if let Ok(actual) = core.position() {
                        if exact {
                            if (actual - requested).abs() <= core.frame_tolerance() {
                                return Ok(());
                            }
                            // Позиция не совпадает: это запоздалое событие от ранее отменённого сика.
                            // Продолжаем ожидание события PLAYBACK_RESTART от актуального сика.
                            seeking = false;
                            continue;
                        } else if actual <= requested + 0.1 && requested - actual <= 120.0 {
                            return Ok(());
                        } else {
                            seeking = false;
                            continue;
                        }
                    }
                }
                return Ok(());
            }
            7 => return Err("THUMBNAIL_MPV_END".into()),
            _ => {}
        }
    }
}

fn verified_position(core: &PreviewCore, requested: f64, exact: bool) -> Result<f64, String> {
    let actual = core.position()?;
    if !actual.is_finite() || (exact && (actual - requested).abs() > core.frame_tolerance()) {
        return Err("THUMBNAIL_MPV_POSITION".into());
    }
    Ok(actual)
}
