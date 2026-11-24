//! Модуль захвата системного звука через Windows WASAPI Loopback.
//!
//! Захватывает PCM-аудиопоток с устройства вывода по умолчанию,
//! выполняет быстрое преобразование Фурье (FFT 1024) на 32 студийные
//! полосы частот (глубокий суб-бас, панч, голос, верхняя середина, воздух)
//! с логарифмической шкалой децибел (dBFS) и отдаёт спектр в UI.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use windows::Win32::Media::Audio::{
    eMultimedia, eRender, IAudioCaptureClient, IAudioClient,
    MMDeviceEnumerator, IMMDeviceEnumerator,
    AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
    CLSCTX_ALL, COINIT_MULTITHREADED,
};

/// Размер блока FFT (1024 отсчета = ~46.8 Гц разрешение на бин при 48 кГц).
const FFT_SIZE: usize = 1024;
/// Количество полос спектра (соответствует третьоктавному студийному эквалайзеру).
const BANDS_COUNT: usize = 32;

/// GUID подтипа KSDATAFORMAT_SUBTYPE_PCM (00000001-0000-0010-8000-00aa00389b71) в байтовом представлении LE.
const KSDATAFORMAT_SUBTYPE_PCM_BYTES: [u8; 16] = [
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00,
    0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
];

/// GUID подтипа KSDATAFORMAT_SUBTYPE_IEEE_FLOAT (00000003-0000-0010-8000-00aa00389b71) в байтовом представлении LE.
const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT_BYTES: [u8; 16] = [
    0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00,
    0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
];

/// Формат аудиосэмплов потока WASAPI Loopback.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SampleFormat {
    Float32,
    Pcm16,
    Pcm24,
    Pcm32,
    Unsupported(u16, u16),
}

/// Определение формата сэмплов по полям `WAVEFORMATEX` и `SubFormat` (для `WAVE_FORMAT_EXTENSIBLE`).
fn detect_sample_format(
    format_tag: u16,
    bits_per_sample: u16,
    cb_size: u16,
    subformat_guid_bytes: Option<[u8; 16]>,
) -> SampleFormat {
    match format_tag {
        3 if bits_per_sample == 32 => SampleFormat::Float32,
        1 => match bits_per_sample {
            16 => SampleFormat::Pcm16,
            24 => SampleFormat::Pcm24,
            32 => SampleFormat::Pcm32,
            _ => SampleFormat::Unsupported(format_tag, bits_per_sample),
        },
        0xFFFE if cb_size >= 22 => match subformat_guid_bytes {
            Some(guid) if guid == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT_BYTES && bits_per_sample == 32 => {
                SampleFormat::Float32
            }
            Some(guid) if guid == KSDATAFORMAT_SUBTYPE_PCM_BYTES => match bits_per_sample {
                16 => SampleFormat::Pcm16,
                24 => SampleFormat::Pcm24,
                32 => SampleFormat::Pcm32,
                _ => SampleFormat::Unsupported(format_tag, bits_per_sample),
            },
            _ => SampleFormat::Unsupported(format_tag, bits_per_sample),
        },
        _ => SampleFormat::Unsupported(format_tag, bits_per_sample),
    }
}

/// Построение логарифмических границ частотных полос (от 25 Гц до 19 кГц) с учётом реальной частоты дискретизации.
fn build_band_indices(sample_rate: u32) -> [usize; BANDS_COUNT + 1] {
    let effective_rate = sample_rate.max(8_000) as f32;
    let nyquist = (effective_rate * 0.5 - 100.0).max(1_000.0);
    let min_freq = 25.0f32;
    let max_freq = 19_000.0f32.min(nyquist);
    let bin_freq = effective_rate / FFT_SIZE as f32;
    let max_bin = FFT_SIZE / 2 - 1;

    let mut band_indices = [0usize; BANDS_COUNT + 1];
    for (i, item) in band_indices.iter_mut().enumerate() {
        let norm = i as f32 / BANDS_COUNT as f32;
        let freq = min_freq * (max_freq / min_freq).powf(norm);
        let bin = (freq / bin_freq).round() as usize;
        *item = bin.clamp(1, max_bin);
    }

    // Гарантируем строгую монотонность диапазонов полос в пределах [1 ..= FFT_SIZE / 2]
    for i in 1..=BANDS_COUNT {
        if band_indices[i] <= band_indices[i - 1] {
            band_indices[i] = (band_indices[i - 1] + 1).min(FFT_SIZE / 2);
        }
    }

    band_indices
}

