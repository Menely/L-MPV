# L-MPV — Архитектура проекта и База Знаний

Данный документ содержит полную и актуальную информацию об устройстве медиаплеера **L-MPV** (версия **2.0.2**), его архитектуре, технологическом стеке, структуре файлов, взаимодействии Rust и React, детальном реестре IPC-команд, подсистеме Real-Time 4K AI Upscaling и всех пользовательских возможностях.

---

## 1. Стек технологий и Портативность

- **Фронтенд:** React 19 + TypeScript 5.8 + Vite 7 + Lucide Icons + Vanilla CSS (Design Tokens, Glassmorphism, CSS Custom Properties, Vector Drop-Shadow).
- **Бэкенд:** Rust (2021 edition) + Tauri v2 + Tokio.
- **Медиа-движок:** `libmpv-2.dll` (сборка `the-database/mpv-winbuild` с нативным видеофильтром `vf_animejanai`), задействован динамический FFI через `libloading`.
- **Подсистема AI-Апскейлинга:** Нативный инференс ONNX-моделей в реальном времени (DirectML DirectX 12 / NVIDIA TensorRT) через фильтр `animejanai` и мост `aji.dll`.
- **Анализ медиа:** Нативная `mediainfo.dll` (C-API) для детального отчёта свойств медиафайлов в независимом окне ОС Windows.
- **Прямой экспорт дорожек:** Встроенный `ffmpeg.exe` для мгновенного извлечения аудио и субтитров (`-c copy` / многопоточный фоллбек).
- **Портативный режим (Portable Architecture):**
  - Приложение полностью отвязано от диска и реестра Windows.
  - Все пути определяются динамически во время выполнения через `std::env::current_exe().parent()`.
  - Портативная структура папки `Portable-L-MPV/`:
    - `L-MPV.exe` — главный исполняемый файл с нативно встроенным веб-интерфейсом React.
    - `libmpv-2.dll` — нативная библиотека воспроизведения mpv со встроенным фильтром `vf_animejanai`.
    - `mediainfo.dll` — нативная библиотека подробного анализа MediaInfo.
    - `ffmpeg.exe` — утилита прямого извлечения аудио и субтитров.
    - `models/onnx/` — универсальная папка для любых пользовательских моделей нейросетей `.onnx`.
    - `inference/` — каталог вспомогательных библиотек инференса (`aji.dll`, DirectML, TensorRT).
    - `config/` — локальные конфигурации:
      - `settings.json` — конфигурация плеера.
      - `history.json` — история просмотров и позиций воспроизведения.
      - `upscale.conf` — параметры активного режима апскейлинга, слотов и бэкенда.
      - `presets/` — индивидуальные файлы пресетов настроек (`<название_пресета>.json`).
    - `screenshots/` — папка сохранения кадров по умолчанию.

---

## 2. Структура Проекта

```
L-MPV/
├── src/                                  # Фронтенд (React 19 + TypeScript 5.8)
│   ├── assets/                           # Статические ресурсы и иконки
│   ├── components/                       # Модульные компоненты интерфейса
│   │   ├── Titlebar.tsx                  # Шапка окна (логотип, по центру название файла, кнопки окна)
│   │   ├── PlayerControls.tsx            # Нижняя плавающая «таблетка» управления (смена дорожек, скачивание, скриншот, плейлист, скорость)
│   │   ├── ContextMenu.tsx               # Кастомное ПКМ-меню (дорожки со скачиванием, скорость, вид, масштабирование, поворот, подсветка)
│   │   ├── UpscalingSettingsSection.tsx  # Модуль управления 4K AI апскейлингом (Выкл / AI, DirectML / TensorRT, библиотека ONNX моделей, скачивание)
│   │   ├── upscale/                      # Модульные подкомпоненты апскейлинга:
│   │   │   ├── types.ts                  # Интерфейсы моделей данных
│   │   │   ├── GpuHardwareCard.tsx       # Информационная карточка обнаруженного GPU (VRAM, рекомендации)
│   │   │   └── BackendSelector.tsx       # Селектор DirectML / TensorRT, кнопки скачивания, удаления, прогресс
│   │   ├── ColorSchemeSection.tsx        # Модуль цветового оформления плеера (11 кинематографичных тем, акценты, неоновый глоу, предпросмотр)
│   │   ├── ColorPickerModal.tsx          # Кастомное модальное окно выбора цвета (круг спектра HSV/RGB/HEX, слайдер яркости, палитра)
│   │   ├── MediaInfoModal.tsx            # Компактное окно технической информации о медиафайле
│   │   ├── StandaloneMediaInfoWindow.tsx # Независимое нативное окно MediaInfo (565x685, Always on Top с Pin, Drag&Drop, запуск из проводника)
│   │   ├── ChaptersModal.tsx             # Модальное окно навигации по главам (Chapters)
│   │   ├── Timeline.tsx                  # Высокоточный таймлайн с изолированным контекстом времени (без лишних ререндеров)
│   │   ├── AudioVisualizer.tsx           # Высокопроизводительный Canvas-визуалайзер аудио-волн (Waveform / Spectrum / Bars, пастель/неон)
│   │   ├── VisualizerSettingsSection.tsx # Модульная секция настроек аудио-визуалайзера для окна SettingsModal
│   │   ├── PresetsSection.tsx            # Секция управления пресетами («Мои пресеты» и «Готовые стили») в SettingsModal
│   │   └── PlaylistDrawer.tsx            # Выдвижная боковая панель плейлиста (Natural Sort, поиск, переключение)
│   ├── contexts/                         # Реактивные контексты React
│   │   └── PlayerStateContext.tsx        # Трёхуровневый контекст: PlayerStateContext (метаданные) + LiveStateContext (показатели) + PlayerProgressContext (10–60 FPS)
│   ├── styles/                           # Модульная система стилей (15 модулей Vanilla CSS)
│   │   ├── variables.css                 # CSS Custom Properties, темы, UI Scale, шрифтовые гарнитуры, акцентные палитры, параметры свечения
│   │   ├── components.css                # Стандартизированная дизайн-система компонентов (.glass-panel, .glass-section, .glass-tile, .btn, .badge, .kbd-chip)
│   │   ├── base.css                      # Глобальный сброс, стили приложения, IDLE-режим, OSD
│   │   ├── titlebar.css                  # Кастомная шапка окна
│   │   ├── video-area.css                # Область видео и вотермарка
│   │   ├── controls.css                  # Плавающая панель управления, таймлайн, регулятор громкости, векторное свечение drop-shadow
│   │   ├── visualizer.css                # Стили аудио-визуалайзера (режимы над таймлайном и компактный тулбар)
│   │   ├── presets.css                   # Стили секции управления пресетами настроек
│   │   ├── context-menu.css              # Кастомное ПКМ-меню
│   │   ├── modals.css                    # Модальные окна (Настройки, MediaInfo, Chapters)
│   │   ├── mediainfo-modal.css           # Стили кастомного окна и модального отчёта MediaInfo
│   │   ├── side-panel.css                # Панель глав
│   │   ├── track-popover.css             # Всплывающие меню аудиодорожек и субтитров
│   │   ├── overlays.css                  # Overlay-элементы (Drag&Drop, Scrollbar, Playlist Drawer, Update)
│   │   └── responsive.css                # Глобальные медиа-запросы
│   ├── utils/                            # Утилиты
│   │   ├── uiThemeUtils.ts               # Управление скруглением углов, масштабом (UI Scale), прозрачностью и шрифтовой экосистемой (UI Font)
│   │   ├── colorUtils.ts                 # Цветовые палитры и вычисление HSL/RGB акцентов, градиентов и параметров свечения drop-shadow
│   │   ├── hotkeyUtils.ts                # Реестр действий, бинды, сохранение и сброс горячих клавиш (включая Ctrl+J для статистики, Shift+1..7)
│   │   ├── mediaInfoParser.ts            # Модуль разбора и перевода на русский язык отчёта MediaInfo
│   │   ├── presetsUtils.ts               # Модуль управления, хранения, экспорта и импорта пользовательских и готовых пресетов
│   │   └── timeUtils.ts                  # Форматирование времени воспроизведения
│   ├── App.tsx                           # Главный контейнер (клики, IDLE, Drag&Drop, Hotkeys, Zoom/Pan, Wheel Vol, OSD)
│   ├── index.css                         # Единая точка импорта CSS-модулей
│   └── main.tsx                          # Точка входа React
├── src-tauri/                            # Бэкенд (Rust + Tauri v2)
│   ├── capabilities/default.json         # Разрешения Tauri (окна, opener, dialog)
│   ├── src/
│   │   ├── main.rs                       # Входная точка приложения
│   │   ├── upscale/                      # Модульная подсистема 4K AI апскейлинга:
│   │   │   ├── mod.rs                    # Единая точка входа, IPC-команды, unit-тесты
│   │   │   ├── types.rs                  # Модели данных: ModelFileItem, UpscaleSettings, UpscaleStatus, GpuHardwareInfo
│   │   │   ├── hardware.rs               # Аппаратный анализ GPU через DXGI, определение SM-архитектуры
│   │   │   ├── config.rs                 # Пути каталогов, окружение DLL, сканирование models/onnx, генерация upscale.conf
│   │   │   ├── downloader.rs             # Загрузчик DirectML/TensorRT, распаковка архивов tar.exe, очистка
│   │   │   ├── engine_builder.rs         # Сборка движков TensorRT (.engine), автоконвертация FP32 в FP16, aji_harness и trtexec
│   │   │   └── controller.rs             # Применение настроек к libmpv, переключение по хоткеям, перерисовка кадров
│   │   ├── ambient.rs                    # Контроллер подсветки черных полос (Ambient Light: GPU Blur / Color / Off)
│   │   ├── audio_capture.rs              # Нативный захват звука WASAPI Loopback, быстрый БПФ (FFT Radix-2), 32 логарифмические полосы
│   │   ├── mediainfo.rs                  # FFI-интеграция с mediainfo.dll и управление независимым окном MediaInfo
│   │   ├── mpv_manager.rs                # FFI-обертчик libmpv (vo=gpu-next, WASAPI, D3D11, vf_animejanai, sinc resampler)
│   │   ├── system_integration.rs         # Интеграция с Проводником Windows (контекстное меню, ассоциации файлов)
│   │   ├── updater.rs                    # Модуль автообновления приложения
│   │   └── commands.rs                   # IPC #[tauri::command] функции, извлечение дорожек FFmpeg, персистентность AppSettings
│   ├── Cargo.toml                        # Зависимости Rust (tauri, libloading, serde, tokio, reqwest, zip, windows-sys)
│   └── tauri.conf.json                   # Конфигурация приложения Tauri (NSIS bundle, resources, окна)
├── models/                               # Корневой каталог нейросетей
│   └── onnx/                             # Универсальная папка для размещения ONNX-моделей
├── inference/                            # Папка для библиотек инференса (aji.dll, DirectML, TensorRT)
└── Portable-L-MPV/                       # Готовая портативная папка для тестирования и релиза
```

