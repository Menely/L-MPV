//! Общие помощники для интерактивного поиска по субтитрам.
//!
//! Здесь живут чистые функции без зависимости от Tauri State:
//! декодирование байтов с учётом кодировок, очистка разметки,
//! парсинг SRT/WebVTT и ASS/SSA (включая стили, шрифты и слои),
//! а также надежный дисковый LRU-кэш субтитров (до 20 файлов).

use super::types::SubtitleLineInfo;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

/// Максимальный размер stdout FFmpeg, который готовы разобрать.
/// Защита от битых/злонамеренных файлов с гигантским потоком субтитров.
pub const MAX_SUBTITLE_STDOUT_BYTES: usize = 8 * 1024 * 1024;

/// Проверка, является ли тег `<...>` известной разметкой субтитров.
///
/// Удаляем только теги, которые точно понимаем: HTML/ASS
/// (`b`, `i`, `u`, `s`, `font`) и WebVTT (`v`, `lang`, `c`, `ruby`, `rt`).
/// Всё остальное (например, `5 < 10 > 3`) сохраняем как обычный текст.
fn is_known_subtitle_tag(inner: &str) -> bool {
    let tag = inner.trim().to_lowercase();
    if tag.is_empty() {
        return false;
    }
    let name = tag
        .trim_start_matches('/')
        .split(|c| {
            c == ' ' || c == '\t' || c == '.' || c == '/'
        })
        .next()
        .unwrap_or("");
    matches!(
        name,
        "b" | "i"
            | "u"
            | "s"
            | "font"
            | "v"
            | "lang"
            | "c"
            | "ruby"
            | "rt"
    )
}

/// Байтово-корректный срез первых `max_chars` символов строки.
/// Окно поиска закрывающего тега, чтобы битые `<<<<...` не давали O(n²).
fn char_window(s: &str, max_chars: usize) -> &str {
    match s.char_indices().nth(max_chars) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}

