const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const { verticalListSortingStrategy } = require('@dnd-kit/sortable');
const root = path.resolve(__dirname, '..');
const exportsObject = {};
const source = fs.readFileSync(path.join(root, 'src/utils/dndCoordinates.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {exports: exportsObject});
const convert = process.argv.includes('--legacy') ? value => value : exportsObject.toLocalDragTransform;
const heights = [32, 24, 32, 32, 24, 32, 32];
let cases = 0;
for (const zoom of [.75, 1, 1.15, 1.35, 1.5, 2]) {
  let top = 100;
  const rects = heights.map(height => {
    const rect = {top, bottom: top + height * zoom, height: height * zoom, left: 30, width: 300 * zoom};
    top = rect.bottom + 4 * zoom;
    return rect;
  });
  for (let activeIndex = 0; activeIndex < heights.length; activeIndex++) {
    for (let overIndex = 0; overIndex < heights.length; overIndex++) {
      const positions = [];
      for (let index = 0; index < heights.length; index++) {
        const transform = verticalListSortingStrategy({activeIndex, overIndex, index, rects, activeNodeRect: rects[activeIndex]});
        const local = convert(transform, zoom);
        assert.ok(Math.abs(local.y * zoom - transform.y) < 1e-8, 'A sortable translation must move by the measured viewport distance at every UI zoom');
        if (index !== activeIndex) positions.push({top: rects[index].top + local.y * zoom, height: rects[index].height});
      }
      positions.sort((a, b) => a.top - b.top);
      for (let i = 1; i < positions.length; i++) assert.ok(positions[i].top >= positions[i-1].top + positions[i-1].height - .01, 'Mixed-height rows and dividers must not overlap');
      cases++;
    }
  }
}
assert.equal(convert(null, 1.35), null);
for (const invalidScale of [0, NaN, Infinity, -1]) assert.equal(exportsObject.toLocalDragTransform({x: 5, y: 9}, invalidScale).y, 9);
const tab = fs.readFileSync(path.join(root, 'src/components/settings/tabs/ContextMenuSettingsTab.tsx'), 'utf8');
const card = fs.readFileSync(path.join(root, 'src/components/settings/components/ContextMenuEntryCard.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles/modals.css'), 'utf8');
assert.equal((card.match(/ref=\{setNodeRef\} className="cmenu-entry-slot"/g) || []).length, 2, 'Measure stationary wrappers for both kinds of entry');
assert.ok(tab.includes('</DragOverlay>, document.body)'), 'Keep fixed-position overlay outside zoomed, clipped settings');
assert.ok(!tab.includes('ignoreTransform: true'), 'Do not invert animated transforms in viewport measurements');
assert.ok(!tab.includes('frequency: 32'), 'Do not poll animated rows');
assert.match(css, /\.cmenu-entry-slot\s*\{[^}]*flex: 0 0 auto/s);
assert.match(css, /\.cmenu-entry--overlay\s*\{[^}]*height: 100%/s);
console.log(`PASS: ${cases} moves with mixed row heights at six zoom levels; no overlap, stable measuring slots and a body overlay.`);

// Exercise the model component too: the measured wrapper must remain stationary,
// while its fully visible child follows a viewport displacement at each zoom.
const modelSource = fs.readFileSync(path.join(root, 'src/components/upscale/ModelListItem.tsx'), 'utf8');
let modelZoom = 1;
const modelExports = {};
const react = {memo: component => component, createElement: (type, props, ...children) => ({type, props, children})};
vm.runInNewContext(ts.transpileModule(modelSource, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React}}).outputText, {
  exports: modelExports,
  require: name => {
    if (name === 'react') return {default: react};
    if (name === '@dnd-kit/sortable') return {useSortable: () => ({setNodeRef() {}, transform: {x: 12, y: 80}, isDragging: true})};
    if (name === '@dnd-kit/utilities') return {CSS: {Translate: {toString: value => value}}};
    if (name.endsWith('/uiThemeUtils')) return {getActiveUiScale: () => modelZoom};
    if (name.endsWith('/dndCoordinates')) return exportsObject;
    if (name.endsWith('/LanguageContext')) return {useTranslation: () => ({dict: {settings: {upscaling: {modelNumberTip: () => '', dragReorderTip: ''}}}})};
    return new Proxy({}, {get: (_, key) => key});
  },
});
for (modelZoom of [.75, 1, 1.15, 1.35, 1.5, 2]) {
  const slot = modelExports.ModelListItem({model: {filename: 'model.onnx', display_name: 'Model', size_bytes: 1024}, idx: 0, customHotkeys: {}, isSelected: false});
  assert.equal(slot.props.style.transform, undefined);
  assert.equal(slot.props.style.flex, '0 0 auto');
  const card = slot.children[0];
  assert.ok(Math.abs(card.props.style.transform.y * modelZoom - 80) < 1e-8);
  assert.equal(card.props.style.opacity, undefined, 'The actual dragged model must remain visible');
}
console.log('PASS: model cards use stationary non-shrinking slots and opaque, zoom-correct dragging at six scales.');
