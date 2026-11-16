const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rootDir = path.resolve(__dirname, '..');
const storage = new Map(), properties = new Map(), attributes = new Map(), cache = new Map();
const style = { setProperty: (k,v) => properties.set(k,v), getPropertyValue: k => properties.get(k) || '' };
const root = { style, setAttribute: (k,v) => attributes.set(k,v), getAttribute: k => attributes.get(k) || null };
const sandbox = { localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) },
  document: { documentElement: root }, window: { dispatchEvent() {} }, getComputedStyle: () => style,
  CustomEvent: class { constructor(type, init) { this.type=type; this.detail=init?.detail; } }, console, Set, Map };
function load(file) {
  file = path.resolve(rootDir,file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file,exports);
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(js,{...sandbox,exports,require: p => p.startsWith('.') ? load(path.resolve(path.dirname(file),p+'.ts')) : { invoke() {} }},{filename:file});
  return exports;
}
const colors = load('src/utils/colorUtils.ts'), math = load('src/utils/colorMath.ts'), ui = load('src/utils/uiThemeUtils.ts');
const hierarchy = load('src/utils/surfaceHierarchy.ts');
// Independent contrast/compositing reference, deliberately not using colorMath.
function rgb(s) { if(s.startsWith('#'))return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16)).concat(1); return (s.match(/[\d.]+/g)||[]).map(Number); }
function blend(a,b) {a=Array.isArray(a)?a:rgb(a);b=Array.isArray(b)?b:rgb(b);return a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1)));}
function ratio(a,b) {const L=c=>(Array.isArray(c)?c:rgb(c)).slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const x=L(a),y=L(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
assert.equal(ratio('#ffffff','#000000'),21);
const preserved = {graphite:['#0b0d12','#13161d'],oled:['#000000','#09090b'],emerald:['#06130e','#0a1d15'],discord:['#202225','#2e3035'],pine:['#14261f','#1c352b'],mint:['#122827','#1a3837']};
for(const [id,[base,surface]] of Object.entries(preserved)) {
  assert.equal(colors.PLAYER_THEMES[id].tokens.bgPrimary,base);
  assert.equal(colors.PLAYER_THEMES[id].tokens.bgSurface,surface);
}
for(const c of ['#7fc7ff','#e8a236','#f9a8d4','#a7f3d0'])assert.ok(colors.PASTEL_PRESETS.includes(c));
const presets=[...colors.PASTEL_PRESETS,...colors.STANDARD_PRESETS];
assert.equal(new Set(presets).size,presets.length);
const saturation = color => {const values=rgb(color).slice(0,3);return (Math.max(...values)-Math.min(...values))/Math.max(...values);};
const median = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
assert.ok(colors.STANDARD_PRESETS.every(c=>saturation(c)>=.55),'Standard swatches should be visibly saturated');
assert.ok(median(colors.STANDARD_PRESETS.map(c=>math.colorAppearance(c).chroma))>=1.8*median(colors.PASTEL_PRESETS.map(c=>math.colorAppearance(c).chroma)),'Palette groups should be perceptually distinct');
const extras=['#000000','#ffffff','#777777','#7a7a7a','#757575','#ff0000','#0000ff','#00ff00','#6366f1','#8b5cf6'];
const depthCss=fs.readFileSync(path.join(rootDir,'src/styles/surface-depth.css'),'utf8');
const scopes=new Map([...depthCss.matchAll(/\[data-surface-depth="(\d)"\]\s*\{([^}]*)\}/g)].map(m=>[Number(m[1]),[...m[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(d=>[d[1],d[2].trim()])]));
const componentsCss=fs.readFileSync(path.join(rootDir,'src/styles/components.css'),'utf8');
const fillCss=fs.readFileSync(path.join(rootDir,'src/styles/surface-opacity.css'),'utf8');
const fillTokens=new Map([...fillCss.matchAll(/(--surface-fill[\w-]*):\s*color-mix\(in srgb, var\((--[\w-]+)\)/g)].map(m=>[m[1],m[2]]));
for(const selector of ['.glass-section','.glass-tile']) {
  const start=componentsCss.indexOf(selector+' {');
  assert.ok(start>=0);
  assert.match(componentsCss.slice(start,componentsCss.indexOf('}',start)),/background:\s*var\(--surface-card\)/,`${selector} must use its own tone, not the child tone`);
}
const refLum=c=>(Array.isArray(c)?c:rgb(c)).slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
let pairs=0, minimumText=Infinity, minimumFill=Infinity;
for(const theme of Object.values(colors.PLAYER_THEMES)) {
  storage.set(colors.PLAYER_THEME_STORAGE_KEY,theme.id);
  colors.applyPlayerTheme(theme.id);
  assert.ok(theme.recommendedAccents.length>=3,`${theme.id}: too few recommendation dots`);
  for(const c of theme.recommendedAccents)assert.ok(presets.includes(c),`${theme.id}: recommended color missing`);
  for(const accent of [...presets,...extras]) {
    colors.applyAccentColor(accent);
    assert.equal(properties.get('--accent'),accent);
    // Root glass samples bright video. Child levels are explicit opaque tones.
    const glass=blend([...theme.tokens.bgGlassRgb.split(',').map(Number),.88],[255,255,255]);
    const levels=Array.from({length:5},(_,i)=>properties.get(`--surface-tone-${i}`));
    const selected=Array.from({length:5},(_,i)=>properties.get(`--surface-selected-hover-${i}`));
    const hovered=Array.from({length:5},(_,i)=>properties.get(`--surface-hover-${i}`));
    for(let depth=0;depth<5;depth++) {
      assert.match(levels[depth],/^#[\da-f]{6}$/,'Child surfaces must not accumulate alpha');
      if(depth>0) {
        assert.ok(math.colorAppearance(levels[depth]).lightness>math.colorAppearance(levels[depth-1]).lightness,`${theme.id}/${accent}: depth must raise tone`);
        assert.ok(ratio(levels[depth],levels[depth-1])>=1.025,`${theme.id}/${accent}: indistinguishable depth`);
      }
      const scoped=new Map([...properties,...scopes.get(depth)]);
      // Tonal/contrast checks use solid colors. Alpha behavior is separately
      // checked against the rendered CSS in check-surface-opacity.cjs.
      const resolve = name => {let value=scoped.get(name);for(let i=0;i<20&&/^var\(--[\w-]+\)$/.test(value);i++){const key=value.slice(4,-1);value=scoped.get(fillTokens.get(key)||key);}return value;};
      const own=resolve('--surface-card'),child=resolve('--surface-level-3');
      assert.equal(own,levels[depth],`${theme.id}: CSS depth does not match semantic depth`);
      assert.equal(child,levels[Math.min(4,depth+1)]);
      assert.ok(refLum(resolve('--surface-card-hover'))>refLum(own),'A card must not darken on hover');
      // Вуаль selected полупрозрачна: браузер блендит её с подложкой,
      // поэтому сравниваем именно сбленденный цвет (blend over base),
      // а не сырой rgba. Для глухих тонов blend возвращает их как есть.
      assert.ok(refLum(blend(resolve('--surface-card-selected'),own))>refLum(own),'A selected card must not darken');
      assert.ok(refLum(resolve('--surface-level-3-hover'))>refLum(child),'Child control must not darken on hover');
      assert.ok(refLum(blend(resolve('--surface-accent-subtle'),child))>refLum(child),'Child control must not darken on selection');
    }
    // Текст проверяем и на реально отрендеренных вуалях (сбленденных с подложкой).
    const backgrounds=[rgb(theme.tokens.bgSurface),glass,...levels,...selected,...hovered,
      blend(properties.get('--surface-card-selected'),levels[1]),
      blend(properties.get('--surface-accent-subtle'),levels[2])];
    for(const token of ['--text-primary','--text-secondary','--text-muted','--accent-text'])for(const bg of backgrounds) {
      const r=ratio(properties.get(token),bg);minimumText=Math.min(minimumText,r);
      assert.ok(r>=4.5,`${theme.id}/${accent} ${token}: ${r.toFixed(3)}`);
    }
    for(const [fg,bg] of [['--on-accent','--accent'],['--on-accent-hover','--accent-hover']]) {
      const r=ratio(properties.get(fg),properties.get(bg));minimumFill=Math.min(minimumFill,r);
      assert.ok(r>=4.5,`${accent} ${fg}: ${r}`);
    }
    for(const name of ['success','warning','danger','info']) {
      for(const card of levels) {
        const bg=blend(properties.get(`--${name}-surface`),card);
        assert.ok(ratio(properties.get(`--${name}-text`),bg)>=4.5,`${theme.id}/${accent}: ${name}`);
      }
    }
    for(const bg of selected)assert.ok(ratio(properties.get('--focus-ring'),bg)>=3,`${theme.id}/${accent}: focus`);
    pairs++;
  }
}
storage.set(colors.PLAYER_THEME_STORAGE_KEY,'graphite');
for(const intensity of ['off','soft','medium','intense']) {
  storage.set(colors.GLOW_INTENSITY_STORAGE_KEY,intensity);
  colors.applyAccentColor('#000000');
  for(const name of ['accent-glow','surface-accent-glow','success-glow','warning-glow','danger-glow','info-glow']) {
    assert.equal(properties.get(`--${name}`)==='transparent',intensity==='off',`${name}/${intensity}`);
  }
  for(const name of ['thumb-glow','timeline-glow','shadow-glow'])assert.equal(properties.get(`--${name}`)==='none',intensity==='off',`${name}/${intensity}`);
  for(let depth=0;depth<5;depth++)assert.ok(ratio(properties.get('--focus-ring'),properties.get(`--surface-selected-hover-${depth}`))>=3);
}
storage.delete(colors.GLOW_INTENSITY_STORAGE_KEY);
colors.applyPlayerTheme('mint');
colors.applyAccentColor('#7fc7ff');
assert.equal(attributes.get('data-player-theme'),'mint');
const elevated=properties.get('--bg-elevated-rgb');
ui.applyUiOpacity(.64);
assert.equal(properties.get('--bg-elevated'),`rgba(${elevated}, 0.64)`);
assert.notEqual(elevated,properties.get('--bg-glass-rgb'));
colors.applyPlayerTheme('unknown');
assert.equal(attributes.get('data-player-theme'),'graphite');
for(const invalid of ['not-a-color','#ff','#gggggg','']) { colors.applyAccentColor(invalid);assert.equal(properties.get('--accent'),'#7fc7ff'); }
storage.set('l-mpv-accent-color-windows','#777777');
storage.set('l-mpv-accent-color','windows');
colors.applyAccentColor('windows');
assert.equal(properties.get('--accent'),'#777777');
assert.ok(ratio(properties.get('--on-accent'),'#777777')>=4.5);
assert.equal(math.normalizeHex('#ABC'),'#aabbcc');
// Catch the narrow gray foreground gap with a complete grayscale sweep.
for(let i=0;i<=255;i++) {const c='#'+i.toString(16).padStart(2,'0').repeat(3);assert.ok(ratio(math.onColor(c),c)>=4.5);}
class ElementFixture {
  constructor(classes='',...children){this.classes=new Set(classes.split(' '));this.children=children;this.attributes=new Map();}
  matches(selectors){return selectors.split(',').some(s=>{s=s.trim();return s.startsWith('.')?this.classes.has(s.slice(1)):s.startsWith('[')&&this.hasAttribute(s.slice(1,-1));});}
  setAttribute(k,v){this.attributes.set(k,v);}
  getAttribute(k){return this.attributes.get(k)??null;}
  hasAttribute(k){return this.attributes.has(k);}
  removeAttribute(k){this.attributes.delete(k);}
}
const fixture=(cls,...children)=>new ElementFixture(cls,...children);
const deepest=fixture('theme-card'),fourth=fixture('theme-card',deepest),third=fixture('color-column-card',fourth);
const nested=fixture('theme-card',third),sibling=fixture('theme-card');
const popupCard=fixture('theme-card'),popup=fixture('version-picker-popover',popupCard);
fourth.children.push(popup);
const island=fixture('settings-card',fixture('settings-accordion',fixture('',nested,sibling)));
const tree=fixture('',island);
hierarchy.assignSurfaceDepths(tree);
assert.equal(island.getAttribute('data-surface-depth'),'0');
assert.equal(nested.getAttribute('data-surface-depth'),'2');
assert.equal(sibling.getAttribute('data-surface-depth'),'2');
assert.equal(third.getAttribute('data-surface-depth'),'3');
assert.equal(fourth.getAttribute('data-surface-depth'),'4');
assert.equal(deepest.getAttribute('data-surface-depth'),'4');
assert.equal(popup.getAttribute('data-surface-depth'),'0');
assert.equal(popupCard.getAttribute('data-surface-depth'),'1');
nested.classes.clear();hierarchy.assignSurfaceDepths(tree);
assert.equal(nested.getAttribute('data-surface-depth'),null);
assert.equal(third.getAttribute('data-surface-depth'),'2');
assert.equal(sibling.getAttribute('data-surface-depth'),'2');
console.log(`PASS: ${pairs} theme/accent combinations across five surface depths; distinct palettes, protected values, nested/island resets, status/focus/hover, 256 grays, Windows/custom accents and opacity synchronization.`);
console.log(`Minimum tested text contrast ${minimumText.toFixed(3)}:1; filled-action contrast ${minimumFill.toFixed(3)}:1.`);
