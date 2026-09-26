use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

pub const EDGE_COUNT: usize = 4;
pub const MIN_SEGMENT_COUNT: usize = 3;
pub const MAX_SEGMENT_COUNT: usize = 16;
pub const MIN_SAMPLE_WIDTH: u8 = 1;
pub const MAX_SAMPLE_WIDTH: u8 = 15;
/// Количество выборок вдоль сегмента (равномерно по его длине).
pub const ALONG_SAMPLE_COUNT: usize = 5;
/// Количество выборок вглубь от края кадра.
pub const DEPTH_SAMPLE_COUNT: usize = 4;
/// Итоговое количество выборок на один сегмент.
pub const SAMPLES_PER_SEGMENT: usize = ALONG_SAMPLE_COUNT * DEPTH_SAMPLE_COUNT;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(default)]
pub struct SampleWidths {
    pub top: u8,
    pub right: u8,
    pub bottom: u8,
    pub left: u8,
}

impl Default for SampleWidths {
    fn default() -> Self {
        Self {
            top: 3,
            right: 3,
            bottom: 3,
            left: 3,
        }
    }
}

impl SampleWidths {
    pub fn normalized(self) -> Self {
        Self {
            top: self.top.clamp(MIN_SAMPLE_WIDTH, MAX_SAMPLE_WIDTH),
            right: self.right.clamp(MIN_SAMPLE_WIDTH, MAX_SAMPLE_WIDTH),
            bottom: self.bottom.clamp(MIN_SAMPLE_WIDTH, MAX_SAMPLE_WIDTH),
            left: self.left.clamp(MIN_SAMPLE_WIDTH, MAX_SAMPLE_WIDTH),
        }
    }

