<p align="center">
  <img src="./L-MPV%20-%20Banner%20U.png" alt="L-MPV Banner" width="100%" style="border-radius: 12px;">
</p>

<h1 align="center">🎬 L-MPV — Modern & Portable Media Player</h1>

<p align="center">
  <b>Высокопроизводительный, эстетичный и 100% портативный медиаплеер нового поколения.</b><br>
  Построена на базе <b>Tauri v2</b>, <b>React 19</b> и нативного движка <b>libmpv</b> (C-FFI).
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2.0-blue?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2">
  <img src="https://img.shields.io/badge/React-19.1-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Rust-2021-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/MPV-libmpv--2-red?style=for-the-badge&logo=mpv&logoColor=white" alt="libmpv">
  <img src="https://img.shields.io/badge/Platform-Windows%20x64-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
</p>

---

## 🌟 Описание проекта

**L-MPV** сочетает в себе всю мощь нативного аппаратно-ускоренного видео-рендеринга **MPV** (`gpu-hq`, `d3d11`, HDR, `ewa_lanczossharp`) и современный элегантный интерфейс в стиле **Glassmorphism**, созданный на **React 19** и **TypeScript**.

Приложение разработано по концепции **Zero-Install Portable Architecture**: плеер абсолютно отвязан от системного реестра и внешних папок Windows. Все конфигурации, скриншоты и нативные бинарные библиотеки хранятся локально в одной папке.

---

## ✨ Ключевые Особенности

- ⚡ **Аппаратный Рендеринг и GPU-HQ**:
  - Высококачественная профилизация `profile=gpu-hq` с обработкой цветности `ewa_lanczossharp` и `mitchell`.
  - Поддержка `D3D11`, `hwdec=auto-safe`, авто-распознавание HDR (`target-colorspace-hint`, `tone-mapping`).
  - Прямой вывод видеопотока на HWND окна Webview2 через C-FFI с нулевой задержкой.

- 🎨 **Современный Glassmorphic UX/UI**:
  - Минималистичная плавающая панель управления («таблетка») с адаптивными акцентными цветами (**Amber**, **Pink** и др.).
  - Умная система бездействия (**IDLE**): интерфейс плавно скрывается при просмотре и не гаснет, если курсор находится над органами управления или открыты модальные окна.
  - Кастомное ПКМ контекстное меню для быстрой настройки видео, звука, масштаба и дорожек.

- 📦 **100% Портативная Архитектура**:
  - Полная автономность без установки в систему.
  - Автоматическое определение локальных путей во время исполнения (`current_exe().parent()`).
  - Сохранение настроек в `config/settings.json` и чистых кадров в `screenshots/`.

- 🔍 **Аппаратный Zoom & Pan (Масштабирование)**:
  - Центрированный плавающий зум кадра по комбинации `Ctrl` + Колесо мыши (с частотой до 60 FPS).
  - Магнитная привязка к исходному размеру (100%) и мгновенный сброс по `Ctrl + 0`.

- 🎞️ **Покадровая Точность & Главы (Chapters)**:
  - Точный шаг назад/вперед на 1 кадр по клавишам `←` / `→` (или `,` / `.`) с информативным OSD-уведомлением.
  - Полная навигация по главам файла с интерактивным превью времени.

- 🎶 **Управление Плейлистом**:
  - Автоматическое фоновое сканирование папки открытого файла и создание единого плейлиста.
  - Выдвижная боковая панель **Playlist Drawer** (`L` / `P`) с мгновенным поиском и фильтрацией.
  - Перетаскивание видео и аудио файлов прямым **Drag & Drop**.

- 📸 **Чистые Скриншоты**:
  - Мгновенное сохранение исходного кадра в высоком качестве (PNG) без OSD по нажатию `S`.

- ⚙️ **Кастомизация Горячих Клавиш и Ассоциаций**:
  - Модальное окно настроек `SettingsModal` с возможностью перепривязки любой горячей клавиши и сбросом по умолчанию.
  - Быстрая регистрация и удаление ассоциаций видео/аудио файлов в Windows в один клик.

---

## 🏗️ Стек Технологий

<table>
  <tr>
    <th>Компонент</th>
    <th>Используемые Технологии</th>
  </tr>
  <tr>
    <td><b>Frontend</b></td>
    <td>React 19, TypeScript 5.8, Vite 7, Lucide Icons, Vanilla CSS (Design Tokens, Glassmorphism)</td>
  </tr>
  <tr>
    <td><b>Backend & Shell</b></td>
    <td>Rust (2021 edition), Tauri v2 framework</td>
  </tr>
  <tr>
    <td><b>Media Engine</b></td>
    <td><code>libmpv-2.dll</code> / <code>mpv-2.dll</code> via FFI (<code>libloading</code> crate)</td>
  </tr>
  <tr>
    <td><b>Ось & Платформа</b></td>
    <td>Windows 10 / 11 x64 (Direct3D 11, HWDEC auto-safe)</td>
  </tr>
