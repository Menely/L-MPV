const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const calls = new Map();
const storage = new Map();
const heatmapDefaults = { enabled: true, style: 'bars', dataSource: 'audio', palette: 'theme', placement: 'above_controls', height: 34, opacity: .9, showCrestLine: true };
const exportsObject = {};
const source = fs.readFileSync(path.join(root, 'src/utils/presetsUtils.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
vm.runInNewContext(compiled, {
  exports: exportsObject, console,
  require: () => new Proxy({}, { get: (_, key) => {
    if (key === 'DEFAULT_HEATMAP_CONFIG') return heatmapDefaults;
    if (key === 'normalizeAmbientSettings') return value => value;
    return (...args) => { calls.set(key, args); return Promise.resolve(); };
  }}),
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  window: { dispatchEvent() {} }, Event: class {}, CustomEvent: class {},
}, { filename: 'presetsUtils.ts' });
const { BUILT_IN_PRESETS, applySettingsPreset } = exportsObject;
const paletteSource = fs.readFileSync(path.join(root, 'src/utils/playerPalettes.ts'), 'utf8');
(async () => {
  assert.equal(BUILT_IN_PRESETS.length, 5);
  assert.equal(new Set(BUILT_IN_PRESETS.map(p => p.id)).size, 5);
  for (const id of ['builtin_classic', 'builtin_cyberpunk', 'builtin_cinema', 'builtin_minimal']) {
    assert.ok(BUILT_IN_PRESETS.some(p => p.id === id), `Preserve saved references to ${id}`);
  }
  assert.equal(new Set(BUILT_IN_PRESETS.map(p => p.data.controlBarStyle)).size, 3);
  assert.equal(new Set(BUILT_IN_PRESETS.map(p => p.data.playerTheme)).size, 5);
  // Apply in both directions, starting with a previously enabled heatmap.
  for (const preset of [...BUILT_IN_PRESETS, ...[...BUILT_IN_PRESETS].reverse()]) {
    calls.clear();
    calls.set('saveHeatmapConfig', [{ ...heatmapDefaults }]);
    await applySettingsPreset(preset);
    const data = preset.data;
    assert.equal(calls.get('saveHeatmapConfig')[0].enabled, false, `${preset.id}: disable an existing heatmap`);
    for (const [method, value] of [['savePlayerTheme', data.playerTheme], ['applyAccentColor', data.accentColor], ['saveControlBarStyle', data.controlBarStyle], ['saveUiRadius', data.uiRadius], ['saveUiSettingsStyle', data.settingsStyle], ['saveUiFont', data.uiFont], ['saveUiOpacity', data.uiOpacity]]) {
      assert.ok(value !== undefined, `${preset.id}: explicit ${method}`);
      assert.equal(calls.get(method)?.[0], value, `${preset.id}: apply ${method}`);
    }
    assert.ok(paletteSource.includes(`id:"${data.playerTheme}"`), 'Use a current player theme');
    assert.ok(paletteSource.includes(`"${data.accentColor}"`), 'Use a current accent');
    for (const locale of ['ru', 'en']) {
      const text = fs.readFileSync(path.join(root, `src/i18n/locales/${locale}.ts`), 'utf8');
      assert.ok(text.includes(`${preset.id}: {`), `${preset.id}: ${locale} translation`);
    }
  }
  console.log('PASS: five distinct built-in styles, all three toolbar layouts, RU/EN labels, preserved IDs, and heatmap disabled through the real preset application path in both switching directions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
