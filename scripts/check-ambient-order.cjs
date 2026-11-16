const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const esbuild = require('esbuild');

const views = [
  ['src/components/modals/SettingsModal.tsx', 'ambientMountedRef'],
  ['src/components/settings/SettingsPanel.tsx', 'mountedRef'],
];
const tick = () => new Promise(resolve => setImmediate(resolve));
const settings = radius => ({mode: 'blur', blur_radius: radius});

function fixture() {
  let unblock, runtime = 0, stored = 0, active = 0, peak = 0, failNext = false;
  const calls = [], timers = [];
  const invoke = async (command, args) => {
    active++; peak = Math.max(peak, active);
    const radius = args?.settings.blur_radius;
    calls.push([command, radius]);
    try {
      if (radius === 10) await new Promise(resolve => {unblock = resolve;});
      if (failNext) {failNext = false; throw Error('expected write error');}
      runtime = radius;
      if (command === 'set_ambient_settings') stored = radius;
    } finally {active--;}
  };
  const code = esbuild.buildSync({
    entryPoints: ['src/utils/ambientPreviewQueue.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['@tauri-apps/api/core'],
  }).outputFiles[0].text;
  const mod = {exports: {}};
  new Function('module', 'exports', 'require', code)(mod, mod.exports, () => ({invoke}));
  function handler([file, mountedName]) {
    const source = fs.readFileSync(file, 'utf8');
    const start = source.indexOf('const queueAmbientSave =');
    const end = source.indexOf('}, []);', start) + '}, []);'.length;
    assert(start >= 0 && end > start, `Find actual queueAmbientSave in ${file}`);
    const callback = ts.transpileModule(source.slice(start, end), {
      compilerOptions: {target: ts.ScriptTarget.ES2022},
    }).outputText;
    const revision = {current: 1}, mounted = {current: true}, dirty = {current: true};
    const bindings = {
      useCallback: fn => fn, saveAmbientSettings: mod.exports.saveAmbientSettings,
      ambientSaveQueueRef: {current: Promise.resolve()}, ambientSaveRevisionRef: revision,
      isAmbientDirtyRef: dirty, [mountedName]: mounted, ambientSaveTimeoutRef: {current: null},
      console: {error() {}}, setTimeout: fn => {timers.push(fn); return timers.length;}, clearTimeout() {},
    };
    const save = new Function(...Object.keys(bindings), callback + '; return queueAmbientSave;')(...Object.values(bindings));
    return {save, revision, mounted, dirty};
  }
  return {
    ...mod.exports, handler, calls, timers,
    release: () => {assert(unblock, 'Blocked command must have started'); unblock();},
    state: () => ({runtime, stored, peak}), fail: () => {failNext = true;},
  };
}

(async () => {
  for (const view of views) {
    const f = fixture(), local = f.handler(view);
    const first = local.save(settings(10), 1); await tick();
    local.revision.current = 2;
    const second = local.save(settings(20), 2);
    const preset = f.saveAmbientSettings(settings(30));
    f.release(); await Promise.all([first, second, preset]);
    assert.deepEqual(f.calls.map(call => call[1]), [10, 20, 30], `${view[0]}: original save submission order`);
    assert.deepEqual(f.state(), {runtime: 30, stored: 30, peak: 1});

    f.fail(); local.revision.current = 3;
    await local.save(settings(40), 3);
    assert.equal(local.dirty.current, true, 'Failed save remains dirty');
    assert.equal(f.timers.length, 1, 'Failed save schedules a guarded retry');
    local.revision.current = 4; local.mounted.current = false;
    const count = f.calls.length;
    f.timers[0](); await tick();
    assert.equal(f.calls.length, count, 'Stale/unmounted handler must not retry old settings');
  }
  const f = fixture(), modal = f.handler(views[0]), sidebar = f.handler(views[1]);
  const first = modal.save(settings(10), 1); await tick();
  const second = sidebar.save(settings(20), 1);
  const preset = f.saveAmbientSettings(settings(30));
  modal.mounted.current = false;
  f.release(); await Promise.all([first, second, preset]);
  assert.deepEqual(f.calls.map(call => call[1]), [10, 20, 30], 'Layout switch and old-view completion retain shared order');
  assert.deepEqual(f.state(), {runtime: 30, stored: 30, peak: 1});

  const p = fixture(), view = p.handler(views[0]);
  const active = p.applyAmbientPreview(settings(10)); await tick();
  const pending = p.applyAmbientPreview(settings(20));
  const saved = view.save(settings(30), 1);
  p.release(); await Promise.all([active, pending, saved]);
  assert.deepEqual(p.calls, [['apply_ambient_preview', 10], ['set_ambient_settings', 30]], 'Authoritative handler save supersedes queued preview');
  assert.deepEqual(p.state(), {runtime: 30, stored: 30, peak: 1});
  console.log('PASS actual modal/sidebar save handlers: FIFO with preset, layout switch/unmount, superseded previews, stale retry and one active native call');
})().catch(error => {console.error(error); process.exitCode = 1;});
