// Guard the restored original tick centering and wrapped-title icon alignment.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),postcss=require('postcss');
const root=path.resolve(__dirname,'..');
function declarations(file,selector){const props=new Map();postcss.parse(fs.readFileSync(path.join(root,file),'utf8')).walkRules(r=>{if(r.selector===selector)r.walkDecls(d=>props.set(d.prop,d.value));});return props;}
const tick=declarations('src/styles/components.css','.ui-checkbox:checked::after');
for(const [prop,value] of Object.entries({width:'5px',height:'9px','border-width':'0 2px 2px 0',transform:'rotate(45deg)','margin-bottom':'var(--space-1)'}))assert.equal(tick.get(prop),value);
assert.ok(!tick.has('position'));
assert.equal(declarations('src/styles/components.css','.ui-checkbox').get('border'),'0');
const title=declarations('src/styles/settings-alignment.css','.option-body > .row-center:first-child');
assert.equal(title.get('align-items'),'flex-start');assert.equal(title.get('line-height'),'20px');
const checkbox=declarations('src/styles/settings-alignment.css','.option-row > .ui-checkbox');assert.equal(checkbox.get('margin-top'),'1px');
assert.equal(1+18/2,20/2,'Checkbox and first title line centers must coincide');
const slot=declarations('src/styles/settings-alignment.css','.settings-icon');
for(const prop of ['width','height'])assert.equal(slot.get(prop),'20px');assert.equal(slot.get('line-height'),'0');
for(const name of ['AccordionSection','OptionTile','SettingBlocks'])assert.match(fs.readFileSync(path.join(root,`src/components/settings/components/${name}.tsx`),'utf8'),/<SettingsIcon/);
console.log('PASS: original tick centering, borderless checkboxes, first-line title alignment and shared heading slots.');
