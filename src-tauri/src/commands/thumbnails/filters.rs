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

/// `size` — итоговый размер миниатюры. Без `boxed` кадр только вписывается в
/// квадрат со стороной ширины, рамку добавляет кодировщик.
pub(super) fn software(hdr: Option<HdrTransfer>, boxed: bool, size: (u32, u32)) -> String {
    let (w, h) = size;
    let bounds = if boxed {
        format!("{w}:{h}")
    } else {
        format!("{w}:{w}")
    };
    let pad = if boxed {
        format!("pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,")
    } else {
        String::new()
    };
    format!("scale={bounds}:force_original_aspect_ratio=decrease:force_divisible_by=2:reset_sar=1,{}{pad}setsar=1", color(hdr))
}