---

## 3. Архитектура Бэкенда (Rust)

### 3.1. `mpv_manager.rs`
- Динамически загружает `libmpv-2.dll` (с поддержкой `vf_animejanai`) через `libloading`.
- **Рендеринг и видео:** Профиль `vo=gpu-next`, `profile=gpu-hq`, `gpu-api=d3d11`, `hwdec=auto-safe`, `scale=spline36`, `cscale=spline36`, `auto-window-resize=no`.
- **HDR & Color Management:** `target-colorspace-hint=yes`, `tone-mapping=auto`, `hdr-compute-peak=yes`.
- **Студийное аудио (Audiophile Profile):**
  - Драйвер Windows WASAPI: `ao=wasapi`, `audio-buffer=0.2`.
  - Авто-конфигурация каналов: `audio-channels=auto-safe`, `audio-pitch-correction=yes` (scaletempo2).
  - Студийный sinc-ресемплинг: `audio-resample-filter-size=32` (32 taps sinc-фильтр), `audio-resample-phase-shift=14` (16 384 фазы), `audio-resample-linear=yes`.
  - Безопасное стерео-сведение: `audio-normalize-downmix=yes` (защита от перегрузок и клиппинга).
- **Интеграция с AI Апскейлингом:**
  - `enable_ai_upscale(&self, conf_path: &str, slot: u32)` — подключение видеофильтра `@aji:animejanai=conf="..."` и установка активного слота.
  - `disable_ai_upscale(&self)` — сброс слота на 0 и удаление фильтра `@aji`.
  - `set_ai_upscale_slot(&self, slot: u32)` — переключение слота нейросети на лету.
- **Оптимизация буферизации и кэширования:**
  - `demuxer-max-bytes=32MiB`, `demuxer-readahead-secs=2`.
  - `demuxer-max-back-bytes=16MiB` (**кэш обратной перемотки**: мгновенный возврат назад).
  - `hr-seek-framedrop=yes`, `cache-pause=no`, `demuxer-mkv-subtitle-preroll=yes`, `sub-auto=fuzzy`.

### 3.2. `src-tauri/src/upscale/` (Модульная Подсистема 4K AI-Апскейлинга)
Архитектура подсистемы разделена на специализированные слабосвязанные модули с высокой связностью (High Cohesion):
- **`mod.rs` (Фасад и IPC-диспетчер):**
  - Единая точка входа для Tauri Builder (`generate_handler!`), экспортирует 10 IPC-команд.
  - Содержит модульные тесты: валидация CRC32-хеширования путей, корректность маппинга SM-архитектур NVIDIA и устойчивость аппаратной диагностики GPU.
