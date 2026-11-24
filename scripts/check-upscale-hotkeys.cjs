const assert=require('assert/strict'),esbuild=require('esbuild');const m={exports:{}};new Function('module','exports',esbuild.buildSync({entryPoints:['src/utils/hotkeyUtils.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text)(m,m.exports);const {DEFAULT_HOTKEYS:d,migrateUpscaleHotkeys:f}=m.exports;
const old={upscaleOff:['Shift+Digit1']};for(let i=1;i<=9;i++)old['upscaleNet'+i]=['Shift+Digit'+((i+1)%10)];const migrated=f(old);for(const id of Object.keys(old))assert.deepEqual(migrated[id],d[id]);assert.deepEqual(f(migrated),migrated,'Idempotent');
const custom={...old,upscaleNet2:['Alt+KeyX'],upscaleNet4:[],other:['Shift+Backquote']};const result=f(custom);assert.deepEqual(result.upscaleNet2,['Alt+KeyX']);assert.deepEqual(result.upscaleNet4,[]);assert.deepEqual(result.other,['Shift+Backquote']);assert.deepEqual(result.upscaleOff,[],'Do not steal custom occupied key');assert.deepEqual(f(result),result);console.log('PASS upscale hotkey defaults, legacy migration, custom/disabled preservation, collisions and idempotency');

const storage=new Map();global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};global.window={dispatchEvent(){}};global.Event=class{};
storage.set('l-mpv-hotkeys-migrated-v2','true');storage.set('l-mpv-custom-hotkeys',JSON.stringify(old));m.exports.getCustomHotkeys();const edited={...m.exports.getCustomHotkeys(),upscaleNet1:['Shift+Digit2'],upscaleNet2:[]};m.exports.saveCustomHotkeys(edited);assert.deepEqual(m.exports.getCustomHotkeys().upscaleNet1,['Shift+Digit2'],'New custom binding matching old default survives reread');m.exports.saveCustomHotkeys(old,0);assert.deepEqual(m.exports.getCustomHotkeys().upscaleNet1,['Shift+Digit1'],'Legacy portable profile migrates');m.exports.saveCustomHotkeys(edited,3);assert.deepEqual(m.exports.getCustomHotkeys().upscaleNet1,['Shift+Digit2'],'New portable profile preserves custom');console.log('PASS versioned local and portable custom binding migration');

assert.deepEqual(d.seekBack, ['ArrowLeft']);
assert.deepEqual(d.seekForward, ['ArrowRight']);
assert.equal('seekBack10' in d, false);
assert.equal('seekForward10' in d, false);
assert.equal(m.exports.HOTKEY_ACTIONS.some(a => a.id === 'seekBack10' || a.id === 'seekForward10'), false);
const legacySeek = { seekBack: ['ArrowLeft'], seekForward: [], seekBack10: ['KeyJ'], seekForward10: ['ArrowRight'], togglePause: ['Space'] };
const seekMigrated = m.exports.migrateSeekHotkeys(legacySeek);
assert.deepEqual(seekMigrated.seekBack, ['ArrowLeft', 'KeyJ']);
assert.deepEqual(seekMigrated.seekForward, ['ArrowRight']);
assert.equal('seekBack10' in seekMigrated, false);
assert.equal('seekForward10' in seekMigrated, false);
assert.deepEqual(m.exports.migrateSeekHotkeys(seekMigrated), seekMigrated, 'Seek migration idempotent');
console.log('PASS seek hotkey unification, arrow defaults and legacy 10s migration');
