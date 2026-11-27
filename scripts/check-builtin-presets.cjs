const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const calls = new Map();
const storage = new Map();
const heatmapDefaults = { enabled: false, style: 'bars', dataSource: 'audio', palette: 'theme', placement: 'above_controls', height: 34, opacity: .9 };
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
const paletteSource = fs.readFileSync(path.join(root, 'src/theme/palettes.ts'), 'utf8');
(async () => {
  assert.equal(BUILT_IN_PRESETS.length, 7);
  assert.equal(new Set(BUILT_IN_PRESETS.map(p => p.id)).size, 7);
  for (const id of ['builtin_classic', 'builtin_cyberpunk', 'builtin_cinema', 'builtin_minimal']) {
    assert.ok(BUILT_IN_PRESETS.some(p => p.id === id), `Preserve saved references to ${id}`);
  }
  const classicPresets = BUILT_IN_PRESETS.filter(p => p.data.playerInterfaceTheme !== 'glass');
  const glassPresets = BUILT_IN_PRESETS.filter(p => p.data.playerInterfaceTheme === 'glass');
  assert.equal(classicPresets.length, 5);
  assert.equal(glassPresets.length, 2);
  assert.equal(new Set(classicPresets.map(p => p.data.controlBarStyle)).size, 3);
  assert.equal(new Set(classicPresets.map(p => p.data.playerTheme)).size, 5);
  // Apply in both directions, starting with a previously enabled heatmap.
  for (const preset of [...BUILT_IN_PRESETS, ...[...BUILT_IN_PRESETS].reverse()]) {
    calls.clear();
    calls.set('saveHeatmapConfig', [{ ...heatmapDefaults, enabled: true }]);
    await applySettingsPreset(preset);
    const data = preset.data;
    assert.equal(calls.get('saveHeatmapConfig')[0].enabled, false, `${preset.id}: disable an existing heatmap`);
    const isGlass = data.playerInterfaceTheme === 'glass';
    const expectedCalls = isGlass
      ? [['applyAccentColor', data.accentColor], ['saveControlBarStyle', data.liquidGlassStyle], ['saveUiFont', data.uiFont], ['saveUiOpacity', data.uiOpacity]]
      : [['savePlayerTheme', data.playerTheme], ['applyAccentColor', data.accentColor], ['saveControlBarStyle', data.controlBarStyle], ['saveUiRadius', data.uiRadius], ['saveUiSettingsStyle', data.settingsStyle], ['saveUiFont', data.uiFont], ['saveUiOpacity', data.uiOpacity]];
    for (const [method, value] of expectedCalls) {
      assert.ok(value !== undefined, `${preset.id}: explicit ${method}`);
      assert.equal(calls.get(method)?.[0], value, `${preset.id}: apply ${method}`);
    }
    if (!isGlass) {
      assert.ok(paletteSource.includes(`id:"${data.playerTheme}"`), 'Use a current player theme');
      assert.ok(paletteSource.includes(`"${data.accentColor}"`), 'Use a current accent');
    } else {
      assert.match(data.accentColor, /^#[0-9a-f]{6}$/i, `${preset.id}: valid hex accent`);
      assert.ok(data.liquidGlassTint === 'transparent' || paletteSource.includes(`id:"${data.liquidGlassTint}"`), `${preset.id}: valid liquidGlassTint`);
    }
    for (const locale of ['ru', 'en']) {
      const text = fs.readFileSync(path.join(root, `src/i18n/locales/${locale}.ts`), 'utf8');
      assert.ok(text.includes(`${preset.id}: {`), `${preset.id}: ${locale} translation`);
    }
  }
  console.log('PASS: five distinct built-in classic styles + two Liquid Glass built-in presets, RU/EN labels, preserved IDs, and heatmap disabled.');
})().catch(error => { console.error(error); process.exitCode = 1; });