- **`types.rs` (Типизированные DTO и Модели Состояния):**
  - `ModelFileItem`: метаданные ONNX-модели (имя, путь, размер, присвоенный слот 1001+, флаг скомпилированного `.engine` под 1080p).
  - `UpscaleSettings`: активный режим (`Off` / `Ai`), целевой бэкенд (`DirectML` / `TensorRT`), выбранный слот.
  - `UpscaleStatus`: готовность рантаймов DirectML / TensorRT, библиотеки `aji.dll`, список доступных моделей и активный слот.
  - `GpuHardwareInfo`: наименование адаптера, вендор (NVIDIA, AMD, Intel, Apple, Qualcomm), объем VRAM в МБ, SM-архитектура, рекомендация оптимального бэкенда.
  - `EngineDownloadProgress`: статус скачивания и распаковки движка инференса (движок, процент 0–100%, статус, флаг завершения, ошибка).
  - `ModelCompileProgress`: статус компиляции `.engine` (слот, имя файла, процент 0–100%, статус, флаг завершения, ошибка).
- **`hardware.rs` (Аппаратный Анализ GPU через Win32 DXGI C-API и опрос NVIDIA Compute Capability):**
  - Обход видеоадаптеров через COM-интерфейсы `IDXGIFactory` и `IDXGIAdapter` (без вызова внешних консолей).
  - Определение реальной выделенной видеопамяти (`DedicatedVideoMemory`).
  - Гибридное определение архитектуры SM: прямой быстрый опрос утилиты NVIDIA `nvidia-smi --query-gpu=compute_cap` с fallback-таблицей PCI Device ID.
  - Точное сопоставление архитектур с именами пакетов билдера TensorRT:
    - SM 12.0 (`sm120`): NVIDIA GeForce RTX 5090, 5080, 5070 Ti, 5070, 5060 (Blackwell).
    - SM 8.9 (`sm89`): NVIDIA GeForce RTX 4090, 4080, 4070, 4060, RTX Ada (Ada Lovelace).
    - SM 8.6 / 8.0 (`sm86` / `sm80`): NVIDIA GeForce RTX 3090, 3080, 3070, 3060, A100 (Ampere).
    - SM 7.5 (`sm75`): NVIDIA GeForce RTX 2080, 2070, 2060, GTX 1660, 1650 (Turing).
  - Выдача архитектурных рекомендаций для сборки TensorRT 11.
- **`config.rs` (Файловая Система, Окружение и Конфигурация):**
  - Разрешение путей портативного плеера: `models/onnx/`, `inference/`, `config/upscale.conf`.
  - Модификация переменной среды окружения процесса `PATH` для динамической загрузки DLL рантаймов инференса (`nvinfer.dll`, `DirectML.dll`, `aji.dll`).
  - Сканирование каталога `models/onnx/` с естественной сортировкой (Natural Sort) и динамическим назначением слотов (1001, 1002...).
  - Генерация атомарного файла `config/upscale.conf`.
- **`downloader.rs` (Асинхронный Менеджер Загрузки и Распаковки Рантаймов):**
  - Потоковая загрузка архивов DirectML и TensorRT с прогрессом через `reqwest`.
  - Загрузка базового рантайма `component-trt-runtime.7z` и точного архитектурного архива билдера `component-trt-{sm}.7z` (`sm120`, `sm89`, `sm86`, `sm75` с фоллбэком на `component-trt-ptx.7z`).
  - Распаковка архивов в пуле потоков Tokio `spawn_blocking` через `tar.exe` / `zip` (полное устранение блокировок асинхронного рантайма).
  - Трансляция событий `engine-download-progress` в UI на каждом этапе (0% -> 90% скачивание, 91% -> 99% распаковка, 100% готовность).
  - Полная очистка временных архивов и безопасное удаление компонентов по запросу пользователя.
- **`engine_builder.rs` (Сборка Движков TensorRT, Автоконвертация FP16 и Мониторинг):**
  - Нативная фоновая компиляция оптимизированных `.engine` файлов под 1080p через `aji_harness.exe` (нативный утилитарный харнесс mpv-AnimeJaNai с передачей `--slot` и конфигурационного файла) и резервный `trtexec.exe`.
  - Модуль автоматической проверки и конвертации графа ONNX в FP16 (`ensure_onnx_model_fp16`): устраняет различие форматов (FP32 в FP16) перед компиляцией, предотвращая артефакты «радужного шума» на моделях V1 и V3.
  - Согласование архитектурных суффиксов имени движка (`sm12` для Blackwell, `sm8` для Ada/Ampere, `sm7` для Turing) в полном соответствии с токеном `libaji:gpu_token()`.
  - Очистка битых `.cache` и `.log` файлов перед сборкой для исключения коллизий аллокатора CUDA.
  - Построчный асинхронный разбор логов компиляции с отправкой прогресса в UI (`5% -> 15% -> 28% -> 48% -> 68% -> 90% -> 100%`).
- **`controller.rs` (Управление Инференсом libmpv и Горячие Клавиши):**
  - Подключение и удаление видеофильтра `@aji:animejanai=conf="..."` в `libmpv` без перезапуска видео.
  - Мгновенное переключение слотов нейросетей по горячим клавишам `Shift+1..4` с принудительной перерисовкой кадра (`seek(0, "relative+exact")`).
  - Динамическое обновление параметров активного видеофильтра на лету.

### 3.3. `ambient.rs` (Подсветка полос / Ambient Light)
- Управляет состоянием подсветки областей letterbox/pillarbox (соотношения сторон 21:9, 4:3, нестандартные форматы, полноэкранный режим).
- Режимы работы:
  - **`Off`**: классические черные полосы (`border-background=color`, `background-color=#000000`).
  - **`Blur`**: аппаратный шейдерный GPU Blur видеокадра в пустых областях без нагрузки на процессор (`border-background=blur`, `background-blur-radius=5..150`).
  - **`Color`**: мягкая подсветка акцентным цветом темы или кастомным HEX (`border-background=color`, `background-color=#RRGGBB`).
- Оптимизированный `AmbientController` с in-memory кэшированием состояния, 60fps GPU preview и отложенным сохранением (Debounce 400ms).

### 3.4. `lib.rs`
- Извлекает HWND окна Tauri v2 и передает его в mpv через свойство `"wid"`, связывая видеопоток с поверхностью окна WebView2.
- **Предварительная инициализация окон:** окно `"mediainfo"` (565x685 px, `always_on_top: true`) предсоздается в скрытом виде (`visible: false`) на этапе старта.
- **Управление жизненным циклом и фокусом:**
  - Обработка `WindowEvent::Focused` для динамического Z-порядка в полноэкранном режиме (`Alt+Tab`).
  - Обработка `WindowEvent::CloseRequested` с сохранением позиции и гарантированным чистым выходом `window.app_handle().exit(0)`.
- Регистрирует все **103 IPC-команды** в `tauri::Builder`.

### 3.5. `mediainfo.rs`
- Нативное динамическое связывание с `mediainfo.dll` через `libloading` (C-API: `MediaInfo_New`, `MediaInfo_Open`, `MediaInfo_Inform`, `MediaInfo_Close`, `MediaInfo_Delete`).
- Управляет независимым окном MediaInfo через команды `open_mediainfo_window` и `toggle_mediainfo_window`.

