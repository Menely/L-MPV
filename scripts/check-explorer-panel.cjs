const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');

function moduleFrom(file, imports = {}, globals = {}) {
  const code = esbuild.buildSync({entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', '@tauri-apps/api/core', '@tauri-apps/plugin-dialog']}).outputFiles[0].text;
  const mod = {exports: {}};
  new Function('module', 'exports', 'require', ...Object.keys(globals), code)(mod, mod.exports, name => imports[name], ...Object.values(globals));
  return mod.exports;
}
const storage = new Map();
const utils = moduleFrom('src/utils/explorerPanel.ts', {}, {localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)}});
const currentFile = {kind:'video',path:'D:/Media/Episode 2.mkv'};
assert(utils.isExplorerCurrentFile(currentFile, String.raw`d:\MEDIA\Episode 2.mkv`));
assert(utils.isExplorerCurrentFile(currentFile, String.raw`\\?\D:\Media\Episode 2.mkv`));
assert(!utils.isExplorerCurrentFile(currentFile, 'D:/Media/Episode 20.mkv'));
assert(!utils.isExplorerCurrentFile({...currentFile,kind:'directory'}, currentFile.path));
assert(!utils.isExplorerCurrentFile(currentFile, ''));
assert(!utils.isExplorerCurrentFile({kind:'video',path:'/media/A.mkv'}, '/media/a.mkv'));
assert.equal(utils.savedNavigationTab(), 'playlist');
utils.saveNavigationTab('explorer'); assert.equal(utils.savedNavigationTab(), 'explorer');
utils.saveNavigationTab('playlist'); assert.equal(utils.savedNavigationTab(), 'playlist');
assert.equal(utils.savedNavigationWidth(), 480);
for (const width of [320, 360, 480, 700]) {storage.set('l-mpv-playlist-width', String(width)); assert.equal(utils.savedNavigationWidth(), width);}
for (const value of ['319', 'NaN', '', '-10']) {storage.set('l-mpv-playlist-width', value); assert.equal(utils.savedNavigationWidth(), 480);}

// Execute the real layout effect against a newly mounted playlist scroll container.
const drawerSource = fs.readFileSync('src/components/player/PlaylistDrawer.tsx', 'utf8');
const layoutStart = drawerSource.indexOf('useLayoutEffect(', drawerSource.indexOf('// Restore the virtual window'));
const layoutEnd = drawerSource.indexOf('// Мгновенный автоскролл', layoutStart);
const layoutCode = esbuild.transformSync(drawerSource.slice(layoutStart, layoutEnd), {loader: 'tsx'}).code;
for (const rememberedTop of [0, 4400]) {
  const element = {scrollTop: 0, clientHeight: 400};
  let restored, height;
  new Function('useLayoutEffect', 'isPlaylistOpen', 'activeTab', 'contentContainerRef', 'scrollTop', 'setScrollTop', 'setViewHeight', 'drawerWidth', layoutCode)(
    callback => callback(), true, 'playlist', {current: element}, rememberedTop, value => {restored = value;}, value => {height = value;}, 480,
  );
  assert.equal(element.scrollTop, rememberedTop, 'Returning from Explorer restores virtual playlist DOM position before paint');
  assert.equal(restored, rememberedTop); assert.equal(height, 400);
}

