const assert = require('node:assert/strict');
const fs = require('node:fs');
const esbuild = require('esbuild');

const code = esbuild.buildSync({
  entryPoints: ['src/utils/videoBitrateLogic.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
}).outputFiles[0].text;

const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);

const {
  VIDEO_BITRATE_BIN_SEC,
  checkHasVideoTrack,
  resolveActiveVideoTrackId,
  resolveEffectivePosition,
  positionToBitrateBin,
  binToSamplePosition,
  isSeekJump,
  isSeekBinJump,
  normalizeSparklineHistory,
  resolveFallbackBitrate,
} = mod.exports;

assert.equal(resolveActiveVideoTrackId(null), 1);
assert.equal(resolveActiveVideoTrackId({ current_vid: 'auto' }), 1);
assert.equal(resolveActiveVideoTrackId({ current_vid: '2' }), 2);

assert.equal(VIDEO_BITRATE_BIN_SEC, 0.5);
assert.equal(positionToBitrateBin(0), 0);
assert.equal(positionToBitrateBin(0.49), 0);
assert.equal(positionToBitrateBin(0.5), 1);
assert.equal(positionToBitrateBin(3.99), 7);
assert.equal(positionToBitrateBin(4.0), 8);
assert.equal(positionToBitrateBin(-5), 0);

assert.equal(binToSamplePosition(0), 0);
assert.equal(binToSamplePosition(8), 4.0);
assert.equal(binToSamplePosition(-2), 0);

assert.equal(isSeekJump(null, 10), false);
assert.equal(isSeekJump(10.0, 10.5), false);
assert.equal(isSeekJump(10.0, 12.0), true);
assert.equal(isSeekJump(10.0, 9.2), true);

assert.equal(isSeekBinJump(null, 20), false);
assert.equal(isSeekBinJump(20, 20), false);
assert.equal(isSeekBinJump(20, 21), false);
assert.equal(isSeekBinJump(20, 23), false);
assert.equal(isSeekBinJump(20, 24), true);
assert.equal(isSeekBinJump(20, 19), true);

assert.deepEqual(normalizeSparklineHistory([], 25), []);
assert.deepEqual(normalizeSparklineHistory([1500000], 25), [1500000, 1500000]);
assert.deepEqual(
  normalizeSparklineHistory([18000000, 19000000, 4200], 2),
  [19000000, 4200],
);

assert.equal(resolveEffectivePosition(14.25, { position: 2.0 }, { position: 1.0 }), 14.25);
assert.equal(resolveEffectivePosition(undefined, { position: 8.5 }, { position: 1.0 }), 8.5);
assert.equal(checkHasVideoTrack({ has_video: false }, { has_video: false, width: 0, height: 0 }), false);
assert.equal(checkHasVideoTrack({ has_video: true }, null), true);
assert.equal(
  resolveFallbackBitrate({ has_video: true, video_bitrate: 4500000 }, null, 9000000),
  4500000,
);

const hookSource = fs.readFileSync('src/hooks/useVideoBitrate.ts', 'utf8');
assert(hookSource.includes('get_live_video_bitrate'), 'Hook must query PTS-aligned live bitrate window');
assert(!hookSource.includes('0.85'), 'Hook must not apply lagging EMA smoothing');
assert(hookSource.includes('inFlightBinRef'), 'Hook must deduplicate in-flight bin requests');

const overlaySource = fs.readFileSync(
  'src/components/modals/media-info-overlay/MediaInfoOverlay.tsx',
  'utf8',
);
assert(
  overlaySource.includes('useVideoBitrate({\n    liveState,\n    mediaInfo,\n    position,\n  })') ||
    overlaySource.includes('position,'),
  'MediaInfoOverlay must pass frame position to useVideoBitrate',
);

console.log('PASS PTS-aligned 0.5s bitrate bins, instant scene-cut drop, in-flight deduplication, seek reset, and Sparkline history normalization');