---

## 4. Полный Реестр IPC-Команд Rust

В бэкенде зарегистрировано **103 IPC-команды**:

| Категория | IPC Команда | Параметры | Возвращает | Описание |
| :--- | :--- | :--- | :--- | :--- |
| **Апскейлинг и AI Модели (upscale/)** | `get_upscale_status` | — | `UpscaleStatus` | Получение статуса компонентов инференса и списка найденных ONNX-моделей |
| | `get_system_gpu_info` | — | `GpuHardwareInfo` | Аппаратный аудит видеокарты через DXGI: вендор, VRAM, SM-архитектура, рекомендации |
| | `scan_onnx_models` | — | `Vec<ModelFileItem>` | Сканирование папки `models/onnx/` и упорядоченный список моделей со слотами |
| | `open_models_folder` | — | `Result<(), String>` | Открытие папки моделей `models/onnx/` в Проводнике Windows |
| | `open_inference_folder` | — | `Result<(), String>` | Открытие каталога библиотек инференса `inference/` в Проводнике Windows |
| | `apply_upscale_settings` | `settings: UpscaleSettings` | `Result<(), String>` | Формирование `upscale.conf` и включение/выключение фильтра в mpv |
| | `download_inference_engine` | `engine: String` | `Result<String, String>` | Асинхронная потоковая загрузка и распаковка DirectML / TensorRT 11 |
| | `delete_inference_engine` | `backend: String` | `Result<String, String>` | Удаление библиотек выбранного бэкенда из каталога `inference/` |
| | `switch_upscale_network_hotkey` | `slot: u32, backend: Option<String>` | `Result<(), String>` | Мгновенное переключение нейросети/слота по хоткеям Shift+1..4 |
| | `precompile_model_engine_1080p` | `slot: u32, filename: String` | `Result<String, String>` | Фоновая компиляция `.engine` под 1080p через trtexec с отслеживанием прогресса |
| **Воспроизведение и Плейлист** | `open_file` | `path: String` | `Result<(), String>` | Загрузка файла в плеер + авто-создание плейлиста из папки |
| | `toggle_pause` | — | `Result<(), String>` | Переключение паузы (`cycle pause`) |
| | `set_pause` | `paused: bool` | `Result<(), String>` | Явная установка паузы (`yes` / `no`) |
| | `seek` | `seconds: f64` | `Result<(), String>` | Относительная перемотка (`relative+exact`) |
| | `seek_absolute` | `seconds: f64` | `Result<(), String>` | Переход к указанной секунде (`absolute+exact`) |
| | `frame_step` | — | `Result<(), String>` | Шаг на 1 кадр вперед |
| | `frame_back_step` | — | `Result<(), String>` | Шаг на 1 кадр назад |
| | `playlist_prev` | — | `Result<(), String>` | Переход к предыдущему файлу в плейлисте |
| | `playlist_next` | — | `Result<(), String>` | Переход к следующему файлу в плейлисте |
| | `get_playlist` | — | `Result<Vec<PlaylistItem>, String>` | Чтение элементов внутреннего плейлиста MPV |
| | `play_playlist_item` | `index: i64` | `Result<(), String>` | Воспроизведение файла плейлиста по индексу |
| | `set_loop_file` | `loop_file: String` | `Result<(), String>` | Зацикливание текущего файла (`inf` / `no`) |
| | `set_loop_playlist` | `loop_playlist: String` | `Result<(), String>` | Зацикливание всего плейлиста (`inf` / `no`) |
| | `toggle_shuffle` | — | `Result<(), String>` | Переключение случайного порядка плейлиста (`playlist-shuffle`) |
| | `get_play_next_on_end` | — | `Result<bool, String>` | Чтение статуса настройки автопереключения на следующее видео |
| | `set_play_next_on_end` | `enabled: bool` | `Result<(), String>` | Установка действия при завершении видео |
| **Громкость / Скорость** | `set_volume` | `volume: f64` | `Result<(), String>` | Установка громкости от 0.0 до 100.0 |
| | `set_speed` | `speed: f64` | `Result<(), String>` | Установка множителя скорости воспроизведения |
| **Дорожки и Извлечение** | `get_tracks` | — | `Result<Vec<TrackInfo>, String>` | Список дорожек (аудио, субтитры, видео) с ID, кодеком, ff-index и типом |
| | `set_audio_track` | `track_id: i64` | `Result<(), String>` | Переключение аудиодорожки по ID (`aid`) |
| | `set_subtitle_track` | `track_id: i64` | `Result<(), String>` | Переключение субтитров по ID (`sid`) |
| | `disable_subtitles` | — | `Result<(), String>` | Отключение субтитров (`sid = "no"`) |
| | `load_subtitle_file` | `path: String` | `Result<(), String>` | Подключение внешнего файла субтитров (`sub-add`) |
| | `load_audio_file` | `path: String` | `Result<(), String>` | Подключение внешнего аудиофайла (`audio-add`) |
| | `set_video_track` | `track_id: i64` | `Result<(), String>` | Переключение видеопотока по ID (`vid`) |
| | `extract_track` | `video_path, track_type, track_index, ff_index, external_filename, target_path` | `Result<String, String>` | Извлечение аудио/субтитров (Direct Stream Copy `-c copy`, многопоточный fallback `-threads 0`) |
| | `get_auto_load_tracks` | — | `Result<bool, String>` | Получение статуса автоподхвата внешних дорожек |
| | `set_auto_load_tracks` | `enabled: bool` | `Result<(), String>` | Включение/выключение автоподхвата внешних дорожек |
| | `get_auto_select_external_audio`| — | `Result<bool, String>` | Чтение статуса автовыбора внешней русской аудиодорожки |
| | `set_auto_select_external_audio`| `enabled: bool` | `Result<(), String>` | Настройка автовыбора внешней русской аудиодорожки |
| | `load_external_tracks_for_file` | `path: String` | `Result<(), String>` | Сканирование и подключение внешних аудио и субтитров |
| **Вид, Зумирование и Окно** | `set_aspect_ratio` | `ratio: String` | `Result<(), String>` | Установка соотношения сторон (`16:9`, `21:9`, `4:3`, `no`) |
| | `set_rotation` | `degrees: i64` | `Result<(), String>` | Поворот видеокадра (`0`, `90`, `180`, `270`) |
| | `set_video_zoom_and_pan` | `zoom: f64, pan_x: f64, pan_y: f64` | `Result<(), String>` | Аппаратный видеозум и панорамирование в mpv |
| | `get_video_zoom` | — | `Result<f64, String>` | Получение текущего коэффициента зума |
| | `get_video_dimensions` | — | `Result<VideoDimensions, String>` | Получение реальных размеров видео (ширина, высота, aspect) |
| | `toggle_fullscreen` | — | `Result<bool, String>` | Нативное безопасное переключение полноэкранного режима |
| **Скриншоты и Буфер** | `take_screenshot` | — | `Result<(), String>` | Сохранение текущего кадра без OSD (`screenshot video`) |
| | `copy_frame_to_clipboard` | — | `Result<(), String>` | Копирование текущего кадра в буфер обмена Windows |
| | `get_screenshot_dir` | — | `Result<String, String>` | Чтение текущей директории для скриншотов |
| | `set_screenshot_dir` | `path: String` | `Result<(), String>` | Изменение пути скриншотов с записью в `settings.json` |
| **Экземпляры Приложения** | `get_multi_instance` | — | `Result<bool, String>` | Проверка разрешения одновременного запуска нескольких окон |
| | `set_multi_instance` | `enabled: bool` | `Result<(), String>` | Включение/выключение режима нескольких экземпляров |
| **Главы** | `get_chapters` | — | `Result<Vec<ChapterInfo>, String>` | Получение списка всех глав текущего медиафайла |
| | `seek_chapter` | `index: i64` | `Result<(), String>` | Переход к главе по индексу (`chapter`) |
| **Метаданные и Позиция** | `get_playback_state` | — | `Result<PlaybackState, String>` | Динамический статус плеера (позиция, кадр, пауза, громкость, битрейт) |
| | `get_media_info` | — | `Result<MediaInfo, String>` | Полный статический снапшот файла (кодеки, разрешение, FPS, HDR, битрейт) |
| | `get_position` | — | `Result<f64, String>` | Текущее время воспроизведения (в секундах) |
| | `get_duration` | — | `Result<f64, String>` | Полная длительность видео (в секундах) |
| | `get_frame_number` | — | `Result<i64, String>` | Номер текущего кадра |
| | `get_frame_count` | — | `Result<i64, String>` | Общее количество кадров |
| | `get_fps` | — | `Result<f64, String>` | Частота кадров |
| | `get_last_position` | `path: String` | `Result<Option<f64>, String>` | Чтение сохранённой позиции воспроизведения из истории |
| | `save_position` | `path: String, position: f64` | `Result<(), String>` | Сохранение позиции воспроизведения в историю |
| | `save_current_position` | — | `Result<(), String>` | Принудительное сохранение текущей позиции |
| | `get_app_version` | — | `Result<String, String>` | Получение актуальной версии приложения |
| **Анализ MediaInfo (C-FFI)** | `get_detailed_media_info` | `path: String` | `Result<DetailedMediaInfo, String>` | Полный парсинг всех потоков и тегов через `mediainfo.dll` |
| | `is_standalone_mode` | — | `Result<bool, String>` | Определение, запущено ли окно в автономном режиме MediaInfo |
| | `get_standalone_mediainfo_path` | — | `Result<Option<String>, String>` | Получение пути к файлу для MediaInfo |
| | `open_mediainfo_window` | `path: String` | `Result<(), String>` | Открытие независимого окна MediaInfo с инспекцией файла |
| | `toggle_mediainfo_window` | `path: Option<String>` | `Result<bool, String>` | Переключение видимости независимого окна MediaInfo |
| **Интеграция с Windows** | `get_windows_accent_color` | — | `Result<Option<String>, String>` | Получение системного цвета акцента Windows |
| | `register_file_associations` | — | `Result<Vec<String>, String>` | Регистрация плеера и ассоциаций медиафайлов в Windows |
| | `unregister_file_associations` | — | `Result<Vec<String>, String>` | Полное удаление ассоциаций файлов и записей L-MPV из реестра |
| | `is_explorer_context_menu_registered` | — | `Result<bool, String>` | Проверка регистрации пунктов L-MPV в контекстном меню Проводника |
| | `register_explorer_context_menu` | — | `Result<(), String>` | Добавление пунктов воспроизведения и MediaInfo в меню Windows |
| | `unregister_explorer_context_menu` | — | `Result<(), String>` | Удаление пунктов L-MPV из контекстного меню Проводника |
| | `open_default_apps_settings` | — | `Result<(), String>` | Открытие параметров Windows «Приложения по умолчанию» |
| | `update_taskbar_progress` | `progress: f64, state: String` | `Result<(), String>` | Отображение прогресса видео на иконке панели задач Windows |
| **Подсветка полос (Ambient Light)** | `get_ambient_settings` | — | `Result<AmbientSettings, String>` | Получение текущего режима, радиуса размытия и цвета подсветки |
| | `apply_ambient_preview` | `settings: AmbientSettings` | `Result<(), String>` | Мгновенный 60fps предпросмотр шейдерных эффектов на GPU |
| | `set_ambient_settings` | `settings: AmbientSettings` | `Result<(), String>` | Применение и сохранение настроек подсветки черных полос |
| | `toggle_ambient_mode` | — | `Result<AmbientSettings, String>` | Циклическое быстрое переключение режима (Off -> Blur -> Color) |
| **Автообновление (In-App)** | `check_launch_and_update` | — | `Result<Option<UpdateInfo>, String>` | Фоновая проверка обновлений на GitHub |
| | `check_for_updates` | — | `Result<Option<UpdateInfo>, String>` | Ручная проверка релизов на GitHub с получением списка изменений |
| | `download_and_install_update` | `version: String, assets: Vec<AssetInfo>` | `Result<(), String>` | Скачивание бинарников, создание `update.bat` и автоперезапуск |
| | `postpone_update` | — | `Result<(), String>` | Откладывание проверки обновлений на 15 запусков |
| **Пресеты настроек и Файлы** | `get_settings_presets` | — | `Result<String, String>` | Чтение всех пресетов из индивидуальных файлов `config/presets/*.json` |
| | `save_settings_presets` | `presets_json: String` | `Result<(), String>` | Сохранение пресетов в отдельные файлы `config/presets/<имя>.json` |
| | `save_single_preset` | `file_name: String, preset_json: String` | `Result<String, String>` | Сохранение одиночного пресета в отдельный файл |
| | `delete_preset_file` | `file_name: String` | `Result<(), String>` | Удаление индивидуального файла пресета |
| | `rename_preset_file` | `old_name: String, new_name: String` | `Result<String, String>` | Переименование файла пресета в папке `config/presets/` |
| | `open_presets_folder` | — | `Result<(), String>` | Открытие портативной директории `config/presets/` в Проводнике |
| | `write_text_file` | `path: String, content: String` | `Result<(), String>` | Запись файла по произвольному пути диалога сохранения |
| | `read_text_file` | `path: String` | `Result<String, String>` | Чтение файла по произвольному пути диалога выбора файла |

