const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const storage = new Map();
const properties = new Map();
const attributes = new Map();
const style = {
  setProperty: (key, value) => properties.set(key, value),
  getPropertyValue: (key) => properties.get(key) ?? "",
};
global.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
global.window = new EventTarget();
global.document = {
  documentElement: {
    style,
    getAttribute: (key) => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value),
  },
};
global.getComputedStyle = () => style;

const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const requireLocal = (name) => load(path.resolve(path.dirname(file), name + ".ts"));
  new Function("module", "exports", "require", outputText)(module, module.exports, requireLocal);
  return module.exports;
}

const fromRoot = (file) => load(path.resolve(__dirname, "..", file));
const colors = fromRoot("src/utils/colorUtils.ts");
const preferences = fromRoot("src/features/liquidGlass/preferences.ts");
const layout = fromRoot("src/utils/controlBarStyleUtils.ts");

// Recover the interface selection from an early build, then pick a real palette.
storage.set(colors.PLAYER_THEME_STORAGE_KEY, "glass");
assert.equal(preferences.getPlayerTheme(), "glass");
const [first, second] = Object.keys(colors.PLAYER_THEMES);
colors.savePlayerTheme(first);
const initialFill = properties.get("--bg-pill");
colors.savePlayerTheme(second);
assert.notEqual(properties.get("--bg-pill"), initialFill);
assert.equal(preferences.getPlayerTheme(), "glass");

layout.saveControlBarStyle("capsule");
colors.applyAccentColor("#f04050");
assert.equal(properties.get("--accent"), "#f04050");
preferences.setPlayerTheme("lmpv");
assert.equal(colors.getSavedPlayerTheme(), second);
preferences.setPlayerTheme("glass");
assert.equal(layout.getSavedControlBarStyle(), "capsule");
assert.equal(colors.getSavedPlayerTheme(), second);
assert.equal(preferences.getGlassBlur(), 30);
preferences.saveGlassBlur(0);
preferences.setPlayerTheme("lmpv");
preferences.setPlayerTheme("glass");
assert.equal(preferences.getGlassBlur(), 0);
preferences.saveGlassBlur(110);
assert.equal(preferences.getGlassBlur(), 100);
console.log("PASS: Liquid Glass mode, palette, accent, and blur are independent.");