/// Очистка текста субтитров от разметки ASS (`{\...}`), известных
/// HTML/WebVTT-тегов (`<b>`, `<i>`, `<font...>` и т.п.) и жёстких
/// переносов ASS (`\N`, `\n` — сохраняем как `\n`, `\h` — как пробел).
pub fn clean_subtitle_text(text: &str) -> String {
    const TAG_WINDOW: usize = 128;
    let mut result = String::with_capacity(text.len());
    let mut rest = text;

    while let Some(ch) = rest.chars().next() {
        let ch_len = ch.len_utf8();
        let after = &rest[ch_len..];

        if ch == '{' {
            let window = char_window(after, TAG_WINDOW);
            if let Some(close) = window.find('}') {
                rest = &after[close + 1..];
                continue;
            }
            result.push(ch);
            rest = after;
            continue;
        }
        if ch == '<' {
            let window = char_window(after, TAG_WINDOW);
            if let Some(close) = window.find('>') {
                let inner = &window[..close];
                if !inner.contains('<')
                    && !inner.contains('\n')
                    && is_known_subtitle_tag(inner)
                {
                    rest = &after[close + 1..];
                    continue;
                }
            }
            result.push(ch);
            rest = after;
            continue;
        }
        if ch == '\\' {
            if let Some(next_ch) = after.chars().next() {
                if next_ch == 'N' || next_ch == 'n' {
                    result.push('\n');
                    rest = &after[next_ch.len_utf8()..];
                    continue;
                }
                if next_ch == 'h' {
                    result.push(' ');
                    rest = &after[1..];
                    continue;
                }
            }
        }
        result.push(ch);
        rest = after;
    }

    let decoded = result
        .replace("&nbsp;", " ")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&");

    decoded
        .split('\n')
        .map(|line| {
            line.split_whitespace().collect::<Vec<_>>().join(" ")
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Парсинг временной метки субтитров
/// (00:01:23,456 или 00:01:23.456 или 01:23.45) в секунды.
pub(crate) fn parse_timestamp_seconds(
    s: &str,
) -> Option<f64> {
    let clean = s.trim().replace(',', ".");
    let parts: Vec<&str> = clean.split(':').collect();
    match parts.len() {
        3 => {
            let hours: f64 = parts[0].trim().parse().ok()?;
            let minutes: f64 = parts[1].trim().parse().ok()?;
            let seconds: f64 = parts[2].trim().parse().ok()?;
            Some(hours * 3600.0 + minutes * 60.0 + seconds)
        }
        2 => {
            let minutes: f64 = parts[0].trim().parse().ok()?;
            let seconds: f64 = parts[1].trim().parse().ok()?;
            Some(minutes * 60.0 + seconds)
        }
        _ => None,
    }
}

/// Описание стиля ASS/SSA из секции `[V4+ Styles]` / `[V4 Styles]`.
#[derive(Debug, Clone, Default)]
pub(crate) struct AssStyleDef {
    pub font_name: Option<String>,
    pub font_size: Option<f64>,
    pub color: Option<String>,
    pub alignment: Option<String>,
}

/// Конвертация цвета ASS `&HAABBGGRR` или `&HBBGGRR&` в `#RRGGBB`.
pub(crate) fn parse_ass_color(s: &str) -> Option<String> {
    let clean = s
        .trim()
        .trim_start_matches('&')
        .trim_start_matches('H')
        .trim_end_matches('&');
    if clean.is_empty() {
        return None;
    }
    let val = u32::from_str_radix(clean, 16).ok()?;
    let (b, g, r) = if clean.len() > 6 {
        (
            ((val >> 16) & 0xFF) as u8,
            ((val >> 8) & 0xFF) as u8,
            (val & 0xFF) as u8,
        )
    } else {
        (
            ((val >> 16) & 0xFF) as u8,
            ((val >> 8) & 0xFF) as u8,
            (val & 0xFF) as u8,
        )
    };
    Some(format!("#{:02X}{:02X}{:02X}", r, g, b))
}

/// Извлечение инлайн override-тегов из текста ASS (`{\fn...}`, `{\fs...}`, `{\c...}`, `\pos(...)`, `\an...`).
pub(crate) fn extract_ass_tags(
    text: &str,
) -> (
    Option<String>,
    Option<f64>,
    Option<String>,
    Option<String>,
) {
    let mut font = None;
    let mut size = None;
    let mut color = None;
    let mut pos = None;

    let mut start = 0;
    while let Some(open) = text[start..].find('{') {
        let open_idx = start + open;
        if let Some(close) = text[open_idx..].find('}') {
            let close_idx = open_idx + close;
            let inside = &text[open_idx + 1..close_idx];
            for tag in inside.split('\\') {
                let trimmed = tag.trim();
                if trimmed.starts_with("fn") {
                    let f = trimmed[2..].trim();
                    if !f.is_empty() {
                        font = Some(f.to_string());
                    }
                } else if trimmed.starts_with("fs") {
                    let num_str: String = trimmed[2..]
                        .chars()
                        .take_while(|c| c.is_ascii_digit() || *c == '.')
                        .collect();
                    if let Ok(sz) = num_str.parse::<f64>() {
                        size = Some(sz);
                    }
                } else if trimmed.starts_with("1c") || trimmed.starts_with('c') {
                    let col_str = if trimmed.starts_with("1c") {
                        &trimmed[2..]
                    } else {
                        &trimmed[1..]
                    };
                    if let Some(c) = parse_ass_color(col_str) {
                        color = Some(c);
                    }
                } else if trimmed.starts_with("pos(") {
                    pos = Some(format!("\\{}", trimmed));
                } else if trimmed.starts_with("an") && trimmed.len() >= 3 {
                    let an_digit = &trimmed[2..3];
                    let align_desc = match an_digit {
                        "1" => "Снизу слева",
                        "2" => "Снизу по центру",
                        "3" => "Снизу справа",
                        "4" => "По центру слева",
                        "5" => "По центру",
                        "6" => "По центру справа",
                        "7" => "Сверху слева",
                        "8" => "Сверху по центру",
                        "9" => "Сверху справа",
                        _ => "an",
                    };
                    if pos.is_none() {
                        pos = Some(format!("an{} ({})", an_digit, align_desc));
                    }
                }
            }
            start = close_idx + 1;
        } else {
            break;
        }
    }
    (font, size, color, pos)
}

/// Парсинг файлов субтитров в форматах SRT и WebVTT.
/// Многострочные реплики сохраняют переносы (`\n`), извлекаются спикеры и шрифтовые теги.
pub(crate) fn parse_srt_or_vtt(
    content: &str,
) -> Vec<SubtitleLineInfo> {
    let mut lines = Vec::new();
    let normalized =
        content.replace("\r\n", "\n").replace('\r', "\n");
    let blocks = normalized.split("\n\n");

    for block in blocks {
        let block_lines: Vec<&str> = block
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .collect();
        if block_lines.is_empty() {
            continue;
        }

        let time_line_idx = block_lines
            .iter()
            .position(|l| l.contains("-->"));
        if let Some(idx) = time_line_idx {
            let time_str = block_lines[idx];
            let arrow_parts: Vec<&str> =
                time_str.split("-->").collect();
            if arrow_parts.len() >= 2 {
                let start_part = arrow_parts[0].trim();
                let end_part = arrow_parts[1]
                    .split_whitespace()
                    .next()
                    .unwrap_or_default();

                if let (Some(start), Some(end)) = (
                    parse_timestamp_seconds(start_part),
                    parse_timestamp_seconds(end_part),
                ) {
                    let text_lines = &block_lines[idx + 1..];
                    let raw_text = text_lines.join("\n");
                    let clean =
                        clean_subtitle_text(&raw_text);
                    if !clean.is_empty() {
                        let mut actor = None;
                        if let Some(v_start) = raw_text.find("<v") {
                            let after = &raw_text[v_start + 2..];
                            if let Some(v_end) = after.find('>') {
                                let speaker = after[..v_end].trim().trim_start_matches('.');
                                if !speaker.is_empty() {
                                    actor = Some(speaker.to_string());
                                }
                            }
                        }

                        let mut font_name = None;
                        let mut font_size = None;
                        let mut color = None;
                        if let Some(f_start) = raw_text.to_lowercase().find("<font") {
                            let after = &raw_text[f_start + 5..];
                            if let Some(f_end) = after.find('>') {
                                let attrs = &after[..f_end];
                                for attr in attrs.split_whitespace() {
                                    let kv: Vec<&str> = attr.split('=').collect();
                                    if kv.len() == 2 {
                                        let val = kv[1].trim_matches('"').trim_matches('\'');
                                        match kv[0].to_lowercase().as_str() {
                                            "face" => font_name = Some(val.to_string()),
                                            "size" => font_size = val.parse::<f64>().ok(),
                                            "color" => color = Some(val.to_string()),
                                            _ => {}
                                        }
                                    }
                                }
                            }
                        }

                        lines.push(SubtitleLineInfo {
                            index: lines.len() + 1,
                            start,
                            end,
                            text: clean,
                            raw: Some(raw_text),
                            style: None,
                            actor,
                            layer: None,
                            font_name,
                            font_size,
                            color,
                            position: None,
                            effect: None,
                        });
                    }
                }
            }
        }
    }

    lines
}

/// Парсинг файлов субтитров в форматах ASS и SSA (стили и строки Dialogue).
pub(crate) fn parse_ass(
    content: &str,
) -> Vec<SubtitleLineInfo> {
    let mut lines = Vec::new();
    let mut styles: HashMap<String, AssStyleDef> = HashMap::new();
    let normalized =
        content.replace("\r\n", "\n").replace('\r', "\n");

    let mut in_styles = false;
    let mut style_format_keys: Vec<String> = Vec::new();

    for raw_line in normalized.lines() {
        let trimmed = raw_line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let section = trimmed.to_lowercase();
            in_styles = section.contains("style");
            continue;
        }

        if in_styles {
            if let Some(fmt) = trimmed.strip_prefix("Format:") {
                style_format_keys = fmt.split(',').map(|s| s.trim().to_lowercase()).collect();
                continue;
            }
            if let Some(style_data) = trimmed.strip_prefix("Style:") {
                let parts: Vec<&str> = style_data.split(',').map(|s| s.trim()).collect();
                if !parts.is_empty() {
                    let name = parts[0].to_string();
                    let mut def = AssStyleDef::default();

                    if !style_format_keys.is_empty() {
                        for (idx, key) in style_format_keys.iter().enumerate() {
                            if idx < parts.len() {
                                match key.as_str() {
                                    "fontname" => def.font_name = Some(parts[idx].to_string()),
                                    "fontsize" => def.font_size = parts[idx].parse::<f64>().ok(),
                                    "primarycolour" => def.color = parse_ass_color(parts[idx]),
                                    "alignment" => {
                                        let align_digit = parts[idx];
                                        let desc = match align_digit {
                                            "1" => "Снизу слева",
                                            "2" => "Снизу по центру",
                                            "3" => "Снизу справа",
                                            "4" => "По центру слева",
                                            "5" => "По центру",
                                            "6" => "По центру справа",
                                            "7" => "Сверху слева",
                                            "8" => "Сверху по центру",
                                            "9" => "Сверху справа",
                                            _ => align_digit,
                                        };
                                        def.alignment = Some(format!("an{} ({})", align_digit, desc));
                                    }
                                    _ => {}
                                }
                            }
                        }
                    } else if parts.len() >= 3 {
                        def.font_name = Some(parts[1].to_string());
                        def.font_size = parts[2].parse::<f64>().ok();
                        if parts.len() >= 4 {
                            def.color = parse_ass_color(parts[3]);
                        }
                    }
                    styles.insert(name, def);
                }
                continue;
            }
        }

        if let Some(after_colon) = trimmed.strip_prefix("Dialogue:") {
            let parts: Vec<&str> =
                after_colon.splitn(10, ',').collect();
            if parts.len() >= 10 {
                let layer_part = parts[0].trim().parse::<i32>().ok();
                let start_part = parts[1].trim();
                let end_part = parts[2].trim();
                let style_part = parts[3].trim();
                let actor_part = parts[4].trim();
                let effect_part = parts[8].trim();
                let text_part = parts[9].trim();

                if let (Some(start), Some(end)) = (
                    parse_timestamp_seconds(start_part),
                    parse_timestamp_seconds(end_part),
                ) {
                    let clean =
                        clean_subtitle_text(text_part);
                    if !clean.is_empty() {
                        let (inline_font, inline_size, inline_color, inline_pos) =
                            extract_ass_tags(text_part);

                        let style_def = styles.get(style_part);

                        let final_font = inline_font
                            .or_else(|| style_def.and_then(|s| s.font_name.clone()));
                        let final_size = inline_size
                            .or_else(|| style_def.and_then(|s| s.font_size));
                        let final_color = inline_color
                            .or_else(|| style_def.and_then(|s| s.color.clone()));
                        let final_pos = inline_pos
                            .or_else(|| style_def.and_then(|s| s.alignment.clone()));

                        lines.push(SubtitleLineInfo {
                            index: lines.len() + 1,
                            start,
                            end,
                            text: clean,
                            raw: Some(text_part.to_string()),
                            style: if !style_part.is_empty() {
                                Some(style_part.to_string())
                            } else {
                                None
                            },
                            actor: if !actor_part.is_empty() {
                                Some(actor_part.to_string())
                            } else {
                                None
                            },
                            layer: layer_part,
                            font_name: final_font,
                            font_size: final_size,
                            color: final_color,
                            position: final_pos,
                            effect: if !effect_part.is_empty() {
                                Some(effect_part.to_string())
                            } else {
                                None
                            },
                        });
                    }
                }
            }
        }
    }

    lines
}

// ─── Дисковый кэш субтитров (LRU до 20 файлов) ──────────────

/// Максимальное количество файлов кэша субтитров на диске (FIFO/LRU ротация).
pub const MAX_SUBTITLE_CACHE_FILES: usize = 20;

/// Генерация 32-значного детерминированного hex-ключа для файла субтитров/видео.
pub fn generate_subtitles_cache_key(
    path: &str,
    file_size: u64,
    mtime: u64,
    track_id: i64,
) -> String {
    let mut hasher1 = std::collections::hash_map::DefaultHasher::new();
    (path, file_size, mtime, track_id, "l_mpv_sub_v3_a").hash(&mut hasher1);
    let h1 = hasher1.finish();

    let mut hasher2 = std::collections::hash_map::DefaultHasher::new();
    (path, file_size, mtime, track_id, "l_mpv_sub_v3_b").hash(&mut hasher2);
    let h2 = hasher2.finish();

    format!("{:016x}{:016x}", h1, h2)
}

/// Ротация дискового кэша: оставляет не более `max_files` самых свежих JSON-файлов.
pub fn prune_subtitles_cache(cache_dir: &Path, max_files: usize) {
    if let Ok(entries) = std::fs::read_dir(cache_dir) {
        let mut files: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
                let mtime = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                files.push((path, mtime));
            }
        }
        if files.len() > max_files {
            files.sort_by_key(|(_, time)| *time);
            let to_remove = files.len() - max_files;
            for (p, _) in files.into_iter().take(to_remove) {
                let _ = std::fs::remove_file(p);
            }
        }
    }
}

