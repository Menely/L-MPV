// Copyright (c) 2026 L-MPV Developers
// Модуль конфигурации и построения аудиотракта lavfi для mpv.

use std::fmt;
use std::str::FromStr;

/// Лимитер семпловых пиков с порогом 0 dBFS (`limit=1`).
///
/// Межсемпловые пики не измеряются; фильтр не гарантирует защиту динамиков.
pub const ALIMITER_FILTER: &str =
    "alimiter=level_in=1:level_out=1:limit=1:attack=5:release=50";

/// RMS-компрессор 3:1 с порогом около −12 dBFS и единичным makeup gain.
pub const NIGHT_MODE_FILTER: &str =
    "acompressor=threshold=0.25:ratio=3:attack=10:release=450:makeup=1:knee=2:link=maximum:detection=rms";

/// Адаптивное выравнивание с 50% перекрытием блоков и усилением до ×2,5.
pub const DYNAUDNORM_FILTER: &str =
    "dynaudnorm=framelen=500:gausssize=15:maxgain=2.5:peak=0.90:compress=8:threshold=0.008:overlap=0.5";

/// Режим нормализации громкости аудиотракта.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AudioNormalizeMode {
    /// Нормализация отключена (оригинальный динамический диапазон дорожки).
    #[default]
    Off,
    /// Динамическая нормализация (выравнивание громкости по окну Гаусса).
    Dynamic,
    /// Ночной режим (мягкое сжатие всплесков экшна с сохранением диалогов).
    Night,
    Ebu128,
}

impl AudioNormalizeMode {
    /// Возвращает канонический строковый идентификатор режима для хранения в настройках.
    ///
    /// Для обратной совместимости с существующими конфигами `settings.json`
    /// для ночного режима сохраняется ключ `"loudnorm"`.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Off => "no",
            Self::Dynamic => "dynaudnorm",
            Self::Night => "loudnorm",
            Self::Ebu128 => "ebu128",
        }
    }

    /// Безопасно парсит строку режима либо возвращает значение по умолчанию (`Off`).
    pub fn from_str_or_default(s: &str) -> Self {
        s.parse().unwrap_or_default()
    }
}

impl fmt::Display for AudioNormalizeMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for AudioNormalizeMode {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let normalized = s.trim().to_ascii_lowercase();
        let mode = match normalized.as_str() {
            "dynaudnorm" | "dynamic" => Self::Dynamic,
            "loudnorm" | "night" => Self::Night,
            "ebu128" => Self::Ebu128,
            _ => Self::Off,
        };
        Ok(mode)
    }
}

/// Собирает цепочку mpv, помещая лимитер после выбранного режима нормализации.
pub fn audio_filter_chain(mode: AudioNormalizeMode, limiter: bool) -> String {
    let normalizer = match mode {
        AudioNormalizeMode::Off | AudioNormalizeMode::Ebu128 => None,
        AudioNormalizeMode::Dynamic => Some(DYNAUDNORM_FILTER),
        AudioNormalizeMode::Night => Some(NIGHT_MODE_FILTER),
    };

    match (normalizer, limiter) {
        (None, false) => String::new(),
        (None, true) => format!("lavfi=[{ALIMITER_FILTER}]"),
        (Some(filter), false) => format!("lavfi=[{filter}]"),
        (Some(filter), true) => format!("lavfi=[{filter},{ALIMITER_FILTER}]"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mode_from_str() {
        assert_eq!("no".parse::<AudioNormalizeMode>().unwrap(), AudioNormalizeMode::Off);
        assert_eq!("off".parse::<AudioNormalizeMode>().unwrap(), AudioNormalizeMode::Off);
        assert_eq!("dynaudnorm".parse::<AudioNormalizeMode>().unwrap(), AudioNormalizeMode::Dynamic);
        assert_eq!("dynamic".parse::<AudioNormalizeMode>().unwrap(), AudioNormalizeMode::Dynamic);
        assert_eq!("loudnorm".parse::<AudioNormalizeMode>().unwrap(), AudioNormalizeMode::Night);
        assert_eq!("night".parse::<AudioNormalizeMode>().unwrap(), AudioNormalizeMode::Night);
        assert_eq!("ebu128".parse::<AudioNormalizeMode>().unwrap(), AudioNormalizeMode::Ebu128);
        assert_eq!("unknown_garbage".parse::<AudioNormalizeMode>().unwrap(), AudioNormalizeMode::Off);
    }

    #[test]
    fn test_mode_as_str() {
        assert_eq!(AudioNormalizeMode::Off.as_str(), "no");
        assert_eq!(AudioNormalizeMode::Dynamic.as_str(), "dynaudnorm");
        assert_eq!(AudioNormalizeMode::Night.as_str(), "loudnorm");
        assert_eq!(AudioNormalizeMode::Ebu128.as_str(), "ebu128");
    }

    #[test]
    fn test_filter_chain_matrix() {
        // 1. Off + no limiter => пустая строка (bypass)
        assert_eq!(audio_filter_chain(AudioNormalizeMode::Off, false), "");

        // 2. Off + limiter => только alimiter
        assert_eq!(
            audio_filter_chain(AudioNormalizeMode::Off, true),
            format!("lavfi=[{ALIMITER_FILTER}]")
        );

        // 3. Dynamic + no limiter => только dynaudnorm
        assert_eq!(
            audio_filter_chain(AudioNormalizeMode::Dynamic, false),
            format!("lavfi=[{DYNAUDNORM_FILTER}]")
        );

        // 4. Dynamic + limiter => dynaudnorm + alimiter
        assert_eq!(
            audio_filter_chain(AudioNormalizeMode::Dynamic, true),
            format!("lavfi=[{DYNAUDNORM_FILTER},{ALIMITER_FILTER}]")
        );

        // 5. Night + no limiter => только acompressor
        assert_eq!(
            audio_filter_chain(AudioNormalizeMode::Night, false),
            format!("lavfi=[{NIGHT_MODE_FILTER}]")
        );

        // 6. Night + limiter => acompressor + alimiter
        assert_eq!(
            audio_filter_chain(AudioNormalizeMode::Night, true),
            format!("lavfi=[{NIGHT_MODE_FILTER},{ALIMITER_FILTER}]")
        );
        assert_eq!(audio_filter_chain(AudioNormalizeMode::Ebu128, false), "");
        assert_eq!(
            audio_filter_chain(AudioNormalizeMode::Ebu128, true),
            format!("lavfi=[{ALIMITER_FILTER}]")
        );

    }

    #[test]
    fn test_filter_syntax_validity() {
        // Проверяем, что в константах нет пробелов вокруг разделителей опций двоеточием
        assert!(!DYNAUDNORM_FILTER.contains(" :"));
        assert!(!NIGHT_MODE_FILTER.contains(" :"));
        assert!(!ALIMITER_FILTER.contains(" :"));
        assert!(DYNAUDNORM_FILTER.starts_with("dynaudnorm="));
        assert!(NIGHT_MODE_FILTER.starts_with("acompressor="));
        assert!(ALIMITER_FILTER.starts_with("alimiter="));
    }
}
