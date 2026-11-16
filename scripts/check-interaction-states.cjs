// Guard the actual state selectors and shadow geometry, independent of migration.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),postcss=require('postcss');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function rules(file){return postcss.parse(read(file)).nodes.filter(n=>n.type==='rule');}
function declaration(file,selector,property){const found=rules(file).filter(r=>r.selectors.includes(selector)).flatMap(r=>r.nodes.filter(d=>d.type==='decl'&&d.prop===property));assert.ok(found.length,`${selector} ${property}`);return found.at(-1);}
const modals='src/styles/modals.css',mi='src/styles/mediainfo-modal/mediainfo-modal-capsule.css';
for(const [file,selector] of [
  [modals,'.version-picker-item--active:hover'],[modals,'.settings-tab-btn--active:hover'],
  [modals,'.modal--settings-capsule .settings-card--tabs .settings-tab-btn--active:hover'],
  [modals,'.settings-side-panel--capsule .settings-card--tabs .settings-tab-btn--active:hover'],
  ['src/styles/settings-panel.css','.settings-side-panel__nav-btn--active:hover'],
  [mi,'.mediainfo-standalone--capsule .mediainfo-standalone__control-btn--active:hover'],
  [mi,'.mediainfo-standalone--capsule .mediainfo-standalone__action-btn--active:hover:not(:disabled)'],
  [mi,'.mediainfo-standalone--capsule .mediainfo-tab-chip--active:hover:not(:disabled)'],
// Выбранный таб при наведении держит акцентную вуаль (эталон selected):
// hover поверх selected — всегда усиление вуали, никогда нейтральный фон.
])assert.equal(declaration(file,selector,'background').value,'var(--surface-accent-hover)');
const components='src/styles/components.css';
assert.ok(!rules(components).some(r=>r.selector==='.glass-section:hover'||r.selector.includes('.glass-section:has(:focus-visible)')));
for(const base of ['.glass-tile--clickable:hover','.glass-tile--active:hover'])assert.ok(rules(components).some(r=>r.selector.startsWith(base+':not(:has(button:hover')));
assert.ok(rules(modals).some(r=>r.selector==='.settings-accordion:has(> .settings-accordion__header:hover)'));
assert.ok(rules('src/styles/presets.css').some(r=>r.selector==='.preset-action-btn:hover:not(.preset-action-btn--apply):not(.preset-action-btn--danger)'));
assert.equal(declaration('src/styles/controls/controls-base.css','.timeline:focus-visible','outline').value,'none');
assert.equal(declaration('src/styles/controls/controls-base.css','.timeline:focus-visible','outline').important,true);
assert.equal(declaration('src/styles/controls/controls-base.css','.volume-slider__input:focus-visible','outline').value,'2px solid var(--focus-ring)');
// A solid zero-blur ring must survive Glow Off. Inspect CSS and inline JSX strings.
let files=0,rings=0;
function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())walk(p);else if(/\.(css|tsx)$/.test(p)){files++;const s=read(p);for(const m of s.matchAll(/(?:inset\s+)?0\s+0\s+0(?:px)?\s+[\d.]+px\s+var\(--([\w-]+)\)/g)){rings++;assert.ok(!/glow/.test(m[1]),`${p}: solid ring uses ${m[1]}`);}}}}
walk('src/styles');walk('src/components');assert.ok(rings>0);
// Ordinary selection must not borrow the contrast-corrected keyboard ring.
// The selection frame comes from one switchable token, never a hardcoded accent.
assert.equal(declaration(modals,'.compact-segment-btn--active','border-color').value,'var(--selection-frame)');
assert.doesNotMatch(declaration(modals,'.compact-segment-btn--active','box-shadow').value,/--focus-ring/);
assert.doesNotMatch(read('src/components/settings/components/optionCardStyles.ts'),/--focus-ring/);
// No selected-state rule may hardcode the accent frame or keep a glow halo:
// both must come from --selection-frame / --selection-shadow.
for(const file of fs.readdirSync(path.join(root,'src/styles')).flatMap(f=>{
  const p=path.join(root,'src/styles',f);
  return fs.statSync(p).isDirectory()?fs.readdirSync(p).map(x=>'src/styles/'+f+'/'+x):['src/styles/'+f];
}).filter(f=>f.endsWith('.css'))) {
  const css=postcss.parse(read(file));
  css.walkRules(r=>{
    if(!/--active|--selected\b|--current|--applied|:checked/.test(r.selector))return;
    if(/recording/i.test(r.selector))return;
    // Чекбокс — исключение: его рамка совпадает с цветом заливки
    // (контур сливается с акцентной заливкой, отдельная рамка не нужна).
    if(/ui-checkbox/.test(r.selector))return;
    r.walkDecls('border',d=>assert.doesNotMatch(d.value,/var\(--accent\)/,`${file}: ${r.selector} hardcodes the accent frame`));
    r.walkDecls('border-color',d=>assert.doesNotMatch(d.value,/var\(--accent\)/,`${file}: ${r.selector} hardcodes the accent frame`));
    r.walkDecls('box-shadow',d=>assert.doesNotMatch(d.value,/var\(--surface-accent-glow\)/,`${file}: ${r.selector} keeps a glow halo`));
  });
}
// Window action buttons (close, expand, refresh, clear) must share ONE hover
// background everywhere: the X used a denser veil than its neighbour arrows,
// so the same island looked mismatched.
const actionTokens=new Set(['var(--action-hover-veil)']);
for(const [file,selector] of [
  ['src/styles/close-actions.css','.update-card__action-btn'],
  ['src/styles/modals.css','.update-modal-capsule .update-card__action-btn'],
  ['src/styles/modals.css','.modal__close'],
  ['src/styles/overlays.css','.update-toast__close'],
  ['src/styles/settings-panel.css','.settings-side-panel__close'],
  ['src/styles/side-panel.css','.side-panel__close'],
  ['src/styles/mediainfo-modal.css','.mediainfo-standalone__action-btn'],
  ['src/styles/media-info-overlay/media-info-overlay-base.css','.media-info__close'],
  ['src/styles/playlist/playlist-base.css','.playlist-drawer__action-btn'],
  ['src/styles/track-popover/track-popover-base.css','.track-popover__icon-btn'],
]){
  const css=postcss.parse(read(file));
  css.walkRules(r=>{
    if(!r.selector.includes(selector))return;
    if(!/:hover/.test(r.selector))return;
    r.walkDecls('background',d=>{
      assert.ok(actionTokens.has(d.value.trim()),
        `${file}: ${r.selector} must use the shared action hover token, got ${d.value}`);
    });
  });
}
// The shared token must exist and resolve to the accent (colour follows the accent).
const varsText=read('src/styles/variables.css');
assert.match(varsText,/--action-hover-veil:/);
assert.match(varsText,/--action-hover-veil:\s*var\(--hover-veil-float\)/);
// No hover rule may hardcode an accent alpha instead of using a token.
for(const file of fs.readdirSync(path.join(root,'src/styles')).flatMap(f=>{
  const p=path.join(root,'src/styles',f);
  return fs.statSync(p).isDirectory()?fs.readdirSync(p).map(x=>'src/styles/'+f+'/'+x):['src/styles/'+f];
}).filter(f=>f.endsWith('.css'))) {
  const css=postcss.parse(read(file));
  css.walkRules(r=>{
    if(!/:hover/.test(r.selector))return;
    // Scrollbar thumbs are pseudo-element affordances, not control states.
    if(/scrollbar/.test(r.selector))return;
    // A selected element keeps the selection veil even while hovered.
    if(/--active|--selected\b|--current|--applied/.test(r.selector))return;
    r.walkDecls('background',d=>{
      assert.doesNotMatch(d.value,/rgba\(var\(--accent-rgb/,
        `${file}: ${r.selector} hardcodes an accent alpha instead of a token`);
    });
  });
}
// The selection switch must exist and be documented in one place.
const vars=read('src/styles/variables.css');
assert.match(vars,/--selection-frame:/);
assert.match(vars,/--selection-shadow:/);
assert.match(vars,/--hover-veil:/);
assert.match(vars,/--hover-veil-float:/);
// Tabs are the documented exception: hover shows the veil only, never a frame
// (a framed tab reads as a selected one).
for(const selector of ['.settings-tab-btn:hover','.modal--settings-capsule .settings-card--tabs .settings-tab-btn:hover']){
  const value=declaration('src/styles/modals.css',selector,'border-color');
  assert.equal(value.value,'transparent',`${selector} must not draw a hover frame`);
}
// The track download button has one design in every style: no card, no frame.
for(const [file,selector] of [['src/styles/track-popover/track-popover-base.css','.track-download-btn'],['src/styles/context-menu.css','.context-menu .track-download-btn']]){
  const css=postcss.parse(read(file));
  const rules=css.nodes.filter(n=>n.type==='rule'&&n.selector===selector);
  assert.ok(rules.length,`${selector} missing`);
  const decls=new Map();
  rules.at(-1).walkDecls(d=>decls.set(d.prop,d.value));
  assert.equal(decls.get('background'),'transparent',`${selector} must not have a card background`);
  assert.equal(decls.get('border'),'1px solid transparent',`${selector} must not have a frame`);
}
// Hover must always carry an accent veil, never a neutral grey wash.
for(const file of fs.readdirSync(path.join(root,'src/styles')).flatMap(f=>{
  const p=path.join(root,'src/styles',f);
  return fs.statSync(p).isDirectory()?fs.readdirSync(p).map(x=>'src/styles/'+f+'/'+x):['src/styles/'+f];
}).filter(f=>f.endsWith('.css'))) {
  const css=postcss.parse(read(file));
  css.walkRules(r=>{
    if(!/:hover/.test(r.selector))return;
    r.walkDecls('background',d=>{
      assert.doesNotMatch(d.value,/var\(--surface-level-3-hover\)/,`${file}: ${r.selector} hover is a neutral wash`);
    });
  });
}
for(const file of ['src/components/upscale/ModelHotkeyButton.tsx','src/components/subtitles/SubtitleLineRow.tsx'])assert.doesNotMatch(read(file),/rgba\((?:59, 130, 246|127, 199, 255)/);
assert.doesNotMatch(read('src/components/settings/tabs/HotkeysSettingsTab.tsx'),/currentTarget\.style\.background/);
const depths=read('src/styles/surface-depth.css');
// --bg-hover is the accent hover veil at every depth (hover always carries accent).
assert.equal((depths.match(/--bg-hover: var\(--hover-veil\)/g)||[]).length,5);
assert.equal((depths.match(/--bg-active: var\(--surface-accent-hover\)/g)||[]).length,5);
console.log(`PASS: selected-hover, parent/child borders, destructive hover, timeline/volume focus, ${rings} solid rings across ${files} style/component files, scoped aliases and legacy-blue regressions.`);
