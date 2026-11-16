//! Resize only the selected BGR0 screenshot; never process intermediate GOP frames.
use fast_image_resize::{
    images::{TypedImage, TypedImageRef},
    pixels::U8x4,
    FilterType, ImageView, ResizeAlg, ResizeOptions, Resizer,
};

/// Буфер для упаковки строк с отступами больше этого размера не удерживается
/// между кадрами: иначе один 4K-кадр навсегда занимал бы ~33 МБ.
const RETAINED_PACKED_BYTES: usize = 4 * 1024 * 1024;

#[derive(Default)]
pub(super) struct FrameEncoder {
    resizer: Resizer,
    packed: Vec<u8>,
    target: Option<TypedImage<'static, U8x4>>,
    rgb: Vec<u8>,
}

impl FrameEncoder {
    pub fn encode(
        &mut self,
        data: &[u8],
        width: usize,
        height: usize,
        stride: usize,
        aspect: Option<f64>,
        output: (u32, u32),
    ) -> Result<Vec<u8>, String> {
        let (out_w, out_h) = output;
        if out_w < 16 || out_h < 9 || out_w > 1920 || out_h > 1080 {
            return Err("THUMBNAIL_MPV_DIMENSIONS".into());
        }
        if width == 0
            || height == 0
            || width > 8192
            || height > 8192
            || width * height > 8192 * 4320
        {
            return Err("THUMBNAIL_MPV_DIMENSIONS".into());
        }
        let row_bytes = width * 4;
        let required = (height - 1)
            .checked_mul(stride)
            .and_then(|n| n.checked_add(row_bytes))
            .ok_or("THUMBNAIL_MPV_STRIDE")?;
        if stride < row_bytes || data.len() < required {
            return Err("THUMBNAIL_MPV_STRIDE".into());
        }
        // Usually the native buffer is packed and borrowed directly. Pack only
        // unusual padded rows; no full-size RGB conversion/copy on the common path.
        let packed = if stride == row_bytes {
            &data[..height * row_bytes]
        } else {
            self.packed.resize(height * row_bytes, 0);
            for (n, row) in self.packed.chunks_exact_mut(row_bytes).enumerate() {
                row.copy_from_slice(&data[n * stride..n * stride + row_bytes]);
            }
            &self.packed
        };
        let aspect = aspect
            .filter(|a| a.is_finite() && *a > 0.0)
            .unwrap_or(width as f64 / height as f64);
        let (w, h) = fit(aspect, out_w, out_h);
        if self
            .target
            .as_ref()
            .is_none_or(|image| image.width() != w || image.height() != h)
        {
            self.target = Some(TypedImage::new(w, h));
        }
        let input = TypedImageRef::<U8x4>::from_buffer(width as u32, height as u32, packed)
            .map_err(|e| e.to_string())?;
        let target = self.target.as_mut().ok_or("THUMBNAIL_MPV_DIMENSIONS")?;
        // BGR0's fourth byte is padding, not alpha. Do not premultiply it.
        let options = ResizeOptions::new()
            .resize_alg(ResizeAlg::Convolution(FilterType::Bilinear))
            .use_alpha(false);
        let resized = self.resizer.resize_typed(&input, target, &options);
        if self.packed.capacity() > RETAINED_PACKED_BYTES {
            self.packed = Vec::new();
        }
        resized.map_err(|e| e.to_string())?;
        let (frame_w, frame_h) = (out_w as usize, out_h as usize);
        self.rgb.resize(frame_w * frame_h * 3, 0);
        self.rgb.fill(0);
        let left = (frame_w - w as usize) / 2;
        let top = (frame_h - h as usize) / 2;
        for (y, row) in target.pixels().chunks_exact(w as usize).enumerate() {
            for (x, pixel) in row.iter().enumerate() {
                let offset = ((top + y) * frame_w + left + x) * 3;
                self.rgb[offset..offset + 3].copy_from_slice(&[pixel.0[2], pixel.0[1], pixel.0[0]]);
            }
        }
        let mut jpeg = Vec::with_capacity(16 * 1024);
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 75)
            .encode(&self.rgb, out_w, out_h, image::ExtendedColorType::Rgb8)
            .map_err(|e| e.to_string())?;
        Ok(jpeg)
    }
}

fn fit(aspect: f64, out_w: u32, out_h: u32) -> (u32, u32) {
    let (fw, fh) = (out_w as f64, out_h as f64);
    if aspect >= fw / fh {
        (out_w, (fw / aspect).round().clamp(1.0, fh) as u32)
    } else {
        ((fh * aspect).round().clamp(1.0, fw) as u32, out_h)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_bgr0_color_without_alpha_and_padded_rows() {
        let mut pixels = vec![0u8; 648 * 360 * 4];
        for row in pixels.chunks_exact_mut(648 * 4) {
            for p in row[..640 * 4].chunks_exact_mut(4) {
                p[2] = 255;
            }
        }
        let mut encoder = FrameEncoder::default();
        let jpeg = encoder
            .encode(&pixels, 640, 360, 648 * 4, None, (320, 180))
            .unwrap();
        let image = image::load_from_memory(&jpeg).unwrap().to_rgb8();
        assert_eq!(image.dimensions(), (320, 180));
        assert!(image.get_pixel(160, 90)[0] > 240);
        let wide = encoder
            .encode(&pixels, 640, 360, 648 * 4, Some(4.0 / 3.0), (320, 180))
            .unwrap();
        let image = image::load_from_memory(&wide).unwrap().to_rgb8();
        assert!(image.get_pixel(0, 90)[0] < 20 && image.get_pixel(160, 90)[0] > 240);
    }
    #[test]
    fn downscaling_filters_subpixel_detail_instead_of_aliasing() {
        let mut pixels = vec![0; 640 * 360 * 4];
        for y in 0..360 {
            for x in 0..640 {
                let v = if (x + y) % 2 == 0 { 255 } else { 0 };
                let i = (y * 640 + x) * 4;
                pixels[i..i + 3].fill(v);
            }
        }
        let jpeg = FrameEncoder::default()
            .encode(&pixels, 640, 360, 640 * 4, None, (320, 180))
            .unwrap();
        let image = image::load_from_memory(&jpeg).unwrap().to_rgb8();
        assert!((100..155).contains(&image.get_pixel(160, 90)[0]));
    }
    #[test]
    fn encodes_requested_hidpi_and_storyboard_sizes() {
        let mut pixels = vec![0u8; 1280 * 720 * 4];
        for p in pixels.chunks_exact_mut(4) {
            p[1] = 255;
        }
        let mut encoder = FrameEncoder::default();
        for size in [(480, 270), (400, 225), (240, 135)] {
            let jpeg = encoder
                .encode(&pixels, 1280, 720, 1280 * 4, None, size)
                .unwrap();
            let image = image::load_from_memory(&jpeg).unwrap().to_rgb8();
            assert_eq!(image.dimensions(), size);
            assert!(image.get_pixel(size.0 / 2, size.1 / 2)[1] > 240);
        }
        assert!(encoder
            .encode(&pixels, 1280, 720, 1280 * 4, None, (4000, 2000))
            .is_err());
    }
    #[test]
    fn padded_4k_rows_do_not_pin_a_full_frame_buffer() {
        let (w, h, stride) = (3840usize, 2160usize, 3840 * 4 + 64);
        let pixels = vec![128u8; stride * h];
        let mut encoder = FrameEncoder::default();
        encoder
            .encode(&pixels, w, h, stride, None, (320, 180))
            .unwrap();
        assert!(encoder.packed.capacity() <= RETAINED_PACKED_BYTES);
    }
}
