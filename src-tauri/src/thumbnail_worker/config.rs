use std::path::PathBuf;

#[derive(Debug)]
pub(super) struct Config {
    pub input: PathBuf,
    pub output: PathBuf,
    pub parent: u32,
    pub options: Vec<(String, String)>,
}

impl Config {
    pub fn parse(args: &[String]) -> Result<Self, String> {
        Self::parse_impl(args, false)
    }

    pub fn parse_shared(args: &[String]) -> Result<Self, String> {
        Self::parse_impl(args, true)
    }

    fn parse_impl(args: &[String], shared: bool) -> Result<Self, String> {
        let (mut options, mut output, mut input, mut parent) =
            (Vec::<(String, String)>::new(), None, None, None);
        let mut files = false;
        for arg in args {
            if arg == "--" {
                files = true;
                continue;
            }
            if files {
                if input.replace(PathBuf::from(arg)).is_some() {
                    return Err("Worker accepts one local file".into());
                }
                continue;
            }
            let flag = arg.strip_prefix("--").ok_or("Invalid worker argument")?;
            let (key, value) = flag.split_once('=').unwrap_or((flag, "yes"));
            if value.len() > 16384 {
                return Err("Worker argument too long".into());
            }
            match key {
                "lmpv-thumbnail-parent" => {
                    parent = Some(value.parse::<u32>().map_err(|_| "Invalid worker parent")?)
                }
                "o" => output = Some(PathBuf::from(value)),
                "input-ipc-server" => {
                    if !value.starts_with("lmpv-thumbfast-")
                        || value.len() > 128
                        || !value
                            .bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
                    {
                        return Err("Invalid worker pipe".into());
                    }
                    options.push((key.into(), value.into()));
                }
                // These affect the decoder/filters, not application initialization.
                "edition"
                | "vid"
                | "start"
                | "hr-seek"
                | "vf"
                | "video-rotate"
                | "vd-lavc-skiploopfilter"
                | "vd-lavc-software-fallback"
                | "vd-lavc-fast"
                | "vd-lavc-threads"
                | "demuxer-readahead-secs"
                | "demuxer-max-bytes"
                | "sws-scaler"
                | "sws-allow-zimg" => options.push((key.into(), value.into())),
                // BGRA output needs downloadable frames, so explicitly prefer copy decoders.
                "hwdec" => options.push((
                    key.into(),
                    if value == "no" { "no" } else { "auto-copy" }.into(),
                )),
                // Upstream CLI flags whose semantics the private worker fixes itself.
                "no-config" | "msg-level" | "idle" | "pause" | "keep-open" | "really-quiet"
                | "no-terminal" | "load-scripts" | "osc" | "ytdl" | "load-stats-overlay"
                | "load-osd-console" | "load-auto-profiles" | "no-sub" | "no-audio"
                | "ytdl-format" | "ovc" | "of" | "ofopts" | "media-controls" => {}
                _ => return Err(format!("Unsupported worker argument: {key}")),
            }
        }
        let input = input
            .ok_or("Missing worker media")?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if !input.is_file() {
            return Err("Worker media is not a file".into());
        }
        let output: PathBuf = output.ok_or("Missing worker output")?;
        let dir = output
            .parent()
            .ok_or("Invalid worker output directory")?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let file = output
            .file_name()
            .and_then(|v| v.to_str())
            .ok_or("Invalid worker output name")?;
        // Private protocol: only the adapter's session directory can receive frames.
        if !dir
            .file_name()
            .and_then(|v| v.to_str())
            .is_some_and(|name| name.starts_with("lmpv-thumbfast-"))
            || !file.starts_with("thumb")
            || !file[5..].bytes().all(|b| b.is_ascii_digit())
        {
            return Err("Worker output is outside a thumbfast session".into());
        }
        let output = dir.join(file);
        if output.canonicalize().is_ok_and(|path| path == input) {
            return Err("Worker output is media".into());
        }
        let parent = parent
            .filter(|pid| *pid > 0 && (shared || *pid != std::process::id()))
            .ok_or("Missing worker parent")?;
        if !options.iter().any(|(key, _)| key == "input-ipc-server") {
            return Err("Missing worker IPC server".into());
        }
        for (key, value) in [
            ("config", "no"),
            ("load-scripts", "no"),
            ("vo", "null"),
            ("audio", "no"),
            ("sub", "no"),
            ("pause", "yes"),
            ("idle", "yes"),
            ("keep-open", "always"),
            ("terminal", "no"),
            ("input-terminal", "no"),
            ("input-media-keys", "no"),
            ("media-controls", "no"),
            ("osc", "no"),
            ("ytdl", "no"),
            ("load-stats-overlay", "no"),
            ("load-osd-console", "no"),
            ("load-auto-profiles", "no"),
            ("msg-level", "all=error"),
            ("vd-lavc-threads", "2"),
            ("demuxer-max-back-bytes", "0"),
            ("vd-queue-enable", "no"),
            // Copy-back has its own decoder thread count; vd-lavc-threads alone
            // does not limit it. Each extra thread can retain full-size 4K frames.
            ("hwdec-threads", "1"),
            ("hwdec-extra-frames", "0"),
        ] {
            options.push((key.into(), value.into()));
        }
        for (key, value) in &mut options {
            if key == "vf" {
                if let Some(normalized) = normalized_filter(value) {
                    *value = normalized;
                }
            }
        }
        Ok(Self {
            input,
            output,
            parent,
            options,
        })
    }
}

