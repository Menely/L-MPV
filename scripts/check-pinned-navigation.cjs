const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const compiled = esbuild.buildSync({entryPoints: ['src/hooks/usePinnedNavigationPanel.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react', '../theme/tokens']}).outputFiles[0].text;

function fixture(savedPin = null) {
  const storage = new Map(savedPin === null ? [] : [['l-mpv-navigation-panel-pin', JSON.stringify(savedPin)]]);
  const hooks = [], listeners = new Map(), frames = new Map(), observers = [];
  let cursor = 0, effects = [], dirty = true, result, visible = true, scale = 1.5, frameId = 0, mounted = true, postUnmountWrites = 0;
  let panelRect = {top: 120, height: 300};
  let controlsRect = {top: 700, height: 90};
  const panel = {getBoundingClientRect: () => panelRect};
  const controls = {getBoundingClientRect: () => controlsRect};
  const panelRef = {current: panel};
  const bodyStyle = {cursor: 'default', userSelect: 'text'};
  const windowMock = {
    innerHeight: 900,
    dispatchEvent(event) { for (const callback of [...listeners.get(event.type) ?? []]) callback(event); },
    addEventListener(name, callback) {if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback);},
    removeEventListener(name, callback) {listeners.get(name)?.delete(callback);},
  };
  const react = {
    useState(initial) {const i = cursor++; hooks[i] ??= {value: typeof initial === 'function' ? initial() : initial}; return [hooks[i].value, value => {
      if (!mounted) postUnmountWrites++;
      const next = typeof value === 'function' ? value(hooks[i].value) : value;
      if (!Object.is(next, hooks[i].value)) {hooks[i].value = next; dirty = true;}
    }];},
    useRef(initial) {const i = cursor++; return hooks[i] ??= {current: initial};},
    useCallback(callback, deps) {const i = cursor++; const old = hooks[i]; if (!old || deps.some((dep, j) => !Object.is(dep, old.deps[j]))) hooks[i] = {deps, callback}; return hooks[i].callback;},
    useLayoutEffect(callback, deps) {const i = cursor++; const old = hooks[i]; if (!old || deps.some((dep, j) => !Object.is(dep, old.deps[j]))) {
      hooks[i] = {deps, cleanup: old?.cleanup}; effects.push(() => {hooks[i].cleanup?.(); hooks[i].cleanup = callback();});
    }},
  };
  class ResizeObserverMock {
    constructor(callback) {this.callback = callback; this.nodes = new Set(); observers.push(this);}
    observe(node) {this.nodes.add(node);}
    disconnect() {this.nodes.clear();}
  }
  const mod = {exports: {}};
  new Function('module', 'exports', 'require', 'window', 'document', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', compiled)(
    mod, mod.exports, name => name === 'react' ? react : {getActiveUiScale: () => scale}, windowMock,
    {querySelector: () => controls, body: {style: bodyStyle}}, ResizeObserverMock,
    callback => {frames.set(++frameId, callback); return frameId;}, id => frames.delete(id),
    {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
  );
  const exports = mod.exports;
  function flush() {
    let runs = 0;
    while (dirty) {
      assert(++runs < 12, 'Resize observer / state must not loop');
      dirty = false; cursor = 0; result = exports.usePinnedNavigationPanel(panelRef, visible);
      const pending = effects; effects = []; pending.forEach(effect => effect());
    }
  }
  const dispatch = (name, event = {}) => {for (const listener of [...listeners.get(name) ?? []]) listener(event); flush();};
  const capture = new Set();
  const target = {setPointerCapture: id => capture.add(id), releasePointerCapture: id => capture.delete(id)};
  const pointer = (y, id = 1) => ({button: 0, clientY: y, pointerId: id, currentTarget: target, preventDefault() {}, stopPropagation() {}});
  flush();
  return {get: () => result, exports, dispatch, pointer, capture, bodyStyle, frames, observers, storage,
    flush, animate: () => {for (const [id, callback] of [...frames]) {frames.delete(id); callback();} flush();},
    resize: (height, top = controlsRect.top) => {windowMock.innerHeight = height; controlsRect = {...controlsRect, top}; dispatch('resize');},
    zoom: value => {scale = value; dispatch('l-mpv-ui-scale-changed');},
    content: height => {panelRect = {...panelRect, height}; for (const observer of observers) if (observer.nodes.size) observer.callback(); flush();},
    show: value => {visible = value; dirty = true; flush();},
    listenerCount: () => [...listeners.values()].reduce((sum, list) => sum + list.size, 0),
    unmount: () => {mounted = false; hooks.forEach(hook => hook?.cleanup?.());},
    postUnmountWrites: () => postUnmountWrites,
  };
}
const f = fixture();
const fit = f.exports.fitPinnedNavigationGeometry;
for (const scale of [1, 1.25, 1.5, 2]) {
  const g = fit({top: 900, height: 400}, 360, 270, scale);
  assert(g.top * scale >= 8 && (g.top + g.height) * scale <= 262);
}
assert.equal(f.get().pinned, false);
const titlebarBound = fit({top: 0, height: 500}, 600, 550, 1, 54);
assert(titlebarBound.top >= 54 && titlebarBound.top + titlebarBound.height <= 542, 'Pinned card cannot cover titlebar controls');
const shortCard = fit({top: 300, height: 500}, 700, 650, 1, 54, 160);
assert.equal(shortCard.top, 300, 'A short card can move down without being constrained by its former tall content');
assert.equal(shortCard.height, 342, 'Height limit respects space below the pinned top');
f.get().togglePinned(); f.flush();
assert.deepEqual(f.get().geometry, {top: 80, height: 200}, 'Snapshot measured top and height divided by UI zoom');
f.content(600);
assert.deepEqual(f.get().geometry, {top: 80, height: 200}, 'Folder count/tab content cannot change frozen dimensions');
f.zoom(2); assert.deepEqual(f.get().geometry, {top: 80, height: 200});
f.resize(300, 240); assert.deepEqual(f.get().geometry, {top: 4, height: 112});
f.resize(900, 700); assert.deepEqual(f.get().geometry, {top: 80, height: 200}, 'Expand restores requested base height, not previously clamped height');
f.zoom(1.5);
f.get().onGripPointerDown(f.pointer(130));
assert.equal(f.capture.size, 1);
f.dispatch('pointermove', f.pointer(190, 2)); assert.equal(f.frames.size, 0, 'Ignore a different pointer');
f.dispatch('pointermove', f.pointer(190)); f.animate();
assert.equal(f.get().geometry.top, 120, 'Drag uses visual mouse delta / UI zoom');
f.dispatch('pointercancel', f.pointer(190));
assert.equal(f.get().geometry.top, 80, 'Cancelled drag returns to its original position');
assert.equal(f.capture.size, 0); assert.deepEqual(f.bodyStyle, {cursor: 'default', userSelect: 'text'});
f.get().onGripKeyDown({key: 'ArrowDown', shiftKey: true, preventDefault() {}, stopPropagation() {}}); f.flush();
assert.equal(f.get().geometry.top, 112);
f.get().onGripKeyDown({key: 'End', preventDefault() {}, stopPropagation() {}}); f.flush();
assert.equal((f.get().geometry.top + f.get().geometry.height) * 1.5, 692);
f.get().onGripPointerDown(f.pointer(300)); f.dispatch('pointermove', f.pointer(350));
f.show(false);
assert.equal(f.frames.size, 0, 'Close cancels pending drag rAF'); assert.equal(f.listenerCount(), 1, 'Only portable hydration subscription stays while closed');
assert.equal(f.capture.size, 0); assert.deepEqual(f.bodyStyle, {cursor: 'default', userSelect: 'text'});
f.get().onGripPointerDown(f.pointer(10)); assert.equal(f.listenerCount(), 1, 'Closing UI cannot start another drag');
f.show(true);
f.get().onGripPointerDown(f.pointer(300)); f.dispatch('pointermove', f.pointer(320));
f.unmount(); assert.equal(f.frames.size, 0); assert.equal(f.listenerCount(), 0);
assert.equal(f.observers.every(observer => observer.nodes.size === 0), true);
assert.equal(f.postUnmountWrites(), 0); assert.equal(f.capture.size, 0);

const unpin = fixture(); unpin.get().togglePinned(); unpin.flush(); unpin.get().togglePinned(); unpin.flush();
assert.equal(unpin.get().geometry, null, 'Unpin removes all fixed geometry so normal CSS anchoring returns');
assert.equal(unpin.listenerCount(), 1); assert.equal(unpin.storage.get('l-mpv-navigation-panel-pin'), 'null'); unpin.unmount();
const restored = fixture({top: 90, height: 210});
assert.deepEqual(restored.get().geometry, {top: 90, height: 210}, 'Cold restart restores pin dimensions');
restored.get().onGripKeyDown({key: 'ArrowDown', preventDefault() {}, stopPropagation() {}}); restored.flush();
assert.deepEqual(JSON.parse(restored.storage.get('l-mpv-navigation-panel-pin')), {top: 98, height: 210});
restored.unmount();
const invalid = fixture({top: -1, height: 'bad'}); assert.equal(invalid.get().pinned, false); invalid.unmount();
console.log('PASS pinned panel snapshot, stable content height, scale/viewport/control clamps, drag/cancel/keyboard, unpin and close/unmount listener/rAF cleanup');
