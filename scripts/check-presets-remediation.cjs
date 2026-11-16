const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function compile(source) {
  return ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
}
const modules = new Map();
const storage = new Map();
let saved = [], failSave = false;
let delayNextRead = false, finishRead, upscaleCalls = 0;
const invoke = async command => {
  if (command === 'save_settings_presets') {
    if (failSave) throw Error('disk unavailable');
    return;
  }
  if (command === 'get_settings_presets') {
    const snapshot = JSON.stringify(saved);
    if (delayNextRead) {
      delayNextRead = false;
      return new Promise(resolve => {finishRead = () => resolve(snapshot);});
    }
    return snapshot;
  }
  if (command === 'get_upscale_status') {upscaleCalls++; return {probe: upscaleCalls};}
  throw Error(command);
};
const globals = {
  localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
  window: {dispatchEvent() {}}, CustomEvent: class {},
};
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {}; modules.set(file, exports);
  const requireModule = name => {
    if (name === '@tauri-apps/api/core') return {invoke: async (cmd, args) => {
      const response = await invoke(cmd);
      if (cmd === 'save_settings_presets') saved = JSON.parse(args.presetsJson);
      return response;
    }};
    if (name.endsWith('presetsUtils')) return load('src/utils/presetsUtils.ts');
    if (name.endsWith('userPresetsCache')) return load('src/utils/userPresetsCache.ts');
    return new Proxy({}, {get: (_, key) => key === 'normalizeAmbientSettings' ? value => value ?? {} : {}});
  };
  new Function('exports', 'require', ...Object.keys(globals), compile(fs.readFileSync(file, 'utf8')))(exports, requireModule, ...Object.values(globals));
  return exports;
}
const presets = load('src/utils/presetsUtils.ts');
const preload = load('src/components/settings/lib/settingsTabPreload.ts');
const componentSource = fs.readFileSync('src/components/settings/sections/PresetsSection.tsx', 'utf8');
function handler(start, end, bindings) {
  const source = componentSource.slice(componentSource.indexOf(start), componentSource.indexOf(end));
  const name = start.match(/const (\w+)/)[1];
  return new Function(...Object.keys(bindings), compile(source) + `; return ${name};`)(...Object.values(bindings));
}
async function checkPresets() {
  const first = {id: 'A', name: 'First'}, second = {id: 'B', name: 'Second'};
  let current = [first, second];
  preload.storeUserPresets(current);
  const bindings = {
    userPresets: current, setUserPresets: value => {current = value;}, saveUserPresets: presets.saveUserPresets,
    activePresetId: null, saveActivePresetId() {}, setActivePresetId() {}, showToast() {},
    dict: {settings: {presets: {toastDeleted: () => '', toastRenamed: () => ''}}},
    editingName: 'Renamed', setEditingId() {},
  };
  await handler('const handleDelete =', '// Кастомный диалог подтверждения', bindings)(first);
  assert.deepEqual((await preload.loadPreloadedUserPresets()).map(p => p.id), ['B'], 'Deleted preset must stay deleted after reopen');
  bindings.userPresets = current;
  await handler('const handleSaveRename =', '// Нативный импорт пресета', bindings)('B');
  assert.equal((await preload.loadPreloadedUserPresets())[0].name, 'Renamed', 'Reopen must retain rename');
  await presets.saveUserPresets([...await preload.loadPreloadedUserPresets(), {id: 'C', name: 'New'}]);
  assert.deepEqual(saved.map(p => p.id), ['B', 'C'], 'Later save must not resurrect deleted preset');
  assert.equal(saved[0].name, 'Renamed');
  failSave = true;
  await assert.rejects(presets.saveUserPresets([]));
  assert.deepEqual((await preload.loadPreloadedUserPresets()).map(p => p.id), ['B', 'C'], 'Failed save must retain confirmed cache');
  failSave = false;
  delayNextRead = true;
  const staleRead = preload.loadPreloadedUserPresets(true);
  await presets.saveUserPresets([{id: 'C', name: 'Latest'}]);
  finishRead();
  assert.deepEqual((await staleRead).map(p => p.id), ['C'], 'Late read must not undo a confirmed newer save');
  assert.deepEqual(JSON.parse(storage.get('l-mpv-settings-presets')).map(p => p.id), ['C'], 'Late read must not overwrite local persistence');
}

function checkEscape() {
  for (const [file, marker, ref] of [
    ['src/components/modals/SettingsModal.tsx', '// Навигация стрелками', 'modalRef'],
    ['src/components/settings/SettingsPanel.tsx', '// Навигация клавишами', 'panelRef'],
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    const start = source.indexOf('const handleKeyDown =', source.indexOf(marker));
    const callback = source.slice(start, source.indexOf('\n    };', start) + 7);
    let closed = 0;
    let nested = true;
    const bindings = { [ref]: {current: {querySelector: () => nested ? {} : null}}, isRecordingHotkey: false, handleClose: () => {closed++;} };
    const parent = new Function(...Object.keys(bindings), compile(callback) + '; return handleKeyDown;')(...Object.values(bindings));
    const nestedStart = componentSource.indexOf('const onKeyDown =', componentSource.indexOf('// Escape закрывает диалог'));
    const nestedCode = componentSource.slice(nestedStart, componentSource.indexOf('\n    };', nestedStart) + 7);
    let cancelled = 0;
    const child = new Function('cancelDelete', compile(nestedCode) + '; return onKeyDown;')(() => {nested = false; cancelled++;});
    const event = {key: 'Escape', target: {closest: () => null}, preventDefault() {}, stopPropagation() {}};
    parent(event);
    child(event);
    assert.equal(closed, 0, `${file}: Escape must belong to nested confirmation`);
    assert.equal(cancelled, 1, `${file}: Escape must cancel nested confirmation`);
    parent(event);
    assert.equal(closed, 1, `${file}: Escape must still close settings without nested confirmation`);
  }
}
async function checkUpscaleTtl() {
  const realNow = Date.now;
  let now = 100000;
  Date.now = () => now;
  try {
    const first = await preload.loadPreloadedUpscaleStatus();
    assert.equal(await preload.loadPreloadedUpscaleStatus(), first);
    assert.equal(upscaleCalls, 1);
    now += 15001;
    const next = await preload.loadPreloadedUpscaleStatus();
    assert.notEqual(next, first);
    assert.equal(upscaleCalls, 2, 'Expired status must refresh');
    const stored = {probe: 'installed'};
    preload.storeUpscaleStatus(stored);
    now += 1000;
    assert.equal(await preload.loadPreloadedUpscaleStatus(), stored);
    assert.equal(upscaleCalls, 2, 'Explicit status update refreshes its TTL');
  } finally {Date.now = realNow;}
}
(async () => {
  await checkPresets();
  checkEscape();
  await checkUpscaleTtl();
  console.log('PASS preset delete/rename reopen, subsequent save, failure/stale cache, nested Escape in modal/sidebar and upscale TTL');
})().catch(error => {console.error(error); process.exitCode = 1;});