/// Сведение одного многоканального кадра 32-bit PCM (`i32`) в нормализованный моно-отсчёт `[-1.0 .. 1.0]`.
fn decode_pcm32_frame_mono(frame: &[i32], channels: usize) -> f32 {
    const SCALE: f32 = 2_147_483_648.0;
    if frame.is_empty() {
        return 0.0;
    }
    let f0 = frame[0] as f32 / SCALE;
    let mono = if channels == 1 || frame.len() < 2 {
        f0
    } else if channels == 2 || frame.len() < 6 {
        let f1 = frame[1] as f32 / SCALE;
        (f0 + f1) * 0.5
    } else {
        let f1 = frame[1] as f32 / SCALE;
        let fc = frame[2] as f32 / SCALE;
        let flfe = frame[3] as f32 / SCALE;
        (f0 * 0.5 + f1 * 0.5 + fc * 0.8 + flfe * 1.5) / 1.7
    };
    mono.clamp(-1.0, 1.0)
}

/// Потокобезопасный контроллер захвата звука и вычисления спектра.
pub struct AudioCaptureManager {
    /// Флаг работы фонового потока (false — завершение потока).
    is_running: Arc<AtomicBool>,
    /// Флаг активности захвата (true — захват работает, false — спит).
    is_active: Arc<AtomicBool>,
    /// Буфер последних вычисленных 32 полос спектра [0.0 .. 1.0].
    spectrum: Arc<Mutex<[f32; BANDS_COUNT]>>,
}

impl AudioCaptureManager {
    /// Создание и запуск менеджера захвата в фоновом потоке.
    pub fn new() -> Self {
        let is_running = Arc::new(AtomicBool::new(true));
        let is_active = Arc::new(AtomicBool::new(false));
        let spectrum = Arc::new(Mutex::new([0.0f32; BANDS_COUNT]));

        let running_clone = is_running.clone();
        let active_clone = is_active.clone();
        let spectrum_clone = spectrum.clone();

        thread::Builder::new()
            .name("l-mpv-audio-capture".to_string())
            .spawn(move || {
                run_capture_loop(running_clone, active_clone, spectrum_clone);
            })
            .expect("Не удалось запустить фоновый поток захвата звука");

        Self { is_running, is_active, spectrum }
    }

    /// Установка активности захвата (включается при отображении UI визуализатора).
    pub fn set_active(&self, active: bool) {
        self.is_active.store(active, Ordering::SeqCst);
    }

    /// Получение текущего среза спектра (32 нормализованных значения от 0.0 до 1.0).
    pub fn get_spectrum(&self) -> [f32; BANDS_COUNT] {
        if let Ok(guard) = self.spectrum.lock() {
            *guard
        } else {
            [0.0f32; BANDS_COUNT]
        }
    }
}

impl Drop for AudioCaptureManager {
    fn drop(&mut self) {
        self.is_running.store(false, Ordering::SeqCst);
        self.is_active.store(false, Ordering::SeqCst);
    }
}

