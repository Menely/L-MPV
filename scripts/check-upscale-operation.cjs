const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source = fs.readFileSync("src/components/settings/sections/UpscalingSettingsSection.tsx", "utf8");
const persist = source.slice(source.indexOf("  const persistModelOrder ="), source.indexOf("  const sensors ="));
const drag = source.slice(source.indexOf("  const handleDragEnd ="), source.indexOf("  const [settings,"));
function fixture(compilingModel, fail = false, deferred = false) {
  const models = [{ filename: "a.onnx", slot: 1 }, { filename: "b.onnx", slot: 2 }];
  let state = { models }, cache = state, settings = { selected_model: "a.onnx", active_slot: 1 }, calls = 0, writes = 0;
  const pending = [];
  const storage = new Map([["l-mpv-upscale-slot", "1"], ["l-mpv-upscale-selected-model", "a.onnx"]]);
  const applySettings = update => { settings = typeof update === "function" ? update(settings) : update; };
  const context = {
    settings,
    compilingModel, status: state, dict: { settings: { upscaling: { errSaveOrder: "failed" } } },
    invoke: async () => { calls++; if (fail) throw "UPSCALE_BUSY"; },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem(key,value) { writes++; storage.set(key,value); } },
    setStatus: update => { state = typeof update === "function" ? update(state) : update; },
    storeUpscaleStatus: value => { cache = value; },
    setSettings: update => { if(deferred) pending.push(update); else applySettings(update); },
    window: { dispatchEvent() {
      if(deferred) pending.push({...settings, active_slot:Number(storage.get("l-mpv-upscale-slot"))});
    } }, Event: class {}, console: { error() {} },
    arrayMove: (items, from, to) => { const next = [...items]; next.splice(to, 0, next.splice(from, 1)[0]); return next; },
  };
  vm.runInNewContext(ts.transpileModule(
    `function handlers() { ${persist} ${drag}; return { handleDragEnd }; } this.handlers = handlers();`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText, context);
  return { drag: context.handlers.handleDragEnd, names: () => state.models.map(model => model.filename), calls: () => calls, writes: () => writes, slots: () => state.models.map(model => model.slot), cache: () => cache, selectedSlot: () => { while(pending.length) applySettings(pending.shift()); return settings.active_slot; } };
}
(async () => {
  const event = { active: { id: "a.onnx" }, over: { id: "b.onnx" } };
  const busy = fixture("a.onnx");
  await busy.drag(event);
  assert.equal(busy.calls(), 0);
  assert.deepEqual(busy.names(), ["a.onnx", "b.onnx"]);
  const rejected = fixture(null, true);
  await rejected.drag(event);
  assert.equal(rejected.calls(), 1);
  assert.equal(rejected.writes(), 0);
  assert.deepEqual(rejected.names(), ["a.onnx", "b.onnx"]);
  const ready = fixture(null);
  await ready.drag(event);
  assert.equal(ready.calls(), 1);
  assert.equal(ready.writes(), 2);
  assert.deepEqual(ready.names(), ["b.onnx", "a.onnx"]);
  assert.equal(JSON.stringify(ready.slots()), "[1,2]");
  assert.equal(ready.cache().models[0].filename, "b.onnx");
  assert.equal(ready.cache().models[0].slot, 1);
  assert.equal(ready.cache().models[1].filename, "a.onnx");
  assert.equal(ready.cache().models[1].slot, 2);
  assert.equal(ready.selectedSlot(), 2, "selected filename keeps its identity in UI after reorder");
  const batched = fixture(null, false, true);
  await batched.drag(event);
  assert.equal(batched.selectedSlot(), 2, "batched updater and synchronous storage listener agree");
  console.log("PASS build blocks drag; rejected cross-process reorder preserves UI/storage; accepted reorder persists");
})().catch(error => { console.error(error); process.exitCode = 1; });