/// Normalize startup and live `vf set` changes through the same bounded graph.
pub(super) fn normalized_filter(value: &str) -> Option<String> {
    if value.is_empty() || value.contains("lavfi=") {
        return None;
    }
    let mut graph = value
        .replace("lavfi-crop=", "crop=")
        .replace("format=fmt=", "format=");
    // Only rewrite upstream's known HDR chain. Bound expensive float
    // conversion/tonemapping to thumbnail pixels, not full 4K frames.
    if let (Some(linear), Some(scale)) = (
        graph.find("zscale=transfer=linear,format=gbrpf32le,tonemap="),
        graph.find(",scale="),
    ) {
        let scale = scale + 1;
        if scale > linear {
            let end = graph[scale..]
                .find(',')
                .map_or(graph.len(), |offset| scale + offset);
            let filter = graph[scale..end].to_string();
            graph.replace_range(scale - 1..end, "");
            graph.insert_str(linear, &format!("{filter},"));
        }
    }

    Some(format!("lavfi=[{graph}]:o=[threads=1]"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    #[test]
    fn live_filter_updates_keep_one_graph_and_scale_before_hdr_float_buffers() {
        let raw="hflip,zscale=transfer=linear,format=fmt=gbrpf32le,tonemap=hable,zscale=transfer=bt709,scale=w=320:h=180,pad=w=320:h=180,format=fmt=bgra";
        let graph = normalized_filter(raw).unwrap();
        assert!(graph.find("scale=w=320").unwrap() < graph.find("format=gbrpf32le").unwrap());
        assert!(graph.contains("hflip,scale=w=320:h=180,zscale=transfer=linear"));
        assert!(graph.ends_with(":o=[threads=1]"));
        assert!(normalized_filter(&graph).is_none());
    }
    #[test]
    fn rejects_missing_parent_arbitrary_outputs_and_extra_files() {
        let root =
            std::env::temp_dir().join(format!("lmpv-thumbfast-config-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let input = root.join("video.mkv");
        std::fs::write(&input, b"fixture").unwrap();
        let args = |output: &Path, pid: &str| {
            vec![
                format!("--lmpv-thumbnail-parent={pid}"),
                "--input-ipc-server=lmpv-thumbfast-test".into(),
                format!("--o={}", output.display()),
                "--".into(),
                input.to_string_lossy().into_owned(),
            ]
        };
        assert!(Config::parse(&args(&root.join("thumb123"), "1")).is_ok());
        assert!(Config::parse(&args(&root.join("other"), "1")).is_err());
        assert!(Config::parse(&args(&root.join("thumb123"), "0")).is_err());
        let mut extra = args(&root.join("thumb123"), "1");
        extra.push("second.mkv".into());
        assert!(Config::parse(&extra).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
