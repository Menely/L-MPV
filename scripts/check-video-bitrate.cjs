const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const hooks = [], effects = [];
let cursor = 0, interval;
const react = {
  useRef(value) {const i = cursor++; return hooks[i] ??= {current: value};},
  useState(value) {const i = cursor++; hooks[i] ??= {value}; return [hooks[i].value, next => {hooks[i].value = typeof next === 'function' ? next(hooks[i].value) : next;}];},
  useCallback(callback) {cursor++; return callback;},
  useEffect(callback) {const i = cursor++; if (!hooks[i]) {hooks[i] = {}; effects.push(callback);}},
};
const code = ts.transpileModule(fs.readFileSync('src/hooks/useVideoBitrate.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const exportsObject = {};
new Function('exports', 'require', 'window', code)(exportsObject, () => react, {
  setInterval(callback) {interval = callback; return 1;}, clearInterval() {interval = null;},
});
const live = {has_video: true, paused: false, video_bitrate: 10000000, frame: 0};
const media = {path: 'constant.mkv', has_video: true, fps: 24};
function render() {cursor = 0; return exportsObject.useVideoBitrate({liveState: live, mediaInfo: media});}
render(); const cleanups = effects.map(callback => callback());
for (const frame of [0, 6, 12, 18, 24, 300]) {
  live.frame = frame;
  render(); interval();
  assert.equal(render().bitrate, 10000000, `Constant native bitrate must not depend on frame ${frame}`);
}
live.video_bitrate = 20000000;
render(); interval();
assert.equal(render().bitrate, 18500000, 'Preserve existing smoothing of real native changes');
const length = render().history.length;
live.paused = true; render(); interval();
assert.equal(render().history.length, length, 'Pause must not append invented samples');
cleanups.forEach(cleanup => cleanup?.());
assert.equal(interval, null);
console.log('PASS measured bitrate without frame modulation, real-change smoothing, pause and timer cleanup');