/// Чтение разобранных реплик субтитров из дискового кэша.
pub fn read_subtitles_cache(
    cache_dir: &Path,
    cache_key: &str,
) -> Option<Vec<SubtitleLineInfo>> {
    let file_path = cache_dir.join(format!("{}.json", cache_key));
    if file_path.is_file() {
        if let Ok(content) = std::fs::read_to_string(&file_path) {
            if let Ok(lines) = serde_json::from_str::<Vec<SubtitleLineInfo>>(&content) {
                if !lines.is_empty() {
                    let _ = std::fs::File::open(&file_path)
                        .and_then(|f| f.set_modified(std::time::SystemTime::now()));
                    return Some(lines);
                }
            }
        }
    }
    None
}

/// Запись разобранных реплик субтитров в дисковый кэш с ротацией.
pub fn write_subtitles_cache(
    cache_dir: &Path,
    cache_key: &str,
    lines: &[SubtitleLineInfo],
) {
    if lines.is_empty() {
        return;
    }
    if std::fs::create_dir_all(cache_dir).is_err() {
        return;
    }
    let file_path = cache_dir.join(format!("{}.json", cache_key));
    if let Ok(json) = serde_json::to_string(lines) {
        if std::fs::write(&file_path, json).is_ok() {
            prune_subtitles_cache(cache_dir, MAX_SUBTITLE_CACHE_FILES);
        }
    }
}

