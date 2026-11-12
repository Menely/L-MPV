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

const windowListeners = new Map();
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
  await update(['C:/first.mkv',1,10,true]);
  assert.equal(requests.length,1,'first exact request starts immediately');
  for(let i=1;i<=100;i++){await advance(16);await update(['C:/first.mkv',1,10+i*.1,true]);}
  assert.equal(requests.length,1,'only one active request during continuous movement');
  assert.equal(cancellations.length,0,'motion alone does not repeatedly abort decoding');
  requests[0].resolve(bytes());await flush();
  assert(result.src,'completed exact frame is visible during movement');
  assert.equal(result.seconds,10,'visible image carries its own timestamp');
  assert.equal(requests.length,2,'only latest pending target is dispatched');
  assert.equal(requests[1].args.seconds,20);
  requests[1].resolve(bytes());await flush();assert.equal(result.seconds,20);
  const cached=result.src;
  await update(['C:/first.mkv',1,30,true]);const obsolete=requests.at(-1);
  await update(['C:/first.mkv',1,20,true]);
  assert.equal(result.src,cached);
  assert(cancellations.includes(obsolete.args.requestId),'cached return cancels obsolete decoding');
  obsolete.reject('THUMBNAIL_MPV_TIMEOUT');await flush();
  assert.equal(result.src,cached,'obsolete error cannot clear cached image');assert(!result.failed);
  await update(['C:/first.mkv',1,40,true]);const settling=requests.at(-1);
  await update(['C:/first.mkv',1,41,true]);await advance(120);
  assert(cancellations.includes(settling.args.requestId),'resting pointer prioritizes final exact target');
  settling.reject('THUMBNAIL_CANCELLED');await flush();assert.equal(requests.at(-1).args.seconds,41);
  requests.at(-1).resolve(bytes());await flush();assert.equal(result.seconds,41);
  // A cached target reached during cancellation must not be overwritten by a late reply.
  await update(['C:/first.mkv',1,50,true]);const late=requests.at(-1);
  await update(['C:/first.mkv',1,20,true]);late.resolve(bytes());await flush();assert.equal(result.src,cached);
  // Module cache survives popup unmount and is invalidated even while no hook listener exists.
  hooks.forEach(h=>h.cleanup?.());hooks.length=0;effects=[];
  for(const listener of [...(windowListeners.get('l-mpv-preview-transform-changed')||[])])listener();
  const before=requests.length;await update(['C:/first.mkv',1,20,true]);
  assert.equal(result.src,null);assert.equal(requests.length,before+1,'transform change while closed invalidates cached frame');
  requests.at(-1).resolve(bytes());await flush();
  hooks.forEach(h=>h.cleanup?.());hooks.length=0;effects=[];
  const beforeReopen=requests.length;await update(['C:/first.mkv',1,20,true]);
  assert(result.src);assert.equal(requests.length,beforeReopen,'unchanged popup reopen uses cache');
  await update(['C:/second.mkv',2,10,true]);assert.equal(result.src,null);
  requests.at(-1).reject('THUMBNAIL_UNAVAILABLE');await flush();assert(!result.failed);
  await update(['C:/second.mkv',2,11,true]);requests.at(-1).resolve(bytes());await flush();
  for(let i=0;i<24;i++){await update(['C:/cache.mkv',1,i*5,true]);requests.at(-1).resolve(bytes());await flush();assert(urls.size<=12);}
  await update(['C:/cache.mkv',1,200,true]);await update(['C:/cache.mkv',1,201,true]);
  const last=requests.at(-1);await update(['C:/cache.mkv',1,201,false]);last.resolve(bytes());await flush();
  assert.equal(result.src,null);assert.equal(urls.size,0);assert.equal(timers.size,0);
  assert(!geometry.supportsTrickplaySize(1920,1080));
  assert(geometry.supportsTrickplaySize(2160,3840));
  await update(['C:/uhd.mkv',1,42.35,true,true]);
  const coarse=requests.at(-1);assert.equal(coarse.args.seconds,42);assert.equal(coarse.args.exact,false);
  await update(['C:/uhd.mkv',1,42.85,true,true]);
  coarse.resolve(bytes());await flush();assert.equal(result.seconds,42);
  await advance(39);assert.equal(requests.at(-1),coarse);
  await advance(1);const refinement=requests.at(-1);
  assert.equal(refinement.args.exact,true);assert.equal(refinement.args.seconds,42.85);
  refinement.resolve(bytes());await flush();assert.equal(result.seconds,42.85);
  const count=requests.length;await update(['C:/uhd.mkv',1,42.9,true,true]);
  assert.equal(requests.length,count,'same grid uses ready thumbnail');
  await update(['C:/uhd.mkv',1,42.85,true,true]);await advance(120);
  assert.equal(requests.length,count,'cached exact target wins');
  await update(['C:/uhd.mkv',1,50.25,true,true]);const outdated=requests.at(-1);
  await update(['C:/uhd.mkv',1,60.25,true,true]);await advance(40);
  assert(cancellations.includes(outdated.args.requestId),'resting cursor supersedes outdated coarse seek');
  outdated.reject('THUMBNAIL_CANCELLED');await flush();
  assert.equal(requests.at(-1).args.seconds,60.25);assert(requests.at(-1).args.exact);
  hooks.forEach(h=>h.cleanup?.());clearTimelineThumbnailCache();
  console.log('PASS immediate exact queue, motion progress, latest pending, settle cancellation, stale errors, global transform invalidation and URL bounds');
})().catch(error=>{console.error(error);process.exitCode=1;});
