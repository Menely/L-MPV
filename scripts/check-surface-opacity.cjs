const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),postcss=require('postcss');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'src/styles/surface-opacity.css');
assert.ok(fs.existsSync(file),'Rendered surfaces must respond to global opacity');
const tokens=new Map();
postcss.parse(fs.readFileSync(file,'utf8')).walkRules(r=>{if(r.selector===':root')r.walkDecls(d=>tokens.set(d.prop,d.value));});
function alpha(name,opacity){const value=tokens.get(name);assert.ok(value,`${name} missing`);const m=value.match(/^calc\(([\d.]+) \+ var\(--ui-opacity\) \* ([\d.]+)\)$/);assert.ok(m,`${name}: unexpected curve`);return Number(m[1])+opacity*Number(m[2]);}
for(let d=0;d<5;d++){
  let previous=0;
  for(const o of [.1,.5,.88,1]){
    const card=alpha(`--surface-opacity-${d}`,o),hover=alpha(`--surface-state-opacity-${d}`,o),selected=alpha(`--surface-selection-opacity-${d}`,o);
    assert.ok(card>previous);previous=card;
    assert.ok(card>=o&&hover>=card&&selected>=hover);
    if(o<1)assert.ok(selected<1,'Highlights must also respond to opacity');
    else for(const a of [card,hover,selected])assert.ok(Math.abs(a-1)<1e-9);
  }
  for(const [prefix,role] of [['fill','opacity'],['fill-hover','state-opacity'],['fill-selected','selection-opacity'],['fill-selected-hover','selection-opacity']]){
    assert.match(tokens.get(`--surface-${prefix}-${d}`),new RegExp(`var\\(--surface-${role}-${d}\\)`));
  }
}
for(const o of [.1,.5,.88,1])assert.ok(alpha('--ui-popover-opacity',o)>=o);
const depth=fs.readFileSync(path.join(root,'src/styles/surface-depth.css'),'utf8');
assert.doesNotMatch(depth,/--surface-(?:card|child|level-[23]|accent)[\w-]*:\s*var\(--surface-(?:tone|hover|selected)-/);
assert.match(depth,/\.track-popover[\s\S]*--surface-root-glass:[\s\S]*var\(--ui-popover-opacity\)/);
const hierarchy=fs.readFileSync(path.join(root,'src/utils/surfaceHierarchy.ts'),'utf8');
for(const selector of ['.track-popover','.context-menu','.context-menu__submenu','.controls-overflow','.subtitles-search-card__track-picker-menu','.confirm-dialog','.version-picker-popover']){
  assert.ok(depth.includes(selector+',' )||depth.includes(selector+' {'),`${selector}: dropdown opacity missing`);
  assert.ok(hierarchy.includes(`"${selector}"`),`${selector}: independent root missing`);
}
for(const [file,selector] of [['controls/controls-overflow.css','.controls-overflow'],['presets.css','.confirm-dialog'],['controls/controls-base.css','.waveform-activity-strip__status']]){
  const css=postcss.parse(fs.readFileSync(path.join(root,'src/styles',file),'utf8'));
  const matches=[];css.walkRules(r=>{if(r.selectors.includes(selector))r.walkDecls('background',d=>matches.push(d.value));});
  assert.ok(matches.includes('var(--bg-glass)')||matches.includes('var(--surface-level-3)'),`${selector}: must use responsive fill`);
}
const index=fs.readFileSync(path.join(root,'src/index.css'),'utf8');assert.ok(index.indexOf("'./styles/surface-opacity.css'")<index.indexOf("'./styles/surface-depth.css'"));
console.log('PASS: five depth curves at 10/50/88/100%, distinct card/hover/selection density, live CSS dependency, dropdown response and semantic mappings.');
