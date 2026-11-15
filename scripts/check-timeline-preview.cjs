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

let previewPreference = null;
let preferenceEvents = 0;
const previewSettings = load('src/utils/timelinePreviewPreference.ts', {}, {
  localStorage: { getItem: () => previewPreference, setItem: (_, value) => { previewPreference = value; } },
  window: { dispatchEvent: () => { preferenceEvents++; } },
});
assert.equal(previewSettings.isTimelinePreviewEnabled(), true);
previewSettings.setTimelinePreviewEnabled(false);
assert.equal(previewSettings.isTimelinePreviewEnabled(), false);
assert.equal(preferenceEvents, 1);
previewSettings.setTimelinePreviewEnabled(true);
assert.equal(previewSettings.isTimelinePreviewEnabled(), true);

const geometry = load('src/utils/timelineThumbnail.ts', {});
assert.equal(geometry.thumbnailTime(12.3456, false), 12);
assert.equal(geometry.thumbnailTime(12.3456, true), 12.346);
assert.equal(geometry.thumbnailTime(12.3456, true, 24), 12.333, 'exact keys snap to the video frame');
assert.equal(geometry.thumbnailTime(12.34, true, 24), geometry.thumbnailTime(12.35, true, 24), 'pixels on one frame share a key');
assert.equal(geometry.thumbnailWidth(1, 1), 320);
assert.equal(geometry.thumbnailWidth(1.5, 1), 400);
assert.equal(geometry.thumbnailWidth(2, 1), 480);
assert.equal(geometry.thumbnailWidth(3, 1.25), 480, 'width is bounded');
assert.equal(geometry.thumbnailWidth(NaN, 0), 320);
assert(geometry.frameTolerance(24) > 1 / 24 && geometry.frameTolerance(0) === 0.25);
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

const windowListeners = new Map();
const hooks = [];
let cursor = 0, dirty = true, effects = [], props, result, clock = 0, timerId = 0;
const timers = new Map(), requests = [], cancellations = [], urls = new Set(), other = [];
let urlId = 0;

