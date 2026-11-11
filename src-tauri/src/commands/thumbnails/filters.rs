//! Shared preview color conversion with CPU and optional GPU scaling paths.
#[derive(Clone, Copy, Debug)]
pub(super) enum HdrTransfer {
    Pq = 1,
    Hlg = 2,
}

fn color(hdr: Option<HdrTransfer>) -> String {
    match hdr {
        None => String::new(),
        Some(hdr) => {
            let transfer = match hdr {
                HdrTransfer::Pq => "smpte2084",
                HdrTransfer::Hlg => "arib-std-b67",
            };
            format!("zscale=pin=bt2020:tin={transfer}:min=bt2020nc:t=linear:m=gbr:p=bt709:npl=100,format=gbrpf32le,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,")
        }
    }
}

pub(super) fn software(hdr: Option<HdrTransfer>, boxed: bool) -> String {
    let bounds = if boxed { "320:180" } else { "320:320" };
    let pad = if boxed {
        "pad=320:180:(ow-iw)/2:(oh-ih)/2,"
    } else {
        ""
    };
    format!("scale={bounds}:force_original_aspect_ratio=decrease:force_divisible_by=2:reset_sar=1,{}{pad}setsar=1", color(hdr))
}
