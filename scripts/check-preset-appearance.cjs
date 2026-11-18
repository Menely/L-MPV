const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
const source = fs.readFileSync('src/utils/presetsUtils.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
vm.runInNewContext(compiled, {
  exports: exportsObject, console,
  require: () => new Proxy({}, { get: (_, key) => {
    if (key === 'DEFAULT_HEATMAP_CONFIG') return { enabled: false };
    if (key === 'normalizeAmbientSettings') return value => value;
    if (key === 'getSavedUiSettingsStyle') return () => 'modal';
    return () => {};
  }}),
  localStorage: { getItem: () => null, setItem() {} }, window: { dispatchEvent() {} },
  Event: class {}, CustomEvent: class {},
});
const { BUILT_IN_PRESETS, parseImportedPresets, isSettingsMatchingPreset } = exportsObject;
const data = { ...BUILT_IN_PRESETS[0].data, uiFont: 'outfit', controlBarStyle: 'capsule', timePosition: 'titlebar', timeFormat: 'finish_time' };
const original = { name: 'Appearance roundtrip', data };
const [restored] = parseImportedPresets(JSON.stringify(original));
for (const key of ['uiFont', 'controlBarStyle', 'timePosition', 'timeFormat']) assert.equal(restored.data[key], data[key], `Import must retain ${key}`);
assert.equal(isSettingsMatchingPreset(data, data), true);
for (const [key, value] of [['controlBarStyle', 'docked'], ['timePosition', 'timeline_right'], ['timeFormat', 'elapsed_total']]) {
  assert.equal(isSettingsMatchingPreset({ ...data, [key]: value }, data), false, `Changing ${key} clears active preset`);
}
const legacy = { ...data };
for (const key of ['controlBarStyle', 'timePosition', 'timeFormat']) delete legacy[key];
assert.equal(isSettingsMatchingPreset(data, legacy), true, 'Missing legacy optional fields impose no constraint');
const [floating] = parseImportedPresets(JSON.stringify({ name: 'Old floating', data: { ...data, controlBarStyle: 'floating' } }));
assert.equal(floating.data.controlBarStyle, 'modern');
const [invalid] = parseImportedPresets(JSON.stringify({ name: 'Invalid options', data: { ...data, controlBarStyle: 'unknown', timePosition: 'unknown', timeFormat: 'unknown', uiFont: 42 } }));
for (const key of ['controlBarStyle', 'timePosition', 'timeFormat', 'uiFont']) assert.equal(invalid.data[key], undefined);
console.log('PASS: appearance export/import, active-preset detection, legacy floating and invalid options.');
