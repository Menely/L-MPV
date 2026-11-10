const assert = require('node:assert/strict');
const vm = require('node:vm');
const esbuild = require('esbuild');
const code = esbuild.buildSync({
  entryPoints: ['src/hooks/useAutoUpscale.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react', '@tauri-apps/api/core'],
}).outputFiles[0].text;

function fixture(locale = 'ru', mode = 'ai', path = 'C:/video.mkv') {
  const storage = new Map([
    ['l-mpv-language', locale], ['l-mpv-upscale-mode', mode],
    ['l-mpv-upscale-backend', 'TensorRT'], ['l-mpv-upscale-slot', '2'],
    ['l-mpv-upscale-selected-model', 'anime.onnx'],
  ]);
  const events = [], calls = [];
  let cleanup, reject, resolve;
  const context = {
    module: { exports: {} }, exports: {}, console,
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
    window: {dispatchEvent: event => events.push(event)},
    Event: class {constructor(type) {this.type = type;}},
    CustomEvent: class {constructor(type, options) {this.type = type;this.detail = options.detail;}},
    require: name => {
      if (name === 'react') return {useEffect: effect => {cleanup = effect();}};
      if (name === '@tauri-apps/api/core') return {invoke: (cmd, args) => {
        calls.push({cmd, args});
        return new Promise((yes, no) => {resolve = yes; reject = no;});
      }};
      throw Error('Unexpected import: ' + name);
    },
  };
  vm.runInNewContext(code, context);
  context.module.exports.useAutoUpscale(path);
  return {storage, events, calls, cancel: () => cleanup?.(), reject: error => reject(error), resolve: () => resolve()};
}
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  for (const locale of ['ru', 'en']) for (const error of [
    'UPSCALE_PLAYER_UPDATE', 'UPSCALE_RUNTIME_UPDATE:TensorRT',
    'UPSCALE_MODEL_REBUILD', 'UPSCALE_RESTART_REQUIRED',
  ]) {
    const f = fixture(locale);
    f.reject(error); await flush();
    assert.equal(f.storage.get('l-mpv-upscale-mode'), 'off');
    assert.equal(f.storage.get('l-mpv-upscale-selected-model'), 'anime.onnx');
    assert(f.events.some(event => event.type === 'l-mpv-settings-changed'));
    const osd = f.events.find(event => event.type === 'show-osd');
    assert(osd.detail.isError && osd.detail.durationMs >= 6000);
    assert(!osd.detail.text.includes('UPSCALE_'));
  }
  const success = fixture(); success.resolve(); await flush();
  assert.equal(success.storage.get('l-mpv-upscale-mode'), 'ai');
  assert.equal(success.events.length, 0);
  const stale = fixture(); stale.cancel(); stale.reject('UPSCALE_MODEL_REBUILD'); await flush();
  assert.equal(stale.events.length, 0); assert.equal(stale.storage.get('l-mpv-upscale-mode'), 'ai');
  const changed = fixture(); changed.storage.set('l-mpv-upscale-selected-model', 'new.onnx');
  changed.reject('UPSCALE_MODEL_REBUILD'); await flush(); assert.equal(changed.events.length, 0);
  const busy = fixture(); busy.reject('UPSCALE_BUSY'); await flush();
  assert.equal(busy.storage.get('l-mpv-upscale-mode'), 'ai');
  assert(busy.events.some(event => event.type === 'show-osd'));
  assert.equal(fixture('ru', 'off').calls.length, 0);
  assert.equal(fixture('ru', 'ai', '').calls.length, 0);
  console.log('PASS auto-AI migration errors RU/EN, preference sync, successful activation, stale results, changed selection, busy and disabled mode');
})().catch(error => {console.error(error); process.exitCode = 1;});
