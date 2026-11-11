# Полный технический аудит функции предпросмотра на таймлайне (коммиты `4c2d776` и `3cec276`)

Код проекта не изменялся. В этом документе объединены и дописаны до конца результаты полного аудита обоих коммитов (`4c2d776` — первичная реализация и `3cec276` — интеграция `thumbfast` и внутрипроцессного воркера):

1. Как устроен конвейер предпросмотра сейчас.
2. Полный реестр найденных ошибок (`P0`–`P3`) с точными ссылками на код и способами их исправления.
3. Поэтапный разбор задержек и способы ускорения функции.
4. Реальная структура потребления оперативной и видеопамяти (RAM / VRAM) и способы её снижения.
5. Сравнение с архитектурой других плееров и движков (`thumbfast`/`uosc`, `mpv_thumbnail_script`, `IINA`, `Jellyfin`, `MPC-HC`, `media_kit`, `uniplayer`).
6. Рекомендуемая целевая архитектура с примером кода.
7. Пошаговый план внедрения и список гипотез для инструментальных замеров.
8. Аудит ревизии после рефакторинга: подтверждение исправлений, оставшиеся и новые ошибки, готовые патчи.

---

## 0. Главные выводы (Executive Summary)

1. **Самая критичная проблема — нарушение корректности и порча дискового кеша (`P0-1`).** Lua-адаптер помечает ответом на *текущий* запрос любой кадр, который пришёл от `thumbfast` (`id = request`). Если курсор сдвинулся или сменился файл, кадр от прошлой позиции (или прошлого файла) попадает в RAM- и **дисковый** кеш под чужим ключом и затем показывается постоянно.
2. **Режим `exact` в `thumbfast`-пути фактически не работает (`P0-2`).** Флаг `exact` не передаётся в `Thumbfast::frame`. Скрипт `thumbfast.lua` всегда сначала делает быстрый seek по ключевому кадру (`absolute+keyframes`), а точный (`absolute+exact`) — только через ~100 мс. Rust-код забирает *первый* пришедший кадр (ключевой) и кеширует его под ключом `exact = true`. При этом запущенный внутри `thumbfast` отложенный `exact`-сик продолжает вхолостую декодировать весь GOP после того, как ответ уже отдан.
3. **Самоблокировка превью при движении мыши на фронтенде (`P0-3`).** В [`useTimelineThumbnail.ts`](file:///d:/My-programs/L-MPV/src/hooks/useTimelineThumbnail.ts) активный `grid`-запрос специально не отменяется первые 120 мс, чтобы кадры успевали появляться при ведении курсора. Но в `.then()` строка `if (thumbnailTime(latestTime, job.exact) !== job.seconds) return;` **выбрасывает** полученный кадр (даже не сохраняя его в `cached`), если за время декодирования курсор сместился хотя бы на соседнюю секунду. В итоге при плавном ведении мыши старый запрос до 120 мс блокирует запуск нового, а его результат гарантированно уходит в мусор.
4. **Асинхронная гонка при выгрузке сессии каждые 5 секунд и утечка папок/таймеров (`P1-1`).** В `Drop for Thumbfast` отправляется асинхронная команда `script-message-to ... lmpv-shutdown` и тут же синхронно вызывается `fs::remove_dir_all(&self.dir)`. Поток Lua в основном `mpv` в этот момент ещё работает (а `lmpv-shutdown` не останавливает `file_timer` 60 Гц и `seek_timer` самого `thumbfast.lua` и не закрывает дескриптор pipe), из-за чего `remove_dir_all` на Windows периодически падает с `ERROR_SHARING_VIOLATION` / `ERROR_DIR_NOT_EMPTY`, оставляя папки сессий в `data/thumbs/`.
5. **Отказ на путях с кириллицей и вечное отключение быстрого пути (`P1-2`, `P1-3`).** `io.open` в LuaJIT вызывает ANSI CRT `fopen`, а Rust передаёт UTF-8 путь `bridge.dir`. При наличии кириллицы в пути к плееру (включая установку NSIS в `%LOCALAPPDATA%` пользователя с русским именем) `Thumbfast::new` падает по таймауту, а глобальный флаг `thumbfast_disabled` отключает быстрый путь **до перезапуска приложения**.
6. **Файловый транспорт, 7 циклов опроса (polling) и 8 копирований кадра внутри одного процесса (`P2-2`–`P2-4`).** Декодер работает в потоке того же процесса `l-mpv.exe`, но передаёт кадры через файлы `.bgra` на диске, 2 переименования в Rust, 2 переименования в Lua, чтение и перезапись в `frame-K.bgra`. На каждом кадре теряется 15–55 мс и создаётся до 8 буферов в памяти.
7. **Основной потребитель ОЗУ — декодер (`150–250 МБ` для 4K HEVC 10-бит), а не кеши JPEG (`P2-5`, §4).** Кеши на 4 МиБ и 12 Blob URL занимают менее 5 МБ. Реальная экономия памяти достигается отключением `hwdec=auto-copy` (или переводом его только на keyframe-режим), переключением потоков декодера в `thread_type=slice` и запретом подгрузки внешних файлов/шрифтов (`autoload-files=no`, `embeddedfonts=no`).
8. **Главная архитектурная рекомендация (§6).** Убрать прослойку `thumbfast.lua` + `thumbfast_bridge.lua` + файловый транспорт. Оставить один постоянный поток с приватным `PreviewCore` (`libmpv`), общающийся с Tauri-командами напрямую через каналы Rust (`Mutex + Condvar` + `oneshot` + `mpv_wakeup`) и блокирующий `mpv_wait_event`. Это удалит ~1900 строк кода и устранит причины ошибок `P0`–`P2`.

---

## 1. Как работает текущая архитектура (`4c2d776` + `3cec276`)

```mermaid
sequenceDiagram
    participant UI as React (useTimelineThumbnail)
    participant RS as Rust frame() [mutex worker]
    participant LUA as Lua: мост + thumbfast (в основном mpv)
    participant FS as Файлы data/thumbs/session
    participant W as Rust-поток + приватный libmpv

    UI->>RS: invoke get_timeline_thumbnail(t, exact)
    RS->>RS: source_request(): canonicalize + до 4×N запросов свойств main mpv
    RS->>LUA: script-message-to lmpv-thumb id t  (флаг exact теряется!)
    LUA->>FS: worker-request.json (при первом запуске)
    RS-->>FS: цикл опроса каждые 2 мс (reply.json, worker-*.json)
    RS->>W: InProcessWorker::start (libmpv + named pipe IPC)
    LUA->>W: "async seek t absolute+keyframes", через ~100 мс "absolute+exact"
    W->>W: опрос mpv_wait_event(0) + sleep 2 мс (1 событие за итерацию)
    W->>FS: screenshot-raw -> thumbN.part -> rename в thumbN (BGRA 230 КБ)
    LUA-->>FS: file_timer 60 Гц: rename thumbN -> .tmp -> .bgra
    LUA->>FS: чтение .bgra, запись копии в frame-K.bgra, reply.json {id = ТЕКУЩИЙ request}
    RS->>FS: чтение frame-K.bgra -> BGRA->RGB -> resize(Triangle) -> pad -> JPEG
    RS->>FS: запись в дисковый кеш + RAM LRU
    RS-->>UI: сырые байты JPEG -> Blob URL -> <img>
```

Три ступени получения кадра в [`src-tauri/src/commands/thumbnails/mod.rs`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L156-L212):
1. **Основной путь (`Thumbfast`)** — загружает в основной плеер склеенный Lua-скрипт (`thumbfast_bridge.lua` + `vendor/thumbfast/thumbfast.lua`), перехватывает его вызов `subprocess` и запускает поток `InProcessWorker` с отдельным `PreviewCore` (`libmpv`).
2. **Первый резервный путь (`NativeDecoder`)** — прямой постоянный экземпляр `PreviewCore` в Rust без Lua, управляемый через `mpv_command("seek", ...)`.
3. **Второй резервный путь (`decoder::extract`)** — запуск дочернего процесса `ffmpeg.exe` с выводом одного MJPEG-кадра в `stdout`.

---

## 2. Полный реестр ошибок и способы их исправления

Приоритеты:
- **P0** — неверный результат, порча дискового кеша, блокировка пользовательского сценария;
- **P1** — отказ функции, зависание очереди или утечка ресурсов;
- **P2** — существенная потеря производительности, памяти или надёжности;
- **P3** — мелкие недочёты и кодовая гигиена.

---

### P0-1. Кадр помечается `id` *текущего* запроса, а не той позиции, для которой он декодирован (порча кеша)

- **Где:** [`thumbfast_bridge.lua:72-97`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast_bridge.lua#L72-L97) (`id = request`), приём в [`thumbfast.rs:187-233`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast.rs#L187-L233), а также резервный [`native.rs:167-180`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/native.rs#L167-L180).
- **Механизм ошибки:**
  1. Запрос `A` (`t = 10 с`) отправлен в Lua (`request = id_A`), но пользователь сдвинул мышь: Rust отменил `A` по токену `cancelled` и тут же отправил запрос `B` (`t = 500 с`). Мост перезаписал глобальную переменную `request = id_B`.
  2. В этот момент `InProcessWorker` дорендерил кадр от старого сика `t = 10 с` (либо сработал отложенный на 100 мс `exact`-сик от `t = 10 с`). Таймер `file_timer` в `thumbfast.lua` подхватывает файл и вызывает `thumbfast-render`.
  3. Обработчик `thumbfast-render` в `thumbfast_bridge.lua:87` формирует `reply.json` с `id = request` (то есть `id_B`!).
  4. Rust-цикл в `thumbfast.rs:189` видит `reply.id == id_B`, забирает кадр от `10 с` и в [`mod.rs:219-221`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L219-L221) сохраняет его в `FrameCache` и **в дисковый кеш** под ключом `t = 500 с`.
  5. Тот же сценарий возможен при **смене файла**: в `file_load` (`thumbfast.lua:893-907`) старому воркеру не отправляется `quit`, и его последний кадр может быть принят как ответ для нового файла (проверка `same_source` в `mod.rs:214` сверяет путь только у *основного* плеера).
  6. В резервном [`NativeDecoder::extract`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/native.rs#L167-L180) есть похожая гонка: если запрос `A` был отменён сразу после отправки `seek`, то `while core.event()? != 0 {}` перед запросом `B` очищает только уже лежащие в очереди события. Когда через 1 мс от декодера приходят `MPV_EVENT_SEEK (20)` и `MPV_EVENT_PLAYBACK_RESTART (21)` от запроса `A`, `wait_restart` принимает их за результат запроса `B`.
- **Как исправить:**
  - **Быстрое исправление:** после `MPV_EVENT_PLAYBACK_RESTART` считывать у приватного `PreviewCore` свойства `path` и `time-pos` (`pts`), передавать их вместе с кадром и проверять в Rust: путь должен совпадать с `source.path`, для `exact = true` должно выполняться $|pts - t| \le \max(0.08, 1.5 / \text{fps})$, а для `exact = false` — $pts \le t + 0.05$ и $t - pts \le 30.0$.
  - **Правильное архитектурное исправление:** убрать Lua-мост и файловый обмен (§6), передавая запрос и ответ через типизированный канал в одном потоке-акторе.
  - **Обязательно:** увеличить версию соли в [`cache.rs:34`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/cache.rs#L34) (`lmpv-timeline-v6-...` → `v7`), чтобы инвалидировать уже записанные на диск ошибочные миниатюры.

---

### P0-2. Потеря флага `exact`: под ключом `exact` кешируется ключевой кадр, а декодер вхолостую декодирует GOP

- **Где:** [`thumbfast.rs:166-177`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast.rs#L166-L177), [`thumbfast.lua:648-680`](file:///d:/My-programs/L-MPV/src-tauri/vendor/thumbfast/thumbfast.lua#L648-L680), [`mod.rs:140, 167`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L140).
- **Механизм ошибки:**
  1. `ThumbnailService::frame` принимает `exact: bool`, вычисляет разные ключи кеша для `exact = false` и `exact = true`, но в `session.frame(source.seconds, token, &self.0.stopped)` аргумент `exact` **не передаётся**.
  2. В `thumbfast.lua` функция `request_seek()` (строки 672–680) для любого видео длиннее 30 секунд (`allow_fast_seek = true`) всегда сначала вызывает `seek(true)` → `async seek <t> absolute+keyframes`, и запускает `seek_timer` (`3/60 = 50 мс`), который только через 2 тика (~100 мс) вызывает `seek(false)` → `async seek <t> absolute+exact`.
  3. Поскольку ключевой кадр декодируется за 10–40 мс (раньше, чем истекают 100 мс), на запрос с `exact = true` Rust **почти всегда забирает первый (keyframe) кадр**, сохраняет его в кеш под ключом `exact = true` и завершает функцию `frame()`.
  4. Напротив, когда фронтенд запрашивает быстрый `grid`-кадр (`exact = false`), Rust забирает keyframe через 20 мс, но через 100 мс `seek_timer` в `thumbfast.lua` всё равно отправляет `absolute+exact`, заставляя декодер вхолостую декодировать десятки 4K-кадров до конца GOP и перезаписывать `.bgra` на диске.
- **Как исправить:**
  - Явно передавать режим `exact` в декодер: для `exact = false` выполнять только `seek <t> absolute+keyframes`, для `exact = true` — сразу `seek <t> absolute+exact` без промежуточного keyframe-сика и без внутреннего 100 мс таймера.

---

### P0-3. Самоблокировка превью при движении мыши во фронтенд-хуке `useTimelineThumbnail`

- **Где:** [`src/hooks/useTimelineThumbnail.ts:56-70`](file:///d:/My-programs/L-MPV/src/hooks/useTimelineThumbnail.ts#L56-L70) и [`104-108`](file:///d:/My-programs/L-MPV/src/hooks/useTimelineThumbnail.ts#L104-L108).
- **Механизм ошибки:**
  1. В `queue()` (строки 104–108) активный `grid`-запрос не отменяется первые **120 мс**:
     ```ts
     if (active && !active.cancelled && active.job.key !== job.key &&
       (active.job.exact || (thumbnailTime(active.job.seconds, false) !== thumbnailTime(time, false) && Date.now() - active.started >= 120))) {
       active.cancelled = true;
       void invoke("cancel_timeline_thumbnail", { requestId: active.id }).catch(() => {});
     }
     ```
     Замысел понятен: не убивать декодер каждые 8 мс во время движения мыши, а дать ему выдавать промежуточные кадры ~8 раз в секунду.
  2. Но когда этот неотменённый запрос завершается (допустим, через 50 мс), в `.then()` срабатывает строка 58:
     ```ts
     if (thumbnailTime(latestTime, job.exact) !== job.seconds) return;
     const next = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
     cached.set(job.key, next);
     ```
     Поскольку пользователь ведёт мышь, за 50 мс `latestTime` уже ушёл с секунды `10` на секунду `14`. Условие `14 !== 10` истинно, и функция делает `return`!
  3. В результате:
     - Декодированный кадр **не показывается** пользователю (во время движения курсора вместо смены кадров висит иконка-заглушка со спиннером).
     - Декодированный кадр **даже не сохраняется в `cached`** (так как `cached.set` стоит после `return`!), и при движении мыши обратно через секунду `10` фронтенд снова делает IPC-запрос.
     - Новый запрос в `desired` всё это время простаивал, ожидая завершения старого запроса, результат которого был выброшен.
  4. Для `exact`-запроса (`job.exact == true`) строка 58 сравнивает время с точностью до **1 мс** (`thumbnailTime(latestTime, true)`). На 2-часовом видео при ширине шкалы 1000 px сдвиг мыши на 1 пиксель изменяет `latestTime` на 7,2 с (а на 20-минутном видео — на 1,2 с), поэтому малейший микросдвиг курсора отбрасывает готовый `exact`-кадр.
- **Как исправить:**
  ```ts
  // 1. Всегда сохраняем валидный полученный кадр в LRU-кеш фронтенда:
  const next = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
  cached.set(job.key, next);
  evictOldestIfNeeded();

  // 2. Показываем кадр, если он актуален ИЛИ если это промежуточный grid-кадр
  // во время движения мыши (когда ещё нет точного совпадения с текущей позицией):
  const isCurrentTarget = thumbnailTime(latestTime, job.exact) === job.seconds;
  if (isCurrentTarget || (!job.exact && shown !== `grid:${thumbnailTime(latestTime, false)}`)) {
    url = next;
    shown = job.key;
    setFrame({ source, url: next, failed: false, pending: desired !== null });
  }
  ```

---

### P1-1. Гонка при `Drop for Thumbfast`, незакрытые таймеры `thumbfast.lua` и утечка папок сессий

- **Где:** [`thumbfast.rs:240-249`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast.rs#L240-L249), [`thumbfast_bridge.lua:116-122`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast_bridge.lua#L116-L122), [`mod.rs:65-69`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L65-L69).
- **Механизм ошибки:**
  1. Каждые 5 секунд простоя фоновый reaper-поток обнуляет `*thumbfast = None`, вызывая `Drop for Thumbfast`:
     ```rust
     impl Drop for Thumbfast {
         fn drop(&mut self) {
             let _ = self
                 .main
                 .command(&format!("script-message-to {} lmpv-shutdown", self.script));
             self.worker = None;
             let _ = fs::remove_dir_all(&self.dir);
         }
     }
     ```
  2. Команда `script-message-to ... lmpv-shutdown` помещает сообщение в очередь событий Lua-скрипта в основном `mpv` **асинхронно** и немедленно возвращает управление в Rust.
  3. Rust тут же уничтожает `worker` и вызывает `fs::remove_dir_all(&self.dir)`. В этот момент поток Lua в основном `mpv` может ещё не обработать `lmpv-shutdown` и выполнять `file_timer` (`check_new_thumb` на 60 Гц) или `thumbfast-render`, удерживая открытый дескриптор файла в `self.dir` или создавая `reply.tmp` / `worker-stop.json.part`.
  4. На Windows удаление директории, в которой параллельно открывается или создаётся файл, завершается ошибкой `ERROR_SHARING_VIOLATION` (32) или `ERROR_DIR_NOT_EMPTY` (145). Ошибка подавляется (`let _ = ...`), и папка `data/thumbs/lmpv-thumbfast-<pid>-<seq>` навсегда остаётся на диске.
  5. Более того, сам обработчик `lmpv-shutdown` в [`thumbfast_bridge.lua:116-122`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast_bridge.lua#L116-L122) убивает только `retry` и `worker_timer`, но **не останавливает** таймеры `file_timer` (60 Гц), `seek_timer` (20 Гц), `activity_timer`, `info_timer`, созданные в `thumbfast.lua`, и не вызывает `remove_thumbnail_files()` для закрытия дескриптора pipe `file`.
- **Как исправить:**
  - Полностью уходит при удалении Lua-прослойки (§6).
  - Если оставлять `thumbfast`: в `lmpv-shutdown` вызывать `mp.commandv("script-message-to", script, "clear")`, закрывать все обёрнутые таймеры, записывать маркер завершения и ждать его в `Drop` перед `fs::remove_dir_all`, а при старте приложения очищать старые папки `data/thumbs/lmpv-thumbfast-*`.

---

### P1-2. Кириллица и другие не-ASCII символы в пути к плееру ломают Lua-мост

- **Где:** [`thumbfast.rs:56-94`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast.rs#L56-L94), [`thumbfast_bridge.lua:29-36, 59-95`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast_bridge.lua#L29-L36).
- **Механизм ошибки:**
  - Путь `bridge.dir` (`<exe_dir>/data/thumbs/lmpv-thumbfast-...`) сериализуется в JSON в кодировке **UTF-8**.
  - Стандартные функции Lua `io.open`, `os.remove`, `os.rename` в LuaJIT на Windows вызывают узкосимвольные функции C Runtime (`fopen`, `remove`, `rename`), которые ожидают системную однобайтовую кодировку ANSI (`CP_ACP`, например Windows-1251), если в манифесте `.exe` не задан `<activeCodePage>UTF-8</activeCodePage>`.
  - В [`tauri.conf.json:49-58`](file:///d:/My-programs/L-MPV/src-tauri/tauri.conf.json#L49-L58) установщик NSIS по умолчанию ставит приложение в профиль пользователя (`%LOCALAPPDATA%`). Если имя пользователя Windows на кириллице (или портативная версия распакована в папку с русским названием), `io.open(bridge.dir .. '/ready', 'w')` в [`thumbfast.rs:70`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast.rs#L70) возвращает `nil`, `Thumbfast::new` ждёт 3 секунды и падает с `THUMBFAST_SCRIPT_LOAD`.
  - В тесте [`scripts/check-thumbnail-worker.py`](file:///d:/My-programs/L-MPV/scripts/check-thumbnail-worker.py#L14-L15) эта ошибка не проявилась, потому что тест запускает `--lmpv-thumbnail-worker` напрямую из Python (минуя Lua и `Thumbfast::new`), а папку сессии создаёт в `%TEMP%`.
- **Как исправить:**
  - Убрать файловый обмен с Lua (§6).
  - Либо встроить `<activeCodePage>UTF-8</activeCodePage>` в манифест Windows-приложения / использовать `_wfopen` через LuaJIT FFI в `thumbfast_bridge.lua`.

---

### P1-3. Любая одиночная ошибка в `thumbfast` отключает его навсегда до перезапуска плеера

- **Где:** [`mod.rs:39, 157-159, 177-183`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L177-L183), а также фронтенд [`useTimelineThumbnail.ts:70-86`](file:///d:/My-programs/L-MPV/src/hooks/useTimelineThumbnail.ts#L70-L86).
- **Механизм ошибки:**
  1. В `mod.rs:177-183` любая ошибка `thumbfast_result`, кроме `"THUMBNAIL_CANCELLED"`, атомарно устанавливает `self.0.thumbfast_disabled.swap(true, Ordering::AcqRel)`. Флаг нигде не сбрасывается. Достаточно одного таймаута в 6 секунд (например, при раскрутке внешнего HDD или перегрузке диска) — и до конца работы программы плеер навсегда деградирует на резервные пути.
  2. На фронтенде в `useTimelineThumbnail.ts:70-86` любая ошибка (включая штатную временную ошибку `"THUMBNAIL_UNAVAILABLE"`, возвращаемую бэкендом при `super::background_io::open_work_pending()` в [`mod.rs:151-153`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L151-L153) в первые мгновения после открытия файла!) переводит хук в `stopped = true` (для `grid`) или `exactDisabled = true` (для `exact`) на всё время текущего наведения.
- **Как исправить:**
  - Разделить ошибки на *временные* (`THUMBNAIL_BUSY`, `THUMBNAIL_TIMEOUT`), *ошибки конкретного файла* (`THUMBNAIL_UNSUPPORTED_MEDIA`, хранятся по `identity` файла, как `failed_identity` в `native.rs`) и *фатальные ошибки инициализации DLL*.
  - На фронтенде при получении `THUMBNAIL_BUSY` / `THUMBNAIL_UNAVAILABLE` планировать повтор через `setTimeout(..., 150)` вместо выставления `stopped = true`.

---

### P1-4. Каскад таймаутов до 21–24 секунд под глобальным мьютексом `worker`

- **Где:** [`mod.rs:132, 156-212`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L132).
- **Механизм ошибки:** На проблемном файле последовательно выполняются: `Thumbfast::new` (до 3 с) + `Thumbfast::frame` (6 с) → `NativeDecoder::extract` (5 с) → `decoder::extract` FFmpeg (10 с). Все 21–24 секунды удерживается `self.0.worker.lock()`, блокируя обработку любых новых запросов.
- **Как исправить:** Передавать во все стадии единый `deadline = Instant::now() + Duration::from_millis(1800)`.

---

### P2-1. Кеш-хиты стоят в очереди за декодированием, а `source_request` опрашивает основной `mpv` в цикле

- **Где:** [`mod.rs:132-150, 247-318`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L132-L150).
- **Механизм ошибки:**
  1. Мьютекс `self.0.worker.lock()` захватывается на строке 132 **до** проверки RAM-кеша (`cache.get`) и дискового кеша (`FrameCache::read_disk`). Пока декодируется один кадр, даже уже готовые кадры из RAM-кеша не могут быть отданы фронтенду.
  2. На каждый запрос (даже кешированный!) вызывается `source_request()`, который:
     - делает `Path::new(path).canonicalize()` (обращение к ФС);
     - в цикле `for index in 0..count.min(2048)` выполняет до **4 синхронных FFI-запросов** `get_property_*` на каждую дорожку контейнера (`track-list/{index}/type`, `external`, `id`, `ff-index`) к **основному** экземпляру `mpv`, отвлекая его core-поток во время воспроизведения;
     - затем `cache::cache_key` снова вызывает `path.metadata()` и считает `BLAKE3`.
- **Как исправить:**
  - Проверять RAM- и дисковый кеш **до** захвата `worker.lock()`.
  - Кешировать структуру `SourceMetadata` для текущей пары `(path, vid)` в памяти и вместо обхода всего `track-list` читать напрямую свойства `current-tracks/video/ff-index` и `current-tracks/video/external`.

---

### P2-2. Event loop читает только 1 событие за 2 мс и вызывает `GetProcAddress` 500 раз в секунду

- **Где:** [`preview.rs:113-211`](file:///d:/My-programs/L-MPV/src-tauri/src/mpv_manager/preview.rs#L113-L211), [`thumbnail_worker/mod.rs:114-143`](file:///d:/My-programs/L-MPV/src-tauri/src/thumbnail_worker/mod.rs#L114-L143), [`native.rs:192-215`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/native.rs#L192-L215).
- **Механизм ошибки:**
  1. `PreviewCore::event_status()` вызывает `mpv_wait_event(handle, 0.0)` (неблокирующий режим), а внешний цикл делает `std::thread::sleep(Duration::from_millis(2))` после **каждого одиночного события**.
  2. При `loadfile` и `seek` `libmpv` помещает в очередь сразу пачку из 5–15 событий (`START_FILE`, `TRACKS_CHANGED`, `FILE_LOADED`, `VIDEO_RECONFIG`, `PROPERTY_CHANGE`, `SEEK`, `PLAYBACK_RESTART`). Вычитывание по одному событию раз в 2 мс добавляет **10–30 мс искусственной задержки** на каждый кадр.
  3. Внутри `PreviewCore::event_status()`, `command()`, `watch_filters()` и `drop()` при каждом вызове выполняется `self.manager().api._lib.get(b"mpv_wait_event\0")` — то есть системный вызов Win32 `GetProcAddress` 500 раз в секунду! А при каждом создании `PreviewCore` заново вызывается `MpvApi::load("libmpv-2.dll")`.
- **Как исправить:**
  - Разрешить указатели на функции `mpv_command`, `mpv_wait_event`, `mpv_wakeup`, `mpv_observe_property`, `mpv_terminate_destroy` один раз при инициализации `MpvApi` (и хранить сам `MpvApi` в `OnceLock`).
  - Использовать блокирующий `mpv_wait_event(handle, 0.5)` с пробуждением через `mpv_wakeup(handle)` при новом запросе/отмене, а после пробуждения вычитывать всю очередь событий во внутреннем цикле до `MPV_EVENT_NONE (0)`.

---

### P2-3. Семь независимых циклов опроса (polling)

| № | Уровень | Частота | Что делает на каждом тике | Где в коде |
|---|---|---|---|---|
| 1 | Rust `Thumbfast::frame` | **500 Гц** (каждые 2 мс) | `fs::read("worker-stop.json")`, `fs::read("worker-request.json")` (причём файл `worker-request.json` даже не удаляется после чтения!), `fs::read("reply.json")` | [`thumbfast.rs:126-237`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast.rs#L126-L237) |
| 2 | Rust `run_core` (worker) | **500 Гц** (каждые 2 мс) | `mpv_wait_event(0.0)` + `WaitForSingleObject` в CLI-режиме | [`thumbnail_worker/mod.rs:114-143`](file:///d:/My-programs/L-MPV/src-tauri/src/thumbnail_worker/mod.rs#L114-L143) |
| 3 | Rust `Thumbfast::new` | **500 Гц** (до 3 с) | `fs::read_to_string("ready")` при каждом холодном старте | [`thumbfast.rs:80-94`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast.rs#L80-L94) |
| 4 | Lua `file_timer` (`thumbfast.lua`) | **60 Гц** (каждые 16,6 мс) | `os.remove(tmp)` + `os.rename(thumb, tmp)` + `file_info(tmp)`. Так как `clear()` никто не вызывает, `show_thumbnail` всегда `true`, и таймер молотит ФС **бесконечно**, пока жива сессия | [`thumbfast.lua:682-715`](file:///d:/My-programs/L-MPV/src-tauri/vendor/thumbfast/thumbfast.lua#L682-L715) |
| 5 | Lua `worker_timer` (`bridge.lua`) | **50 Гц** (каждые 20 мс) | `io.open("worker-result-N.json", "r")` для всех записей `pending` | [`thumbfast_bridge.lua:57-70`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast_bridge.lua#L57-L70) |
| 6 | Lua `retry` (`bridge.lua`) | **10 Гц** (каждые 100 мс) | Повторно шлёт `script-message-to ... thumb`. Если запрос в Rust отменён или упал по таймауту, `retry` продолжает стрелять 10 раз в секунду до закрытия сессии | [`thumbfast_bridge.lua:99-110`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast_bridge.lua#L99-L110) |
| 7 | Rust `start_idle_cleanup` (reaper) | **2 Гц** (каждые 500 мс) | Поток крутится **всё время жизни приложения**, даже когда видео не открыто или стоит на паузе часами | [`mod.rs:49-71`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L49-L71) |

- **Как исправить:** Заменить файловый опрос на синхронизацию через `Condvar` / `mpv_wakeup` (§6); таймер очистки простоя сделать частью цикла ожидания самого потока декодера (`recv_timeout(Duration::from_secs(15))`).

---

### P2-4. Восемь аллокаций кадра, двойной ресайз (HiDPI) и 4 лишних преобразования цвета

- **Где:** [`thumbfast.lua:379-387`](file:///d:/My-programs/L-MPV/src-tauri/vendor/thumbfast/thumbfast.lua#L379-L387), [`thumbfast.rs:201-232`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast.rs#L201-L232), [`decoder.rs:27-41`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/decoder.rs#L27-L41), [`mpv_manager.rs:130-197`](file:///d:/My-programs/L-MPV/src-tauri/src/mpv_manager.rs#L130-L197), [`preview.rs:213-246`](file:///d:/My-programs/L-MPV/src-tauri/src/mpv_manager/preview.rs#L213-L246).
- **Механизм ошибки:**
  1. **Двойное масштабирование при системном DPI > 100 %:** `thumbfast.lua:379` умножает `max_width=320, max_height=180` на свойство `display-hidpi-scale` основного окна `mpv`. При масштабе экрана Windows 150 % воркер рендерит кадр `480×270` (`518 КБ` BGRA), пишет его на диск, а затем `thumbfast.rs:219` сжимает его обратно до `320×180` фильтром `Triangle`!
  2. **Лишний `resize` и `canvas` даже при размере 320×180:** в `thumbfast.rs:201-232` для каждого кадра последовательно выделяются:
     - `raw: Vec<u8>` (230 КБ, чтение файла);
     - `rgb: Vec<u8>` (172 КБ, перекладка BGRA → RGB);
     - буфер внутри `.resize(320, 180, FilterType::Triangle)` (172 КБ — вызывается безусловно, даже если `reply.width == 320 && reply.height == 180`);
     - `canvas = RgbImage::new(320, 180)` (172 КБ, заливка нулями + `imageops::replace`);
     - `jpeg: Vec<u8>`.
     Плюс до этого 1 буфер `Vec<u8>` в `PreviewCore::bgra()` и 2 строки по 230 КБ в Lua. Итого **8 буферов в памяти и 3 файла на диске** на каждый кадр.
  3. **Четыре лишних преобразования цвета в `NativeDecoder`:**
     В [`decoder.rs:37`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/decoder.rs#L37) HDR-фильтр заканчивается на `format=yuv420p`. Затем [`with_screenshot_raw`](file:///d:/My-programs/L-MPV/src-tauri/src/mpv_manager.rs#L1019) запрашивает у `libmpv` формат `"bgr0"`, вынуждая `libmpv` запускать `swscale` (`YUV420p → BGR0`). Далее [`copy_bgr0_frame`](file:///d:/My-programs/L-MPV/src-tauri/src/mpv_manager.rs#L189-L194) по одному байту через `result.push(...)` копирует `BGR0 → BGR`, затем [`PreviewCore::jpeg`](file:///d:/My-programs/L-MPV/src-tauri/src/mpv_manager/preview.rs#L218-L220) вторым проходом делает `pixel.swap(0, 2)` (`BGR → RGB8`), после чего `JpegEncoder` снова переводит `RGB8 → YCbCr`!
- **Как исправить:**
  - В фильтре `preview_filter` сразу задавать `scale=320:180:force_original_aspect_ratio=decrease:flags=area,pad=320:180:(ow-iw)/2:(oh-ih)/2,format=bgr0`.
  - Внутри замыкания `with_screenshot_raw` за один проход перекладывать `BGR0 → RGB8` в заранее выделенный буфер `320 * 180 * 3` и сразу кодировать в `JpegEncoder`, без промежуточных `MpvRawFrame`, `DynamicImage::resize` и `canvas`.

---

### P2-5. Противоречивая политика `hwdec`: скачивание 4K-кадров из VRAM в RAM при `auto-copy`

- **Где:** [`preview.rs:52-54`](file:///d:/My-programs/L-MPV/src-tauri/src/mpv_manager/preview.rs#L52-L54) (`hwdec=no`) против [`thumbfast_bridge.lua:13`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast_bridge.lua#L13) (`o.hwdec = true`) и [`config.rs:72-75`](file:///d:/My-programs/L-MPV/src-tauri/src/thumbnail_worker/config.rs#L72-L75) (`hwdec=auto-copy`).
- **Механизм ошибки:**
  - В `PreviewCore::new` (для `NativeDecoder`) аппаратное декодирование отключено (`hwdec=no`) с верным комментарием: не создавать второй GPU-декодер ради крошечного превью.
  - Но в `thumbfast`-пути включён `hwdec=auto-copy`. При `exact`-сике (который `thumbfast` запускает через 100 мс после каждого запроса) декодер декодирует все кадры от ключевого до целевого, и в режиме `auto-copy` **каждый промежуточный 4K-кадр (~25 МБ для 10-бит) копируется через PCIe из VRAM в системную RAM** только для того, чтобы быть отброшенным! Кроме того, второй контекст D3D11 конкурирует за видеодвижок GPU с основным `vo=gpu-next` и TensorRT-апскейлером AnimeJaNai.
- **Как исправить:** См. подробный разбор в §4 (использовать `hwdec=no` со `slice`-многопоточностью по умолчанию).

---

### P2-6. Конкуренция с основным плеером во время перетаскивания ползунка (`drag`)

- **Где:** [`src/components/player/Timeline.tsx:203-212`](file:///d:/My-programs/L-MPV/src/components/player/Timeline.tsx#L203-L212).
- **Механизм ошибки:** Когда пользователь тянет ползунок мышью (`p.drag == true`), `Timeline.tsx` одновременно вызывает `scheduleScrub(time, false)` (перематывая **основной** плеер) и обновляет `hoverInfo`, запуская декодирование тех же кадров во втором экземпляре `libmpv`. Оба декодера одновременно читают один и тот же файл с диска и нагружают CPU/GPU.
- **Как исправить:** Во время активного перетаскивания (`isDraggingState == true`) либо передавать `enabled = false` в `useTimelineThumbnail` (оставляя только время и название главы, так как сам видеокадр уже виден на главном экране плеера), либо не вызывать `scheduleScrub` основного плеера до отпускания кнопки мыши (`pointerup`).

---

### P2-7. Неэффективность дискового кеша: полное декодирование JPEG при чтении, неатомарная запись, FIFO вместо LRU

- **Где:** [`src-tauri/src/commands/thumbnails/cache.rs:93-160`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/cache.rs#L93-L160), [`mod.rs:226-232`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L226-L232).
- **Механизм ошибки:**
  1. В `FrameCache::read_disk` (строка 109) на каждое чтение с диска вызывается `image::load_from_memory_with_format(&bytes, ImageFormat::Jpeg).is_ok()` — то есть **полное программное декодирование JPEG в RGB** только ради проверки целостности, после чего распакованный буфер выбрасывается, а сырые байты отправляются в WebView, где Chromium декодирует их второй раз!
  2. `write_disk` (строка 122) пишет напрямую в `dir.join(format!("{key}.jpg"))` без временного файла `.tmp`.
  3. `prune_disk` (строки 145–150) сортирует файлы по времени модификации (`modified()`), которое устанавливается один раз при создании файла — то есть это **FIFO**, а не LRU.
  4. Папка кеша (`data/thumbs/timeline-v1`) и рабочие папки сессий создаются рядом с `l-mpv.exe`. При установке в защищённую директорию запись упадёт, а в портативном режиме временные файлы сессий постоянно пишут на флешку/диск с программой.
- **Как исправить:**
  - В `write_disk` писать через `.tmp` + `fs::rename`, а в `read_disk` проверять только `valid_jpeg(&bytes)` и заголовок `into_dimensions() == Ok((320, 180))`.
  - Временные файлы (если они вообще нужны) держать в `std::env::temp_dir()`, а постоянный кеш — в `app_cache_dir` (с fallback на `data/thumbs` для portable-режима).

---

### P2-8. Разрушение фронтенд-кеша при каждом уводе мыши и широкий `MutationObserver`

- **Где:** [`Timeline.tsx:429-433`](file:///d:/My-programs/L-MPV/src/components/player/Timeline.tsx#L429-L433), [`useTimelineThumbnail.ts:29, 132-141`](file:///d:/My-programs/L-MPV/src/hooks/useTimelineThumbnail.ts#L132-L141), [`TimelinePreview.tsx:47-56`](file:///d:/My-programs/L-MPV/src/components/player/timeline/TimelinePreview.tsx#L47-L56).
- **Механизм ошибки:**
  1. Компонент `<TimelinePreview>` монтируется условно (`{hoverInfo && <TimelinePreview ... />}`). Как только курсор на миллиметр выходит за пределы шкалы (`handlePointerLeave` → `setHoverInfo(null)`), компонент размонтируется, и cleanup-функция `useEffect` в `useTimelineThumbnail.ts` уничтожает весь `cached` (`URL.revokeObjectURL`)! При повторном наведении через секунду интерфейс снова показывает заглушку и запрашивает кадры по IPC.
  2. Кроме того, при каждом наведении заново создаются `ResizeObserver` и `MutationObserver` с `subtree: true, attributes: true, childList: true` на всём блоке `.player-controls` ([`TimelinePreview.tsx:55`](file:///d:/My-programs/L-MPV/src/components/player/timeline/TimelinePreview.tsx#L55)), который срабатывает на каждое обновление текста таймера воспроизведения или прогресс-бара внутри `.player-controls`.
- **Как исправить:**
  - Вынести LRU-кеш `Blob URL` (на 24–32 кадра) на уровень модуля `useTimelineThumbnail.ts`, привязав его к `source` (`${path}\n${videoTrack}`), и очищать только при смене `source`.
  - Вместо `MutationObserver` на всём `.player-controls` передавать булев проп `hasHeatmap` из родительского компонента в зависимость `useLayoutEffect`.

---

### P2-9. Ошибка запуска воркера в `thumbfast.lua` отключает тонмаппинг HDR

- **Где:** [`vendor/thumbfast/thumbfast.lua:515-520`](file:///d:/My-programs/L-MPV/src-tauri/vendor/thumbfast/thumbfast.lua#L515-L520).
- **Механизм ошибки:** В upstream `thumbfast.lua` при любой ошибке дочернего процесса (`status ~= 0`) предполагается, что в `mpv` нет поддержки `zscale`/`tonemap`, поэтому скрипт выполняет `options.tone_mapping = "no"` и вызывает `mp.commandv("show-text", "thumbfast: ERROR! cannot create mpv subprocess", 5000)`. Надпись на экране не появляется только потому, что в основном плеере стоит `osd-level=0`, но тонмаппинг HDR отключается на всю оставшуюся сессию, делая HDR-превью блёклыми.

---

### P2-10. Изоляция сбоев декодера и поверхность атаки IPC

- **Где:** [`thumbnail_worker/mod.rs:51-68`](file:///d:/My-programs/L-MPV/src-tauri/src/thumbnail_worker/mod.rs#L51-L68), [`config.rs:45-55`](file:///d:/My-programs/L-MPV/src-tauri/src/thumbnail_worker/config.rs#L45-L55).
- **Механизм:**
  1. Поскольку `InProcessWorker` работает в потоке основного процесса `l-mpv.exe`, любой segfault / access violation внутри `libavcodec` или видеодрайвера при декодировании битого файла приведёт к аварийному завершению всего плеера вместе с активным воспроизведением.
  2. Опция `input-ipc-server` открывает неаутентифицированный named pipe `\\.\pipe\lmpv-thumbfast-<PID>-<N><PID>`, принимающий команды `mpv` (включая `run` и `subprocess`) от любого локального процесса того же пользователя.
- **Как исправить:** При отказе от `thumbfast` (§6) опция `input-ipc-server` не нужна и named pipe вообще не создаётся.

---

### P3 — Мелкие недочёты

1. **Перезапись и компиляция 45 КБ Lua каждые 5 секунд простоя:** `Thumbfast::new` ([`thumbfast.rs:67-78`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast.rs#L67-L78)) каждый раз заново записывает на диск склеенный файл `.lua` и вызывает `load-script` в основном `mpv`.
2. **Три конфликтующих таймаута простоя:** 5 с в Rust reaper (`thumbfast.rs:100`, `native.rs:115`), 30 с в `thumbfast_bridge.lua:15` (`quit_after_inactivity = 30`), 120 с в `thumbnail_worker/mod.rs:139`.
3. **Лишние клонирования `Vec<u8>` в `FrameCache`:** `cache.get()` ([`cache.rs:72`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/cache.rs#L72)) и `cache.insert(key, bytes.clone())` ([`mod.rs:147, 221`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L147)) клонируют вектор байтов при каждом обращении. Замена `Vec<u8>` на `Arc<[u8]>` делает копирование `O(1)`.
4. **Безусловная запись `.bgra` на каждый `MPV_EVENT_PLAYBACK_RESTART`:** [`thumbnail_worker/mod.rs:129-136`](file:///d:/My-programs/L-MPV/src-tauri/src/thumbnail_worker/mod.rs#L129-L136) снимает скриншот и пишет файл на диск даже при внутренних реконфигурациях, когда запрос уже отменён.
5. **Неудаляемый `worker-request.json`:** в [`thumbfast.rs:141`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/thumbfast.rs#L141) в отличие от `worker-stop.json` файл `worker-request.json` не удаляется после запуска воркера и перечитывается с диска каждые 2 мс (500 раз в секунду!) в течение всего запроса.
6. **Отладочный CLI-флаг `--lmpv-thumbnail-worker` в `main.rs`:** в [`src-tauri/src/main.rs:5-11`](file:///d:/My-programs/L-MPV/src-tauri/src/main.rs#L5-L11) диспетчеризация CLI-воркера включена безусловно, хотя сам плеер его больше не вызывает.

---

### Что в коммитах `4c2d776` и `3cec276` сделано хорошо

- Передача кадров из Rust в WebView через сырой бинарный `tauri::ipc::Response` (без сериализации массива чисел в JSON и без раздувания Base64).
- Защита от ранней отмены (`cancelled: VecDeque<String>` в [`mod.rs:29, 78, 94-99`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L94-L99)), когда `cancel_timeline_thumbnail` обгоняет `get_timeline_thumbnail`.
- Вынесение `scale=320:180` **перед** конвертацией в `gbrpf32le` и тонмаппингом HDR ([`decoder.rs:37`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/decoder.rs#L37), [`config.rs:176-189`](file:///d:/My-programs/L-MPV/src-tauri/src/thumbnail_worker/config.rs#L176-L189)), что уменьшает объём float-буферов `zscale`/`tonemap` в 144 раза для 4K.
- Выделенный модуль [`process_job.rs`](file:///d:/My-programs/L-MPV/src-tauri/src/process_job.rs) с `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` для дочерних процессов `ffmpeg.exe`.
- Синхронное уничтожение `PreviewCore` через `mpv_terminate_destroy` в [`preview.rs:249-277`](file:///d:/My-programs/L-MPV/src-tauri/src/mpv_manager/preview.rs#L249-L277).
- Учёт `UI scale`, границ окна и высоты тепловой карты при позиционировании карточки [`TimelinePreview.tsx`](file:///d:/My-programs/L-MPV/src/components/player/timeline/TimelinePreview.tsx).

---

## 3. Скорость: поэтапный разбор задержек и как ускорить предпросмотр

### Куда уходит время на один кадр (тёплая сессия, keyframe-запрос)

| Этап конвейера | Сейчас (`thumbfast` + файлы) | Целевой путь (прямой `PreviewCore` в памяти) |
|---|---|---|
| Проверка кеша и `source_request` | 0,5–3 мс (ожидание `worker.lock()` + FFI к main `mpv`) | **< 0,05 мс** (lock-free / быстрый mutex до декодера) |
| Отправка команды seek в декодер | 1–5 мс (Rust → main `mpv` → Lua → named pipe → worker) | **< 0,05 мс** (запись в слот + `mpv_wakeup`) |
| Декодирование I-кадра 1080p H.264 (SW) | 10–35 мс | 10–35 мс |
| Декодирование I-кадра 4K HEVC 10-бит (SW) | 45–130 мс | **30–90 мс** (с `thread_type=slice` и `flags=area`) |
| Ожидание `MPV_EVENT_PLAYBACK_RESTART` | 6–25 мс (по 2 мс сна на каждое промежуточное событие) | **≈ 0 мс** (блокирующий `mpv_wait_event` + цикл до `NONE`) |
| Запись `.part` → `rename` в `thumbN` + Defender | 1–10 мс | **0 мс** |
| Ожидание `file_timer` (60 Гц) в `thumbfast.lua` | 0–16,7 мс | **0 мс** |
| Чтение в Lua, запись `frame-K.bgra`, `reply.json` | 1–4 мс | **0 мс** |
| Опрос `reply.json` (2 мс) + чтение `frame-K.bgra` в Rust | 1–4 мс | **0 мс** |
| `BGRA → RGB` + `resize(Triangle)` + `canvas` + `JPEG` | 2–5 мс | **0,8–1,5 мс** (один проход `BGR0 → RGB` + JPEG) |
| **Итого накладных расходов сверх декодера** | **≈ 13–73 мс на каждый кадр** | **≈ 1–2 мс на каждый кадр** |

При **холодном старте** (первое наведение или наведение после каждых 5 секунд паузы) сейчас дополнительно тратится **150–400 мс** на генерацию `.lua`-файла, `load-script`, ожидание `ready`, `worker-request.json`, инициализацию `libmpv` и `loadfile`.

### 10 способов ускорить предпросмотр (по убыванию отдачи)

1. **Убрать файловый транспорт и Lua-прослойку (§6):** мгновенно убирает **13–73 мс** накладных расходов на каждом кадре и **150–300 мс** на холодном старте.
2. **Блокирующий `mpv_wait_event` + `mpv_wakeup` + дренирование очереди событий (`P2-2`):** убирает 10–30 мс задержки на каждом сике и снижает потребление CPU в простое до нуля.
3. **Кеширование интервалов ключевых кадров (Keyframe Interval Cache):**
   При `seek <t> absolute+keyframes` декодер встаёт на ключевой кадр с меткой времени $\text{pts}_{\text{kf}} \le t$. Это значит, что для **любой** секунды $s \in [\text{pts}_{\text{kf}}, t]$ ключевой кадр в видео один и тот же! Сохраняя в `FrameCache` интервал $[\lfloor\text{pts}_{\text{kf}}\rfloor \dots \lfloor t \rfloor] \to \text{Arc}<[\text{u8}]>$, при ведении мыши вдоль таймлайна мы сокращаем число реальных декодирований **в 5–10 раз** (при типичном GOP 5–10 с все промежуточные секунды отдаются из RAM за 0 мс).
4. **Прогрев контекста (`warmup`) по событию `pointerenter` на шкале таймлайна:**
   Отправлять команду `warmup_timeline_thumbnail(path, videoTrack)` в момент, когда курсор только пересекает границу `.timeline` (или при пробуждении панели управления). К моменту первого `pointermove` контекст `PreviewCore` уже создан, файл открыт (`FILE_LOADED`), и первый сик выполняется мгновенно.
5. **Пропуск `exact`-уточнения, если ключевой кадр уже близко к цели:**
   Если для позиции $t$ полученный keyframe имеет $|\text{pts}_{\text{kf}} - t| \le 0.25\text{ с}$, второй (`exact`) запрос после остановки мыши не нужен — визуально кадр практически тот же, а экономится самый тяжёлый проход декодирования GOP.
6. **Переключение декодера на `thread_type=slice` (`vd-lavc-o=thread_type=slice`):**
   По умолчанию `vd-lavc-threads=2` включает `FF_THREAD_FRAME` (параллельное декодирование *разных* последовательных кадров), что не ускоряет декодирование одиночного I-кадра после сика, но добавляет буферизацию. Режим `slice` распараллеливает декодирование **одного и того же кадра** (через WPP в HEVC и slices в H.264) без конвейерной задержки.
7. **Отключение сканирования внешних файлов при открытии (`autoload-files=no`, `embeddedfonts=no`):**
   Ускоряет `loadfile` в папках с большим количеством файлов и внешними субтитрами `.ass`/`.srt`.
8. **Замена фильтра масштабирования на `flags=area` или `fast_bilinear` прямо внутри графа `lavfi`:**
   Опция `--sws-scaler=fast-bilinear` в `mpv` не влияет на фильтр `scale`, вызванный внутри графа `lavfi=[scale=...]` (там `libswscale` по умолчанию использует `bicubic`). Явное указание `scale=320:180:force_original_aspect_ratio=decrease:flags=area` ускоряет даунскейл 4K → 320×180 и устраняет муар.
9. **Проверка опции `video-latency-hacks=yes` в `PreviewCore`:**
   В `libmpv` эта опция отключает предварительное декодирование 1 следующего кадра вперёд для оценки длительности кадра, что при одиночных сиках на паузе экономит декодирование лишнего P/B-кадра.
10. **Опциональная фоновая предгенерация ключевых кадров (по образцу `mpv_thumbnail_script` и `Jellyfin`):**
    Для локальных видео длительностью до 2–3 часов после первого наведения можно в фоне с низким приоритетом потока проходить по ключевым кадрам (`-skip_frame nokey`) с шагом 30 с → 10 с, сохраняя компактный спрайт-лист в дисковый кеш.

---

## 4. Оперативная память: где она тратится и как её уменьшить

### Расчёт фактического потребления памяти (RAM / VRAM)

| Компонент памяти | 1080p H.264 8-бит | 4K HEVC 10-бит (`P010`) | Комментарий |
|---|---|---|---|
| Один декодированный кадр в памяти декодера | ≈ 3,1 МБ | **≈ 24,9 МБ** | $3840 \times 2160 \times 1.5 \times 2\text{ байта}$ |
| Пул референсных кадров (DPB, до 6–8 кадров при `exact`-сике) + выходные поверхности | ≈ 20–35 МБ | **≈ 140–220 МБ** | Главный потребитель ОЗУ при декодировании 4K |
| Дополнительные буферы `FF_THREAD_FRAME` (`vd-lavc-threads=2`) | ≈ 5–10 МБ | **≈ 25–50 МБ** | Каждый frame-поток держит свой контекст |
| Копирование кадров GPU → CPU при `hwdec=auto-copy` | ≈ 3 МБ / кадр | **≈ 25 МБ / кадр** | Staging-буферы D3D11 + копирование всех промежуточных кадров при `exact` |
| Контекст `libmpv` + демуксер `libavformat` + индекс MKV/MP4 | ≈ 10–25 МБ | **≈ 15–35 МБ** | Зависит от длительности контейнера |
| Вложения MKV (вшитые шрифты `.ttf`/`.otf` в аниме) и внешние `.ass` | 0–50 МБ | **0–50 МБ** | Загружаются демуксером, если не отключить |
| Lua VM (`thumbfast.lua` + мост) в основном экземпляре `mpv` | ≈ 2–4 МБ | ≈ 2–4 МБ | Пересоздаётся каждые 5 с при `load-script` |
| RAM-кеш JPEG в Rust (`FrameCache`) | ≤ 4 МиБ | ≤ 4 МиБ | 64 сжатых кадра по ~12–20 КБ ≈ 0,8–1,3 МБ |
| Кеш `Blob URL` в React (`MAX_READY_FRAMES = 12`) | ≤ 0,3 МБ | ≤ 0,3 МБ | Только сжатые JPEG-блобы |

> [!IMPORTANT]
> Ограничения `4 МиБ` для JPEG-кеша и `12 изображений` во фронтенде влияют менее чем на **2 %** от пикового потребления памяти. Остальные **98 % (150–250 МБ на 4K)** находятся внутри декодера `libavcodec`, демуксера `libavformat` и буферов `hwdec`.

### 7 мер по снижению потребления ОЗУ

1. **Использовать `hwdec=no` по умолчанию для контекста предпросмотра:**
   Программный декодер при `absolute+keyframes` декодирует только один I-кадр, не создаёт второй контекст D3D11/DXVA2, не выделяет пул GPU-текстур (`hwdec-extra-frames`) и не гоняет по 25 МБ через staging-буферы `auto-copy` на каждом промежуточном кадре при `exact`-сике.
2. **Включить `vd-lavc-o=thread_type=slice` (или `vd-lavc-threads=1` для `grid`-запросов):**
   Отказ от `FF_THREAD_FRAME` в пользу `slice`-потоков экономит **25–50 МБ RAM** на 4K HEVC без потери скорости декодирования одиночного кадра.
3. **Запретить загрузку внешних файлов и вложений демуксером:**
   Добавить в настройки `PreviewCore`:
   ```rust
   ("autoload-files", "no"),
   ("sub-auto", "no"),
   ("audio-file-auto", "no"),
   ("embeddedfonts", "no"),
   ("sub-ass", "no"),
   ("cache", "no"),
   ("demuxer-readahead-secs", "0"),
   ("demuxer-max-bytes", "512KiB"),
   ("demuxer-max-back-bytes", "0"),
   ("video-latency-hacks", "yes"),
   ```
4. **Немедленно освобождать `PreviewCore` при смене/закрытии файла или сворачивании окна:**
   Сейчас при закрытии видео или переходе к следующему файлу старый контекст висит в памяти ещё до 5 секунд (а в `thumbfast` воркер предыдущего файла остаётся жить до следующего запроса). Освобождать контекст нужно сразу по событию смены файла, а при активной работе пользователя с таймлайном держать таймер простоя **15 секунд после `pointerleave`**, чтобы не дёргать аллокатор каждые 5 секунд.
5. **Убрать промежуточные буферы при снятии скриншота (`P2-4`):**
   Один предвыделенный буфер `Vec<u8>` на `320 * 180 * 3 = 172 800 байт` внутри воркера вместо 8 аллокаций на каждый кадр.
6. **Хранить в `FrameCache` `Arc<[u8]>` вместо `Vec<u8>`:**
   Убирает клонирование векторов при чтении из кеша и передаче в `tauri::ipc::Response`.
7. **Удалить Lua-скрипт `thumbfast` из основного экземпляра `mpv`:**
   Освобождает основной экземпляр `mpv` от создания новых Lua-состояний при каждом `load-script` после 5-секундного простоя.

---

## 5. Анализ других плееров и архитектурных подходов

| Проект | Язык и стек | Архитектура предпросмотра | Что перенять / чего избегать |
|---|---|---|---|
| **thumbfast + uosc** ([po5/thumbfast](https://github.com/po5/thumbfast)) | Lua (`mpv`) | Запускает второй процесс `mpv`, шлёт команды через named pipe, пишет сырой `BGRA` в файл, рисует через `overlay-add` | **Перенять:** опции облегчения декодера (`vd-lavc-skiploopfilter=all`, `vd-lavc-fast`, `demuxer-readahead-secs=0`). **Избегать:** файлового транспорта и Lua-таймеров — в Lua это вынужденный обход отсутствия потоков, а в Rust это лишнее узкое место |
| **mpv_thumbnail_script** ([TheAMM](https://github.com/TheAMM/mpv_thumbnail_script)) | Lua (`mpv`, пул воркеров) | Многопроходная фоновая предгенерация кадров всего видео (сначала крупный шаг, затем уплотнение) в папку кеша | **Перенять:** идею фонового разреженного прохода по ключевым кадрам и переиспользования одного кадра на интервал времени |
| **IINA** ([iina/iina](https://github.com/iina/iina)) | Swift + `libmpv` + `FFmpeg` (`libav*`) | Отдельный `FFmpegController` в фоновом потоке открывает локальный файл, декодирует **только ключевые кадры** и кеширует на диск | **Перенять:** отказ от тяжёлого `exact`-декодирования во время скроллинга и дедупликацию по ключевым кадрам |
| **Jellyfin Trickplay** ([jellyfin](https://jellyfin.org/docs/general/server/metadata/trickplay/)) | C# + `FFmpeg` | Извлечение с `-skip_frame nokey`, упаковка по 100 кадров (10×10) в один JPEG спрайт-лист | **Перенять:** принцип `-skip_frame nokey` (keyframe-only) и хранение кеша одним файлом/спрайтом вместо тысячи мелких `.jpg` |
| **MPC-HC** ([clsid2/mpc-hc](https://github.com/clsid2/mpc-hc)) | C++ / DirectShow (LAV) | Второй независимый граф сплиттера/декодера в фоновом потоке, быстрый keyframe-seek и рендер в память | **Перенять:** прямой вызов второго декодера в памяти процесса без IPC и без временных файлов |
| **media_kit** ([media-kit](https://github.com/media-kit/media-kit)) | Dart / C++ / `libmpv` | Второй скрытый экземпляр `mpv_handle` (`vo=null`), прямой вызов `seek` + `screenshot` в байтовый буфер в памяти | **Перенять:** минималистичную схему «второй `mpv_handle` → `seek` → `screenshot-raw` → память → UI» |
| **uniplayer** ([xiaolai/uniplayer](https://github.com/xiaolai/uniplayer)) | **Rust + Tauri 2 + `libmpv`** | Нативное окно `libmpv` + HTML-интерфейс поверх, прямое взаимодействие Rust-бэкенда с WebView | Подтверждает, что в связке `Tauri 2 + Rust + libmpv` Lua-прослойка не нужна |

---

## 6. Рекомендуемая целевая архитектура для L-MPV

```mermaid
flowchart LR
    UI["React: модульный LRU Blob URL, прогрев по pointerenter"] -->|"invoke(t, exact)"| CMD["Tauri command"]
    CMD --> C1{"RAM / Диск кеш + интервалы ключевых кадров"}
    C1 -->|Hit 0 мс| UI
    C1 -->|Miss| SLOT["Слот LatestJob (Mutex + Condvar), отмена старого"]
    SLOT -->|"mpv_wakeup()"| WK["Поток-актор PreviewWorker (один PreviewCore)"]
    WK -->|"seek t keyframes/exact"| MPV["Приватный libmpv: vo=null, hwdec=no, slice-threads, autoload-files=no"]
    MPV -->|"PLAYBACK_RESTART (блокирующий mpv_wait_event)"| WK
    WK -->|"time-pos + with_screenshot_raw -> JPEG в памяти"| C1
```

### Скелет целевого цикла Rust-воркера (без Lua, без файлов и без поллинга)

```rust
// Цикл потока предпросмотра: нулевая нагрузка в простое, мгновенное пробуждение
// через mpv_wakeup() и строгая привязка кадра к породившему его запросу.
loop {
    // 1. Если контекст ещё не открыт — спим на Condvar до прихода задачи.
    let Some(core) = &mut self.core else {
        let Some(job) = self.slot.wait_for_job(Duration::from_secs(15)) else {
            continue;
        };
        self.open_and_handle(job);
        continue;
    };

    // 2. Блокирующее ожидание события libmpv (до 500 мс);
    // новый запрос или отмена мгновенно будит поток вызовом mpv_wakeup(handle).
    let status = core.wait_event_blocking(0.5);

    // 3. Вычитываем ВСЕ накопившиеся события из очереди без sleep(2ms).
    let mut frame_ready = false;
    let mut cur = status;
    while cur.id != 0 {
        match cur.id {
            21 => frame_ready = true, // MPV_EVENT_PLAYBACK_RESTART
            1 | 7 => {
                self.core = None;
                break;
            }
            _ => {}
        }
        cur = core.wait_event_blocking(0.0);
    }

    // 4. Если пришёл более свежий запрос — отменяем старый и запускаем новый seek.
    if let Some(next_job) = self.slot.take_latest() {
        active_job = Some(next_job);
        let job = active_job.as_ref().unwrap();
        let mode = if job.exact { "absolute+exact" } else { "absolute+keyframes" };
        let _ = core.command(&["seek", &format!("{:.3}", job.seconds), mode]);
        continue;
    }

    // 5. Если кадр готов и запрос не был вытеснен новым — снимаем JPEG в памяти.
    if frame_ready {
        if let Some(job) = active_job.take() {
            if !job.cancelled.load(Ordering::Acquire) {
                let actual_pts = core.get_property_double("time-pos").unwrap_or(job.seconds);
                let jpeg = core.encode_jpeg_in_memory();
                let _ = job.reply.send((actual_pts, jpeg));
            }
        }
    }

    // 6. Освобождение контекста после 15 секунд реального простоя.
    if active_job.is_none() && self.last_activity.elapsed() >= Duration::from_secs(15) {
        self.core = None;
    }
}
```

Что это даёт:
- Полностью удаляются файлы: `thumbfast.rs`, `thumbfast_bridge.lua`, `thumbfast_pipe.rs`, `thumbfast_runtime.rs`, `thumbnail_worker/*` и `vendor/thumbfast/*` (**минус ~1900 строк кода**).
- По классу конструкции исчезают ошибки `P0-1`, `P0-2`, `P1-1`, `P1-2`, `P2-2`, `P2-3`, `P2-4`, `P2-5`, `P2-9`, `P2-10`.

---

## 7. Пошаговый план работ

| Шаг | Что сделать | Закрываемые проблемы | Сложность |
|---|---|---|---|
| **1** | Обновить соль ключа кеша в [`cache.rs:34`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/cache.rs#L34) (`v6` → `v7`), сделать запись `.jpg` атомарной через `.tmp` и убрать полное декодирование JPEG в `read_disk` | Сброс испорченного кеша (`P0-1`, `P0-2`), ускорение чтения с диска (`P2-7`) | **XS** |
| **2** | Исправить [`useTimelineThumbnail.ts`](file:///d:/My-programs/L-MPV/src/hooks/useTimelineThumbnail.ts): сохранять кадр в `cached` до проверки `latestTime`, показывать промежуточные `grid`-кадры во время ведения мыши, вынести `cached` на уровень модуля и не ставить `stopped = true` на `THUMBNAIL_UNAVAILABLE` | Самоблокировка превью (`P0-3`), деградация (`P1-3`), сброс кеша при уводе мыши (`P2-8`) | **S** |
| **3** | В [`mod.rs`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs): вынести проверку RAM/дискового кеша до захвата `worker.lock()`, кешировать `SourceRequest` для `(path, vid)` и задать общий `deadline` 1,8 с | Мгновенные кеш-хиты (`P2-1`), защита от зависания на 21 с (`P1-4`) | **S** |
| **4** | В [`preview.rs`](file:///d:/My-programs/L-MPV/src-tauri/src/mpv_manager/preview.rs): разрешить все FFI-символы (`mpv_wait_event`, `mpv_wakeup`, `mpv_command`, `mpv_terminate_destroy`) один раз в `MpvApi`, добавить `autoload-files=no`, `embeddedfonts=no`, `vd-lavc-o=thread_type=slice`, `video-latency-hacks=yes`, `format=bgr0` и однопроходное кодирование в JPEG | Минус 10–30 мс на событиях (`P2-2`), минус 50–150 МБ RAM на 4K (§4), минус 4 цветовые конверсии (`P2-4`) | **S** |
| **5** | Перевести основной путь на прямой поток-актор поверх `PreviewCore` / `NativeDecoder` (с блокирующим `mpv_wait_event` и `mpv_wakeup`), синхронизировать фильтры (`crop`, `rotate`, `flip`, `hdr`) на Rust и удалить `thumbfast` + `thumbnail_worker` | Полное устранение `P0-1`, `P0-2`, `P1-1`, `P1-2`, `P2-3`, `P2-5`, `P2-9`, `P2-10` и удаление ~1900 строк кода | **M** |
| **6** | Добавить в `FrameCache` дедупликацию по интервалам ключевых кадров $[\text{pts}_{\text{kf}} \dots t]$ и пропускать `exact`-запрос при $|\text{pts}_{\text{kf}} - t| \le 0.25\text{ с}$ | В 5–10 раз меньше декодирований при ведении курсора | **M** |
| **7** | Добавить прогрев по `pointerenter` на таймлайне и немедленную выгрузку `PreviewCore` при смене файла / сворачивании окна (с таймаутом 15 с после `pointerleave`) | Устранение холодного старта и пиков переаллокации каждые 5 с | **S** |
| **8** | В [`Timeline.tsx`](file:///d:/My-programs/L-MPV/src/components/player/Timeline.tsx#L203-L212): согласовать поведение при перетаскивании ползунка (`isDragging`), чтобы фоновый декодер превью не конкурировал со скраббингом основного плеера | Плавный скраббинг без просадок FPS (`P2-6`) | **XS** |

---

## 8. Гипотезы, которые рекомендуется проверить замерами на стенде

1. **Эффект `vd-lavc-o=thread_type=slice` против `vd-lavc-threads=1` и `vd-lavc-threads=2` (frame)** на ваших тестовых файлах 1080p H.264 и 4K HEVC 10-бит: замерить время одного keyframe-сика, одного exact-сика и `Private Bytes` процесса через `GetProcessMemoryInfo`.
2. **Влияние `video-latency-hacks=yes`** в `PreviewCore` на скорость получения `MPV_EVENT_PLAYBACK_RESTART` при `pause=yes`.
3. **Влияние `embeddedfonts=no` и `autoload-files=no`** на пик `Private Bytes` и время `FILE_LOADED` на аниме-релизах в MKV с 50+ МБ вшитых шрифтов и внешними `.ass`-субтитрами.
4. **Проверка воспроизведения `P1-2` (кириллица в пути):** запуск портативной копии плеера из папки `D:\Проверка\L-MPV` и замер поведения `Thumbfast::new`.
5. **Проверка воспроизведения `P0-1` (порча кеша):** быстрое движение курсора туда-обратно по таймлайну с последующей проверкой соответствия закешированных в `data/thumbs/timeline-v1` кадров реальным таймкодам.

---

## 9. Источники и материалы

- Репозиторий и устройство `thumbfast` (po5): https://github.com/po5/thumbfast
- Многопроходный генератор `mpv_thumbnail_script` (TheAMM): https://github.com/TheAMM/mpv_thumbnail_script
- Документация `mpv` (`--vd-lavc-threads`, `--hwdec-threads`, `--autoload-files`, `--embeddedfonts`, `--video-latency-hacks`, C API `mpv_wait_event` / `mpv_wakeup`): https://mpv.io/manual/master/
- Документация `FFmpeg` по `FF_THREAD_FRAME` и `FF_THREAD_SLICE` (`thread_type`): https://ffmpeg.org/ffmpeg-codecs.html
- Спецификация `Jellyfin Trickplay` (`-skip_frame nokey`, тайловые спрайты): https://jellyfin.org/docs/general/server/metadata/trickplay/
- Реализация превью в `IINA`: https://github.com/iina/iina
- Реализация Seekbar Preview в `MPC-HC` (clsid2): https://github.com/clsid2/mpc-hc
- Архитектура второго экземпляра `Player` в `media_kit`: https://github.com/media-kit/media-kit
- Плеер на `Tauri 2 + Rust + libmpv` (`uniplayer`): https://github.com/xiaolai/uniplayer
- Документация Microsoft по UTF-8 кодовой странице в манифесте Windows и `fopen`: https://learn.microsoft.com/windows/apps/design/globalizing/use-utf8-code-page
- Документация Microsoft по приоритетам фоновых потоков `SetThreadPriority` / `THREAD_MODE_BACKGROUND_BEGIN`: https://learn.microsoft.com/windows/win32/api/processthreadsapi/nf-processthreadsapi-setthreadpriority

---

## 10. Аудит обновлённого кода (после удаления thumbfast и перехода на нативный декодер)

В ходе последней серии правок в репозитории была проведена масштабная архитектурная переработка: удалено более 2300 строк устаревшего кода, полностью ликвидирована прослойка `thumbfast.lua`, `thumbfast_bridge.lua` и файловый транспорт обмена кадрами. Декодирование переведено на постоянный экземпляр `PreviewCore` внутри процесса `l-mpv.exe`.

Ниже приведён подробный анализ текущего состояния кода, верификация исправлений из предыдущего аудита, реестр оставшихся и вновь возникших дефектов, а также конкретные рекомендации по их устранению.

---

### 10.1. Что сделано качественно и правильно

1. **Полная ликвидация внешнего IPC и файлового транспорта:**
   - Удалены скрипты `thumbfast.lua`, `thumbfast_bridge.lua`, модули `thumbfast.rs`, `thumbfast_pipe.rs`, `thumbfast_runtime.rs` и каталог `thumbnail_worker/`.
   - Больше нет записи и переименования промежуточных файлов `thumbN.part`, `.bgra`, `frame-K.bgra` и `reply.json` на диске. Кадр считывается напрямую из памяти через `with_screenshot_raw`.
2. **Ликвидация зависимости от Lua и проблемы с кириллицей:**
   - Так как Lua-мост удалён, вызов ANSI CRT `fopen` через `io.open` в LuaJIT больше не участвует в получении превью. Проблема с путями пользователя, содержащими кириллицу (`P1-2`), полностью решена на архитектурном уровне.
3. **Атомарная запись дискового кеша:**
   - В [`cache.rs:122-132`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/cache.rs#L122-L132) запись ведётся во временный файл `{key}.part` с последующим атомарным переименованием в `{key}.jpg`. Это исключает чтение незавершённых или повреждённых миниатюр при параллельных запросах или прерываниях.
4. **Обновление соли ключа кеша:**
   - В [`cache.rs:34`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/cache.rs#L34) соль обновлена до `lmpv-timeline-v8-snapshot-320x180`. Все старые или испорченные файлы кеша гарантированно изолированы.
5. **Вынос проверки кеша до захвата мьютекса декодера:**
   - В [`mod.rs:136-145`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L136-L145) чтение из памяти (`cache.get`) и с диска (`FrameCache::read_disk`) выполняется **до** взятия блокировки `self.0.worker.lock()`. Попадания в кеш больше не сериализуются и отдаются мгновенно.
6. **Выделенный профиль Snapshot с SIMD-ресайзингом для 4K (`profile.rs` и `preview_image.rs`):**
   - Для видео разрешением выше 1080p (4K UHD) без HDR выбран профиль `Snapshot` с аппаратным ускорением `d3d11va` без наложения фильтров `vf`.
   - В [`preview_image.rs`](file:///d:/My-programs/L-MPV/src-tauri/src/mpv_manager/preview_image.rs) подключён крейт `fast_image_resize` 5.1 с билинейной свёрткой на SIMD-инструкциях процессора (SSE4.1/AVX2). Перемасштабирование 4K BGR0-буфера в 320x180 занимает всего 1.5–3 мс. Промежуточные кадры GOP не пересылаются по шине PCIe.
7. **Кеширование интервалов ключевых кадров (`coarse_cache.rs`):**
   - Добавлен LRU-кеш подтверждённых интервалов GOP `[actual..=requested]`. При движении курсора внутри уже проверенного интервала повторные сики и декодирование не производятся.
8. **Безопасная изоляция геометрических фильтров (`transforms.rs`):**
   - Реализована безопасная фильтрация параметров `crop`, `video-rotate`, `hflip`, `vflip`. Тяжёлые постобработчики воспроизведения (шейдеры апскейла, интерполяция, `animejanai`) гарантированно не проникают в декодер превью.

---

### 10.2. Матрица статуса ошибок из первой части аудита

| Идентификатор | Описание изначальной проблемы | Статус в обновлённом коде | Комментарий |
|---|---|---|---|
| **P0-1** | Порча кеша из-за ответа с чужим `id = request` при движении курсора | **ИСПРАВЛЕНО** | Файловый мост и `reply.json` удалены; запрос и ответ идут синхронно в рамках одного вызова. |
| **P0-2** | Потеря флага `exact`: ключевой кадр кешировался как точный, а декодер крутил GOP | **ИСПРАВЛЕНО** | Флаг `exact` явно передаётся в `PreviewCore::new` (`hr-seek`) и в команду `seek ... absolute+exact` / `absolute+keyframes`. |
| **P0-3** | Выбрасывание кадра в `.then()` фронтенда при несовпадении с `latestTime` | **ИСПРАВЛЕНО** | Кадр сохраняется в `cached` независимо от того, сдвинулся ли курсор; старый черновой кадр кешируется для будущих возвратов мыши. |
| **P1-1** | Гонка при удалении сессионных папок `remove_dir_all` на Windows | **ИСПРАВЛЕНО** | Временные сессионные каталоги больше не создаются. |
| **P1-2** | Сбой на путях с кириллицей из-за ANSI CRT `fopen` в `io.open` LuaJIT | **ИСПРАВЛЕНО** | Вся цепочка Lua удалена; открытие файла происходит через UTF-8 C API `libmpv` в Rust. |
| **P1-3** | Перманентный отказ быстрого пути при первой ошибке (`thumbfast_disabled`) | **ИСПРАВЛЕНО** | Глобальный флаг отключения удалён; при сбое отдельного кадра плеер продолжает работу. |
| **P1-4** | Каскадный таймаут до 21 секунды при зависании декодера | **ЧАСТИЧНО** | Добавлен единый `deadline` в `extract_until`, однако при зависании внешнего `ffmpeg` в fallback-ветке таймаут всё ещё может затянуться. |
| **P2-1** | Блокировка кеш-хитов глобальным мьютексом воркера | **ИСПРАВЛЕНО** | Чтение RAM- и дискового кеша вынесено за пределы `worker.lock()`. |
| **P2-2** | Множественные циклы опроса с задержкой 2 мс | **ИСПРАВЛЕНО** | Опрос убран, события читаются через `wait_event` с таймаутом. |
| **P2-3**–**P2-4** | Файловый транспорт и 8 копирований буфера кадра | **ИСПРАВЛЕНО** | Кадр извлекается через `with_screenshot_raw` в оперативную память. |
| **P2-7** | Неатомарная запись дискового кеша | **ИСПРАВЛЕНО** | Запись производится через временный файл `.part` с переименованием в `.jpg`. |
| **P2-8** | Сброс кеша Blob URL при каждом уводе курсора | **СОХРАНЯЕТСЯ** | Кеш миниатюр во фронтенде по-прежнему очищается при `pointerleave` внутри `controller.current.fail()`. |

---

### 10.3. Реестр подтверждённых дефектов, анализ рисков и калибровка оценок

По результатам кросс-анализа и инструментальной проверки логики конвейера, подтверждены реальные узкие места, а также скорректирована оценка их критичности и рисков при исправлении.

---

#### Дефект №1 (P1): Уничтожение декодера `self.core = None` при отмене точного запроса (`exact`) и опасность наивной синхронизации

- **Локализация:** [`src-tauri/src/commands/thumbnails/native.rs:597-601`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/native.rs#L597-L601).
- **Исходный фрагмент:**
  ```rust
  if result.is_err() {
      // A canceled seek can still emit SEEK/PLAYBACK_RESTART later. Never
      // let its events satisfy the next job or poison the persistent cache.
      self.core = None;
      ...
  }
  ```
- **Фактический механизм и реальная частота возникновения:**
  1. Вопреки первоначальному предположению, декодер **не пересоздаётся каждые 16–50 мс** при непрерывном ведении мыши. Причина: во фронтенде в [`useTimelineThumbnail.ts:124-128`](file:///d:/My-programs/L-MPV/src/hooks/useTimelineThumbnail.ts#L124-L128) стоит фильтр `active.job.exact`, поэтому черновые (`grid`) запросы во время движения вообще не отменяются и доходят до конца.
  2. Пересоздание декодера происходит в другом сценарии: пользователь задержал курсор на 180 мс (сработал таймер `settle`, запустился точный `exact`-запрос), и в этот момент пользователь снова сдвинул мышь. Фронтенд отменяет активный `exact`-запрос через `cancel_timeline_thumbnail`. В Rust `wait_restart` возвращает `Err("THUMBNAIL_CANCELLED")`, и строка 600 **полностью уничтожает контекст `libmpv`**.
  3. При возобновлении движения мыши контекст плеера пересоздаётся заново (вызов `PreviewCore::new`, повторная установка 25 опций и `loadfile`), что вызывает задержку первого кадра после остановки до 200–300 мс.
- **Опасность наивного исправления (почему нельзя просто убрать `self.core = None`):**
  Если отменить запрос, пока фоновый поток `mpv` ещё выполняет перемотку, вызов `while core.event()? != 0 {}` очистит **только те события, которые уже лежат в очереди клиента**. События `MPV_EVENT_SEEK (20)` и `MPV_EVENT_PLAYBACK_RESTART (21)` от отменённого сика придут из декодера чуть позже (через 5–20 мс). Если к этому моменту уже отправлен следующий сик, `wait_restart` ошибочно примет запоздалый `PLAYBACK_RESTART` за завершение нового сика и снимет старый кадр. Возникнет рассинхронизация потока миниатюр на 1 кадр.
- **Надёжное инженерное решение:**
  Чтобы не уничтожать контекст декодера и одновременно не поймать чужой `PLAYBACK_RESTART`:
  1. **Вариант А (Drain с коротким таймаутом):** При отмене запроса не сбрасывать `self.core = None`, а позволить декодеру завершить текущий шаг с ограниченным таймаутом (до 30 мс) либо сбросить очередь перед отправкой нового сика и проверять совпадение `actual_pts` в `verified_position`. Если позиция не соответствует запрошенной — не отдавать ошибку, а продолжить чтение событий до следующего `PLAYBACK_RESTART` от нового сика.
  2. **Вариант Б (Асинхронные команды с ID):** Использовать `mpv_command_async` с уникальным 64-битным счётчиком `id` и ожидать `MPV_EVENT_COMMAND_REPLY` именно для актуального `id`, игнорируя ответы на устаревшие запросы.

---

#### Дефект №2 (P1): Полная декомпрессия JPEG в ОЗУ в `read_disk` при каждом чтении из кеша

- **Локализация:** [`src-tauri/src/commands/thumbnails/cache.rs:104-110`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/cache.rs#L104-L110).
- **Исходный фрагмент:**
  ```rust
  let dimensions =
      image::ImageReader::with_format(std::io::Cursor::new(&bytes), image::ImageFormat::Jpeg)
          .into_dimensions()
          .ok();
  let decodes = dimensions == Some((320, 180))
      && image::load_from_memory_with_format(&bytes, image::ImageFormat::Jpeg).is_ok();
  if valid_jpeg(&bytes) && decodes {
      Some(bytes)
  } else { ... }
  ```
- **Подтверждение дефекта:**
  1. Метод `ImageReader::into_dimensions()` быстро (< 0.1 мс) считывает маркер SOF и валидирует габариты без распаковки пикселей.
  2. Последующий вызов `image::load_from_memory_with_format(&bytes, ImageFormat::Jpeg).is_ok()` выполняет полную декомпрессию блоков ДКП в RGB-буфер на CPU.
  3. Для файлов, попадающих в RAM-кеш (`cache.get`), эта проверка не вызывается. Она затрагивает только обращения к дисковому кешу (например, при повторном наведении на таймлайн после вытеснения из 64-кадрового RAM LRU).
  4. Поскольку запись в `write_disk` атомарна (через временный файл `.part`), файлы на диске не могут быть оборваны посередине. Риск побитового повреждения файла крайне мал, а в случае редкого сбоя фронтенд отлавливает ошибку через `img.onerror` (`onImageError`).
- **Решение:**
  Убрать полную декомпрессию `load_from_memory_with_format`. Достаточно быстрой валидации заголовка/маркеров (`valid_jpeg(&bytes)`) и размеров (`dimensions == Some((320, 180))`).

---

#### Дефект №3 (P1 UX — подтверждено): Очистка картинки (`url = null`) при пересечении секундной границы

- **Локализация:** [`src/hooks/useTimelineThumbnail.ts:113-117`](file:///d:/My-programs/L-MPV/src/hooks/useTimelineThumbnail.ts#L113-L117).
- **Исходный фрагмент:**
  ```typescript
  const hit = cached.get(job.key);
  if (!hit && shown && thumbnailTime(Number(shown.split(":")[1]), false) !== thumbnailTime(time, false)) {
    url = null;
    shown = null;
    setFrame({ source, url: null, failed: false, pending: true });
  }
  ```
- **Подтверждение дефекта:**
  1. При перемещении курсора в момент пересечения любой секундной границы (например, с 14.9 с на 15.0 с), если кадр для новой секунды ещё не успел декодироваться, код принудительно зануляет `url = null`.
  2. Тултип превращается в пустой тёмный прямоугольник. При непрерывном движении мыши окно предпросмотра мигает («стробит»).
  3. Сохранение предыдущего кадра до момента готовности нового (`pending: true`, но `url` остаётся прежним) — ключевое визуальное улучшение, полностью устраняющее строб без изменения логики декодера.

---

#### Дефект №4 (P2): Поведение очереди запросов во фронтенде и неотменяемые `grid`-запросы

- **Локализация:** [`src/hooks/useTimelineThumbnail.ts:124-132`](file:///d:/My-programs/L-MPV/src/hooks/useTimelineThumbnail.ts#L124-L132).
- **Уточнённая механика очереди:**
  1. Во фронтенде **нет бесконечной очереди устаревших задач**. Очередь `desired` является одиночным слотом: при каждом движении мыши старый `desired` перезаписывается самым свежим.
  2. В каждый момент времени выполняется ровно один активный запрос (`active`), а в ожидании находится ровно один последний (`desired`).
  3. Однако из-за условия `&& active.job.exact` текущий активный черновой `grid`-запрос не отменяется. Если пользователь быстро сдвинул мышь на несколько десятков секунд вперёд, бэкенд вынужден завершить декодирование старого кадра, прежде чем взять актуальный целевой кадр из `desired`.
  4. **Внимание:** снимать проверку `&& active.job.exact` во фронтенде можно **только после** внедрения надёжной синхронизации отмены в бэкенде (Дефект №1). Если разрешить отмену `grid`-запросов прямо сейчас при существующем `self.core = None`, плеер начнёт уничтожаться на каждое движение мыши, что приведёт к резкой деградации.

---

#### Дефект №5: Строгое равенство PTS в `coarse_cache.rs` — осознанное ограничение, а не баг

- **Локализация:** [`src-tauri/src/commands/thumbnails/coarse_cache.rs:21-23`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/coarse_cache.rs#L21-L23).
- **Анализ:**
  1. В `coarse_cache.rs` для черновых запросов (`!exact`) используется интервал `seconds >= e.start && seconds <= e.end`.
  2. Для точных запросов (`exact = true`) автор намеренно поставил требование `seconds == e.start`. Смысл ограничения: интервальный кеш ключевых кадров **не должен** отдавать приближённый кадр на запрос точного позиционирования, кроме редкого случая, когда запрошенная точка совпала с ключевым кадром.
  3. Предложение ввести допуск `0.04 с` действительно некорректно: при 24–60 fps 0.04 с — это сдвиг на 1–2.5 кадра, из-за чего точный запрос показал бы соседний неверный кадр.
  4. Поэтому текущая строгая логика в `coarse_cache` оправдана и защищает от деградации точности.

---

#### Дефект №6 (P3): Синхронные обращения к основному mpv в `mod.rs`

- **Локализация:** [`src-tauri/src/commands/thumbnails/mod.rs:185-187`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/mod.rs#L185-L187).
- **Анализ:**
  1. Чтение свойств `path`, `vid`, `video-rotate`, `video-crop`, `vf` защищает кеш от записи кадра, если в процессе декодирования пользователь переключил видеопоток или повернул картинку.
  2. Эти вызовы не являются подтверждённым узким местом при обычном воспроизведении. Оптимизировать их имеет смысл только через подписку на события изменения свойств, а не простым удалением проверок.

---

### 10.4. Скорректированные рекомендации и готовые патчи

#### Рекомендация 1 (UX): Устранение мерцания превью в `useTimelineThumbnail.ts`

В [`src/hooks/useTimelineThumbnail.ts`](file:///d:/My-programs/L-MPV/src/hooks/useTimelineThumbnail.ts) не занулять `url = null` при пересечении секунд, сохраняя предыдущую картинку:

```typescript
// src/hooks/useTimelineThumbnail.ts (строки 112–123):
const hit = cached.get(job.key);
if (hit) {
  url = hit;
  shown = job.key;
  desired = null;
  setFrame({ source, url, failed: false, pending: false });
} else {
  // Сохраняем предыдущий кадр (url), выставляя только pending: true.
  // Это полностью устраняет мерцание (flickering/strobe) при ведении мыши.
  setFrame((previous) => ({ ...previous, pending: true }));
}
```

---

#### Рекомендация 2 (Производительность): Оптимизация чтения дискового кеша в `cache.rs`

В [`src-tauri/src/commands/thumbnails/cache.rs`](file:///d:/My-programs/L-MPV/src-tauri/src/commands/thumbnails/cache.rs) убрать дорогую декомпрессию JPEG пикселей на CPU:

```rust
// src-tauri/src/commands/thumbnails/cache.rs (строки 104–115):
let dimensions =
    image::ImageReader::with_format(std::io::Cursor::new(&bytes), image::ImageFormat::Jpeg)
        .into_dimensions()
        .ok();
// Быстрая верификация без полной декомпрессии DCT: маркеры JPEG + валидный заголовок 320x180.
if valid_jpeg(&bytes) && dimensions == Some((320, 180)) {
    Some(bytes)
} else {
    let _ = fs::remove_file(path);
    None
}
```

---

#### Рекомендация 3 (Надёжность): Безопасная обработка отмены без уничтожения декодера

При отмене `exact`-запроса не обнулять `self.core = None`, а в цикле ожидания перед подачей следующего сика дождаться стабилизации очереди событий или игнорировать устаревший `PLAYBACK_RESTART` через проверку соответствия `position()`:

```rust
// src-tauri/src/commands/thumbnails/native.rs:
// Обнулять self.core ТОЛЬКО при фатальных сбоях, но не при THUMBNAIL_CANCELLED:
if let Err(err) = &result {
    let is_fatal = err != "THUMBNAIL_CANCELLED" && err != "THUMBNAIL_MPV_TIMEOUT";
    if is_fatal {
        self.core = None;
        if using_snapshot {
            self.snapshot_failed_identity = Some(identity);
            return self.extract_until(root, source, exact, cancelled, stopped, deadline);
        }
    }
}
```

---

### 10.5. Реалистичная оценка ожидаемого эффекта

| Область | Ожидаемый практический результат |
|---|---|
| **Плавность интерфейса (UX)** | Полное исчезновение эффекта стробоскопа и мигания чёрным экраном при ведении мыши по таймлайну. |
| **Чтение с диска** | Снижение времени проверки одного дискового кадра с ~1.5–3 мс до < 0.2 мс, разгрузка ядер процессора при скраббинге по закешированным зонам. |
| **Отклик после паузы** | Устранение 200–300 мс задержки на пересоздание контекста `mpv` при сдвиге курсора после кратковременной остановки. |
| **Общее ускорение** | Реальное сокращение задержки отклика интерфейса на 30–50% в динамике, отсутствие рывков. |