---

## 5. Подробное Описание Всех Функций Плеера (User Capabilities)

### 5.1. Управление Воспроизведением и Плейлист
- **Открытие медиафайлов и Авто-плейлист:**
  - Нажатие `Ctrl+O` или выбор пункта *"Открыть файл..."* в контекстном меню.
  - При открытии файла плеер сканирует родительскую директорию, находит все видеофайлы, применяет естественную сортировку (**Natural Sort**) и фоново формирует плейлист.
  - В плейлисте отображаются реальные имена файлов с расширениями для однозначной идентификации релизов.
  - Быстрый переход по плейлисту через кнопки Предыдущий/Следующий файл на панели управления.
  - Боковая панель **Playlist Drawer** (горячие клавиши `L` / `P`): поиск, индикация текущего трека, подсветка и переключение по клику.
  - Поддержка Drag & Drop файлов и сетевых потоков (URL).
- **Режимы повтора и случайного воспроизведения:**
  - Кнопка Repeat на панели управления: переключение между режимами *«Без повтора»*, *«Повтор одного файла»* (`set_loop_file`), *«Повтор всего плейлиста»* (`set_loop_playlist`).
  - Кнопка Shuffle: случайный порядок воспроизведения файлов.
- **Пауза, Покадровая и Быстрая Перемотка:**
  - Пробел (`Space`), клик ЛКМ по видео, кнопка Play/Pause.
  - Покадровый шаг: клавиши `←` / `,` / `Б` (назад) и `→` / `.` / `Ю` (вперед) с OSD-счётчиком кадра.

