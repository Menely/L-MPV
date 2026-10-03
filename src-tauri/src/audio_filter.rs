// Copyright (c) 2026 L-MPV Developers
// Модуль конфигурации и построения аудиотракта lavfi для mpv.

use std::fmt;
use std::str::FromStr;

/// Защитный пиковый лимитер (True Peak Limiter).
///
/// Предотвращает цифровой клиппинг и хрип динамиков при выкручивании громкости выше 100% (до 150%).
/// На уровне 100% громкости сигнал со стандартным пиком не упирается в потолок (limit=0.98, т.е. -0.17 dBFS)
/// и звучит прозрачно без компрессии.
pub const ALIMITER_FILTER: &str =
    "alimiter=level_in=1:level_out=1:limit=0.98:attack=5:release=50";

/// Ночной режим (Night Mode / Dynamic Range Compression).
///
/// Слегка приглушает внезапные громкие взрывы и экшн (на ~5 dB), полностью сохраняя естественность диалогов.
/// - `threshold=0.25` (-12 dBFS) и `knee=2`: порог компрессии расположен строго выше спектра речи (-27..-18 dBFS);
/// - `ratio=3`: умеренное сжатие 3:1 для пиков экшна (взрыв 0 dBFS превращается в -8 dBFS, снижение на 5 dB);
/// - `attack=10`: быстрый перехват ударной волны;
/// - `release=450`: плавный сход без эффекта «дыхания» (pumping);
/// - `makeup=1`: строго единичное усиление без искусственного раздувания диалогов в крик;
/// - `link=maximum`: связывание стереоканалов по пику для сохранения баланса панорамы;
/// - `detection=rms`: детектирование энергии сигнала по слуховому восприятию человека.
pub const NIGHT_MODE_FILTER: &str =
    "acompressor=threshold=0.25:ratio=3:attack=10:release=450:makeup=1:knee=2:link=maximum:detection=rms";

/// Кинематографическая динамическая нормализация (Dynamic Audio Normalization).
///
/// Выравнивает громкость тихих и громких фрагментов в фильмах с широким или несбалансированным диапазоном:
/// - `framelen=500` и `gausssize=15`: размер сглаживающего окна Гаусса 7.5 секунд (исключает пампинг между
///   словами и быстро восстанавливает громкость речи за 2..3 секунды после громких взрывов);
/// - `overlap=0.5`: 50% перекрытие фреймов для абсолютно непрерывного и плавного изменения усиления;
/// - `maxgain=3.5`: ограничение усиления тихих участков не более ×3.5 (+10.9 dB максимум), благодаря чему
///   тихая речь получает реальную прибавку +3..+5 dB, но фоновый шум не раздувается;
/// - `threshold=0.008` (-42 dBFS): шумовой порог отсечения — фильтр подтягивает даже тихий шёпот,
///   игнорируя только чистые цифровые паузы;
/// - `peak=0.90`: умеренный целевой пик (-0.9 dBFS), исключающий общую просадку громкости фильма;
/// - `compress=8`: мягкое сжатие избыточных динамических всплесков перед нормализацией.
pub const DYNAUDNORM_FILTER: &str =
    "dynaudnorm=framelen=500:gausssize=15:maxgain=3.5:peak=0.90:compress=8:threshold=0.008:overlap=0.5";

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
            _ => Self::Off,
        };
        Ok(mode)
    }
}

/// Строитель цепочки аудиофильтров lavfi для mpv.
///
/// Гарантирует независимую матрицу состояний: нормализация и пиковый лимитер
/// могут включаться как совместно, так и по отдельности.
pub struct AudioFilterChainBuilder;

impl AudioFilterChainBuilder {
    pub const AF_BYPASS: &'static str = "";
    pub const AF_ALIMITER: &'static str =
        "lavfi=[alimiter=level_in=1:level_out=1:limit=0.98:attack=5:release=50]";
    pub const AF_DYNAUDNORM: &'static str =
        "lavfi=[dynaudnorm=framelen=500:gausssize=15:maxgain=3.5:peak=0.90:compress=8:threshold=0.008:overlap=0.5]";
    pub const AF_DYNAUDNORM_ALIMITER: &'static str =
        "lavfi=[dynaudnorm=framelen=500:gausssize=15:maxgain=3.5:peak=0.90:compress=8:threshold=0.008:overlap=0.5,alimiter=level_in=1:level_out=1:limit=0.98:attack=5:release=50]";
    pub const AF_NIGHT: &'static str =
        "lavfi=[acompressor=threshold=0.25:ratio=3:attack=10:release=450:makeup=1:knee=2:link=maximum:detection=rms]";
    pub const AF_NIGHT_ALIMITER: &'static str =
        "lavfi=[acompressor=threshold=0.25:ratio=3:attack=10:release=450:makeup=1:knee=2:link=maximum:detection=rms,alimiter=level_in=1:level_out=1:limit=0.98:attack=5:release=50]";

