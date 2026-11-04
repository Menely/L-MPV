//! Низкоуровневый разбор формата EBML (Extensible Binary Meta Language).
//!
//! Предоставляет идентификаторы элементов спецификации Matroska,
//! структуру заголовка `ElementHeader` и высокопроизводительный читатель
//! `EbmlReader` с отслеживанием позиции и нулевыми накладными расходами
//! на перемещения внутри буфера памяти.

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::Path;

/// Идентификаторы ключевых элементов EBML спецификации Matroska.
pub mod ebml_id {
    pub const EBML_HEADER: u32 = 0x1A45_DFA3;
    pub const SEGMENT: u32 = 0x1853_8067;
    pub const SEEK_HEAD: u32 = 0x114D_9B74;
    pub const SEEK: u32 = 0x4DBB;
    pub const SEEK_ID: u32 = 0x53AB;
    pub const SEEK_POSITION: u32 = 0x53AC;
    pub const INFO: u32 = 0x1549_A966;
    pub const TIMESTAMP_SCALE: u32 = 0x2A_D7B1;
    pub const TRACKS: u32 = 0x1654_AE6B;
    pub const TRACK_ENTRY: u32 = 0xAE;
    pub const TRACK_NUMBER: u32 = 0xD7;
    pub const TRACK_TYPE: u32 = 0x83;
    pub const CODEC_ID: u32 = 0x86;
    pub const CODEC_PRIVATE: u32 = 0x63A2;
    pub const TRACK_NAME: u32 = 0x536E;
    pub const TRACK_LANGUAGE: u32 = 0x22_B59C;
    pub const TRACK_LANGUAGE_BCP47: u32 = 0x22_B59D;
    pub const CONTENT_ENCODINGS: u32 = 0x6D80;
    pub const CONTENT_ENCODING: u32 = 0x6240;
    pub const CONTENT_ENCODING_SCOPE: u32 = 0x5032;
    pub const CONTENT_ENCODING_TYPE: u32 = 0x5033;
    pub const CONTENT_COMPRESSION: u32 = 0x5034;
    pub const CONTENT_COMP_ALGO: u32 = 0x4254;
    pub const CONTENT_COMP_SETTINGS: u32 = 0x4255;
    pub const CLUSTER: u32 = 0x1F43_B675;
    pub const CLUSTER_TIMESTAMP: u32 = 0xE7;
    pub const SIMPLE_BLOCK: u32 = 0xA3;
    pub const BLOCK_GROUP: u32 = 0xA0;
    pub const BLOCK: u32 = 0xA1;
    pub const BLOCK_DURATION: u32 = 0x9B;
    pub const CUES: u32 = 0x1C53_BB6B;
    pub const CUE_POINT: u32 = 0xBB;
    pub const CUE_TRACK_POSITIONS: u32 = 0xB7;
    pub const CUE_TRACK: u32 = 0xF7;
    pub const CUE_CLUSTER_POSITION: u32 = 0xF1;
    pub const CUE_RELATIVE_POSITION: u32 = 0xF0;
    pub const TAGS: u32 = 0x1254_C367;
    pub const ATTACHMENTS: u32 = 0x1941_A469;
    pub const CHAPTERS: u32 = 0x1043_A770;

    /// Проверяет, является ли идентификатор элементом верхнего уровня Segment.
    /// Встреча с ними внутри кластера неизвестного размера означает конец кластера.
    #[inline]
    pub fn is_top_level(id: u32) -> bool {
        matches!(
            id,
            CLUSTER
                | CUES
                | TAGS
                | ATTACHMENTS
                | CHAPTERS
                | SEEK_HEAD
                | INFO
                | TRACKS
        )
    }
}

/// Максимальный допустимый объём метаданных одного служебного элемента (64 МБ).
pub const MAX_METADATA_BYTES: u64 = 64 * 1024 * 1024;

/// Заголовок элемента EBML: идентификатор, размер данных и абсолютное смещение данных.
#[derive(Debug, Clone, Copy)]
pub struct ElementHeader {
    /// Числовой идентификатор EBML (1–4 байта с сохранением маски длины).
    pub id: u32,
    /// Размер полезной нагрузки элемента в байтах (`None` — размер неизвестен).
    pub size: Option<u64>,
    /// Абсолютное смещение полезной нагрузки от начала файла в байтах.
    pub data_start: u64,
}

impl ElementHeader {
    /// Вычисляет абсолютную позицию конца данных элемента, если размер известен.
    #[inline]
    pub fn data_end(&self) -> Option<u64> {
        self.size.map(|s| self.data_start.saturating_add(s))
    }
}

/// Высокопроизводительный буферизованный читатель потока EBML.
///
/// В отличие от стандартного `std::io::BufReader`, прыжки внутри текущего буфера
/// выполняются арифметическим смещением курсора без сброса закэшированных данных
/// и без системных вызовов `SetFilePointerEx`.
pub struct EbmlReader {
    file: File,
    buf: Vec<u8>,
    buf_start: u64,
    buf_len: usize,
    cursor: usize,
    file_len: u64,
}