function hookFixture() {
  const hooks = [], requests = [], dialogs = [], locations = [];
  let cursor = 0, dirty = true, effects = [], result, active = true;
  const react = {
    useState(initial) {const i = cursor++; hooks[i] ??= {value: initial}; return [hooks[i].value, value => {hooks[i].value = typeof value === 'function' ? value(hooks[i].value) : value; dirty = true;}];},
    useRef(initial) {const i = cursor++; return hooks[i] ??= {current: initial};},
    useCallback(callback) {cursor++; return callback;},
    useEffect(callback, deps) {const i = cursor++; const old = hooks[i]; if (!old || deps.some((dep, j) => !Object.is(dep, old.deps[j]))) {hooks[i] = {deps, cleanup: old?.cleanup}; effects.push(() => {hooks[i].cleanup?.(); hooks[i].cleanup = callback();});}},
  };
  // Keep useCallback identity stable just as React does.
  react.useCallback = (callback, deps) => {const i = cursor++; const old = hooks[i]; if (!old || deps.some((dep, j) => !Object.is(dep, old.deps[j]))) hooks[i] = {deps, callback}; return hooks[i].callback;};
  const {useExplorerDirectory} = moduleFrom('src/hooks/useExplorerDirectory.ts', {
    react,
    '@tauri-apps/api/core': {invoke: (command, args) => new Promise((resolve, reject) => requests.push({command, args, resolve, reject}))},
    '@tauri-apps/plugin-dialog': {open: args => new Promise(resolve => dialogs.push({args, resolve}))},
  });
  const onLocation = path => locations.push(path);
  async function flush() {
    for (let i = 0; i < 12; i++) {
      if (dirty) {dirty = false; cursor = 0; result = useExplorerDirectory(active, undefined, onLocation); const pending = effects; effects = []; pending.forEach(effect => effect());}
      await Promise.resolve();
    }
  }
  return {requests, dialogs, locations, flush, get: () => result,
    setActive: async value => {active = value; dirty = true; await flush();},
    unmount: () => hooks.forEach(hook => hook?.cleanup?.()),
  };
}
const directory = path => ({path, parent: null, entries: []});
(async () => {
  const calls = [];
  const invoke = async (command, args) => {calls.push([command, args.path]);};
  const tracks = async () => {calls.push(['tracks']);};
  for (const kind of ['video', 'audio', 'image', 'playlist']) await utils.openExplorerFile({kind, path: `C:/${kind}`}, false, tracks, invoke);
  assert.deepEqual(calls.map(call => call[0]), ['open_file', 'open_file', 'open_file', 'open_file']);
  await utils.openExplorerFile({kind: 'subtitle', path: 'C:/text.ass'}, true, tracks, invoke);
  assert.deepEqual(calls.slice(-2), [['load_subtitle_file', 'C:/text.ass'], ['tracks']]);
  const count = calls.length;
  await assert.rejects(utils.openExplorerFile({kind: 'subtitle', path: 'C:/text.ass'}, false, tracks, invoke), /EXPLORER_MEDIA_REQUIRED/);
  await utils.openExplorerFile({kind: 'directory', path: 'C:/folder'}, true, tracks, invoke);
  assert.equal(calls.length, count, 'Browsing and rejected subtitles must not change playback');

  const f = hookFixture(); await f.flush();
  assert.equal(f.requests.length, 1); assert.deepEqual(f.requests[0].args, {path: null});
  assert.equal(f.get().loading, true);
  const picker = f.get().pickFolder('Choose folder'); f.dialogs[0].resolve(null); await picker;
  f.requests[0].resolve(directory('C:/Media')); await f.flush();
  assert.equal(f.get().loading, false, 'Cancelled picker must not strand pending browse');
  assert.equal(f.get().directory.path, 'C:/Media');
  void f.get().load('C:/old'); void f.get().load('D:/new');
  f.requests[2].resolve(directory('D:/new')); await f.flush();
  f.requests[1].resolve(directory('C:/old')); await f.flush();
  assert.equal(f.get().directory.path, 'D:/new', 'Old browse result must not replace the latest folder');
  assert.equal(f.locations.at(-1), 'D:/new');
  const pick = f.get().pickFolder('Other drive'); f.dialogs[1].resolve('E:/Folder'); await Promise.resolve(); await f.flush();
  assert.deepEqual(f.requests.at(-1).args, {path: 'E:/Folder'});
  f.requests.at(-1).resolve(directory('E:/Folder')); await pick; await f.flush();
  assert.equal(f.get().directory.path, 'E:/Folder');
  void f.get().load('C:/later');
  await f.setActive(false);
  f.requests.at(-1).resolve(directory('C:/later')); await f.flush();
  assert.equal(f.get().directory.path, 'E:/Folder', 'Closed view ignores delayed browse');
  const before = f.requests.length; await f.get().load('C:/closed');
  assert.equal(f.requests.length, before, 'Inactive view must not invoke filesystem commands');
  await f.setActive(true);
  assert.deepEqual(f.requests.at(-1).args, {path: 'E:/Folder'}, 'Reopening retains current location');
  f.unmount(); f.requests.at(-1).reject(Error('old error')); await f.flush();
  assert.equal(f.get().error, null, 'Unmounted callback must not publish an error');
  console.log('PASS explorer tab/width persistence, all media routes, subtitle requirement, stale browse, cancelled picker, drive choice and closed/unmounted guards');
})().catch(error => {console.error(error); process.exitCode = 1;});