    /// Формирует строку параметра `af` для mpv по заданной комбинации режима и состояния лимитера.
    ///
    /// Полностью статическая сборка с нулевым числом аллокаций памяти в куче (zero-heap allocation).
    ///
    /// # Матрица состояний:
    /// - `Off` + `limiter=false` => `""` (чистый сквозной bypass без фильтров);
    /// - `Off` + `limiter=true` => `lavfi=[alimiter=...]`;
    /// - `Dynamic` + `limiter=false` => `lavfi=[dynaudnorm=...]`;
    /// - `Dynamic` + `limiter=true` => `lavfi=[dynaudnorm=...,alimiter=...]`;
    /// - `Night` + `limiter=false` => `lavfi=[acompressor=...]`;
    /// - `Night` + `limiter=true` => `lavfi=[acompressor=...,alimiter=...]`.
    #[inline]
    pub fn build(mode: AudioNormalizeMode, limiter_enabled: bool) -> &'static str {
        match (mode, limiter_enabled) {
            (AudioNormalizeMode::Off, false) => Self::AF_BYPASS,
            (AudioNormalizeMode::Off, true) => Self::AF_ALIMITER,
            (AudioNormalizeMode::Dynamic, false) => Self::AF_DYNAUDNORM,
            (AudioNormalizeMode::Dynamic, true) => Self::AF_DYNAUDNORM_ALIMITER,
            (AudioNormalizeMode::Night, false) => Self::AF_NIGHT,
            (AudioNormalizeMode::Night, true) => Self::AF_NIGHT_ALIMITER,
        }
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
        assert_eq!("unknown_garbage".parse::<AudioNormalizeMode>().unwrap(), AudioNormalizeMode::Off);
    }

    #[test]
    fn test_mode_as_str() {
        assert_eq!(AudioNormalizeMode::Off.as_str(), "no");
        assert_eq!(AudioNormalizeMode::Dynamic.as_str(), "dynaudnorm");
        assert_eq!(AudioNormalizeMode::Night.as_str(), "loudnorm");
    }

    #[test]
    fn test_matrix_all_six_combinations() {
        // 1. Off + no limiter => пустая строка (bypass)
        assert_eq!(AudioFilterChainBuilder::build(AudioNormalizeMode::Off, false), "");

        // 2. Off + limiter => только alimiter
        assert_eq!(
            AudioFilterChainBuilder::build(AudioNormalizeMode::Off, true),
            format!("lavfi=[{ALIMITER_FILTER}]")
        );

        // 3. Dynamic + no limiter => только dynaudnorm
        assert_eq!(
            AudioFilterChainBuilder::build(AudioNormalizeMode::Dynamic, false),
            format!("lavfi=[{DYNAUDNORM_FILTER}]")
        );

        // 4. Dynamic + limiter => dynaudnorm + alimiter
        assert_eq!(
            AudioFilterChainBuilder::build(AudioNormalizeMode::Dynamic, true),
            format!("lavfi=[{DYNAUDNORM_FILTER},{ALIMITER_FILTER}]")
        );

        // 5. Night + no limiter => только acompressor
        assert_eq!(
            AudioFilterChainBuilder::build(AudioNormalizeMode::Night, false),
            format!("lavfi=[{NIGHT_MODE_FILTER}]")
        );

        // 6. Night + limiter => acompressor + alimiter
        assert_eq!(
            AudioFilterChainBuilder::build(AudioNormalizeMode::Night, true),
            format!("lavfi=[{NIGHT_MODE_FILTER},{ALIMITER_FILTER}]")
        );

        // Проверяем тождество статических констант и интерполированных цепочек
        assert_eq!(AudioFilterChainBuilder::AF_ALIMITER, format!("lavfi=[{ALIMITER_FILTER}]"));
        assert_eq!(AudioFilterChainBuilder::AF_DYNAUDNORM, format!("lavfi=[{DYNAUDNORM_FILTER}]"));
        assert_eq!(
            AudioFilterChainBuilder::AF_DYNAUDNORM_ALIMITER,
            format!("lavfi=[{DYNAUDNORM_FILTER},{ALIMITER_FILTER}]")
        );
        assert_eq!(AudioFilterChainBuilder::AF_NIGHT, format!("lavfi=[{NIGHT_MODE_FILTER}]"));
        assert_eq!(
            AudioFilterChainBuilder::AF_NIGHT_ALIMITER,
            format!("lavfi=[{NIGHT_MODE_FILTER},{ALIMITER_FILTER}]")
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
