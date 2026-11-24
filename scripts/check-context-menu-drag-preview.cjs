const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let context = {activeNodeRect: null};
const output = {};
const source = fs.readFileSync(path.join(__dirname, '../src/components/settings/components/ContextMenuDragPreview.tsx'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText, {
  exports: output,
  require: name => name === 'react/jsx-runtime' ? {jsx: (type, props) => ({type, props, children: [props.children]}), jsxs: (type, props) => ({type, props, children: props.children})} : name === '@dnd-kit/core' ? {useDndContext: () => context} : {OverlayCard: 'OverlayCard'},
});
const tab = fs.readFileSync(path.join(__dirname, '../src/components/settings/tabs/ContextMenuSettingsTab.tsx'), 'utf8');
assert.ok(!tab.includes('activeOverlaySize') && !tab.includes('event.active.rect.current.initial'), 'Do not gate the preview on a one-time drag-start measurement');
const props = {entry: {type: 'item', id: 'subtitle_track'}, scale: 1.35};
// onDragStart happens before activeNodeRect is measured. The next context
// update must show a preview, without needing another drag-start event.
assert.equal(output.ContextMenuDragPreview(props), null);
context = {activeNodeRect: {width: 405, height: 43.2}};
const preview = output.ContextMenuDragPreview(props);
assert.ok(preview, 'Render the overlay after the delayed measurement arrives');
assert.equal(preview.props.style.width, 300);
assert.equal(preview.props.style.height, 32);
assert.equal(preview.props.style.zoom, 1.35);
assert.equal(preview.children[0].props.entry, props.entry);
context = {activeNodeRect: null};
assert.equal(output.ContextMenuDragPreview(props), null);
console.log('PASS: preview appears after a delayed drag measurement, preserves zoom and disappears on cleanup.');
