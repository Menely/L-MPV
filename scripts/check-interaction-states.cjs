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
walk('src/styles');walk('src/components');assert.ok(rings>15);
for(const file of ['src/components/upscale/ModelHotkeyButton.tsx','src/components/subtitles/SubtitleLineRow.tsx'])assert.doesNotMatch(read(file),/rgba\((?:59, 130, 246|127, 199, 255)/);
assert.doesNotMatch(read('src/components/settings/tabs/HotkeysSettingsTab.tsx'),/currentTarget\.style\.background/);
const depths=read('src/styles/surface-depth.css');
assert.equal((depths.match(/--bg-hover: var\(--surface-level-3-hover\)/g)||[]).length,5);
assert.equal((depths.match(/--bg-active: var\(--surface-accent-hover\)/g)||[]).length,5);
console.log(`PASS: selected-hover, parent/child borders, destructive hover, timeline/volume focus, ${rings} solid rings across ${files} style/component files, scoped aliases and legacy-blue regressions.`);