/// Быстрое преобразование Фурье (Radix-2 Cooley-Tukey FFT на 1024 отсчета) с окном Ханна.
fn compute_fft(
    input: &[f32; FFT_SIZE],
    real: &mut [f32; FFT_SIZE],
    imag: &mut [f32; FFT_SIZE],
    bit_rev: &[usize; FFT_SIZE],
    hann_window: &[f32; FFT_SIZE],
) {
    // 1. Оконная функция Ханна и 10-битная перестановка (Bit-reversal) по предрасчитанной таблице
    for i in 0..FFT_SIZE {
        let rev = bit_rev[i];
        real[rev] = input[i] * hann_window[i];
        imag[rev] = 0.0;
    }

    // 2. Итеративные бабочки FFT (Radix-2)
    let mut step = 2;
    while step <= FFT_SIZE {
        let half = step / 2;
        let angle_step = -2.0 * std::f32::consts::PI / step as f32;

        for j in 0..half {
            let angle = angle_step * j as f32;
            let (w_im, w_re) = angle.sin_cos();

            let mut group = 0;
            while group < FFT_SIZE {
                let idx1 = group + j;
                let idx2 = idx1 + half;

                let u_re = real[idx1];
                let u_im = imag[idx1];

                let v_re = real[idx2] * w_re - imag[idx2] * w_im;
                let v_im = real[idx2] * w_im + imag[idx2] * w_re;

                real[idx1] = u_re + v_re;
                imag[idx1] = u_im + v_im;

                real[idx2] = u_re - v_re;
                imag[idx2] = u_im - v_im;

                group += step;
            }
        }
        step <<= 1;
    }
}

