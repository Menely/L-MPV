use super::{decoder, SourceRequest};
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
    failed_identity: Option<String>,
    last_used: Option<Instant>,
    ready: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!(decoder.failed_identity.is_none());
    }
}

impl NativeDecoder {
    pub fn release_if_idle(&mut self) {
        if self
            .last_used
            .is_some_and(|time| time.elapsed() >= Duration::from_secs(5))
        {
            self.core = None;
            self.last_used = None;
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
        // Identity includes file metadata, track and conversion, but not seek position.
        let identity = super::cache::cache_key(
            &source.path,
            &source.stream,
            source.hdr.map_or(0, |h| h as u8),
            0.0,
            false,
        )?;
        if self.failed_identity.as_ref() == Some(&identity) {
            return Err("THUMBNAIL_MPV_UNAVAILABLE".into());
        }
        let fresh = self.core.is_none() || self.identity != identity;
        self.last_used = Some(Instant::now());
        let result = (|| {
            if fresh {
                self.ready = false;
                self.core = None;
                self.core = Some(PreviewCore::new(
                    root,
                    &decoder::preview_filter(source.hdr),
                    &source.vid,
                    source.seconds,
                    exact,
                )?);
                self.identity = identity.clone();
                let path = source.path.to_str().ok_or("THUMBNAIL_PATH")?;
                self.core.as_ref().unwrap().command(&["loadfile", path])?;
            }
            let core = self.core.as_ref().ok_or("THUMBNAIL_MPV_UNAVAILABLE")?;
            if !self.ready {
                wait_restart(core, cancelled, stopped, false)?;
                self.ready = true;
                if fresh {
                    return core.jpeg();
                }
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
            wait_restart(core, cancelled, stopped, true)?;
            core.jpeg()
        })();
        if result
            .as_ref()
            .is_err_and(|e: &String| e != "THUMBNAIL_CANCELLED")
        {
            self.core = None;
            self.failed_identity = Some(identity);
        }
        result
    }
}

fn wait_restart(
    core: &PreviewCore,
    cancelled: &AtomicBool,
    stopped: &AtomicBool,
    require_seek: bool,
) -> Result<(), String> {
    let began = Instant::now();
    let mut seeking = !require_seek;
    loop {
        if cancelled.load(Ordering::Acquire) || stopped.load(Ordering::Acquire) {
            return Err("THUMBNAIL_CANCELLED".into());
        }
        if began.elapsed() > Duration::from_secs(5) {
            return Err("THUMBNAIL_MPV_TIMEOUT".into());
        }
        match core.event()? {
            20 => seeking = true,
            21 if seeking => return Ok(()),
            7 => return Err("THUMBNAIL_MPV_END".into()),
            _ => {}
        }
        std::thread::sleep(Duration::from_millis(2));
    }
}
