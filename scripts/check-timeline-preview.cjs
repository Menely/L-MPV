const assert = require('node:assert/strict');
const esbuild = require('esbuild');

function load(entry, imports, globals = {}) {
  const compiled = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', '@tauri-apps/api/core']
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', ...Object.keys(globals), compiled.outputFiles[0].text)(
    mod, mod.exports, name => imports[name], ...Object.values(globals)
  );
  return mod.exports;
}

const geometry = load('src/utils/timelineThumbnail.ts', {});
assert.equal(geometry.thumbnailTime(12.3456, false), 12);
assert.equal(geometry.thumbnailTime(12.3456, true), 12.346);
assert(geometry.supportsTimelineThumbnail('C:\\Video\\movie.mkv', true));
assert(!geometry.supportsTimelineThumbnail('https://host/video.mkv', true));
assert(!geometry.supportsTimelineThumbnail('C:/song.flac', false));
for (const ratio of [0, 0.5, 1]) {
  for (const zoom of [1, 1.5]) {
    const left = geometry.timelinePreviewLeft(ratio, 30, 360, 252 * zoom, 420, zoom);
    const center = 30 + left * zoom;
    assert(center - 126 * zoom >= 8 && center + 126 * zoom <= 412);
  }
}

const hooks = [];
let cursor = 0, dirty = true, effects = [], props, result, clock = 0, timerId = 0;
const timers = new Map(), requests = [], cancellations = [], urls = new Set();
let urlId = 0;

const react = {
  useState(initial) {
    const i = cursor++;
    hooks[i] ??= { value: initial };
    return [
      hooks[i].value,
      value => {
        const next = typeof value === 'function' ? value(hooks[i].value) : value;
        if (!Object.is(next, hooks[i].value)) {
          hooks[i].value = next;
          dirty = true;
        }
      }
    ];
  },
  useRef(initial) {
    const i = cursor++;
    hooks[i] ??= { current: initial };
    return hooks[i];
  },
  useEffect(callback, deps) {
    const i = cursor++;
    const old = hooks[i];
    if (!old || deps.some((dep, n) => !Object.is(dep, old.deps[n]))) {
      hooks[i] = { deps, cleanup: old?.cleanup };
      effects.push(() => {
        hooks[i].cleanup?.();
        hooks[i].cleanup = callback();
      });
    }
  },
};

const invoke = (command, args) => {
  if (command === 'cancel_timeline_thumbnail') {
    cancellations.push(args.requestId);
    return Promise.resolve();
  }
  assert.equal(command, 'get_timeline_thumbnail');
  return new Promise((resolve, reject) => requests.push({ args, resolve, reject }));
};