### 5.2. Подсистема AI-Апскейлинга в 4K (Real-Time AI Upscaling)
- **Управление режимом:**
  - Вкладка **«Апскейлинг»** в Настройках (`F2`).
  - Переключатель режимов: **«Выкл»** и **«AI Upscaling»**. Пользователь самостоятельно включает апскейлинг при необходимости.
- **Аппаратное определение видеокарты (GPU DXGI):**
  - Автоматическое считывание параметров установленного графического процессора через DirectX Graphics Infrastructure (DXGI API).
  - Определение производителя (NVIDIA, AMD, Intel), модели, объема видеопамяти VRAM и архитектуры Streaming Multiprocessors (SM):
    - Blackwell (`sm120`): GeForce RTX 5090, 5080, 5070 Ti, 5070, 5060.
    - Ada Lovelace (`sm89`): GeForce RTX 4090, 4080, 4070, 4060, RTX Ada.
    - Ampere (`sm86` / `sm80`): GeForce RTX 3090, 3080, 3070, 3060, A100, RTX A-series.
    - Turing (`sm75`): GeForce RTX 2080, 2070, 2060, GTX 1660, 1650.
    - JIT Fallback (`ptx`): Универсальная компиляция для других чипов NVIDIA.
  - Автоматическая рекомендация подходящего бэкенда прямо в интерфейсе плеера (TensorRT для NVIDIA, DirectML для AMD и Intel).
- **Умный автоматический загрузчик компонентов («Скачать движок»):**
  - При нажатии пользователем кнопки **«Скачать движок»** плеер самостоятельно определяет все необходимые библиотеки и скачивает их:
    - **DirectML:**
      1. Базовые библиотеки моста `aji-windows-x64.zip` (`aji.dll`, `aji_dml.dll`).
      2. Официальный рантайм `Microsoft.ML.OnnxRuntime.DirectML` (`onnxruntime.dll`, `onnxruntime_providers_shared.dll`).
      3. Библиотека `Microsoft.AI.DirectML` (`DirectML.dll`).
    - **TensorRT:**
      1. Базовые библиотеки моста `aji-windows-x64.zip` (`aji.dll`, `aji_trt.dll`).
      2. Базовый рантайм NVIDIA TensorRT 11 (`component-trt-runtime.7z`: `nvinfer_11.dll`, `cudart64_13.dll`, `trtexec.exe`, `nvonnxparser_11.dll`).
      3. Архитектурный модуль билдера `component-trt-{sm}.7z`, точно соответствующий установленному видеоадаптеру (например, `component-trt-sm120.7z` для RTX 5070 Ti).
      4. Бесшумная распаковка архивов через встроенную в Windows утилиту `tar.exe` (`bsdtar`) в отдельном пуле `tokio::task::spawn_blocking` без появления черных окон консоли и без блокировки рабочего потока Tokio.
  - Строгая валидация статуса установки: движок отмечается как «Установлен» только при физическом наличии полного набора необходимых `.dll` файлов.
  - Интерактивная шкала прогресса: точное отображение процентов и скачанных мегабайт, аккуратный статус «Распаковка архива...» без скачков верстки и гарантированная фиксация 100% готовности с зеленой индикацией в течение 3 секунд перед скрытием.
  - Высокопроизводительное кэширование видеокарты (`OnceLock`) и IPC-стабильность: аппаратный опрос GPU через DirectX Graphics Infrastructure (DXGI) выполняется один раз с сохранением в памяти (`std::sync::OnceLock`), исключая дедлоки с `d3d11` видеодвижка; во фронтенде хук `refreshStatus` мемоизирован со стабильными зависимостями и дедупликацией параллельных запросов (`refreshInProgressRef`), что полностью исключает шторм IPC-вызовов и зависания UI-потока Windows при завершении загрузки.
- **Предварительная компиляция TensorRT под 1080p (.engine):**
  - Сборка нативного оптимизированного `.engine` файла из `.onnx` модели под разрешение 1080p -> 4K (память воркспейса 4096 МБ, optimization level 3) приоритетно через нативный `aji_harness.exe` (или резервный `trtexec.exe`).
  - Устраняет многосекундные задержки и паузы при первом воспроизведении видео в реальном времени.
  - Многоступенчатый фоновый мониторинг этапов компиляции по файлу журнала:
    1. Разбор структуры ONNX графа (`15%`);
    2. Построение профилей 1080p -> 4K (`28%`);
    3. Подбор тактик и ядер CUDA (`48%`);
    4. Глубокая оптимизация графа TensorRT (`68%`);
    5. Сериализация исполняемого `.engine` файла (`90%`);
    6. Валидация размера файла и подтверждение готовности (`100%`).
  - Удержание завершенного статуса «1080p движок готов!» в течение 3 секунд с последующим бесшовным переходом в статус-бейдж «1080p готов».
  - Возможность принудительной повторной перекомпиляции модели по кнопке `Refresh` при обновлении видеодрайвера.
- **Устранение артефактов цветного шума и полная совместимость моделей V1, V2 и V3 (Автоконвертация в FP16):**
  - *Суть проблемы:* Модель `2x_AnimeJaNai_V2_Compact_36k.onnx` работала корректно, в то время как модели поколения V3 (`2x_AnimeJaNai_HD_V3_Compact.onnx`, `2x_AnimeJaNai_HD_V3Sharp1_Compact.onnx`) и V1 выдавали артефакт плотной статической цветной сетки («радужный шум»), наложенной на искаженное изображение.
  - *Коренная причина:*
    1. Шейдеры видеофильтра `vf_animejanai` и ядро инференса `libaji` (`kernels.cu`, `aji_trt.cpp`) спроектированы для работы исключительно с числами половинной точности `__half` (IEEE 754-2008 FP16, 2 байта на элемент тензора).
    2. В TensorRT 11 действует строгая типизация графа (Strongly Typed ONNX), где ключ принудительного даункаста `--fp16` устарел и не переопределяет типы графа ONNX.
    3. Модель V2 изначально была экспортирована создателями в формате `FLOAT16` (`elem_type: 10`), тогда как модели V3 и V1 были экспортированы в формате `FLOAT` (`elem_type: 1`, FP32, 4 байта). В результате TRT 11 компилировал движок в FP32. Шейдер `libaji`, считывая 16-битные полуслова из 32-битного буфера, получал двукратный сдвиг адресации памяти и рассинхронизацию каналов цветности, вызывая сильнейшую цветную рябь.
  - *Инженерное решение:* В модуль `src-tauri/src/upscale/engine_builder.rs` внедрен алгоритм автоматической валидации и приведения типов `ensure_onnx_model_fp16`. Перед сборкой движка модель инспектируется, и при обнаружении FP32-типов граф модели и все константные веса на лету конвертируются в чистый IEEE Float16. Это гарантирует построение корректного FP16 `.engine` файла и безупречную работу моделей V1, V2, V3 и любых пользовательских ONNX-моделей.