/// Декодирование одного байта windows-1251 в `char`.
/// Покрывает кириллицу, украинские/белорусские буквы и типографику.
fn decode_windows1251_byte(b: u8) -> char {
    match b {
        0x00..=0x7F => b as char,
        0x80 => 'Ђ',
        0x81 => 'Ѓ',
        0x82 => '‚',
        0x83 => 'ѓ',
        0x84 => '„',
        0x85 => '…',
        0x86 => '†',
        0x87 => '‡',
        0x88 => '€',
        0x89 => '‰',
        0x8A => 'Љ',
        0x8B => '‹',
        0x8C => 'Њ',
        0x8D => 'Ќ',
        0x8E => 'Ћ',
        0x8F => 'Џ',
        0x90 => 'ђ',
        0x91 => '‘',
        0x92 => '’',
        0x93 => '“',
        0x94 => '”',
        0x95 => '•',
        0x96 => '–',
        0x97 => '—',
        0x98 => '\u{FFFD}',
        0x99 => '™',
        0x9A => 'љ',
        0x9B => '›',
        0x9C => 'њ',
        0x9D => 'ќ',
        0x9E => 'ћ',
        0x9F => 'џ',
        0xA0 => ' ',
        0xA1 => 'Ў',
        0xA2 => 'ў',
        0xA3 => 'Ј',
        0xA4 => '¤',
        0xA5 => 'Ґ',
        0xA6 => '¦',
        0xA7 => '§',
        0xA8 => 'Ё',
        0xA9 => '©',
        0xAA => 'Є',
        0xAB => '«',
        0xAC => '¬',
        0xAD => '\u{AD}',
        0xAE => '®',
        0xAF => 'Ї',
        0xB0 => '°',
        0xB1 => '±',
        0xB2 => 'І',
        0xB3 => 'і',
        0xB4 => 'ґ',
        0xB5 => 'µ',
        0xB6 => '¶',
        0xB7 => '·',
        0xB8 => 'ё',
        0xB9 => '№',
        0xBA => 'є',
        0xBB => '»',
        0xBC => 'ј',
        0xBD => 'Ѕ',
        0xBE => 'ѕ',
        0xBF => 'ї',
        0xC0..=0xFF => {
            char::from_u32((b as u32) - 0xC0 + 0x0410).unwrap_or('\u{FFFD}')
        }
    }
}

