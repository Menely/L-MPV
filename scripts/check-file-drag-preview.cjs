const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const mod = {exports: {}};
const build = esbuild.buildSync({entryPoints: ['src/utils/fileDragPreview.ts'], bundle: true, write: false, platform: 'node', format: 'cjs'});
new Function('module', 'exports', build.outputFiles[0].text)(mod, mod.exports);
const {splitDraggedFileName, draggedFileKind, fileDragPreviewPosition: place} = mod.exports;
for (const [kind, names] of Object.entries({
  video: ['movie.mkv', 'MOVIE.MP4', 'clip.m2ts', 'old.avi', 'video.webm'],
  audio: ['track.flac', 'voice.MKA', 'sound.eac3', 'music.mp3', 'song.opus'],
  subtitle: ['track.ass', 'captions.SRT', 'captions.vtt', 'disc.sup', 'disc.idx'],
  image: ['frame.png', 'photo.JPG', 'image.avif'],
  playlist: ['series.m3u', 'stream.M3U8', 'list.pls'],
  file: ['unknown.bin', 'README', '.hidden'],
})) {
  for (const name of names) assert.equal(draggedFileKind(splitDraggedFileName(name).extension), kind, name);
}
assert.deepEqual(splitDraggedFileName('C:\\Видео\\Эпизод 01.mkv'), {stem: 'Эпизод 01', extension: '.mkv'});
assert.deepEqual(splitDraggedFileName('/Audio/Track.en.flac'), {stem: 'Track.en', extension: '.flac'});
assert.deepEqual(splitDraggedFileName('movie.ass'), {stem: 'movie', extension: '.ass'});
assert.deepEqual(splitDraggedFileName('.hidden'), {stem: '.hidden', extension: ''});
const size = {width: 200, height: 40};
const viewport = {width: 800, height: 600};
assert.deepEqual(place({x: 100, y: 100}, size, viewport, 1, 1), {x: 116, y: 116});
assert.deepEqual(place({x: 200, y: 200}, size, viewport, 2, 1.25), {x: 92.8, y: 92.8});
for (const point of [{x: 0, y: 0}, {x: 800, y: 600}, {x: 790, y: 5}, {x: -20, y: -40}]) {
  const p = place(point, size, viewport, 1, 1);
  assert(p.x >= 8 && p.x + size.width <= 792);
  assert(p.y >= 8 && p.y + size.height <= 592);
}
assert.deepEqual(place({x: 100, y: 100}, size, viewport, NaN, 0), {x: 116, y: 116});
console.log('PASS drag filename, extension, physical pixels, UI zoom and viewport edges');