    pub fn for_edge(self, edge: AmbientEdge) -> u8 {
        match edge {
            AmbientEdge::Top => self.top,
            AmbientEdge::Right => self.right,
            AmbientEdge::Bottom => self.bottom,
            AmbientEdge::Left => self.left,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RectF {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl RectF {
    pub fn new(x: f32, y: f32, width: f32, height: f32) -> Option<Self> {
        if !x.is_finite()
            || !y.is_finite()
            || !width.is_finite()
            || !height.is_finite()
            || width <= 0.0
            || height <= 0.0
        {
            return None;
        }
        Some(Self {
            x,
            y,
            width,
            height,
        })
    }

    pub fn is_valid(self) -> bool {
        Self::new(self.x, self.y, self.width, self.height).is_some()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AmbientEdge {
    Top,
    Right,
    Bottom,
    Left,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SegmentSpan {
    pub start: f32,
    pub length: f32,
    pub direction: i8,
    pub edge: AmbientEdge,
}

impl SegmentSpan {
    pub fn position(self, t: f32) -> f32 {
        let t = t.clamp(0.0, 1.0);
        if self.direction >= 0 {
            self.start + t * self.length
        } else {
            self.start - t * self.length
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct StripGeometry {
    pub top: Vec<SegmentSpan>,
    pub right: Vec<SegmentSpan>,
    pub bottom: Vec<SegmentSpan>,
    pub left: Vec<SegmentSpan>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AmbientGeometry {
    pub display_width: f32,
    pub display_height: f32,
    pub video_rect: RectF,
}

impl AmbientGeometry {
    pub fn new(display_width: f32, display_height: f32, video_rect: RectF) -> Option<Self> {
        if !display_width.is_finite()
            || !display_height.is_finite()
            || display_width <= 0.0
            || display_height <= 0.0
            || !video_rect.is_valid()
        {
            return None;
        }
        Some(Self {
            display_width,
            display_height,
            video_rect,
        })
    }

    pub fn edge_thickness(self) -> [f32; 4] {
        let right = self.display_width - self.video_rect.x - self.video_rect.width;
        let bottom = self.display_height - self.video_rect.y - self.video_rect.height;
        [
            (self.video_rect.y / self.display_height).clamp(0.0, 1.0),
            (right / self.display_width).clamp(0.0, 1.0),
            (bottom / self.display_height).clamp(0.0, 1.0),
            (self.video_rect.x / self.display_width).clamp(0.0, 1.0),
        ]
    }

    pub fn source_rect(frame_width: usize, frame_height: usize) -> Option<RectF> {
        RectF::new(0.0, 0.0, frame_width as f32, frame_height as f32)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Oklab {
    pub l: f32,
    pub a: f32,
    pub b: f32,
}

pub fn srgb_to_linear(value: f32) -> f32 {
    let value = if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        0.0
    };
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

pub fn linear_to_srgb(value: f32) -> f32 {
    let value = if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        0.0
    };
    if value <= 0.0031308 {
        value * 12.92
    } else {
        1.055 * value.powf(1.0 / 2.4) - 0.055
    }
}

fn cube_root(value: f32) -> f32 {
    if value == 0.0 {
        0.0
    } else {
        value.abs().powf(1.0 / 3.0) * value.signum()
    }
}

pub fn linear_rgb_to_oklab(rgb: [f32; 3]) -> Oklab {
    let r = if rgb[0].is_finite() {
        rgb[0].max(0.0)
    } else {
        0.0
    };
    let g = if rgb[1].is_finite() {
        rgb[1].max(0.0)
    } else {
        0.0
    };
    let b = if rgb[2].is_finite() {
        rgb[2].max(0.0)
    } else {
        0.0
    };
    let l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    let m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    let s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    let l_root = cube_root(l);
    let m_root = cube_root(m);
    let s_root = cube_root(s);
    Oklab {
        l: 0.2104542553 * l_root + 0.7936177850 * m_root - 0.0040720468 * s_root,
        a: 1.9779984951 * l_root - 2.4285922050 * m_root + 0.4505937099 * s_root,
        b: 0.0259040371 * l_root + 0.7827717662 * m_root - 0.8086757660 * s_root,
    }
}

pub fn oklab_to_linear_rgb(value: Oklab) -> [f32; 3] {
    let l_root = value.l + 0.3963377774 * value.a + 0.2158037573 * value.b;
    let m_root = value.l - 0.1055613458 * value.a - 0.0638541728 * value.b;
    let s_root = value.l - 0.0894841775 * value.a - 1.2914855480 * value.b;
    let l = l_root * l_root * l_root;
    let m = m_root * m_root * m_root;
    let s = s_root * s_root * s_root;
    [
        (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s).max(0.0),
        (-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s).max(0.0),
        (-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s).max(0.0),
    ]
}

pub fn srgb_to_oklab(rgb: [f32; 3]) -> Oklab {
    linear_rgb_to_oklab([
        srgb_to_linear(rgb[0]),
        srgb_to_linear(rgb[1]),
        srgb_to_linear(rgb[2]),
    ])
}

pub fn oklab_to_srgb(value: Oklab) -> [f32; 3] {
    let rgb = oklab_to_linear_rgb(value);
    [
        linear_to_srgb(rgb[0]),
        linear_to_srgb(rgb[1]),
        linear_to_srgb(rgb[2]),
    ]
}

pub fn oklab_to_rgb_bytes(value: Oklab) -> [u8; 3] {
    let rgb = oklab_to_srgb(value);
    [
        (rgb[0].clamp(0.0, 1.0) * 255.0).round() as u8,
        (rgb[1].clamp(0.0, 1.0) * 255.0).round() as u8,
        (rgb[2].clamp(0.0, 1.0) * 255.0).round() as u8,
    ]
}

fn weighted_mean(samples: &[(f32, f32)]) -> Option<f32> {
    let mut total = 0.0;
    let mut weight = 0.0;
    for &(value, sample_weight) in samples {
        if value.is_finite() && sample_weight.is_finite() && sample_weight > 0.0 {
            total += value * sample_weight;
            weight += sample_weight;
        }
    }
    if weight > 0.0 {
        Some(total / weight)
    } else {
        None
    }
}

pub fn aggregate_trimmed(values: &[f32]) -> Option<f32> {
    let mut sorted: Vec<f32> = values.iter().copied().filter(|v| v.is_finite()).collect();
    if sorted.is_empty() {
        return None;
    }
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    let trim = if sorted.len() >= 5 {
        (sorted.len() / 10).max(1)
    } else {
        0
    };
    let end = sorted.len().saturating_sub(trim);
    let slice = if trim == 0 {
        &sorted[..end]
    } else {
        &sorted[trim..end]
    };
    weighted_mean(&slice.iter().map(|v| (*v, 1.0)).collect::<Vec<_>>())
}

pub fn aggregate_robust(values: &[f32]) -> Option<f32> {
    aggregate_trimmed(values)
}

pub fn aggregate_oklab(values: &[Oklab]) -> Option<Oklab> {
    let l = aggregate_trimmed(&values.iter().map(|v| v.l).collect::<Vec<_>>())?;
    let a = aggregate_trimmed(&values.iter().map(|v| v.a).collect::<Vec<_>>())?;
    let b = aggregate_trimmed(&values.iter().map(|v| v.b).collect::<Vec<_>>())?;
    Some(Oklab { l, a, b })
}

pub fn aggregate_oklab_weighted(samples: &[(Oklab, f32)]) -> Option<Oklab> {
    let mut sorted: Vec<(Oklab, f32)> = samples
        .iter()
        .copied()
        .filter(|(value, weight)| {
            value.l.is_finite()
                && value.a.is_finite()
                && value.b.is_finite()
                && weight.is_finite()
                && *weight > 0.0
        })
        .collect();
    if sorted.is_empty() {
        return None;
    }
    sorted.sort_by(|left, right| left.0.l.partial_cmp(&right.0.l).unwrap_or(Ordering::Equal));
    let trim = if sorted.len() >= 5 {
        (sorted.len() / 10).max(1)
    } else {
        0
    };
    let end = sorted.len().saturating_sub(trim);
    let retained = if trim == 0 {
        &sorted[..end]
    } else {
        &sorted[trim..end]
    };
    let l = weighted_mean(&retained.iter().map(|v| (v.0.l, v.1)).collect::<Vec<_>>())?;
    let a = weighted_mean(&retained.iter().map(|v| (v.0.a, v.1)).collect::<Vec<_>>())?;
    let b = weighted_mean(&retained.iter().map(|v| (v.0.b, v.1)).collect::<Vec<_>>())?;
    Some(Oklab { l, a, b })
}

pub fn temporal_attack_release(
    previous: Oklab,
    target: Oklab,
    delta_ms: f32,
    attack_ms: f32,
    release_ms: f32,
) -> Oklab {
    let delta = if delta_ms.is_finite() {
        delta_ms.max(0.0)
    } else {
        0.0
    };
    if delta == 0.0 {
        return previous;
    }
    let rising = target.l > previous.l;
    let time_constant = if rising { attack_ms } else { release_ms };
    if !time_constant.is_finite() || time_constant <= 0.0 {
        return target;
    }
    let factor = 1.0 - (-delta / time_constant).exp();
    Oklab {
        l: previous.l + (target.l - previous.l) * factor,
        a: previous.a + (target.a - previous.a) * factor,
        b: previous.b + (target.b - previous.b) * factor,
    }
}

pub fn temporal_smooth(
    previous: Option<Oklab>,
    target: Oklab,
    delta_ms: f32,
    attack_ms: f32,
    release_ms: f32,
) -> Oklab {
    previous
        .map(|value| temporal_attack_release(value, target, delta_ms, attack_ms, release_ms))
        .unwrap_or(target)
}

pub fn apply_brightness_saturation(
    value: Oklab,
    brightness_percent: f32,
    saturation_percent: f32,
) -> Oklab {
    let brightness = if brightness_percent.is_finite() {
        if brightness_percent <= 0.0 {
            1.0
        } else {
            (brightness_percent / 100.0).clamp(0.2, 1.5)
        }
    } else {
        1.0
    };
    let saturation = if saturation_percent.is_finite() {
        (saturation_percent / 100.0).clamp(0.0, 1.5)
    } else {
        1.0
    };
    Oklab {
        l: value.l * brightness,
        a: value.a * saturation,
        b: value.b * saturation,
    }
}

/// Средняя светлота палитры (используется для детекции сцен и нормализации).
pub fn mean_luma(values: &[Oklab]) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    let total: f32 = values.iter().map(|value| value.l).sum();
    let mean = total / values.len() as f32;
    if mean.is_finite() {
        mean.clamp(0.0, 1.5)
    } else {
        0.0
    }
}

/// Пространственное сглаживание между соседними сегментами одной грани.
///
/// Каждый сегмент смешивается со своими соседями симметричным ядром [1, 2, 1]/4
/// (с зеркалированием на краях грани). Несколько проходов дают плавный
/// переход между сегментами без «ступенек», как в LED-лентах Ambilight.
pub fn spatial_smooth_segments(values: &mut [Oklab], segment_count: usize, passes: u32) {
    if segment_count < 2 || values.len() < segment_count * EDGE_COUNT {
        return;
    }
    let mut scratch = vec![Oklab { l: 0.0, a: 0.0, b: 0.0 }; values.len()];
    for _ in 0..passes.max(1) {
        for edge in 0..EDGE_COUNT {
            let start = edge * segment_count;
            let end = start + segment_count;
            let slice = &values[start..end];
            let target = &mut scratch[start..end];
            for index in 0..segment_count {
                let previous = if index == 0 {
                    slice[0]
                } else {
                    slice[index - 1]
                };
                let current = slice[index];
                let next = if index + 1 >= segment_count {
                    slice[segment_count - 1]
                } else {
                    slice[index + 1]
                };
                target[index] = Oklab {
                    l: (previous.l + current.l * 2.0 + next.l) * 0.25,
                    a: (previous.a + current.a * 2.0 + next.a) * 0.25,
                    b: (previous.b + current.b * 2.0 + next.b) * 0.25,
                };
            }
        }
        values.copy_from_slice(&scratch);
    }
}

/// Подавление шума в почти чёрных сценах.
///
/// Если грань в среднем темнее `luma_threshold`, её сегменты подтягиваются к
/// среднему цвету грани: это убирает дрожание на статичных тёмных участках
/// (ночные сцены, чёрные полосы внутри кадра), не влияя на обычные сцены.
pub fn suppress_dark_noise(values: &mut [Oklab], segment_count: usize, luma_threshold: f32) {
    if segment_count == 0 || values.len() < segment_count * EDGE_COUNT {
        return;
    }
    let threshold = if luma_threshold.is_finite() {
        luma_threshold.clamp(0.0, 0.2)
    } else {
        return;
    };
    for edge in 0..EDGE_COUNT {
        let start = edge * segment_count;
        let end = start + segment_count;
        let slice = &mut values[start..end];
        let mean = mean_luma(slice);
        if mean >= threshold {
            continue;
        }
        let strength = if threshold <= 0.0 {
            0.0
        } else {
            1.0 - mean / threshold
        };
        let mean_color = Oklab {
            l: mean,
            a: slice.iter().map(|value| value.a).sum::<f32>() / segment_count as f32,
            b: slice.iter().map(|value| value.b).sum::<f32>() / segment_count as f32,
        };
        for value in slice.iter_mut() {
            value.l += (mean_color.l - value.l) * strength * 0.6;
            value.a += (mean_color.a - value.a) * strength * 0.6;
            value.b += (mean_color.b - value.b) * strength * 0.6;
        }
    }
}

/// Vibrance: усиление малонасыщенных цветов без «пересола» уже ярких.
///
/// Классический приём из видеообработки: чем ближе цвет к серому, тем сильнее
/// он поднимается по насыщенности; уже насыщенные цвета почти не меняются.
pub fn apply_vibrance(value: Oklab, amount: f32) -> Oklab {
    let amount = if amount.is_finite() {
        amount.clamp(0.0, 1.0)
    } else {
        0.0
    };
    if amount <= 0.0 {
        return value;
    }
    let chroma = (value.a * value.a + value.b * value.b).sqrt();
    if !chroma.is_finite() || chroma < 1.0e-5 {
        return value;
    }
    let boost = 1.0 + amount * (1.0 - chroma.clamp(0.0, 1.0));
    Oklab {
        l: value.l,
        a: value.a * boost,
        b: value.b * boost,
    }
}

fn build_spans(
    start: f32,
    length: f32,
    segment_count: usize,
    edge: AmbientEdge,
    direction: i8,
    spread: f32,
    gap: f32,
) -> Vec<SegmentSpan> {
    let gap_ratio = gap.clamp(0.0, 50.0) / 100.0;
    let nominal =
        length / (segment_count as f32 + gap_ratio * segment_count.saturating_sub(1) as f32);
    let gap_size = nominal * gap_ratio;
    let span_length = (nominal * spread.clamp(1.0, 2.0)).min(length);
    (0..segment_count)
        .map(|index| {
            let offset = nominal * index as f32 + gap_size * index as f32 + nominal * 0.5;
            let center = if direction >= 0 {
                start + offset
            } else {
                start - offset
            };
            let span_start = if direction >= 0 {
                center - span_length * 0.5
            } else {
                center + span_length * 0.5
            };
            SegmentSpan {
                start: span_start,
                length: span_length,
                direction,
                edge,
            }
        })
        .collect()
}

pub fn build_strip_geometry(
    video_rect: RectF,
    segment_count: usize,
    segment_spread: f32,
    segment_gap: f32,
) -> Option<StripGeometry> {
    if segment_count == 0 || segment_count > MAX_SEGMENT_COUNT || !video_rect.is_valid() {
        return None;
    }
    let spread = if segment_spread.is_finite() {
        segment_spread.clamp(100.0, 200.0) / 100.0
    } else {
        1.3
    };
    let gap = if segment_gap.is_finite() {
        segment_gap.clamp(0.0, 50.0)
    } else {
        0.0
    };
    Some(StripGeometry {
        top: build_spans(
            video_rect.x,
            video_rect.width,
            segment_count,
            AmbientEdge::Top,
            1,
            spread,
            gap,
        ),
        right: build_spans(
            video_rect.y,
            video_rect.height,
            segment_count,
            AmbientEdge::Right,
            1,
            spread,
            gap,
        ),
        bottom: build_spans(
            video_rect.x + video_rect.width,
            video_rect.width,
            segment_count,
            AmbientEdge::Bottom,
            -1,
            spread,
            gap,
        ),
        left: build_spans(
            video_rect.y + video_rect.height,
            video_rect.height,
            segment_count,
            AmbientEdge::Left,
            -1,
            spread,
            gap,
        ),
    })
}

pub fn build_edge_geometry(
    video_rect: RectF,
    segment_count: usize,
    segment_spread: f32,
    segment_gap: f32,
) -> Option<StripGeometry> {
    build_strip_geometry(video_rect, segment_count, segment_spread, segment_gap)
}

fn source_pixel(
    video_rect: RectF,
    frame_width: usize,
    frame_height: usize,
    x: f32,
    y: f32,
) -> Option<(usize, usize)> {
    let u = ((x - video_rect.x) / video_rect.width).clamp(0.0, 1.0);
    let v = ((y - video_rect.y) / video_rect.height).clamp(0.0, 1.0);
    let px = (u * frame_width as f32).floor() as isize;
    let py = (v * frame_height as f32).floor() as isize;
    if frame_width == 0 || frame_height == 0 {
        return None;
    }
    let px = px.clamp(0, frame_width as isize - 1);
    let py = py.clamp(0, frame_height as isize - 1);
    Some((px as usize, py as usize))
}

fn sample_bgr_pixel(
    frame: &[u8],
    frame_width: usize,
    frame_height: usize,
    x: usize,
    y: usize,
) -> Result<[f32; 3], String> {
    if frame_width == 0 || frame_height == 0 || x >= frame_width || y >= frame_height {
        return Err("Некорректные границы BGR0".to_string());
    }
    let row = y
        .checked_mul(frame_width)
        .and_then(|value| value.checked_add(x))
        .and_then(|value| value.checked_mul(3))
        .ok_or_else(|| "Переполнение адреса BGR0".to_string())?;
    let end = row
        .checked_add(3)
        .ok_or_else(|| "Переполнение размера BGR0".to_string())?;
    if end > frame.len() {
        return Err("BGR0 frame обрезан".to_string());
    }
    Ok([
        frame[row + 2] as f32 / 255.0,
        frame[row + 1] as f32 / 255.0,
        frame[row] as f32 / 255.0,
    ])
}

/// Нормированные веса выборок вдоль сегмента (гауссов профиль, симметричный).
pub fn sample_along_weights() -> [f32; ALONG_SAMPLE_COUNT] {
    [1.0, 2.0, 3.0, 2.0, 1.0]
}

/// Позиции выборок вдоль сегмента (0..1), без захвата самых краёв.
pub fn sample_along_fractions() -> [f32; ALONG_SAMPLE_COUNT] {
    [0.1, 0.3, 0.5, 0.7, 0.9]
}

pub fn sample_depth_fractions() -> [f32; 4] {
    [0.125, 0.375, 0.625, 0.875]
}

pub fn sample_depth_weights() -> [f32; 4] {
    [1.0, 2.0 / 3.0, 1.0 / 3.0, 0.2]
}

fn segment_sample_points(
    video_rect: RectF,
    frame_width: usize,
    frame_height: usize,
    span: SegmentSpan,
    sample_count: u8,
) -> Result<Vec<(usize, usize)>, String> {
    let sample_percent = sample_count.clamp(MIN_SAMPLE_WIDTH, MAX_SAMPLE_WIDTH) as f32;
    let along_fractions = sample_along_fractions();
    let depth_fractions = sample_depth_fractions();
    let cross_length = match span.edge {
        AmbientEdge::Top | AmbientEdge::Bottom => video_rect.height,
        AmbientEdge::Right | AmbientEdge::Left => video_rect.width,
    };
    let minimum_side = video_rect.width.min(video_rect.height).max(1.0);
    let sample_depth = (minimum_side * sample_percent / 100.0)
        .round()
        .max(1.0)
        .min(cross_length);
    let mut result = Vec::with_capacity(SAMPLES_PER_SEGMENT);
    for depth_ratio in depth_fractions {
        let depth_value = depth_ratio * sample_depth;
        for along_ratio in along_fractions {
            let coordinate = span.position(along_ratio);
            let point = match span.edge {
                AmbientEdge::Top => (coordinate, video_rect.y + depth_value),
                AmbientEdge::Right => (video_rect.x + video_rect.width - depth_value, coordinate),
                AmbientEdge::Bottom => (coordinate, video_rect.y + video_rect.height - depth_value),
                AmbientEdge::Left => (video_rect.x + depth_value, coordinate),
            };
            let (x, y) = source_pixel(video_rect, frame_width, frame_height, point.0, point.1)
                .ok_or_else(|| "Точка выборки вне BGR0".to_string())?;
            result.push((x, y));
        }
    }
    Ok(result)
}

pub fn build_segment_sample_points(
    frame_width: usize,
    frame_height: usize,
    segment_count: usize,
    sample_widths: SampleWidths,
) -> Result<Vec<(usize, usize)>, String> {
    let video_rect = AmbientGeometry::source_rect(frame_width, frame_height)
        .ok_or_else(|| "Некорректный размер кадра BGR0".to_string())?;
    let geometry = build_strip_geometry(video_rect, segment_count, 100.0, 0.0)
        .ok_or_else(|| "Некорректная геометрия полос".to_string())?;
    let mut result = Vec::with_capacity(segment_count * EDGE_COUNT * SAMPLES_PER_SEGMENT);
    for span in &geometry.top {
        result.extend(segment_sample_points(
            video_rect,
            frame_width,
            frame_height,
            *span,
            sample_widths.for_edge(AmbientEdge::Top),
        )?);
    }
    for span in &geometry.right {
        result.extend(segment_sample_points(
            video_rect,
            frame_width,
            frame_height,
            *span,
            sample_widths.for_edge(AmbientEdge::Right),
        )?);
    }
    for span in &geometry.bottom {
        result.extend(segment_sample_points(
            video_rect,
            frame_width,
            frame_height,
            *span,
            sample_widths.for_edge(AmbientEdge::Bottom),
        )?);
    }
    for span in &geometry.left {
        result.extend(segment_sample_points(
            video_rect,
            frame_width,
            frame_height,
            *span,
            sample_widths.for_edge(AmbientEdge::Left),
        )?);
    }
    Ok(result)
}

fn aggregate_segment(
    frame: &[u8],
    frame_width: usize,
    frame_height: usize,
    video_rect: RectF,
    span: SegmentSpan,
    sample_count: u8,
) -> Result<Oklab, String> {
    let points = segment_sample_points(video_rect, frame_width, frame_height, span, sample_count)?;
    let along_weights = sample_along_weights();
    let depth_weights = sample_depth_weights();
    let mut samples = Vec::with_capacity(points.len());
    for (index, (x, y)) in points.into_iter().enumerate() {
        let rgb = sample_bgr_pixel(frame, frame_width, frame_height, x, y)?;
        let depth_index = index / ALONG_SAMPLE_COUNT;
        let along_index = index % ALONG_SAMPLE_COUNT;
        samples.push((
            srgb_to_oklab(rgb),
            along_weights[along_index] * depth_weights[depth_index],
        ));
    }
    aggregate_oklab_weighted(&samples).ok_or_else(|| "Не удалось агрегировать samples".to_string())
}

pub fn sample_bgr0_segments(
    frame: &[u8],
    frame_width: usize,
    frame_height: usize,
    video_rect: RectF,
    segment_count: usize,
    sample_widths: SampleWidths,
    _segment_spread: f32,
    _segment_gap: f32,
) -> Result<Vec<Oklab>, String> {
    if frame_width == 0 || frame_height == 0 {
        return Err("Пустой BGR0 frame".to_string());
    }
    let required = frame_width
        .checked_mul(3)
        .and_then(|value| value.checked_mul(frame_height))
        .ok_or_else(|| "Переполнение размера BGR0".to_string())?;
    if frame.len() < required {
        return Err("Недостаточно данных BGR0".to_string());
    }
    let geometry = build_strip_geometry(video_rect, segment_count, 100.0, 0.0)
        .ok_or_else(|| "Некорректная геометрия полос".to_string())?;
    let mut result = Vec::with_capacity(segment_count * EDGE_COUNT);
    for span in geometry.top {
        result.push(aggregate_segment(
            frame,
            frame_width,
            frame_height,
            video_rect,
            span,
            sample_widths.for_edge(AmbientEdge::Top),
        )?);
    }
    for span in geometry.right {
        result.push(aggregate_segment(
            frame,
            frame_width,
            frame_height,
            video_rect,
            span,
            sample_widths.for_edge(AmbientEdge::Right),
        )?);
    }
    for span in geometry.bottom {
        result.push(aggregate_segment(
            frame,
            frame_width,
            frame_height,
            video_rect,
            span,
            sample_widths.for_edge(AmbientEdge::Bottom),
        )?);
    }
    for span in geometry.left {
        result.push(aggregate_segment(
            frame,
            frame_width,
            frame_height,
            video_rect,
            span,
            sample_widths.for_edge(AmbientEdge::Left),
        )?);
    }
    Ok(result)
}

pub fn sample_bgr_samples(samples: &[u8], segment_count: usize) -> Result<Vec<Oklab>, String> {
    if segment_count < MIN_SEGMENT_COUNT || segment_count > MAX_SEGMENT_COUNT {
        return Err("Некорректное количество Ambient сегментов".to_string());
    }
    let samples_per_segment = SAMPLES_PER_SEGMENT;
    let required = segment_count
        .checked_mul(EDGE_COUNT)
        .and_then(|value| value.checked_mul(samples_per_segment))
        .and_then(|value| value.checked_mul(3))
        .ok_or_else(|| "Переполнение размера BGR0 samples".to_string())?;
    if samples.len() != required {
        return Err(format!(
            "Ожидалось {} BGR0 samples, получено {}",
            required,
            samples.len()
        ));
    }
    let along_weights = sample_along_weights();
    let depth_weights = sample_depth_weights();
    let mut result = Vec::with_capacity(segment_count * EDGE_COUNT);
    for segment in 0..segment_count * EDGE_COUNT {
        let start = segment * samples_per_segment * 3;
        let mut aggregated = Vec::with_capacity(samples_per_segment);
        for index in 0..samples_per_segment {
            let offset = start + index * 3;
            aggregated.push((
                srgb_to_oklab([
                    samples[offset + 2] as f32 / 255.0,
                    samples[offset + 1] as f32 / 255.0,
                    samples[offset] as f32 / 255.0,
                ]),
                along_weights[index % ALONG_SAMPLE_COUNT]
                    * depth_weights[index / ALONG_SAMPLE_COUNT],
            ));
        }
        result.push(
            aggregate_oklab_weighted(&aggregated)
                .ok_or_else(|| "Не удалось агрегировать BGR0 samples".to_string())?,
        );
    }
    Ok(result)
}

pub fn sample_bgr0_4xn(
    frame: &[u8],
    frame_width: usize,
    frame_height: usize,
    video_rect: RectF,
    segment_count: usize,
    sample_widths: SampleWidths,
    segment_spread: f32,
    segment_gap: f32,
) -> Result<Vec<Oklab>, String> {
    sample_bgr0_segments(
        frame,
        frame_width,
        frame_height,
        video_rect,
        segment_count,
        sample_widths,
        segment_spread,
        segment_gap,
    )
}

pub fn palette_bytes(colors: &[Oklab]) -> Vec<u8> {
    let mut result = Vec::with_capacity(colors.len() * 3);
    for color in colors {
        result.extend_from_slice(&oklab_to_rgb_bytes(*color));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_geometry_preserves_edge_order() {
        let rect = RectF::new(10.0, 20.0, 100.0, 50.0).unwrap();
        let geometry = build_strip_geometry(rect, 4, 130.0, 0.0).unwrap();
        assert_eq!(
            geometry.top[0].position(0.0) < geometry.top[1].position(0.0),
            true
        );
        assert_eq!(
            geometry.bottom[0].position(0.0) > geometry.bottom[1].position(0.0),
            true
        );
        assert_eq!(
            geometry.left[0].position(0.0) > geometry.left[1].position(0.0),
            true
        );
        assert_eq!(
            geometry.right[0].position(0.0) < geometry.right[1].position(0.0),
            true
        );
        let gapped = build_strip_geometry(rect, 7, 100.0, 50.0).unwrap();
        assert!(gapped
            .top
            .iter()
            .all(|span| span.position(0.5) >= rect.x && span.position(0.5) <= rect.x + rect.width));
    }

    #[test]
    fn source_rect_uses_full_captured_frame() {
        let source = AmbientGeometry::source_rect(960, 540).unwrap();
        assert_eq!(source, RectF::new(0.0, 0.0, 960.0, 540.0).unwrap());
    }

    #[test]
    fn edge_thickness_reflects_window_margins() {
        let rect = RectF::new(240.0, 90.0, 1440.0, 900.0).unwrap();
        let geometry = AmbientGeometry::new(1920.0, 1080.0, rect).unwrap();
        let thickness = geometry.edge_thickness();
        assert!((thickness[0] - 90.0 / 1080.0).abs() < 0.0001);
        assert!((thickness[1] - 240.0 / 1920.0).abs() < 0.0001);
        assert!((thickness[2] - 90.0 / 1080.0).abs() < 0.0001);
        assert!((thickness[3] - 240.0 / 1920.0).abs() < 0.0001);
    }

    #[test]
    fn sampling_reads_bgr_and_returns_4xn_colors() {
        let width = 32;
        let height = 32;
        let rect = RectF::new(0.0, 0.0, width as f32, height as f32).unwrap();
        let mut frame = vec![0u8; width * height * 3];
        for pixel in frame.chunks_exact_mut(3) {
            pixel[2] = 255;
        }
        let colors = sample_bgr0_segments(
            &frame,
            width,
            height,
            rect,
            3,
            SampleWidths::default(),
            100.0,
            0.0,
        )
        .unwrap();
        assert_eq!(colors.len(), 12);
        assert!(colors[0].l > colors[0].a.abs());
    }

    #[test]
    fn bgr_samples_are_emitted_as_rgb() {
        let width = 8;
        let height = 8;
        let frame = vec![10u8, 20, 30].repeat(width * height);
        let rect = RectF::new(0.0, 0.0, width as f32, height as f32).unwrap();
        let colors = sample_bgr0_segments(
            &frame,
            width,
            height,
            rect,
            3,
            SampleWidths::default(),
            100.0,
            0.0,
        )
        .unwrap();
        assert_eq!(palette_bytes(&colors[0..1]), vec![30, 20, 10]);
    }

    #[test]
    fn sparse_bgr_samples_match_full_frame_sampling() {
        let width = 24;
        let height = 18;
        let rect = RectF::new(0.0, 0.0, width as f32, height as f32).unwrap();
        let mut frame = vec![0u8; width * height * 3];
        for y in 0..height {
            for x in 0..width {
                let offset = (y * width + x) * 3;
                frame[offset] = (x * 9) as u8;
                frame[offset + 1] = (y * 11) as u8;
                frame[offset + 2] = ((x + y) * 5) as u8;
            }
        }
        let points =
            build_segment_sample_points(width, height, 5, SampleWidths::default()).unwrap();
        let mut sparse = Vec::with_capacity(points.len() * 3);
        for (x, y) in points {
            let offset = (y * width + x) * 3;
            sparse.extend_from_slice(&frame[offset..offset + 3]);
        }
        let compact = sample_bgr_samples(&sparse, 5).unwrap();
        let full = sample_bgr0_segments(
            &frame,
            width,
            height,
            rect,
            5,
            SampleWidths::default(),
            100.0,
            0.0,
        )
        .unwrap();
        assert_eq!(compact, full);
    }

    #[test]
    fn sample_weights_favor_segment_center_and_edge() {
        assert_eq!(sample_along_weights(), [1.0, 2.0, 3.0, 2.0, 1.0]);
        assert_eq!(sample_along_fractions(), [0.1, 0.3, 0.5, 0.7, 0.9]);
        assert_eq!(sample_depth_fractions(), [0.125, 0.375, 0.625, 0.875]);
        assert_eq!(sample_depth_weights(), [1.0, 2.0 / 3.0, 1.0 / 3.0, 0.2]);
        assert_eq!(SAMPLES_PER_SEGMENT, 20);
    }

    #[test]
    fn spatial_smoothing_removes_segment_steps() {
        let mut values = vec![
            Oklab { l: 0.0, a: 0.0, b: 0.0 },
            Oklab { l: 1.0, a: 0.0, b: 0.0 },
            Oklab { l: 0.0, a: 0.0, b: 0.0 },
        ];
        values.extend_from_slice(&[Oklab { l: 0.5, a: 0.0, b: 0.0 }; 9]);
        spatial_smooth_segments(&mut values, 3, 2);
        // Пик сглажен, среднее сохранено (зеркалирование сохраняет сумму).
        assert!(values[1].l < 1.0);
        assert!(values[0].l > 0.0);
        let sum: f32 = values.iter().map(|value| value.l).sum();
        assert!((sum - 5.5).abs() < 0.0001, "сумма {} != 5.5", sum);
    }

    #[test]
    fn dark_noise_suppression_pulls_segments_to_edge_mean() {
        let mut values = vec![
            Oklab { l: 0.001, a: 0.05, b: -0.04 },
            Oklab { l: 0.003, a: -0.05, b: 0.05 },
            Oklab { l: 0.002, a: 0.0, b: 0.0 },
        ];
        values.extend_from_slice(&[Oklab { l: 0.5, a: 0.1, b: 0.1 }; 9]);
        suppress_dark_noise(&mut values, 3, 0.05);
        let chroma: f32 = values[0..3].iter().map(|value| value.a.abs()).sum();
        assert!(chroma < 0.15, "хроматический шум должен быть подавлен: {}", chroma);
    }

    #[test]
    fn vibrance_boosts_gray_more_than_saturated() {
        let gray = Oklab { l: 0.5, a: 0.01, b: 0.0 };
        let vivid = Oklab { l: 0.5, a: 0.25, b: 0.05 };
        let gray_boost = apply_vibrance(gray, 0.4).a / gray.a;
        let vivid_boost = apply_vibrance(vivid, 0.4).a / vivid.a;
        assert!(gray_boost > vivid_boost);
        assert!(gray_boost > 1.0);
    }

    #[test]
    fn trimmed_aggregation_rejects_extreme_values() {
        let values = [1.0, 1.1, 1.0, 1.0, 1.2, 100.0];
        let result = aggregate_trimmed(&values).unwrap();
        assert!(result < 2.0);
    }

    #[test]
    fn color_round_trip_is_stable() {
        let source = [0.2f32, 0.6, 0.9];
        let result = oklab_to_srgb(srgb_to_oklab(source));
        for (left, right) in source.iter().zip(result.iter()) {
            assert!((left - right).abs() < 0.0001);
        }
    }

    #[test]
    fn temporal_filter_uses_attack_and_release() {
        let previous = Oklab {
            l: 0.2,
            a: 0.0,
            b: 0.0,
        };
        let target = Oklab {
            l: 0.8,
            a: 0.0,
            b: 0.0,
        };
        let attack = temporal_attack_release(previous, target, 50.0, 100.0, 400.0);
        let release = temporal_attack_release(target, previous, 50.0, 100.0, 400.0);
        let unchanged = temporal_attack_release(previous, target, 0.0, 100.0, 400.0);
        assert!(attack.l > previous.l && attack.l < target.l);
        assert!(release.l < target.l && release.l > previous.l);
        assert_eq!(unchanged, previous);
    }

    #[test]
    fn brightness_and_saturation_are_bounded() {
        let color = Oklab {
            l: 0.5,
            a: 0.2,
            b: -0.1,
        };
        let result = apply_brightness_saturation(color, 150.0, 0.0);
        assert_eq!(result.a, 0.0);
        assert_eq!(result.b, 0.0);
        assert!(result.l >= color.l);
    }
}