/// Декодирование байтов файла субтитров в строку.
///
/// Порядок: BOM (UTF-8/UTF-16LE/UTF-16BE) → валидный UTF-8 →
/// эвристика UTF-16 по нулевым байтам → windows-1251
/// (типично для RU-раздач в кодировке Блокнота).
pub(crate) fn decode_subtitle_bytes(
    bytes: &[u8],
) -> String {
    if bytes.len() >= 3
        && bytes[0] == 0xEF
        && bytes[1] == 0xBB
        && bytes[2] == 0xBF
    {
        return String::from_utf8_lossy(&bytes[3..])
            .into_owned();
    }
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE
    {
        return decode_utf16(bytes, false);
    }
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF
    {
        return decode_utf16(bytes, true);
    }
    if let Ok(valid) = std::str::from_utf8(bytes) {
        return valid.to_string();
    }
    if !bytes.is_empty() {
        let zeroes =
            bytes.iter().filter(|&&b| b == 0).count();
        if zeroes * 3 > bytes.len() {
            let le = decode_utf16(bytes, false);
            if !le.is_empty()
                && !le.contains('\u{FFFD}')
            {
                return le;
            }
            let be = decode_utf16(bytes, true);
            if !be.is_empty()
                && !be.contains('\u{FFFD}')
            {
                return be;
            }
        }
    }
    bytes
        .iter()
        .map(|&b| decode_windows1251_byte(b))
        .collect()
}

