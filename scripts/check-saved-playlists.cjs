const assert = require('node:assert/strict'), fs = require('node:fs'), esbuild = require('esbuild'), ts = require('typescript');
function load(file, imports = {}, globals = {}) {
  const code = esbuild.buildSync({entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', '@tauri-apps/api/core', '../utils/savedPlaylists']}).outputFiles[0].text;
  const mod = {exports: {}};
  new Function('module', 'exports', 'require', ...Object.keys(globals), code)(mod, mod.exports, name => imports[name], ...Object.values(globals));
  return mod.exports;
}
const storage = new Map();
const utils = load('src/utils/savedPlaylists.ts', {'@tauri-apps/api/core': {invoke: () => Promise.resolve()}}, {
  localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const list = (id, paths = []) => ({id, name: id, paths});
function hookFixture() {
  const hooks = [], requests = [], remembers = [];
  let cursor = 0, dirty = true, effects = [], result, mounted = true, postUnmount = 0;
  const react = {
    useState(value) {const i = cursor++; hooks[i] ??= {value: typeof value === 'function' ? value() : value}; return [hooks[i].value, next => {
      if (!mounted) postUnmount++; hooks[i].value = typeof next === 'function' ? next(hooks[i].value) : next; dirty = true;
    }];},
    useRef(value) {const i = cursor++; return hooks[i] ??= {current: value};},
    useCallback(callback, deps) {const i = cursor++; const old = hooks[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) hooks[i] = {deps, callback}; return hooks[i].callback;},
    useEffect(callback, deps) {const i = cursor++; const old = hooks[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) {
      hooks[i] = {deps, cleanup: old?.cleanup}; effects.push(() => {hooks[i].cleanup?.(); hooks[i].cleanup = callback();});
    }},
  };
  const store = Object.fromEntries(['list', 'save', 'remove', 'import', 'export', 'play'].map(method => [method, (...args) => new Promise((resolve, reject) => requests.push({method, args, resolve, reject}))]));
  const {useSavedPlaylists} = load('src/hooks/useSavedPlaylists.ts', {react, '../utils/savedPlaylists': {
    savedPlaylistStore: store, savedPlaylistSource: () => 'A', rememberPlaylistSource: id => remembers.push(id),
  }});
  function flush() {let runs = 0; while (dirty) {assert(++runs < 20); dirty = false; cursor = 0; result = useSavedPlaylists(true); const pending = effects; effects = []; pending.forEach(effect => effect());}}
  flush();
  return {requests, remembers, get: () => result, flush, unmount: () => {mounted = false; hooks.forEach(hook => hook?.cleanup?.());}, postUnmount: () => postUnmount};
}
(async () => {
  utils.rememberPlaylistSource('unicode-id'); assert.equal(utils.savedPlaylistSource(), 'unicode-id');
  assert.deepEqual(utils.movePlaylistEntry(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(utils.movePlaylistEntry(['a'], 0, -1), ['a']);
  assert(utils.samePlaylistFile('D:\\Видео\\Фильм.mkv', 'd:/видео/фильм.mkv'));
  assert(utils.samePlaylistFile(String.raw`\\?\D:\Видео\Фильм.mkv`, 'd:/видео/фильм.mkv'));
  assert(utils.samePlaylistFile(String.raw`\\?\UNC\server\share\film.mkv`, '//SERVER/share/film.mkv'));
  assert(!utils.samePlaylistFile('/Video/A.mkv', '/video/a.mkv'));
  for (const top of [0, 4400, 439900]) {
    const range = utils.savedPlaylistWindow(10000, top, 440);
    assert(range.end - range.start <= 30, '10k-entry list renders only viewport plus overscan');
    assert.equal(range.before + (range.end - range.start) * 44 + range.after, 440000);
  }
  assert.deepEqual(utils.savedPlaylistWindow(60, 99999, 440), {start: 0, end: 60, before: 0, after: 0});
  let release; const calls = []; let active = 0, peak = 0;
  const store = utils.createSavedPlaylistStore(async (command, args) => {
    active++; peak = Math.max(peak, active); calls.push({command, args});
    try {if (calls.length === 1) await new Promise(resolve => {release = resolve;}); if (args?.name === 'bad') throw Error('expected'); return args;}
    finally {active--;}
  });
  const paths = ['first']; const first = store.save({id: 'A', name: 'one', paths}); paths.push('mutation'); await tick();
  const second = store.save({id: 'A', name: 'two', paths: ['new']}); const playback = store.play('A', 0); const reopen = store.list();
  release(); await Promise.all([first, second, playback, reopen]);
  assert.equal(peak, 1); assert.deepEqual(calls.map(call => call.command), ['save_saved_playlist', 'save_saved_playlist', 'play_saved_playlist', 'list_saved_playlists']);
  assert.deepEqual(calls[0].args.paths, ['first'], 'Queued arguments are immutable snapshots');
  await assert.rejects(store.save({id: 'A', name: 'bad', paths: []})); await store.list();
  assert.equal(calls.at(-1).command, 'list_saved_playlists', 'Failure cannot strand queue/reopen');

  const f = hookFixture(); f.requests[0].resolve([list('A'), list('B')]); await tick(); f.flush();
  f.get().select('B'); f.flush(); assert.equal(f.requests.length, 1, 'Source selection must not invoke playback');
  const old = f.get().update('A', {paths: ['old']}); const latest = f.get().update('A', {paths: ['new']}); f.flush();
  f.requests[2].resolve(list('A', ['new'])); await latest; f.flush();
  f.requests[1].resolve(list('A', ['old'])); await old; f.flush();
  assert.deepEqual(f.get().lists.find(item => item.id === 'A').paths, ['new'], 'Late save cannot replace a newer edit');
  assert.equal(f.get().source, 'B', 'Save completion cannot change selection');
  const creating = f.get().add('Created', []); f.get().select('A'); f.flush();
  f.requests.at(-1).resolve(list('Created')); await creating; f.flush();
  assert.equal(f.get().source, 'A', 'Late create cannot select over a newer user choice');
  const finishing = f.get().update('A', {paths: ['pending']}); f.unmount();
  f.requests.at(-1).resolve(list('A', ['pending'])); await finishing;
  assert.equal(f.postUnmount(), 0, 'Unmounted async completion cannot set React state');

  // Real saved-list Escape effect clears its search; the parent's guard leaves it open.
  const panelSource = fs.readFileSync('src/components/player/SavedPlaylistPanel.tsx', 'utf8');
  const escapeMarker = panelSource.indexOf('if (!editor && !confirmDelete && !menu && !query)');
  const escapeStart = panelSource.lastIndexOf('useEffect(() => {', escapeMarker);
  const escapeEnd = panelSource.indexOf('}, [editor, confirmDelete, menu, query]);', escapeStart) + '}, [editor, confirmDelete, menu, query]);'.length;
  const escapeCode = ts.transpileModule(panelSource.slice(escapeStart, escapeEnd), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  let listener, clearQuery = false, cancelledEditor = false;
  const runEscape = editor => new Function('useEffect', 'window', 'editor', 'confirmDelete', 'menu', 'query', 'setEditor', 'setConfirmDelete', 'setMenu', 'setQuery', 'document', escapeCode)(
    callback => callback(), {addEventListener: (_name, callback) => {listener = callback;}, removeEventListener() {}}, editor, false, false, 'query',
    () => {cancelledEditor = true;}, () => {}, () => {}, value => {clearQuery = value === '';}, {querySelector: () => null},
  );
  const event = {key: 'Escape', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}};
  runEscape(null); listener(event); assert(clearQuery, 'First Escape clears saved-list search');
  runEscape({kind: 'create'}); listener(event); assert(cancelledEditor, 'Editor receives Escape before panel closes');

  // Execute the actual source-choice handler and actual parent folder callback.
  const drawer = fs.readFileSync('src/components/player/PlaylistDrawer.tsx', 'utf8');
  const ast = ts.createSourceFile('drawer.tsx', drawer, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onFolderRequested') expression = node.initializer.expression.getText(ast); ts.forEachChild(node, visit);}
  visit(ast); assert(expression);
  const order = [];
  const reload = new Function('invoke', 'refreshPlaylist', 'return ' + expression)(async command => {order.push(command);}, async () => {order.push('refresh');});
  const source = panelSource;
  const choose = source.slice(source.indexOf('const chooseSource ='), source.indexOf('const importFile ='));
  const code = ts.transpileModule(choose, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  const chooseSource = new Function('library', 'withDialog', 'onFolderRequested', 'mounted', code + '; return chooseSource;')(
    {source: 'custom', select: id => order.push('select:' + id)}, operation => operation(), reload, {current: true},
  );
  chooseSource(''); await tick();
  assert.deepEqual(order, ['reload_folder_playlist', 'refresh', 'select:'], 'Returning to folder after custom play restores actual folder queue without reopening media');
  console.log('PASS saved-playlist preference, immutable serialized saves/play/reopen, failure recovery, stale edits/selection/unmount and saved-to-folder queue restore');
})().catch(error => {console.error(error); process.exitCode = 1;});