impl EbmlReader {
    /// Открывает файл и создаёт буферизованный читатель с заданным размером буфера.
    pub fn open(path: &Path, buffer_size: usize) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| {
            format!(
                "Не удалось открыть медиафайл {}: {}",
                path.display(),
                e
            )
        })?;
        let file_len = file.metadata().map(|m| m.len()).unwrap_or(0);
        let actual_size = buffer_size.max(4096);
        Ok(Self {
            file,
            buf: vec![0u8; actual_size],
            buf_start: 0,
            buf_len: 0,
            cursor: 0,
            file_len,
        })
    }

    /// Возвращает текущую абсолютную позицию чтения в файле.
    #[inline]
    pub fn position(&self) -> u64 {
        self.buf_start + self.cursor as u64
    }

    /// Возвращает общую длину файла в байтах.
    #[inline]
    pub fn file_len(&self) -> u64 {
        self.file_len
    }

    /// Проверяет, достигнут ли конец файла.
    #[inline]
    pub fn at_eof(&self) -> bool {
        self.position() >= self.file_len
    }

    /// Подгружает следующую порцию данных в буфер памяти.
    pub fn refill(&mut self) -> io::Result<bool> {
        self.buf_start += self.buf_len as u64;
        self.cursor = 0;
        self.buf_len = 0;
        loop {
            match self.file.read(&mut self.buf) {
                Ok(n) => {
                    self.buf_len = n;
                    return Ok(n > 0);
                }
                Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                Err(e) => return Err(e),
            }
        }
    }

    /// Перемещает позицию чтения на абсолютное смещение `pos`.
    ///
    /// Если целевая позиция находится внутри уже загруженного буфера памяти,
    /// перемещение происходит мгновенно без обращения к файловой системе.
    pub fn seek_to(&mut self, pos: u64) -> io::Result<()> {
        let buf_end = self.buf_start + self.buf_len as u64;
        if pos >= self.buf_start && pos <= buf_end {
            self.cursor = (pos - self.buf_start) as usize;
            return Ok(());
        }
        self.file.seek(SeekFrom::Start(pos))?;
        self.buf_start = pos;
        self.buf_len = 0;
        self.cursor = 0;
        Ok(())
    }

    /// Считывает один байт из потока.
    #[inline]
    pub fn read_u8(&mut self) -> io::Result<u8> {
        if self.cursor >= self.buf_len && !self.refill()? {
            return Err(io::Error::from(io::ErrorKind::UnexpectedEof));
        }
        let b = self.buf[self.cursor];
        self.cursor += 1;
        Ok(b)
    }

    /// Считывает точное количество байтов в целевой буфер `out`.
    pub fn read_exact(&mut self, out: &mut [u8]) -> io::Result<()> {
        let mut written = 0usize;
        while written < out.len() {
            if self.cursor >= self.buf_len && !self.refill()? {
                return Err(io::Error::from(io::ErrorKind::UnexpectedEof));
            }
            let available = self.buf_len - self.cursor;
            let take = available.min(out.len() - written);
            out[written..written + take].copy_from_slice(
                &self.buf[self.cursor..self.cursor + take],
            );
            self.cursor += take;
            written += take;
        }
        Ok(())
    }

    /// Считывает вектор байтов заданной длины с проверкой лимита безопасности.
    pub fn read_vec(&mut self, len: u64, limit: u64) -> io::Result<Vec<u8>> {
        if len > limit {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Элемент размером {} байт превышает лимит безопасности", len),
            ));
        }
        let mut out = vec![0u8; len as usize];
        self.read_exact(&mut out)?;
        Ok(out)
    }

    /// Считывает идентификатор EBML (от 1 до 4 байт с сохранением битов длины).
    pub fn read_id(&mut self) -> io::Result<u32> {
        let b0 = self.read_u8()?;
        let len = b0.leading_zeros() as usize + 1;
        if len > 4 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Некорректный идентификатор EBML (длина превышает 4 байта)",
            ));
        }
        let mut id = b0 as u32;
        for _ in 1..len {
            id = (id << 8) | self.read_u8()? as u32;
        }
        Ok(id)
    }

    /// Считывает целое число переменной длины VINT.
    /// Возвращает кортеж `(значение, длина_в_байтах, признак_неизвестного_размера)`.
    pub fn read_vint(&mut self) -> io::Result<(u64, usize, bool)> {
        let b0 = self.read_u8()?;
        if b0 == 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Некорректное число переменной длины VINT EBML",
            ));
        }
        let len = b0.leading_zeros() as usize + 1;
        let mask = ((1u16 << (8 - len)) - 1) as u8;
        let mut value = (b0 & mask) as u64;
        let mut all_ones = (b0 & mask) == mask;
        for _ in 1..len {
            let b = self.read_u8()?;
            all_ones &= b == 0xFF;
            value = (value << 8) | b as u64;
        }
        Ok((value, len, all_ones))
    }

    /// Считывает полный заголовок элемента EBML (идентификатор и длину).
    pub fn read_header(&mut self) -> io::Result<ElementHeader> {
        let id = self.read_id()?;
        let (size, _, unknown) = self.read_vint()?;
        Ok(ElementHeader {
            id,
            size: if unknown { None } else { Some(size) },
            data_start: self.position(),
        })
    }

    /// Считывает беззнаковое big-endian число заданной длины до 8 байт.
    pub fn read_uint(&mut self, len: u64) -> io::Result<u64> {
        if len > 8 {
            self.skip(len)?;
            return Ok(0);
        }
        let mut value = 0u64;
        for _ in 0..len {
            value = (value << 8) | self.read_u8()? as u64;
        }
        Ok(value)
    }

    /// Считывает текстовую строку UTF-8 с отсечением завершающих нулей.
    pub fn read_string(&mut self, len: u64) -> io::Result<String> {
        let bytes = self.read_vec(len, MAX_METADATA_BYTES)?;
        let trimmed: &[u8] = match bytes.iter().position(|&b| b == 0) {
            Some(idx) => &bytes[..idx],
            None => &bytes,
        };
        Ok(String::from_utf8_lossy(trimmed).trim().to_string())
    }

    /// Пропускает `len` байтов вперёд от текущей позиции.
    #[inline]
    pub fn skip(&mut self, len: u64) -> io::Result<()> {
        let target = self.position().saturating_add(len);
        self.seek_to(target)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_vint_all_lengths() {
        let path = std::env::temp_dir().join("l_mpv_vint_ebml_test.bin");
        std::fs::write(
            &path,
            [
                0x81, // 1 байт: 1
                0x01, 0, 0, 0, 0, 0, 0x01, 0x23, // 8 байт: 0x123
                0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, // неизвестный
                0x40, 0x02, // 2 байта: 2
            ],
        )
        .unwrap();
        let mut r = EbmlReader::open(&path, 4).unwrap();
        assert_eq!(r.read_vint().unwrap(), (1, 1, false));
        assert_eq!(r.read_vint().unwrap(), (0x123, 8, false));
        assert!(r.read_vint().unwrap().2);
        assert_eq!(r.read_vint().unwrap(), (2, 2, false));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_reader_seek_within_buffer() {
        let path = std::env::temp_dir().join("l_mpv_seek_test.bin");
        let data: Vec<u8> = (0..256).map(|b| b as u8).collect();
        std::fs::write(&path, &data).unwrap();

        let mut r = EbmlReader::open(&path, 128).unwrap();
        assert_eq!(r.read_u8().unwrap(), 0);
        r.seek_to(10).unwrap();
        assert_eq!(r.read_u8().unwrap(), 10);
        r.seek_to(5).unwrap();
        assert_eq!(r.read_u8().unwrap(), 5);
        r.seek_to(130).unwrap();
        assert_eq!(r.read_u8().unwrap(), 130);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_reader_boundary_refill_and_read_exact() {
        let path = std::env::temp_dir().join("l_mpv_boundary_test.bin");
        let sample = b"0123456789ABCDEFabcdef";
        std::fs::write(&path, sample).unwrap();

        // Буфер намеренно мал (4 байта), чтобы принудительно вызывать refill
        let mut r = EbmlReader::open(&path, 4).unwrap();
        let mut out = [0u8; 10];
        r.read_exact(&mut out).unwrap();
        assert_eq!(&out, b"0123456789");
        assert_eq!(r.position(), 10);

        r.seek_to(2).unwrap();
        assert_eq!(r.read_u8().unwrap(), b'2');
        assert_eq!(r.position(), 3);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_read_id_and_uint() {
        let path = std::env::temp_dir().join("l_mpv_id_test.bin");
        // 0x1A, 0x45, 0xDF, 0xA3 = EBML_HEADER (4 байта)
        // 0xAE = TRACK_ENTRY (1 байт)
        // 0x01, 0x02 = 2-байтовое uint (0x0102 = 258)
        std::fs::write(&path, [0x1A, 0x45, 0xDF, 0xA3, 0xAE, 0x01, 0x02]).unwrap();

        let mut r = EbmlReader::open(&path, 8).unwrap();
        assert_eq!(r.read_id().unwrap(), ebml_id::EBML_HEADER);
        assert_eq!(r.read_id().unwrap(), ebml_id::TRACK_ENTRY);
        assert_eq!(r.read_uint(2).unwrap(), 258);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_read_string_trimmed() {
        let path = std::env::temp_dir().join("l_mpv_str_test.bin");
        // Текст "Русский" + нулевой байт '\0'
        let mut data = "Русский".as_bytes().to_vec();
        data.push(0);
        std::fs::write(&path, &data).unwrap();

        let mut r = EbmlReader::open(&path, 16).unwrap();
        let s = r.read_string(data.len() as u64).unwrap();
        assert_eq!(s, "Русский");

        let _ = std::fs::remove_file(&path);
    }
}