/// Декодирование UTF-16LE/BE (с пропуском BOM, если есть).
fn decode_utf16(bytes: &[u8], big_endian: bool) -> String {
    let mut start = 0;
    if bytes.len() >= 2 {
        let has_bom = (!big_endian
            && bytes[0] == 0xFF
            && bytes[1] == 0xFE)
            || (big_endian
                && bytes[0] == 0xFE
                && bytes[1] == 0xFF);
        if has_bom {
            start = 2;
        }
    }
    let mut units = Vec::with_capacity(bytes.len() / 2);
    let mut i = start;
    while i + 1 < bytes.len() {
        let unit = if big_endian {
            u16::from_be_bytes([bytes[i], bytes[i + 1]])
        } else {
            u16::from_le_bytes([bytes[i], bytes[i + 1]])
        };
        units.push(unit);
        i += 2;
    }
    String::from_utf16_lossy(&units)
        .trim_start_matches('\u{FEFF}')
        .to_string()
}

/// Поиск файла внешних субтитров на диске.
pub(crate) fn resolve_external_subtitle_path(
    external_filename: &str,
    video_path: &str,
) -> Option<PathBuf> {
    let direct = PathBuf::from(external_filename);
    if direct.is_absolute() {
        return direct.is_file().then_some(direct);
    }
    if let Some(dir) = std::path::Path::new(video_path).parent()
    {
        let file_name = direct
            .file_name()
            .map(PathBuf::from)
            .unwrap_or_else(|| direct.clone());
        for candidate in
            [dir.join(&file_name), dir.join(&direct)]
        {
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    if direct.is_file() {
        return Some(direct);
    }
    None
}

/// Проверка, является ли дорожка графической (битмап без текстового слоя).
pub(crate) fn is_bitmap_subtitle(
    codec: &str,
    extension: &str,
) -> bool {
    let codec_lower = codec.to_lowercase();
    let text_like = ["teletext", "eia_608", "cea_708"]
        .iter()
        .any(|marker| codec_lower.contains(marker));
    if text_like {
        return false;
    }
    let ext_lower = extension.to_lowercase();
    ["pgs", "vob", "dvb", "dvd_sub", "xsub", "s_hdmv"]
        .iter()
        .any(|marker| codec_lower.contains(marker))
        || matches!(ext_lower.as_str(), "sup" | "idx")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_known_tags_but_keeps_plain_text() {
        assert_eq!(clean_subtitle_text("<b>Привет</b>"), "Привет");
        assert_eq!(clean_subtitle_text("<font color=\"#ffffff\">X</font>"), "X");
        assert_eq!(clean_subtitle_text("<v Speaker>реплика</v>"), "реплика");
        assert_eq!(clean_subtitle_text("{\\an8}Текст"), "Текст");
        assert_eq!(clean_subtitle_text("5 < 10 > 3"), "5 < 10 > 3");
        assert_eq!(clean_subtitle_text("a < b без закрытия"), "a < b без закрытия");
        assert_eq!(clean_subtitle_text("строка1\\Nстрока2"), "строка1\nстрока2");
    }

    #[test]
    fn decodes_utf8_utf16_and_cp1251() {
        assert_eq!(decode_subtitle_bytes("Привет".as_bytes()), "Привет");
        assert_eq!(decode_subtitle_bytes(&[0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2]), "Привет");
    }

    #[test]
    fn parses_srt_keeping_multiline() {
        let srt = "1\n00:00:01,000 --> 00:00:03,000\nHello\nWorld\n";
        let lines = parse_srt_or_vtt(srt);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Hello\nWorld");
        assert!((lines[0].start - 1.0).abs() < f64::EPSILON);
        assert!((lines[0].end - 3.0).abs() < f64::EPSILON);
    }

    #[test]
    fn parses_ass_with_metadata() {
        let ass = "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour\nStyle: Default,Arial,24,&H00FFFFFF\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,Alice,0,0,0,,{\\pos(100,200)}Привет мир!";
        let lines = parse_ass(ass);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Привет мир!");
        assert_eq!(lines[0].style.as_deref(), Some("Default"));
        assert_eq!(lines[0].actor.as_deref(), Some("Alice"));
        assert_eq!(lines[0].font_name.as_deref(), Some("Arial"));
        assert_eq!(lines[0].font_size, Some(24.0));
        assert_eq!(lines[0].position.as_deref(), Some("\\pos(100,200)"));
    }

    #[test]
    fn detects_bitmap_but_not_teletext() {
        assert!(is_bitmap_subtitle("hdmv_pgs_subtitle", ""));
        assert!(is_bitmap_subtitle("vobsub", ""));
        assert!(is_bitmap_subtitle("", "sup"));
        assert!(is_bitmap_subtitle("", "idx"));
        assert!(!is_bitmap_subtitle("subrip", "srt"));
        assert!(!is_bitmap_subtitle("ass", "ass"));
        assert!(!is_bitmap_subtitle("dvb_teletext", ""));
    }

    #[test]
    fn test_subtitles_cache_pruning_limit_20() {
        let temp_dir = std::env::temp_dir().join(format!("l_mpv_sub_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let _ = std::fs::create_dir_all(&temp_dir);

        // Создаем 25 фиктивных файлов кэша
        for i in 0..25 {
            let file_path = temp_dir.join(format!("cache_{:02}.json", i));
            let _ = std::fs::write(&file_path, "[]");
            // Небольшая задержка или явный mtime
            let past = std::time::SystemTime::now() - std::time::Duration::from_secs(100 - i * 2);
            let _ = std::fs::File::open(&file_path).and_then(|f| f.set_modified(past));
        }

        prune_subtitles_cache(&temp_dir, MAX_SUBTITLE_CACHE_FILES);

        let count = std::fs::read_dir(&temp_dir)
            .unwrap()
            .flatten()
            .filter(|e| e.path().extension().and_then(|ext| ext.to_str()) == Some("json"))
            .count();

        let _ = std::fs::remove_dir_all(&temp_dir);
        assert_eq!(count, 20);
    }
}