/// Главный рабочий цикл потока WASAPI Loopback.
fn run_capture_loop(
    is_running: Arc<AtomicBool>,
    is_active: Arc<AtomicBool>,
    spectrum: Arc<Mutex<[f32; BANDS_COUNT]>>,
) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }

    let mut samples_buffer = [0.0f32; FFT_SIZE];
    let mut buffer_pos = 0usize;

    let mut fft_input = [0.0f32; FFT_SIZE];
    let mut real = [0.0f32; FFT_SIZE];
    let mut imag = [0.0f32; FFT_SIZE];
    let mut smoothed_bands = [0.0f32; BANDS_COUNT];

    // Предрасчёт таблицы битовой перестановки и коэффициентов окна Ханна для БПФ
    let mut bit_rev = [0usize; FFT_SIZE];
    let mut hann_window = [0.0f32; FFT_SIZE];
    for i in 0..FFT_SIZE {
        let mut rev = 0usize;
        let mut temp = i;
        for _ in 0..10 {
            rev = (rev << 1) | (temp & 1);
            temp >>= 1;
        }
        bit_rev[i] = rev;
        hann_window[i] = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (FFT_SIZE - 1) as f32).cos());
    }

    while is_running.load(Ordering::Relaxed) {
        // Если визуализатор выключен или UI скрыт — засыпаем (0% CPU)
        if !is_active.load(Ordering::Relaxed) {
            if let Ok(mut guard) = spectrum.lock() {
                if guard.iter().any(|&v| v > 0.001) {
                    *guard = [0.0f32; BANDS_COUNT];
                }
            }
            thread::sleep(Duration::from_millis(80));
            continue;
        }

        // Инициализация WASAPI Loopback
        let capture_res = unsafe { init_wasapi_loopback() };
        let (audio_client, capture_client, channels, sample_rate, sample_format) = match capture_res {
            Ok(c) => c,
            Err(_) => {
                thread::sleep(Duration::from_millis(300));
                continue;
            }
        };

        let band_indices = build_band_indices(sample_rate);

        if unsafe { audio_client.Start() }.is_err() {
            thread::sleep(Duration::from_millis(200));
            continue;
        }

        // Внутренний цикл чтения аудио-пакетов
        while is_running.load(Ordering::Relaxed) && is_active.load(Ordering::Relaxed) {
            let mut packet_length = match unsafe { capture_client.GetNextPacketSize() } {
                Ok(len) => len,
                Err(_) => break,
            };

            if packet_length == 0 {
                thread::sleep(Duration::from_millis(6));
                continue;
            }

            while packet_length > 0 {
                let mut data_ptr = std::ptr::null_mut();
                let mut frames_available = 0u32;
                let mut flags = 0u32;

                let hr = unsafe {
                    capture_client.GetBuffer(
                        &mut data_ptr,
                        &mut frames_available,
                        &mut flags,
                        None,
                        None,
                    )
                };

                if hr.is_ok() && !data_ptr.is_null() && frames_available > 0 {
                    let is_silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0;

                    if is_silent {
                        for _ in 0..frames_available {
                            samples_buffer[buffer_pos] = 0.0;
                            buffer_pos = (buffer_pos + 1) % FFT_SIZE;
                        }
                    } else {
                        match sample_format {
                            SampleFormat::Float32 => {
                                let slice = unsafe {
                                    std::slice::from_raw_parts(
                                        data_ptr as *const f32,
                                        (frames_available * channels) as usize,
                                    )
                                };
                                for frame in slice.chunks_exact(channels as usize) {
                                    let mono = if channels == 1 {
                                        frame[0]
                                    } else if channels == 2 {
                                        (frame[0] + frame[1]) * 0.5
                                    } else if channels >= 6 {
                                        // 5.1 / 7.1: LFE (взрывы/сабвуфер = frame[3]) и Center (голос = frame[2])
                                        (frame[0] * 0.5
                                            + frame[1] * 0.5
                                            + frame[2] * 0.8
                                            + frame[3] * 1.5)
                                            / 1.7
                                    } else {
                                        frame[0]
                                    };
                                    samples_buffer[buffer_pos] = mono.clamp(-1.0, 1.0);
                                    buffer_pos = (buffer_pos + 1) % FFT_SIZE;
                                }
                            }
                            SampleFormat::Pcm16 => {
                                let slice = unsafe {
                                    std::slice::from_raw_parts(
                                        data_ptr as *const i16,
                                        (frames_available * channels) as usize,
                                    )
                                };
                                for frame in slice.chunks_exact(channels as usize) {
                                    let f0 = frame[0] as f32 / 32768.0;
                                    let mono = if channels == 1 {
                                        f0
                                    } else if channels == 2 {
                                        (f0 + (frame[1] as f32 / 32768.0)) * 0.5
                                    } else if channels >= 6 {
                                        let f1 = frame[1] as f32 / 32768.0;
                                        let fc = frame[2] as f32 / 32768.0;
                                        let flfe = frame[3] as f32 / 32768.0;
                                        (f0 * 0.5 + f1 * 0.5 + fc * 0.8 + flfe * 1.5) / 1.7
                                    } else {
                                        f0
                                    };
                                    samples_buffer[buffer_pos] = mono.clamp(-1.0, 1.0);
                                    buffer_pos = (buffer_pos + 1) % FFT_SIZE;
                                }
                            }
                            SampleFormat::Pcm24 => {
                                let total_bytes = (frames_available * channels * 3) as usize;
                                let slice = unsafe {
                                    std::slice::from_raw_parts(
                                        data_ptr as *const u8,
                                        total_bytes,
                                    )
                                };
                                let frame_size = (channels * 3) as usize;
                                for frame in slice.chunks_exact(frame_size) {
                                    let ch0_raw = (frame[0] as i32)
                                        | ((frame[1] as i32) << 8)
                                        | (((frame[2] as i8) as i32) << 16);
                                    let f0 = ch0_raw as f32 / 8388608.0;
                                    let mono = if channels >= 2 && frame.len() >= 6 {
                                        let ch1_raw = (frame[3] as i32)
                                            | ((frame[4] as i32) << 8)
                                            | (((frame[5] as i8) as i32) << 16);
                                        let f1 = ch1_raw as f32 / 8388608.0;
                                        (f0 + f1) * 0.5
                                    } else {
                                        f0
                                    };
                                    samples_buffer[buffer_pos] = mono.clamp(-1.0, 1.0);
                                    buffer_pos = (buffer_pos + 1) % FFT_SIZE;
                                }
                            }
                            SampleFormat::Pcm32 => {
                                let slice = unsafe {
                                    std::slice::from_raw_parts(
                                        data_ptr as *const i32,
                                        (frames_available * channels) as usize,
                                    )
                                };
                                for frame in slice.chunks_exact(channels as usize) {
                                    samples_buffer[buffer_pos] =
                                        decode_pcm32_frame_mono(frame, channels as usize);
                                    buffer_pos = (buffer_pos + 1) % FFT_SIZE;
                                }
                            }
                            SampleFormat::Unsupported(_, _) => {
                                for _ in 0..frames_available {
                                    samples_buffer[buffer_pos] = 0.0;
                                    buffer_pos = (buffer_pos + 1) % FFT_SIZE;
                                }
                            }
                        }
                    }

                    unsafe {
                        let _ = capture_client.ReleaseBuffer(frames_available);
                    }
                } else {
                    break;
                }

                packet_length = unsafe { capture_client.GetNextPacketSize() }.unwrap_or_default();
            }

            // Разворачиваем кольцевой буфер для непрерывности временной функции
            for i in 0..FFT_SIZE {
                fft_input[i] = samples_buffer[(buffer_pos + i) % FFT_SIZE];
            }

            // Вычисляем 1024-точечное FFT с предрасчитанными таблицами
            compute_fft(&fft_input, &mut real, &mut imag, &bit_rev, &hann_window);

            // Логарифмический спектральный анализ по 32 полосам
            for b in 0..BANDS_COUNT {
                let start_bin = band_indices[b];
                let end_bin = band_indices[b + 1];

                let mut max_mag = 0.0f32;
                let mut sum_sq = 0.0f32;
                let count = (end_bin - start_bin) as f32;

                for k in start_bin..end_bin {
                    let mag = (real[k] * real[k] + imag[k] * imag[k]).sqrt();
                    if mag > max_mag {
                        max_mag = mag;
                    }
                    sum_sq += mag * mag;
                }

                let rms_mag = (sum_sq / count).sqrt();
                // 70% пиковая магнитуда для мгновенной реакции + 30% RMS плотность
                let combined_mag = max_mag * 0.7 + rms_mag * 0.3;

                // Нормализация амплитуды окна Ханна (A = 4 * |X| / N)
                let norm_mag = (combined_mag * 4.0 / FFT_SIZE as f32).max(1e-5);

                // Перевод в децибелы (dBFS)
                let db = 20.0 * norm_mag.log10();

                // Частотная компенсация высоких частот (+0.75 dB на полосу для розового шума музыки)
                let tilt_boost = (b as f32) * 0.75;
                let adjusted_db = db + tilt_boost;

                // Рабочий диапазон от -46 dB (тишина) до 0 dB (максимальный пик/взрыв)
                let normalized = ((adjusted_db - (-46.0)) / 46.0).clamp(0.0, 1.0);

                // Профессиональная баллистика: мгновенный рывок вверх (Attack 0.85) и мягкий спад (Decay 0.82)
                if normalized > smoothed_bands[b] {
                    smoothed_bands[b] = smoothed_bands[b] * 0.15 + normalized * 0.85;
                } else {
                    smoothed_bands[b] *= 0.82;
                }
            }

            // Передаем спектр во фронтенд
            if let Ok(mut guard) = spectrum.lock() {
                *guard = smoothed_bands;
            }

            // Частота кадров спектрального анализа ~50 FPS
            thread::sleep(Duration::from_millis(20));
        }

        let _ = unsafe { audio_client.Stop() };
    }

    unsafe {
        CoUninitialize();
    }
}