const react = {
  useState(initial) {
    const i = cursor++;
    hooks[i] ??= { value: typeof initial === 'function' ? initial() : initial };
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
  if (command !== 'get_timeline_thumbnail') {
    other.push({ command, args });
    return new Promise(() => {});
  }
  return new Promise((resolve, reject) => requests.push({ args, resolve, reject }));
};

const testGlobals = {
  window: {
    addEventListener(name,fn){if(!windowListeners.has(name))windowListeners.set(name,new Set());windowListeners.get(name).add(fn);},
    removeEventListener(name,fn){windowListeners.get(name)?.delete(fn);}
  },
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
  Blob: class { constructor(parts, options) { this.parts = parts; this.type = options?.type; } },
  setTimeout(fn, ms) {
    const id = ++timerId;
    timers.set(id, { fn, at: clock + ms });
    return id;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
};

// One bundle so the hook and the test share the same storyboard store.
const compiled = esbuild.buildSync({
  stdin: {
    contents: "export * from './src/hooks/useTimelineThumbnail'; export { timelineStoryboard, parseStoryboard, storyboardKey } from './src/utils/timelineStoryboard'; export { prewarmTimelineThumbnail } from './src/hooks/useTimelineStoryboard';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', '@tauri-apps/api/core'],
});
const bundle = { exports: {} };
new Function('module', 'exports', 'require', ...Object.keys(testGlobals), compiled.outputFiles[0].text)(
  bundle, bundle.exports, name => ({ react, '@tauri-apps/api/core': { invoke } })[name], ...Object.values(testGlobals)
);
const { useTimelineThumbnail, clearTimelineThumbnailCache, timelineStoryboard, parseStoryboard, storyboardKey, prewarmTimelineThumbnail } = bundle.exports;

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

const options = (extra = {}) => ({ fps: 0, width: 320, now: () => clock, ...extra });
async function update(path, track, seconds, enabled = true, extra = {}) {
  props = [path, track, seconds, enabled, options(extra)];
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
const unmount = () => { hooks.forEach(h => h.cleanup?.()); hooks.length = 0; effects = []; };

const bytes = () => new Uint8Array([255, 216, 1, 255, 217]).buffer;

/** Wire-format storyboard (see storyboard.rs) with the given tiles. */
function storyboardBuffer(status, count, interval, seq, tiles) {
  const size = 24 + tiles.reduce((sum, tile) => sum + 16 + 5, 0);
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint32(0, status, true); view.setUint32(4, count, true); view.setFloat64(8, interval, true);
  view.setUint32(16, seq, true); view.setUint32(20, tiles.length, true);
  let at = 24;
  for (const tile of tiles) {
    view.setUint32(at, tile.index, true); view.setFloat64(at + 4, tile.time, true); view.setUint32(at + 12, 5, true);
    new Uint8Array(buffer, at + 16, 5).set([255, 216, tile.index & 255, 255, 217]);
    at += 21;
  }
  return buffer;
}

(async () => {
  // ── Wire format and lookup ──────────────────────────────────────────────
  const parsed = parseStoryboard(storyboardBuffer(1, 300, 2, 7, [{ index: 5, time: 10 }, { index: 299, time: 598 }]));
  assert.equal(parsed.count, 300); assert.equal(parsed.interval, 2); assert.equal(parsed.tiles.length, 2);
  assert.equal(parsed.tiles[1].time, 598);
  assert.equal(parseStoryboard(new ArrayBuffer(8)), null, 'short buffer is rejected');
  assert.equal(parseStoryboard(storyboardBuffer(1, 4, 2, 1, [{ index: 9, time: 0 }])), null, 'out of range index is rejected');

  // ── FHD without a storyboard yet: keyframes while moving, exact at rest ──
  await update('C:/first.mkv', 1, 10);
  assert.equal(requests.length, 1, 'first request starts immediately');
  assert.equal(requests[0].args.exact, false, 'moving cursor first gets the cheap keyframe');
  assert.equal(requests[0].args.width, 320, 'live width is sent to the backend');
  for (let i = 1; i <= 100; i++) { await advance(16); await update('C:/first.mkv', 1, 10 + i * .1); }
  assert.equal(requests.length, 1, 'only one active request during continuous movement');
  assert.equal(cancellations.length, 0, 'motion alone does not abort keyframe decoding');
  requests[0].resolve(bytes()); await flush();
  assert(result.src, 'keyframe is visible during movement');
  assert.equal(result.kind, 'grid');
  assert.equal(requests.length, 2, 'only the latest pending keyframe is dispatched');
  assert.equal(requests[1].args.seconds, 20); assert.equal(requests[1].args.exact, false);
  await advance(40);
  requests[1].resolve(bytes()); await flush();
  const refine = requests.at(-1);
  assert.equal(refine.args.exact, true, 'resting cursor asks for the exact frame');
  assert.equal(refine.args.seconds, 20);
  refine.resolve(bytes()); await flush();
  assert.equal(result.kind, 'exact'); assert.equal(result.seconds, 20);
  const cached = result.src;
  await update('C:/first.mkv', 1, 30); const obsolete = requests.at(-1);
  await update('C:/first.mkv', 1, 20);
  assert.equal(result.src, cached, 'cached exact frame wins immediately');
  assert(cancellations.includes(obsolete.args.requestId), 'cached return cancels obsolete decoding');
  obsolete.reject('THUMBNAIL_MPV_TIMEOUT'); await flush();
  assert.equal(result.src, cached, 'obsolete error cannot clear cached image'); assert(!result.failed);
  // A late keyframe for a far position must not replace the nearer cached exact frame.
  await update('C:/first.mkv', 1, 50); const late = requests.at(-1);
  await update('C:/first.mkv', 1, 20); late.resolve(bytes()); await flush();
  assert.equal(result.src, cached, 'late reply for another position stays in cache');

  // ── Storyboard: instant tiles during a fast sweep, no decoding ───────────
  unmount(); await advance(1000);
  const key = storyboardKey('C:/board.mkv', 1, 0);
  const tiles = Array.from({ length: 300 }, (_, index) => ({ index, time: index * 2 }));
  timelineStoryboard.apply(key, parseStoryboard(storyboardBuffer(2, 300, 2, 300, tiles)));
  assert.equal(timelineStoryboard.lookup(key, 101).time, 100);
  assert.equal(timelineStoryboard.lookup('other', 101), null);
  await update('C:/board.mkv', 1, 100);
  assert.equal(result.kind, 'tile', 'storyboard tile shows before any decoding');
  assert.equal(result.seconds, 100);
  const sweepStart = requests.length;
  const seen = new Set();
  for (let i = 1; i <= 40; i++) {
    await advance(16); await update('C:/board.mkv', 1, 100 + i * 10);
    seen.add(result.src);
  }
  assert.equal(seen.size, 40, 'every move of a fast sweep shows a new frame');
  assert(requests.length - sweepStart <= 1, 'a fast sweep does not queue live decoding');
  assert.equal(result.seconds, 500);
  const firstKeyframe = requests.at(-1);
  await advance(40);
  assert(cancellations.includes(firstKeyframe.args.requestId), 'keyframe for the sweep start is cancelled at rest');
  firstKeyframe.reject('THUMBNAIL_CANCELLED'); await flush();
  const restExact = requests.at(-1);
  assert.equal(restExact.args.exact, true, 'stopping after a sweep asks for the exact frame');
  assert.equal(restExact.args.seconds, 500);
  restExact.resolve(bytes()); await flush();
  assert.equal(result.kind, 'exact');
  // Slow movement with a storyboard still refines with keyframes.
  const slowStart = requests.length;
  for (let i = 1; i <= 10; i++) { await advance(16); await update('C:/board.mkv', 1, 500 + i * .25); }
  assert(requests.length > slowStart, 'slow movement refines with live keyframes');
  requests.forEach(r => r.reject('THUMBNAIL_CANCELLED')); await flush(); await advance(100);
  requests.at(-1).resolve(bytes()); await flush();
  // A finished frame for an old position never hides the nearer tile.
  await update('C:/board.mkv', 1, 200); await advance(16);
  const stale = requests.at(-1);
  await update('C:/board.mkv', 1, 400);
  assert.equal(result.kind, 'tile'); assert.equal(result.seconds, 400);
  stale.resolve(bytes()); await flush();
  assert.equal(result.seconds, 400, 'stale live frame does not replace the nearer tile');
  // A revoked tile (storyboard reset) clears the image without counting as failure.
  result.onImageError(); await flush();
  assert(!result.failed); assert.equal(result.src, null);
  requests.forEach(r => r.reject('THUMBNAIL_CANCELLED')); await flush();
  unmount(); timelineStoryboard.reset(); await advance(1000);

  // ── Transform invalidation, cache reuse, file change ─────────────────────
  for (const listener of [...(windowListeners.get('l-mpv-preview-transform-changed') || [])]) listener();
  const before = requests.length; await update('C:/first.mkv', 1, 20);
  assert.equal(result.src, null); assert.equal(requests.length, before + 1, 'transform change while closed invalidates cached frame');
  requests.at(-1).resolve(bytes()); await flush(); await advance(40);
  requests.at(-1).resolve(bytes()); await flush();
  unmount();
  const beforeReopen = requests.length; await update('C:/first.mkv', 1, 20);
  assert(result.src); assert.equal(result.kind, 'exact');
  assert.equal(requests.length, beforeReopen, 'unchanged popup reopen uses cache');
  // HiDPI width is part of the cache identity.
  await update('C:/first.mkv', 1, 20, true, { width: 480 });
  assert.equal(result.src, null, 'another thumbnail width does not reuse 320px frames');
  assert.equal(requests.at(-1).args.width, 480);
  requests.at(-1).reject('THUMBNAIL_CANCELLED'); await flush();
  await update('C:/second.mkv', 2, 10); assert.equal(result.src, null);
  requests.at(-1).reject('THUMBNAIL_UNAVAILABLE'); await flush(); assert(!result.failed);
  await update('C:/second.mkv', 2, 11); requests.at(-1).resolve(bytes()); await flush();
  for (let i = 0; i < 24; i++) {
    await update('C:/cache.mkv', 1, i * 5); requests.at(-1).resolve(bytes()); await flush();
    await advance(40); requests.at(-1).resolve(bytes()); await flush();
    assert(urls.size <= 12, 'memory cache keeps at most 12 blob URLs');
  }
  await update('C:/cache.mkv', 1, 200); await update('C:/cache.mkv', 1, 201);
  const last = requests.at(-1); await update('C:/cache.mkv', 1, 201, false); last.resolve(bytes()); await flush();
  assert.equal(result.src, null); assert.equal(urls.size, 0); assert.equal(timers.size, 0);

  // ── Frame-accurate keys with fps ─────────────────────────────────────────
  await update('C:/fps.mkv', 1, 42.34, true, { fps: 24 }); requests.at(-1).resolve(bytes()); await flush();
  await advance(40);
  const exact24 = requests.at(-1);
  assert.equal(exact24.args.seconds, 42.333); assert(exact24.args.exact);
  exact24.resolve(bytes()); await flush();
  const count = requests.length;
  await update('C:/fps.mkv', 1, 42.35, true, { fps: 24 }); await advance(40);
  assert.equal(requests.length, count, 'another pixel on the same frame reuses the exact frame');
  assert.equal(result.kind, 'exact');

  // ── Errors and retries ───────────────────────────────────────────────────
  await update('C:/retry.mkv', 1, 10); requests.at(-1).reject('THUMBNAIL_MPV_TIMEOUT'); await flush();
  await update('C:/retry.mkv', 1, 20); const oldRetry = requests.at(-1);
  await update('C:/retry.mkv', 1, 30); await update('C:/retry.mkv', 1, 10);
  oldRetry.resolve(bytes()); await flush();
  assert.equal(requests.at(-1).args.seconds, 10, 'return after an error replaces stale pending target');
  requests.at(-1).resolve(bytes()); await flush(); await advance(40);
  requests.at(-1).resolve(bytes()); await flush(); assert.equal(result.seconds, 10);
  result.onImageError(); await flush();
  assert(requests.at(-1).args.refresh, 'image failure retries once bypassing backend cache');
  requests.at(-1).resolve(bytes()); await flush(); assert(result.src);
  result.onImageError(); await flush(); assert(result.failed, 'second image error terminates retries');
  unmount(); clearTimelineThumbnailCache();

  // ── Prewarm is throttled per file ────────────────────────────────────────
  prewarmTimelineThumbnail('C:/warm.mkv', 1, 320, 10_000);
  prewarmTimelineThumbnail('C:/warm.mkv', 1, 320, 11_000);
  prewarmTimelineThumbnail('C:/warm.mkv', 1, 320, 12_500);
  prewarmTimelineThumbnail('C:/other.mkv', 1, 320, 12_600);
  assert.equal(other.filter(call => call.command === 'prewarm_timeline_thumbnail').length, 3);
  console.log('PASS storyboard wire/lookup, instant tiles in fast sweeps, keyframes while moving, exact at rest, nearest-frame choice, fps keys, HiDPI width, transform invalidation, errors, URL bounds and prewarm throttle');
})().catch(error=>{console.error(error);process.exitCode=1;});