</table>

---

## 📂 Структура Проекта

```text
L-MPV/
├── L-MPV - Banner U.png                 # Главный баннер проекта
├── src/                                  # Фронтенд (React 19 + TypeScript)
│   ├── components/                       # UI Компоненты
│   │   ├── Titlebar.tsx                  # Кастомная шапка окна
│   │   ├── PlayerControls.tsx            # Плавающая панель управления
│   │   ├── ContextMenu.tsx               # Кастомное контекстное ПКМ-меню
│   │   ├── SettingsModal.tsx             # Настройки (скриншоты, цвета, хоткеи, ассоциации)
│   │   ├── MediaInfoModal.tsx            # Техническая информация о видео
│   │   ├── ChaptersModal.tsx             # Навигация по главам
│   │   └── PlaylistDrawer.tsx            # Боковая панель плейлиста
│   ├── contexts/                         # React-контекст (PlayerStateContext)
│   ├── utils/                            # Цветовые палитры и хоткеи
│   ├── App.tsx                           # Главный контейнер приложения
│   └── index.css                         # Design System & Glassmorphism стили
├── src-tauri/                            # Бэкенд (Rust + Tauri v2)
│   ├── src/
│   │   ├── main.rs                       # Точка входа Rust
│   │   ├── lib.rs                        # Привязка HWND и 38 IPC-команд
│   │   ├── mpv_manager.rs                # FFI-оберчик libmpv (GPU-HQ, D3D11, HDR)
│   │   └── commands.rs                   # 38 #[tauri::command] обработчиков
│   ├── Cargo.toml                        # Зависимости Rust
│   └── tauri.conf.json                   # Конфигурация Tauri v2
└── Portable-L-MPV/                       # Готовая портативная сборка
    ├── L-MPV.exe                         # Исполняемый файл плеера
    ├── mpv-2.dll                         # Нативная библиотека MPV
    ├── config/                           # Локальные настройки (settings.json)
    └── screenshots/                      # Директория сохранения снимков
```

---

## ⌨️ Горячие Клавиши (Default Hotkeys)

| Функция | Клавиши по умолчанию |
| :--- | :--- |
| **Воспроизведение / Пауза** | `Space` или Клик ЛКМ по видео |
| **Покадровый шаг назад / вперед** | `←` / `,` / `Б` и `→` / `.` / `Ю` |
| **Перемотка ±10 секунд** | Кнопки на панели / Таймлайн |
| **Громкость ±5%** | Колесо мыши над видео / Слайдер |
| **Масштабирование (Zoom & Pan)** | `Ctrl` + Колесо мыши |
| **Сброс масштаба к 100%** | `Ctrl + 0` |
| **Полноэкранный режим** | `F` или Двойной клик ЛКМ |
| **Открыть файл** | `Ctrl + O` |
| **Панель плейлиста** | `L` или `P` |
| **Сделать скриншот** | `S` или `Ы` |
| **Окно настроек** | Иконка шестеренки / ПКМ-меню |

*(Все клавиши можно легко перепривязать в окне **Настроек**).*

---

## 🚀 Сборка и Запуск

### Требования к окружению
- **Node.js** v18+ и **npm**
- **Rust** (toolchain `x86_64-pc-windows-msvc`)
- Нативная библиотека `libmpv-2.dll` в директории приложения

### Режим разработки (Dev)
```bash
# Установка зависимостей
npm install

# Запуск Vite + Tauri в режиме live-reload
npm run tauri dev
```

### Сборка Портативного Релиза (Production Build)
```bash
# Компиляция исполняемого файла
npm run tauri build
```

Готовый бинарный файл создается по пути `src-tauri/target/release/l-mpv.exe`. Для формирования портативного дистрибутива скопируйте файл в папку `Portable-L-MPV/L-MPV.exe`.

---

## ⚡ IPC-Архитектура (Rust ↔ React)

Бэкенд L-MPV предоставляет **38 высокой степени оптимизации IPC-команд**, включая:
- Управление воспроизведением (`open_file`, `toggle_pause`, `seek`, `frame_step`, `playlist_next`).
- Дорожки и Субтитры (`get_tracks`, `set_audio_track`, `set_subtitle_track`, `load_subtitle_file`).
- Аппаратное масштабирование (`set_video_zoom_and_pan`, `get_video_zoom`).
- Системные интеграции Windows (`register_file_associations`, `unregister_file_associations`).

---

## 📄 Лицензия

Проект распространяется под лицензией **MIT**. 

---

<p align="center">
  Сделано с любовью к качественному видео и чистому коду 🚀
</p>
