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
    /// Позиция и режим начальной загрузки, если её PLAYBACK_RESTART ещё не получен.
    loading: Option<(f64, bool)>,
    identity: String,
    last_used: Option<Instant>,
    snapshot_failed_identity: Option<String>,
    coarse: super::coarse_cache::CoarseCache,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires LMPV_THUMB_ROOT and LMPV_THUMB_REAL_FIXTURE (long-GOP 4K)"]
    fn warm_cancel_preserves_context_and_next_exact_frame() {
        let root = std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_ROOT").unwrap());
        let mut source = SourceRequest {
            path: std::env::var_os("LMPV_THUMB_REAL_FIXTURE").unwrap().into(),
            stream: "0:0".into(),
            vid: "1".into(),
            seconds: 60.5,
            hdr: None,
            transforms: Default::default(),
            profile: super::super::profile::DecodeProfile::Snapshot,
            identity: String::new(),
            size: (320, 180),
        };
        let cancelled = AtomicBool::new(false);
        let stopped = AtomicBool::new(false);
        let mut decoder = NativeDecoder::default();
        let reference = decoder
            .extract(&root, &source, true, &cancelled, &stopped)
            .unwrap();
        for seconds in [180.2, 300.0, 180.24] {
            source.seconds = seconds;
            std::thread::scope(|scope| {
                scope.spawn(|| {
                    std::thread::sleep(Duration::from_millis(10));
                    cancelled.store(true, Ordering::Release);
                });
                assert_eq!(
                    decoder
                        .extract(&root, &source, true, &cancelled, &stopped)
                        .unwrap_err(),
                    "THUMBNAIL_CANCELLED"
                );
            });
            assert!(
                decoder.core.is_some(),
                "warm cancellation must preserve the context"
            );
            cancelled.store(false, Ordering::Release);
            source.seconds = 60.5;
            let next = decoder
                .extract(&root, &source, true, &cancelled, &stopped)
                .unwrap();
            let expected = image::load_from_memory(&reference).unwrap().to_rgb8();
            let actual = image::load_from_memory(&next).unwrap().to_rgb8();
            let error = expected
                .as_raw()
                .iter()
                .zip(actual.as_raw())
                .map(|(a, b)| (*a as f64 - *b as f64).abs())
                .sum::<f64>()
                / expected.as_raw().len() as f64;
            assert!(
                error < 2.0,
                "late seek events changed the next exact frame: {error}"
            );
        }
    }

    /// Замер задержек: LMPV_THUMB_ROOT и LMPV_THUMB_BENCH (путь к видео).
    #[test]
    #[ignore = "requires LMPV_THUMB_ROOT and LMPV_THUMB_BENCH"]
    fn bench_hover_latency() {
        let root = std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_ROOT").unwrap());
        let path = std::path::PathBuf::from(std::env::var_os("LMPV_THUMB_BENCH").unwrap());
        let duration: f64 = std::env::var("LMPV_THUMB_BENCH_DURATION")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(300.0);
        let cancelled = AtomicBool::new(false);
        let stopped = AtomicBool::new(false);
        let mut decoder = NativeDecoder::default();
        let mut source = SourceRequest {
            path,
            stream: "0:0".into(),
            vid: "1".into(),
            seconds: duration * 0.1,
            hdr: None,
            transforms: Default::default(),
            profile: super::super::profile::DecodeProfile::Hardware,
            identity: String::new(),
            size: (320, 180),
        };
        let ms = |d: Duration| d.as_secs_f64() * 1000.0;
        let began = Instant::now();
        decoder
            .extract(&root, &source, false, &cancelled, &stopped)
            .unwrap();
        println!("BENCH cold first keyframe: {:.1} ms", ms(began.elapsed()));
        let mut grid = Vec::new();
        for step in 0..30 {
            source.seconds = (duration * (0.05 + 0.03 * step as f64)).floor();
            let began = Instant::now();
            decoder
                .extract(&root, &source, false, &cancelled, &stopped)
                .unwrap();
            grid.push(ms(began.elapsed()));
        }
        let mut exact = Vec::new();
        for step in 0..10 {
            source.seconds = duration * (0.07 + 0.09 * step as f64) + 3.37;
            let began = Instant::now();
            decoder
                .extract(&root, &source, true, &cancelled, &stopped)
                .unwrap();
            exact.push(ms(began.elapsed()));
        }
        let avg = |v: &[f64]| v.iter().sum::<f64>() / v.len() as f64;
        let max = |v: &[f64]| v.iter().cloned().fold(0.0, f64::max);
        println!(
            "BENCH keyframe sweep: avg {:.1} ms, max {:.1} ms",
            avg(&grid),
            max(&grid)
        );
        println!(
            "BENCH exact: avg {:.1} ms, max {:.1} ms",
            avg(&exact),
            max(&exact)
        );
        // Холодный старт с отменой во время загрузки и следующим запросом.
        let mut decoder = NativeDecoder::default();
        source.seconds = (duration * 0.5).floor();
        std::thread::scope(|scope| {
            scope.spawn(|| {
                std::thread::sleep(Duration::from_millis(15));
                cancelled.store(true, Ordering::Release);
            });
            let _ = decoder.extract(&root, &source, false, &cancelled, &stopped);
        });
        cancelled.store(false, Ordering::Release);
        source.seconds = (duration * 0.97).floor();
        let began = Instant::now();
        decoder
            .extract(&root, &source, false, &cancelled, &stopped)
            .unwrap();
        println!(
            "BENCH request after cancel during cold start: {:.1} ms",
            ms(began.elapsed())
        );
    }

    #[test]
    #[ignore = "requires LMPV_THUMB_ROOT and LMPV_THUMB_FIXTURE"]
    fn prewarm_and_storyboard_tiles_share_the_core_without_mixing_frames() {
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
            seconds: 0.5,
            hdr: None,
            transforms: Default::default(),
            profile: super::super::profile::DecodeProfile::Hardware,
            identity: String::new(),
            size: (320, 180),
        };
        let pixel = |bytes: &[u8]| {
            let image = image::load_from_memory(bytes).unwrap().to_rgb8();
            (
                image.dimensions(),
                image.get_pixel(image.width() / 2, image.height() / 2).0,
            )
        };
        // Прогрев не ждёт кадра: загрузка завершится в следующем запросе.
        decoder.prewarm(&root, &source);
        assert!(decoder.core.is_some() && decoder.loading.is_some());
        source.seconds = 4.2;
        let (size, green) = pixel(
            &decoder
                .extract(&root, &source, true, &cancelled, &stopped)
                .unwrap(),
        );
        assert_eq!(size, (320, 180));
        assert!(
            green[1] > 100 && green[0] < 80,
            "exact after prewarm: {green:?}"
        );
        assert!(decoder.loading.is_none());
        // Кадр раскадровки — ключевой кадр в своём размере, с его позицией.
        source.seconds = 3.5;
        let (bytes, actual) = decoder
            .extract_tile(&root, &source, (240, 135), &cancelled, &stopped)
            .unwrap();
        let (size, blue) = pixel(&bytes);
        assert_eq!(size, (240, 135));
        assert!(
            blue[2] > 100 && blue[0] < 80,
            "tile at keyframe 3.0: {blue:?}"
        );
        assert!((actual - 3.0).abs() < 0.05, "keyframe position {actual}");
        // Кадр раскадровки не попадает в кеш живых интервалов (другой размер).
        let (size, _) = pixel(
            &decoder
                .extract(&root, &source, false, &cancelled, &stopped)
                .unwrap(),
        );
        assert_eq!(size, (320, 180));
        // HiDPI-размер пересоздаёт ядро под новый размер.
        source.size = (480, 270);
        source.seconds = 0.2;
        let (size, red) = pixel(
            &decoder
                .extract(&root, &source, true, &cancelled, &stopped)
                .unwrap(),
        );
        assert_eq!(size, (480, 270));
        assert!(red[0] > 100 && red[2] < 80, "{red:?}");
    }

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
            identity: String::new(),
            size: (320, 180),
        };
        assert_eq!(
            decoder
                .extract_until(
                    Path::new("not-opened"),
                    &source,
                    false,
                    Output::Live,
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
            identity: String::new(),
            size: (320, 180),
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
            identity: String::new(),
            size: (320, 180),
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
            identity: String::new(),
            size: (320, 180),
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
            &decoder::preview_filter(None, (320, 180)),
            "1",
            0.4,
            true,
            crate::mpv_manager::preview::PreviewBackend::Software,
            (320, 180),
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
        // before extract. The loading context survives, but its late events must
        // never be reused as the answer to the next request's seek.
        decoder.last_used = Some(Instant::now() - IDLE_RELEASE - Duration::from_secs(1));
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
        assert!(
            decoder.core.is_some(),
            "cancel during loading must keep the context (no repeated cold start)"
        );
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
            identity: String::new(),
            size: (320, 180),
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

/// Сколько живёт простаивающее ядро превью. Раскадровка закрывает холодный
/// старт при быстром ведении, поэтому ядро не нужно держать долго.
pub(super) const IDLE_RELEASE: Duration = Duration::from_secs(20);

/// Как закодировать результат: размер живой миниатюры или кадра раскадровки.
#[derive(Clone, Copy)]
pub(super) enum Output {
    Live,
    Tile((u32, u32)),
}

impl NativeDecoder {
    /// Освобождает неактивный контекст libmpv после `IDLE_RELEASE` бездействия.
    /// Возвращает true, если декодер еще активен, или false, если освобожден.
    pub fn release_if_idle(&mut self) -> bool {
        if self
            .last_used
            .is_some_and(|time| time.elapsed() >= IDLE_RELEASE)
        {
            self.reset_core();
            self.last_used = None;
            false
        } else {
            self.core.is_some()
        }
    }

    fn reset_core(&mut self) {
        self.core = None;
        self.loading = None;
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
            Output::Live,
            cancelled,
            stopped,
            Instant::now() + Duration::from_secs(3),
        )
        .map(|(bytes, _)| bytes)
    }

    /// Кадр раскадровки: ближайший ключевой кадр, закодированный в `size`.
    /// Возвращает JPEG и фактическую позицию ключевого кадра.
    pub fn extract_tile(
        &mut self,
        root: &Path,
        source: &SourceRequest,
        size: (u32, u32),
        cancelled: &AtomicBool,
        stopped: &AtomicBool,
    ) -> Result<(Vec<u8>, f64), String> {
        self.extract_until(
            root,
            source,
            false,
            Output::Tile(size),
            cancelled,
            stopped,
            Instant::now() + Duration::from_secs(3),
        )
    }

    /// Создаёт ядро и начинает загрузку файла, не дожидаясь первого кадра.
    /// Следующий запрос дождётся окончания загрузки (см. `loading`).
    pub fn prewarm(&mut self, root: &Path, source: &SourceRequest) {
        self.adopt_identity(source);
        if self.core.is_none() {
            let (using_snapshot, profile) = self.plan(source);
            if self
                .open(root, source, false, using_snapshot, profile)
                .is_err()
            {
                self.reset_core();
            }
        }
        self.last_used = Some(Instant::now());
    }

    fn adopt_identity(&mut self, source: &SourceRequest) -> String {
        // Identity includes file metadata, track, transforms, size and conversion,
        // but not seek position.
        let identity = source.decoder_identity();
        if self.identity != identity {
            self.reset_core();
            self.coarse.clear();
            self.identity = identity.clone();
        }
        identity
    }

    fn plan(&self, source: &SourceRequest) -> (bool, super::profile::DecodeProfile) {
        let using_snapshot = source.profile == super::profile::DecodeProfile::Snapshot
            && self.snapshot_failed_identity.as_ref() != Some(&self.identity)
            && source.transforms.is_identity()
            && source.hdr.is_none();
        let profile =
            if source.profile == super::profile::DecodeProfile::Snapshot && !using_snapshot {
                super::profile::DecodeProfile::Hardware
            } else {
                source.profile
            };
        (using_snapshot, profile)
    }

    fn open(
        &mut self,
        root: &Path,
        source: &SourceRequest,
        exact: bool,
        using_snapshot: bool,
        profile: super::profile::DecodeProfile,
    ) -> Result<(), String> {
        self.reset_core();
        let filter = if using_snapshot {
            String::new()
        } else {
            source.transforms.filter(source.hdr, source.size)
        };
        let core = PreviewCore::new(
            root,
            &filter,
            &source.vid,
            source.seconds,
            exact,
            profile.backend(),
            source.size,
        )?;
        core.set_property("video-rotate", &source.transforms.rotation)?;
        if !source.transforms.crop.is_empty() {
            core.set_property("video-crop", &source.transforms.crop)?;
        }
        let path = source.path.to_str().ok_or("THUMBNAIL_PATH")?;
        core.command(&["loadfile", path])?;
        self.core = Some(core);
        self.loading = Some((source.seconds, exact));
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn extract_until(
        &mut self,
        root: &Path,
        source: &SourceRequest,
        exact: bool,
        output: Output,
        cancelled: &AtomicBool,
        stopped: &AtomicBool,
        deadline: Instant,
    ) -> Result<(Vec<u8>, f64), String> {
        if cancelled.load(Ordering::Acquire) || stopped.load(Ordering::Acquire) {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        if Instant::now() >= deadline {
            return Err("THUMBNAIL_MPV_TIMEOUT".into());
        }
        let identity = self.adopt_identity(source);
        let live = matches!(output, Output::Live);
        if live {
            if let Some(bytes) = self.coarse.get(source.seconds, exact) {
                self.last_used = Some(Instant::now());
                return Ok((bytes, source.seconds));
            }
        }
        let (using_snapshot, profile) = self.plan(source);
        self.last_used = Some(Instant::now());
        let mut loading_failed = false;
        let result = (|| {
            if self.core.is_none() {
                self.open(root, source, exact, using_snapshot, profile)?;
            }
            let core = self.core.as_ref().ok_or("THUMBNAIL_MPV_UNAVAILABLE")?;
            let encode = |core: &PreviewCore| match output {
                Output::Live => core.jpeg(),
                Output::Tile(size) => core.jpeg_sized(size),
            };
            let frame = |coarse: &mut super::coarse_cache::CoarseCache| {
                let actual = verified_position(core, source.seconds, exact)?;
                // Forward hovers can land on the same keyframe beyond the last
                // proven interval. Seek proves that bound, but downloading and
                // encoding the identical frame again would waste CPU/GPU work.
                if live && !exact {
                    if let Some(bytes) = coarse.get(actual, true) {
                        return Ok((bytes, actual));
                    }
                }
                if using_snapshot {
                    core.validate_snapshot()?;
                }
                encode(core).map(|bytes| (bytes, actual))
            };
            if let Some(opened_at) = self.loading {
                // Загрузка файла могла начаться в отменённом запросе или при
                // прогреве. Сначала дожидаемся её PLAYBACK_RESTART: тогда её
                // позднее событие уже не будет принято за ответ на наш seek.
                if let Err(error) = wait_restart(core, cancelled, stopped, None, deadline) {
                    loading_failed = error == "THUMBNAIL_MPV_END";
                    return Err(error);
                }
                self.loading = None;
                if opened_at == (source.seconds, exact) {
                    return frame(&mut self.coarse);
                }
            }
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
            wait_restart(
                core,
                cancelled,
                stopped,
                Some((source.seconds, exact)),
                deadline,
            )?;
            frame(&mut self.coarse)
        })();
        if live && !exact {
            if let Ok((bytes, actual)) = &result {
                self.coarse.insert(*actual, source.seconds, bytes);
            }
        }
        if let Err(err) = &result {
            // Отмена, таймаут и несовпадение позиции — штатные исходы: контекст
            // сохраняется, в том числе если загрузка файла ещё не закончилась.
            // Уничтожается он только при неисправимой ошибке или если сам файл
            // не загрузился.
            let recoverable = matches!(
                err.as_str(),
                "THUMBNAIL_CANCELLED"
                    | "THUMBNAIL_MPV_TIMEOUT"
                    | "THUMBNAIL_MPV_POSITION"
                    | "THUMBNAIL_MPV_END"
            ) && !loading_failed;
            if !recoverable {
                self.reset_core();
                if using_snapshot && err != "THUMBNAIL_CANCELLED" && err != "THUMBNAIL_MPV_TIMEOUT"
                {
                    #[cfg(test)]
                    eprintln!("Snapshot fallback: {:?}", err);
                    self.snapshot_failed_identity = Some(identity);
                    return self
                        .extract_until(root, source, exact, output, cancelled, stopped, deadline);
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
                            // Продолжаем ожидание события PLAYBACK_RESTART от актуального сика,
                            // не сбрасывая seeking, так как событие 20 для текущего сика уже поступило.
                            continue;
                        } else if actual <= requested + 0.1 && requested - actual <= 120.0 {
                            return Ok(());
                        } else {
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