const { useTimelineThumbnail, clearTimelineThumbnailCache } = load(
  'src/hooks/useTimelineThumbnail.ts',
  { react, '@tauri-apps/api/core': { invoke } },
  {
    window: { addEventListener() {}, removeEventListener() {} },
    URL: {
      createObjectURL() {
        const url = 'blob:frame-' + (++urlId);
        urls.add(url);
        return url;
      },
      revokeObjectURL(url) {
        urls.delete(url);
      }
    },
    setTimeout(fn, ms) {
      const id = ++timerId;
      timers.set(id, { fn, at: clock + ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  }
);

async function flush() {
  for (let i = 0; i < 12; i++) {
    if (dirty) {
      dirty = false;
      cursor = 0;
      result = useTimelineThumbnail(...props);
      const pending = effects;
      effects = [];
      pending.forEach(fn => fn());
    }
    await Promise.resolve();
  }
}

async function update(next) {
  props = next;
  dirty = true;
  await flush();
}

async function advance(ms) {
  clock += ms;
  for (const [id, timer] of [...timers]) {
    if (timer.at <= clock) {
      timers.delete(id);
      timer.fn();
    }
  }
  await flush();
}

const bytes = () => new Uint8Array([255, 216, 1, 255, 217]).buffer;

(async () => {
  // 1. Дебаунс 35 мс: быстрое перемещение курсора объединяется в один точный запрос
  await update(['C:/first.mkv', 1, 10.5, true]);
  assert.equal(requests.length, 0, 'debounce prevents immediate request on first move');
  await advance(20);
  assert.equal(requests.length, 0, 'within debounce interval no request dispatched');
  await update(['C:/first.mkv', 1, 350.5, true]);
  await advance(35);
  assert.equal(requests.length, 1, 'only latest exact job is queued after debounce fires');
  assert.equal(requests[0].args.seconds, 350.5);
  assert.equal(requests[0].args.exact, true);

  // 2. Успешный ответ сразу отображается и помещается в кэш
  requests[0].resolve(bytes());
  await flush();
  assert(result.src, 'exact frame displays immediately without intermediate keyframe');
  assert.equal(urls.size, 1);

  // 3. Отмена активного запроса при смещении на новую позицию
  await update(['C:/first.mkv', 1, 351, true]);
  await advance(35);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].args.seconds, 351);
  assert.equal(requests[1].args.exact, true);

  await update(['C:/first.mkv', 1, 352, true]);
  await advance(35);
  assert(cancellations.includes(requests[1].args.requestId), 'in-flight request is cancelled');

  requests[1].resolve(bytes());
  await flush();
  assert.equal(urlId, 1, 'late reply from cancelled request is discarded');

  assert.equal(requests.length, 3, 'next request is dispatched once in-flight finished');
  assert.equal(requests[2].args.seconds, 352);

  requests[2].resolve(bytes());
  await flush();
  assert(result.src);
  assert.equal(urls.size, 2);

  // 4. Смена источника сбрасывает кэш и ссылки
  await update(['C:/second.mkv', 2, 20, true]);
  assert.equal(result.src, null);
  assert.equal(urls.size, 0, 'switching source revokes previous source urls');
  await advance(35);
  assert.equal(requests.at(-1).args.seconds, 20);
  requests.at(-1).resolve(bytes());
  await flush();
  assert(result.src);
  assert.equal(urls.size, 1);

  // 5. Выключение предпросмотра (enabled=false) очищает кадр
  await update(['C:/second.mkv', 2, 20, false]);
  assert.equal(result.src, null);
  assert.equal(urls.size, 0);

  // 6. Попадание в кэш ОЗУ отдает точный кадр МГНОВЕННО (0 мс) без вызова IPC
  await update(['C:/cached.mkv', 1, 10, true]);
  await advance(35);
  requests.at(-1).resolve(bytes());
  await flush();
  const cachedUrl = result.src;
  assert(cachedUrl);

  const beforeCacheHit = requests.length;
  await update(['C:/cached.mkv', 1, 30, true]);
  await advance(35);
  requests.at(-1).resolve(bytes());
  await flush();
  assert.notEqual(result.src, cachedUrl);

  // Возврат на 10.0: должен отобразиться мгновенно без IPC
  await update(['C:/cached.mkv', 1, 10, true]);
  assert.equal(result.src, cachedUrl, 'RAM cache hit returns immediately without debounce delay');
  assert.equal(requests.length, beforeCacheHit + 1, 'no new IPC request is dispatched on cache hit');

  // 7. Ошибки декодирования
  await update(['C:/broken.mkv', 1, 10, true]);
  await advance(35);
  requests.at(-1).reject(Error('decode'));
  await flush();
  assert(result.failed, 'fatal decode error marks frame as failed');

  // 8. Временная недоступность (THUMBNAIL_UNAVAILABLE) не блокирует следующие ховеры
  await update(['C:/transient.mkv', 1, 10, true]);
  await advance(35);
  requests.at(-1).reject('THUMBNAIL_UNAVAILABLE');
  await flush();
  assert(!result.failed, 'transient error does not permanently disable preview');

  await update(['C:/transient.mkv', 1, 11, true]);
  await advance(35);
  requests.at(-1).resolve(bytes());
  await flush();
  assert(result.src);

  // 9. Ограничение емкости кэша (12 кадров)
  for (let i = 0; i < 24; i++) {
    await update(['C:/cache-limit.mkv', 1, i * 5, true]);
    await advance(35);
    requests.at(-1).resolve(bytes());
    await flush();
    assert(urls.size <= 12, 'cache entries must not exceed MAX_READY_FRAMES');
  }

  // 10. Очистка хука и сброс кэша
  hooks.forEach(hook => hook.cleanup?.());
  clearTimelineThumbnailCache();
  assert.equal(urls.size, 0);
  assert.equal(timers.size, 0);

  console.log('PASS timeline geometry, always-exact instant decoding, debounce coalescing, cancellation and bounded LRU cache');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
