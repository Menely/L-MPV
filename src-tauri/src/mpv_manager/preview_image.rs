//! Resize only the selected BGR0 screenshot; never process intermediate GOP frames.
use fast_image_resize::{
    images::{TypedImage, TypedImageRef},
    pixels::U8x4,
    FilterType, ImageView, ResizeAlg, ResizeOptions, Resizer,
};

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
    ) -> Result<Vec<u8>, String> {
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
        let (w, h) = fit(aspect);
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
        self.resizer
            .resize_typed(&input, target, &options)
            .map_err(|e| e.to_string())?;
        self.rgb.resize(320 * 180 * 3, 0);
        self.rgb.fill(0);
        let left = (320 - w as usize) / 2;
        let top = (180 - h as usize) / 2;
        for (y, row) in target.pixels().chunks_exact(w as usize).enumerate() {
            for (x, pixel) in row.iter().enumerate() {
                let offset = ((top + y) * 320 + left + x) * 3;
                self.rgb[offset..offset + 3].copy_from_slice(&[pixel.0[2], pixel.0[1], pixel.0[0]]);
            }
        }
        let mut jpeg = Vec::with_capacity(16 * 1024);
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 75)
            .encode(&self.rgb, 320, 180, image::ExtendedColorType::Rgb8)
            .map_err(|e| e.to_string())?;
        Ok(jpeg)
    }
}

fn fit(aspect: f64) -> (u32, u32) {
    if aspect >= 320.0 / 180.0 {
        (320, (320.0 / aspect).round().clamp(1.0, 180.0) as u32)
    } else {
        ((180.0 * aspect).round().clamp(1.0, 320.0) as u32, 180)
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
        let jpeg = encoder.encode(&pixels, 640, 360, 648 * 4, None).unwrap();
        let image = image::load_from_memory(&jpeg).unwrap().to_rgb8();
        assert_eq!(image.dimensions(), (320, 180));
        assert!(image.get_pixel(160, 90)[0] > 240);
        let wide = encoder
            .encode(&pixels, 640, 360, 648 * 4, Some(4.0 / 3.0))
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
            .encode(&pixels, 640, 360, 640 * 4, None)
            .unwrap();
        let image = image::load_from_memory(&jpeg).unwrap().to_rgb8();
        assert!((100..155).contains(&image.get_pixel(160, 90)[0]));
    }
}
