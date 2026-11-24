const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const code = esbuild.buildSync({entryPoints: ['src/utils/truncateMiddle.ts'], bundle: true,
  write: false, platform: 'node', format: 'cjs'}).outputFiles[0].text;
const mod = {exports: {}};
new Function('module', 'exports', code)(mod, mod.exports);
const {truncateMiddle} = mod.exports;
// A proportional font, including wide Unicode code points, rather than char counts.
const measure = value => Array.from(value).reduce((sum, character) => sum +
  (character === 'W' ? 12 : character === 'i' ? 2 : character === '🎬' ? 14 : 6), 0);
for (const text of ['F:/Archive/Very long folder/Episode 01', '//Server/Аниме/Сезон 2', 'D:/🎬/WWW/iii']) {
  assert.equal(truncateMiddle(text, measure(text), measure), text);
  for (let width = 0; width <= measure(text); width++) {
    const display = truncateMiddle(text, width, measure);
    assert(measure(display) <= width);
    assert(!/[\uD800-\uDFFF]/u.test(display), 'No split Unicode surrogate pairs');
    if (display.includes('…')) {
      const [start, end] = display.split('…');
      assert(text.startsWith(start) && text.endsWith(end));
    }
  }
}
assert.equal(truncateMiddle('', 10, measure), '');
console.log('PASS middle ellipsis fits proportional widths, preserves both ends and Unicode, restores full paths');
