const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const compiled = esbuild.buildSync({
  entryPoints: ["src/components/settings/lib/cacheRingGeometry.ts"], bundle: true,
  write: false, platform: "node", format: "cjs",
});
const scope = { exports: {} };
new Function("module", "exports", compiled.outputFiles[0].text)(scope, scope.exports);
const { cacheRingSegments, roundedCacheArc } = scope.exports;
const close = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
assert.deepEqual(cacheRingSegments([]), []);
assert.deepEqual(cacheRingSegments([0, 0]), []);
assert.deepEqual(cacheRingSegments([42]), [{ index: 0, start: 0, size: 360 }]);
assert.deepEqual(cacheRingSegments([1000, .001, 30]).map(segment => segment.index), [0, 2], "subpixel slices do not reserve empty gaps");
for (const weights of [[100, 1], [327100000, 7200000, 3100000, 68000, 3500], [1e9, 1e-6, 1, 7, 10, 300, 2]]) {
  const segments = cacheRingSegments(weights);
  const arcTotal = segments.reduce((sum, segment) => sum + segment.size, 0);
  const weightTotal = segments.reduce((sum, segment) => sum + weights[segment.index], 0);
  const gap = segments.length > 1 ? segments[1].start - segments[0].start - segments[0].size : 0;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    assert(segment.size > 0);
    close(segment.size / arcTotal, weights[segment.index] / weightTotal);
    const next = segments[(i + 1) % segments.length];
    close(next.start + (i === segments.length - 1 ? 360 : 0) - segment.start - segment.size, gap);
    assert(!/NaN|Infinity/.test(roundedCacheArc(segment.start, segment.size)));
  }
  close(arcTotal + gap * segments.length, 360);
}
assert(!/NaN|Infinity/.test(roundedCacheArc(12, 1e-9)));
console.log("PASS equal cache ring gaps including wraparound, proportional arcs and tiny categories");