/// Инициализация интерфейса WASAPI Loopback Capture на устройстве по умолчанию.
unsafe fn init_wasapi_loopback() -> Result<(IAudioClient, IAudioCaptureClient, u32, u32, SampleFormat), String> {
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
        .map_err(|e| format!("Ошибка создания MMDeviceEnumerator: {}", e))?;

    let device = enumerator
        .GetDefaultAudioEndpoint(eRender, eMultimedia)
        .map_err(|e| format!("Ошибка получения аудиоустройства по умолчанию: {}", e))?;

    let audio_client: IAudioClient = device
        .Activate(CLSCTX_ALL, None)
        .map_err(|e| format!("Ошибка активации IAudioClient: {}", e))?;

    let mix_format_ptr = audio_client
        .GetMixFormat()
        .map_err(|e| format!("Ошибка получения MixFormat: {}", e))?;

    let wave_format = &*mix_format_ptr;
    let channels = (wave_format.nChannels as u32).max(1);
    let sample_rate = wave_format.nSamplesPerSec.max(8_000);
    let format_tag = wave_format.wFormatTag;
    let bits_per_sample = wave_format.wBitsPerSample;
    let cb_size = wave_format.cbSize;

    // В WAVEFORMATEXTENSIBLE за 18-байтным заголовком WAVEFORMATEX идут:
    // Samples (2 байта) + dwChannelMask (4 байта) + SubFormat GUID (16 байт), смещение SubFormat = 24 байта.
    let subformat_guid_bytes = if format_tag == 0xFFFE && cb_size >= 22 {
        let base_ptr = mix_format_ptr as *const u8;
        let guid_slice = std::slice::from_raw_parts(base_ptr.add(24), 16);
        let mut guid = [0u8; 16];
        guid.copy_from_slice(guid_slice);
        Some(guid)
    } else {
        None
    };

    let sample_format = detect_sample_format(
        format_tag,
        bits_per_sample,
        cb_size,
        subformat_guid_bytes,
    );

    let hns_buffer_duration = 200_000i64; // 20ms буфер
    let init_result = audio_client.Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK,
        hns_buffer_duration,
        0,
        mix_format_ptr,
        None,
    );

    // Освобождаем выделенную память CoTaskMemAlloc для WAVEFORMATEX
    CoTaskMemFree(Some(mix_format_ptr as *const _));

    init_result.map_err(|e| format!("Ошибка инициализации loopback audio client: {}", e))?;

    let capture_client: IAudioCaptureClient = audio_client
        .GetService()
        .map_err(|e| format!("Ошибка получения IAudioCaptureClient: {}", e))?;

    Ok((audio_client, capture_client, channels, sample_rate, sample_format))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn тест_различения_32_битного_pcm_и_ieee_float_в_wave_format_extensible() {
        assert_eq!(
            detect_sample_format(
                0xFFFE,
                32,
                22,
                Some(KSDATAFORMAT_SUBTYPE_IEEE_FLOAT_BYTES)
            ),
            SampleFormat::Float32
        );
        assert_eq!(
            detect_sample_format(
                0xFFFE,
                32,
                22,
                Some(KSDATAFORMAT_SUBTYPE_PCM_BYTES)
            ),
            SampleFormat::Pcm32
        );
        assert_eq!(
            detect_sample_format(
                0xFFFE,
                24,
                22,
                Some(KSDATAFORMAT_SUBTYPE_PCM_BYTES)
            ),
            SampleFormat::Pcm24
        );
        assert_eq!(
            detect_sample_format(
                0xFFFE,
                16,
                22,
                Some(KSDATAFORMAT_SUBTYPE_PCM_BYTES)
            ),
            SampleFormat::Pcm16
        );
        // Без валидного SubFormat 32-bit extensible не должен слепо считаться Float32
        assert_eq!(
            detect_sample_format(0xFFFE, 32, 0, None),
            SampleFormat::Unsupported(0xFFFE, 32)
        );
    }

    #[test]
    fn тест_декодирования_32_битного_pcm() {
        let half_pos = i32::MAX / 2;
        let mono = decode_pcm32_frame_mono(&[half_pos, half_pos], 2);
        assert!((mono - 0.5).abs() < 0.001, "mono={mono}");
    }

    #[test]
    fn тест_пересчёта_полос_спектра_для_разных_частот_дискретизации() {
        let bands_44k = build_band_indices(44_100);
        let bands_48k = build_band_indices(48_000);
        let bands_96k = build_band_indices(96_000);

        for bands in [&bands_44k, &bands_48k, &bands_96k] {
            for i in 1..=BANDS_COUNT {
                assert!(
                    bands[i] > bands[i - 1],
                    "Нарушена строгая монотонность полос на индексе {i}: {bands:?}"
                );
                assert!(bands[i] <= FFT_SIZE / 2);
            }
        }
        // При 96 кГц шаг бина в 2 раза шире (93.75 Гц против 46.875 Гц), поэтому верхний бин 19 кГц меньше
        assert!(bands_96k[BANDS_COUNT] < bands_48k[BANDS_COUNT]);
        assert!(bands_48k[BANDS_COUNT] <= bands_44k[BANDS_COUNT]);
    }
}
