const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const requests = [];
const invoke = (command, args) => new Promise(resolve => requests.push({ command, args, resolve }));
const compiled = esbuild.buildSync({
  entryPoints: ["src/components/settings/lib/cacheUsage.ts"], bundle: true,
  write: false, platform: "node", format: "cjs", external: ["@tauri-apps/api/core"],
});
const moduleScope = { exports: {} };
new Function("module", "exports", "require", compiled.outputFiles[0].text)(
  moduleScope, moduleScope.exports, () => ({ invoke }));
const cache = moduleScope.exports;
assert.equal(cache.formatCachePath(String.raw`\\?\D:\My-programs\L-MPV\data\cache`), String.raw`D:\My-programs\L-MPV\data\cache`);
assert.equal(cache.formatCachePath(String.raw`\\?\UNC\server\share\cache`), String.raw`\\server\share\cache`);
for (const path of [String.raw`D:\data\cache`, String.raw`\\server\share\cache`, "/home/player/cache", ""]) {
  assert.equal(cache.formatCachePath(path), path, "ordinary paths remain unchanged");
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
(async () => {
  const initial = cache.loadCacheUsage();
  assert.equal(cache.loadCacheUsage(), initial, "concurrent reads share a native request");
  await flush();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].command, "get_cache_usage");
  const clear = cache.clearCacheUsage();
  assert.equal(cache.loadCacheUsage(true), clear, "reads wait for a pending clear");
  await flush();
  assert.equal(requests.length, 1, "clear waits for the older read");
  requests[0].resolve([{ id: "thumbnails", bytes: 100, files: 1 }]);
  await initial;
  await flush();
  assert.equal(requests[1].command, "clear_app_cache");
  requests[1].resolve([{ id: "thumbnails", bytes: 0, files: 0 }]);
  await clear;
  await flush();
  assert.equal((await cache.loadCacheUsage())[0].bytes, 0);
  assert.equal(requests.length, 2, "fresh cache avoids scanning again on accordion reopen");
  const refresh = cache.loadCacheUsage(true);
  await flush();
  assert.equal(requests.length, 3);
  requests[2].resolve([{ id: "thumbnails", bytes: 25, files: 1 }]);
  await refresh;
  assert.equal(cache.cachedCacheUsage()[0].bytes, 25);
  const selective=cache.clearCacheUsage("shaders");
  await flush();
  assert.equal(requests[3].args.category,"shaders");
  requests[3].resolve([{id:"thumbnails",bytes:25,files:1}]);
  await selective;
  assert.equal(cache.cachedCacheUsage()[0].bytes,25,"unrelated cache remains after category cleanup");
  console.log("PASS cache read coalescing, serialized cleanup, refresh and snapshot reuse");
})().catch(error => { console.error(error); process.exitCode = 1; });