- **Точная адресация архитектур GPU NVIDIA (Blackwell SM120 vs SM12, Ada SM89 vs SM8):**
  - *Разделение уровней именования:*
    1. Имена дистрибутивных архивов на GitHub: `component-trt-sm120.7z` (Blackwell / RTX 50xx), `component-trt-sm89.7z` (Ada Lovelace / RTX 40xx), `component-trt-sm86.7z` (Ampere / RTX 30xx), `component-trt-sm75.7z` (Turing / RTX 20xx). Попытки запроса архивов с усеченным именем (например, `sm12.7z` или `sm8.7z`) приводили к ошибке HTTP 404 и откату на универсальный PTX-компилятор, падавший на чипах Blackwell.
    2. Имена скомпилированных файлов `.engine` внутри `libaji`: токен генерации имени в `aji_trt.cpp:gpu_token()` использует только старшую цифру мажорной версии Compute Capability (`prop.major`): `-sm12` для Blackwell (12.0), `-sm8` для Ada/Ampere (8.x), `-sm7` для Turing (7.x).
  - *Реализация:* В `hardware.rs` внедрен прямой опрос `nvidia-smi --query-gpu=compute_cap`, возвращающий точный CC (например, `12.0` -> `sm120`). Загрузчик `downloader.rs` скачивает полноценный архив `component-trt-sm120.7z`, а модуль `engine_builder.rs` формирует суффикс `-sm12`, обеспечивая 100% совпадение имени файла с поисковым токеном `libaji` и предотвращая холостые сбои компиляции.
- **Нативная компиляция через `aji_harness.exe` и Безопасная Работа с Логами:**
  - Предварительная компиляция вызывает нативный харнесс `aji_harness.exe` с передачей аргументов `--slot <слот>` и пути к `upscale.conf`.
  - Харнесс автоматически выставляет хэш конфигурации оптимизации (например, `780037328`), генерирует динамические профили `dyn-HW` и собирает файл с эталонными параметрами для `aji_trt.dll`.
  - Устранена коллизия дескрипторов файлов логов: `aji_harness.exe` самостоятельно ведет запись в `*.log`; процесс в Rust запускается с независимыми потоками ввода-вывода, а модуль мониторинга асинхронно считывает файл журнала, исключая перезапись логов пустыми байтами при завершении процесса.
- **Универсальная библиотека ONNX моделей (`models/onnx/`):**
  - Пользователь может поместить любые свои `.onnx` модели в папку `models/onnx/`.
  - Кнопка **«Папка моделей»** открывает директорию в Проводнике Windows.
  - Кнопка скрытия/отображения названий моделей (маскировка точками для компактного вида).
  - Автоматическое обновление списка при возврате фокуса в плеер.
- **Горячие клавиши переключения видов нейросетей на лету:**
  - `Shift+1` — Выключить апскейлинг.
  - `Shift+2` — Включить апскейл и выбрать Нейросеть #1.
  - `Shift+3` — Включить апскейл и выбрать Нейросеть #2.
  - `Shift+4` — Включить апскейл и выбрать Нейросеть #3.
  - Мгновенный вывод OSD-уведомления с реальным названием активированной модели.
  - Принудительная перерисовка кадра на паузе при переключении или включении апскейлинга.

### 5.3. Студийный Аудио-Визуалайзер (WASAPI Loopback Capture / FFT 1024)
- **Спектральный анализ:** Нативный захват системного звука через Windows WASAPI Loopback Capture в фоновом Rust-потоке с вычислением 1024-точечного БПФ (Cooley-Tukey Radix-2 FFT) со сглаживающим окном Ханна.
- **32 частотные полосы:** Логарифмическое распределение от 25 Гц до 19 000 Гц.
- **Сведение 5.1/7.1 Surround:** Подмешивание LFE канала сабвуфера и центрального канала голоса.
- **3 стиля:** `Waveform`, `Spectrum`, `Bars`.
- **0.0% CPU в IDLE:** При скрытии контролов или паузе захват звука засыпает.

### 5.4. Аппаратная Подсветка Полос (Ambient Light / GPU Blur)
- Устранение черных полос при несоответствии пропорций экрана и видео.
- 3 режима: `Off`, `Blur` (GPU шейдерное размытие кадра), `Color` (акцентная заливка).
- Быстрое переключение по горячей клавише `B`.

### 5.5. Извлечение и Экспорт Дорожек (FFmpeg Track Extraction)
- Кнопки скачивания аудио и субтитров прямо в меню дорожек.
- Direct Stream Copy (`-c copy`) без потери качества.

### 5.6. Анализ Свойств Медиаконтейнера (MediaInfo C-API)
- Нативное независимое окно 565x685 px с поддержкой Always on Top, Drag & Drop, поиска (Ctrl+F), экспорта в .txt.
- Автономный запуск из контекстного меню Проводника Windows.

### 5.7. Модульная Система Пресетов Настроек
- Индивидуальные файлы `config/presets/<название_пресета>.json`.
- Импорт и экспорт через системный Проводник Windows.

### 5.8. Единая Дизайн-Система Компонентов, Шрифтовая Экосистема и Эргономика UI
- **Иерархия поверхностей (Elevation Surfaces):**
  - **Level 1 (`.glass-panel`):** Главные парящие панели интерфейса, модальные окна, выпадающие меню с тяжелым размытием `backdrop-filter: blur(28px)`.
  - **Level 2 (`.glass-section`):** Родительские секции и группирующие блоки с полупрозрачной заливкой `rgba(255, 255, 255, 0.025)` и субтильной рамкой.
  - **Level 3 (`.glass-tile`):** Интерактивные плитки опций, карточки бэкендов, модели нейросетей с физическим откликом `translateY(-1px)` и микроанимацией нажатия.
  - **Активное состояние (`.glass-tile--active`):** Динамическая интеграция с текущей цветовой темой через CSS-переменные `var(--accent)` и `var(--accent-glow)`.
