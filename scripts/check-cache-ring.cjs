const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const compiled = esbuild.buildSync({
  entryPoints: ["src/components/settings/lib/cacheRingGeometry.ts"], bundle: true,
  write: false, platform: "node", format: "cjs",
});
const scope = { exports: {} };
new Function("module", "exports", compiled.outputFiles[0].text)(scope, scope.exports);
const { cacheRingSegments, roundedCacheArc } = scope.exports;
const close = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

// 1. Пустые и нулевые категории
assert.deepEqual(cacheRingSegments([]), []);
assert.deepEqual(cacheRingSegments([0, 0]), []);
assert.deepEqual(cacheRingSegments([42]), [{ index: 0, start: 0, size: 360 }]);

// 2. Все положительные категории включаются (даже субпиксельные)
assert.deepEqual(
  cacheRingSegments([1000, 0.001, 30]).map(segment => segment.index),
  [0, 1, 2],
  "all positive slices get visible guaranteed minimum sectors"
);

// 3. Проверка геометрии распределения и зазоров
for (const weights of [
  [100, 1],
  [327100000, 7200000, 3100000, 68000, 3500],
  [1e9, 1e-6, 1, 7, 10, 300, 2],
  [62, 3500, 44000, 540000, 1000000, 8400000, 390000000],
]) {
  const segments = cacheRingSegments(weights);
  const positiveWeights = weights
    .map((w, index) => ({ w, index }))
    .filter(item => item.w > 0 && Number.isFinite(item.w));
  assert.equal(segments.length, positiveWeights.length);

  const arcTotal = segments.reduce((sum, segment) => sum + segment.size, 0);
  const gap = segments.length > 1
    ? segments[1].start - segments[0].start - segments[0].size
    : 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    assert(segment.size > 0, "segment size must be positive");

    // Зазор между сегментами строго одинаковый, включая замыкание круга
    const next = segments[(i + 1) % segments.length];
    const actualGap = (next.start + (i === segments.length - 1 ? 360 : 0)) - (segment.start + segment.size);
    close(actualGap, gap);

    // Геометрия дуги строится без ошибок и без NaN/Infinity
    const path = roundedCacheArc(segment.start, segment.size);
    assert(path.length > 0);
    assert(!/NaN|Infinity/.test(path), `path contains NaN/Infinity: ${path}`);
  }

  // Общая сумма дуг и зазоров строго равна 360°
  close(arcTotal + gap * segments.length, 360);
}

// 4. Проверка граничных случаев для дуги
assert(!/NaN|Infinity/.test(roundedCacheArc(0, 0)));
assert(!/NaN|Infinity/.test(roundedCacheArc(12, 1e-9)));
assert(!/NaN|Infinity/.test(roundedCacheArc(45, 6.5)));
assert(!/NaN|Infinity/.test(roundedCacheArc(90, 270)));

console.log("PASS equal cache ring gaps, guaranteed sectors for micro-caches, and robust rounded arcs");