- **Унифицированная система кнопок (`.btn`):**
  - `.btn--primary` — главные акцентные действия с неоновым свечением.
  - `.btn--secondary` — стандартные светлые кнопки с легкой подсветкой при наведении.
  - `.btn--ghost` — прозрачные кнопки второстепенных действий.
  - `.btn--danger` — деструктивные операции (удаление файлов, очистка).
  - `.btn--icon` — стандартизированные квадратные кнопки для пиктограмм (34x34 px и 28x28 px).
- **Единые статусные бейджи (`.badge`) и хоткей-чипы (`.kbd-chip`):**
  - Цветовая семантика: `.badge--success` (зеленый), `.badge--warning` (янтарный), `.badge--danger` (красный), `.badge--accent` (акцентная тема).
  - Клавиатурные колпачки `.kbd-chip` с поддержкой моноширинного шрифта и активного состояния записи `.kbd-chip--recording`.
- **Шрифтовая экосистема из 6 гарнитур (UI Fonts):**
  - **Inter:** Стандартный гротеск для максимальной читаемости и четкости.
  - **Системный:** Нативный шрифт операционной системы (Segoe UI / San Francisco / Roboto).
  - **Outfit:** Геометричный футуристичный стиль премиум-класса.
  - **Plus Jakarta Sans:** Утончённый плавный нео-гротеск для кинопросмотра.
  - **Manrope:** Сбалансированный современный швейцарский полугеометрический гротеск.
  - **JetBrains Mono:** Инженерный моноширинный шрифт для точных данных и таймингов.
  - Мгновенное переключение во вкладке «Кастомизация» Настроек с живым сохранением в `localStorage` и синхронизацией между всеми окнами через событие `l-mpv-ui-font-changed`.
- **11 Цветовых Тем Плеера и Выкатные Pill-Метки:**
  - *Тёмный графит*, *Discord Gray*, *Глубокий OLED*, *Сапфировая полночь*, *Холодный Норд*, *Лавандовый индиго*, *Тёмный изумруд*, *Лесной шалфей*, *Мятный нефрит*, *Аметист*, *Коралловый закат*.
  - Выкатные интерактивные pill-метки в 1 ряд с идеальной калибровкой настоящих цветов кружков (`dotColor`), отражающих эстетику фона каждой темы.
- **Оптимизированная Строка Таймлайна со Временем Справа (`.timeline-row`):**
  - Перенос компонента `<TimeDisplay />` из тулбара управления непосредственно на строку таймлайна справа от полосы прогресса.
  - Адаптивное сжатие полного и компактного времени при изменении размера окна, разгружающее кнопки нижнего тулбара.
- **Динамическая Система Скругления (UI Corner Radius):**
  - 4 уровня скругления (*Без скругления 0px*, *Умеренное 8px*, *Закругленное 14px*, *Овальное 20px/Pill*) с сквозным обновлением CSS-переменных `--radius-controls`, `--radius-md`, `--radius-sm` для всех окон, кнопок и модалок плеера.

### 5.9. Софтверное Усиление Громкости до 150% (Audio Boost)
- **Аппаратный и программный запас мощности:** интеграция `volume-max: 150.0` в mpv_manager с чистым выводом WASAPI без клиппинга.
- **Полная интеграция в UI:** регулятор громкости и OSD поддерживают плавное изменение от 0 до 150% колесиком мыши и горячими клавишами (`ArrowUp` / `ArrowDown`).
- **Трехзначная верстка:** автоматическое расширение счетчика процентов в тулбаре для предотвращения сдвига кнопок при громкости `> 100%`.

### 5.10. Умное Скрытие Всего Интерфейса в Полноэкранном Режиме
- **Режим кинематографичного фокуса:** опциональная настройка в категории «Основные» для автоматического мгновенного скрытия всего интерфейса (верхней шапки Titlebar и нижней панели управления), когда курсор мыши подводится к самому верху экрана (зона шапки / верхние 65 px).
- **Мгновенный возврат:** интерфейс моментально плавно возвращается, как только курсор опускается в рабочую область.

### 5.11. Многоуровневая Защитная Адаптивность Панели Управления (Container Queries)
- **Предотвращение вылета кнопок:** использование `minmax(0, 1fr)` в CSS Grid и `min-width: 0` для контейнеров кнопок.
- **Многоступенчатая оптимизация пространства:**
  - `1040px`: плавное ужимание плашек названий дорожек (`max-width: 80px`).
  - `920px`: скрытие текстовых подписей дорожек и компактное сужение аудио-визуализатора.
  - `780px`: плавное скрытие визуализатора и низкоприоритетных кнопок тулбара.
  - `580px`, `460px`, `340px`: ступенчатый переход в ультракомпактный режим.

---

## 6. Инструкция по Сборке и Релизу

### Необходимые зависимости
- **Node.js** v20+ и **npm**.
- **Rust toolchain** (`stable-x86_64-pc-windows-msvc`).
- Библиотеки в корне или `src-tauri/`:
  - `libmpv-2.dll` (сборка `the-database/mpv-winbuild` с `vf_animejanai`).
  - `ffmpeg.exe` (gyan.dev).
  - `mediainfo.dll` (MediaArea).

### Сборка приложения
```bash
# 1. Установка зависимостей фронтенда
npm install

# 2. Быстрая сборка автономного .exe без создания инсталлятора (фронтенд встраивается автоматически):
npm run build:exe
# (или напрямую: npm run tauri build -- --no-bundle)

# 3. Полная сборка с созданием NSIS-инсталлятора:
npm run build:bundle
# (или напрямую: npm run tauri build)
```

Готовый файл располагается по пути: `src-tauri/target/release/l-mpv.exe`.

### Копирование в портативную сборку
```powershell
Copy-Item -Path "src-tauri/target/release/l-mpv.exe" -Destination "Portable-L-MPV/L-MPV.exe" -Force
```

---

## 7. CI/CD и Автоматическая Публикация Релизов (GitHub Actions)

### 7.1. Сборщик зависимостей (`upload-dependencies.yml`)
- Автоматически скачивает свежую сборку `libmpv-2.dll` из репозитория `the-database/mpv-winbuild` с фильтром `vf_animejanai`, `ffmpeg.exe` и `mediainfo.dll`.
- Запаковывает их в `mpv_libs.zip` и публикует в релиз `deps-v1`.

### 7.2. Рабочий процесс релиза (`release.yml`)
1. `actions/checkout@v4` — получение кода.
2. `actions/setup-node@v4` и `rust-toolchain@stable`.
3. Скачивание `mpv_libs.zip` из релиза `deps-v1`, распаковка в `src-tauri/` и корень, строгая валидация наличия всех трех компонентов (`libmpv-2.dll` с `vf_animejanai`, `ffmpeg.exe`, `mediainfo.dll`).
4. Синхронизация версии из Git-тега в `package.json` и `Cargo.toml`.
5. Сборка и публикация инсталлятора NSIS через `tauri-apps/tauri-action@v0`.
6. Сборка полного портативного архива `L-MPV-v<версия>-portable.zip` со всеми нативными библиотеками и структурой папок (`models/onnx`, `inference`, `config`, `screenshots`), а также загрузка автономного `L-MPV.exe` через `gh release upload`.
