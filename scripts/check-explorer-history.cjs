const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
function moduleFrom(file, imports = {}) {
  const code = esbuild.buildSync({entryPoints:[file],bundle:true,write:false,platform:'node',format:'cjs',external:['react','@tauri-apps/api/core','@tauri-apps/plugin-dialog']}).outputFiles[0].text;
  const mod = {exports:{}};
  new Function('module','exports','require',code)(mod,mod.exports,name => imports[name]);
  return mod.exports;
}
const {commitExplorerHistory,bindExplorerHistoryMouse} = moduleFrom('src/utils/explorerHistory.ts');
let rootHistory = commitExplorerHistory({paths:[],index:-1},'C:/',{kind:'push'});
rootHistory = commitExplorerHistory(rootHistory,'c:\\',{kind:'push'});
assert.equal(rootHistory.paths.length,1,'Windows root spelling must not create a duplicate history entry');

// The actual capture listener must suppress all three browser navigation phases,
// navigate once, ignore ordinary mouse buttons, and remove the exact callbacks.
const listeners = new Map();
const target = {
  addEventListener(type,callback,capture) { assert.equal(capture,true); listeners.set(type,callback); },
  removeEventListener(type,callback,capture) { assert.equal(capture,true); assert.equal(listeners.get(type),callback); listeners.delete(type); },
};
const directions = [];
const dispose = bindExplorerHistoryMouse(target,direction => directions.push(direction));
for (const button of [0,1,2,3,4]) {
  for (const type of ['mousedown','mouseup','auxclick']) {
    let prevented = false, stopped = false;
    listeners.get(type)({type,button,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
    assert.equal(prevented,button===3||button===4); assert.equal(stopped,prevented);
  }
}
assert.deepEqual(directions,[-1,1]);
dispose(); assert.equal(listeners.size,0,'Closed/unmounted panel removes every capture listener');

// Execute the real panel effects: auxiliary buttons activate a hidden Explorer
// before traversing, and closing the shared panel discards queued navigation.
const panel = fs.readFileSync('src/components/player/ExplorerPanel.tsx','utf8');
const effectsCode = esbuild.transformSync(panel.slice(panel.indexOf('  const pendingDirection ='),panel.indexOf('  useEffect(() => {\n    openingRef.current')), {loader:'ts'}).code;
const panelHooks=[], panelCalls=[]; let panelCursor=0,panelEffects=[];
const panelRef=initial=>panelHooks[panelCursor++]??={current:initial};
const panelEffect=(callback,deps)=>{
  const i=panelCursor++,old=panelHooks[i];
  if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j]))){panelHooks[i]={deps,cleanup:old?.cleanup};panelEffects.push(()=>{panelHooks[i].cleanup?.();panelHooks[i].cleanup=callback();});}
};
const runPanelEffects = new Function('useRef','useEffect','active','panelActive','back','forward','canGoBack','canGoForward','onSearch','onRequestActivate','setOpenError','bindExplorerHistoryMouse','window',effectsCode);
function renderPanel(active,panelActive){
  panelCursor=0;
  runPanelEffects(panelRef,panelEffect,active,panelActive,()=>panelCalls.push('back'),()=>panelCalls.push('forward'),true,true,
    value=>panelCalls.push(`search:${value}`),()=>panelCalls.push('activate'),()=>{},bindExplorerHistoryMouse,target);
  const pending=panelEffects;panelEffects=[];pending.forEach(effect=>effect());
}
function mouse(type,button){listeners.get(type)?.({type,button,preventDefault(){},stopPropagation(){}});}
renderPanel(false,true);mouse('mousedown',3);mouse('mouseup',3);mouse('auxclick',3);
assert.deepEqual(panelCalls,['activate'],'Playlist tab requests Explorer activation before navigating');
renderPanel(true,true);assert.deepEqual(panelCalls,['activate','search:','back']);
mouse('mousedown',4);assert.deepEqual(panelCalls.slice(-2),['search:','forward']);
renderPanel(false,true);mouse('mousedown',3);const callsBeforeClose=panelCalls.length;
renderPanel(false,false);assert.equal(listeners.size,0,'Closing common panel unbinds auxiliary capture');
renderPanel(true,true);assert.equal(panelCalls.length,callsBeforeClose,'Reopening must not replay the closed panel pending direction');
panelHooks.forEach(hook=>hook?.cleanup?.());assert.equal(listeners.size,0);

function fixture() {
  const hooks=[],requests=[],dialogs=[],locations=[];
  let cursor=0,dirty=true,effects=[],result,active=true;
  const react={
    useState(initial){const i=cursor++;hooks[i]??={value:initial};return[hooks[i].value,value=>{hooks[i].value=typeof value==='function'?value(hooks[i].value):value;dirty=true;}];},
    useRef(initial){const i=cursor++;return hooks[i]??={current:initial};},
    useCallback(callback,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks[i]={deps,callback};return hooks[i].callback;},
    useEffect(callback,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){hooks[i]={deps,cleanup:old?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=callback();});}},
  };
  const {useExplorerDirectory}=moduleFrom('src/hooks/useExplorerDirectory.ts',{
    react,'@tauri-apps/api/core':{invoke:(command,args)=>new Promise((resolve,reject)=>requests.push({command,args,resolve,reject}))},
    '@tauri-apps/plugin-dialog':{open:()=>new Promise(resolve=>dialogs.push(resolve))},
  });
  const onLocation=path=>locations.push(path);
  async function flush(){for(let i=0;i<12;i++){if(dirty){dirty=false;cursor=0;result=useExplorerDirectory(active,undefined,onLocation);const pending=effects;effects=[];pending.forEach(effect=>effect());}await Promise.resolve();}}
  return {requests,dialogs,locations,flush,get:()=>result,setActive:async value=>{active=value;dirty=true;await flush();},unmount:()=>hooks.forEach(hook=>hook?.cleanup?.())};
}
const directory=path=>({path,parent:null,entries:[]});
(async()=>{
  const f=fixture();await f.flush();
  f.requests.at(-1).resolve(directory('C:/A'));await f.flush();
  assert.equal(f.get().canGoBack,false);assert.equal(f.get().canGoForward,false);
  const navigate=async(method,path,fail=false)=>{
    const pending=f.get()[method](path);const request=f.requests.at(-1);
    if(fail)request.reject(Error('permission denied'));else request.resolve(directory(path??request.args.path));
    await pending;await f.flush();
  };
  await navigate('load','C:/B',true);
  assert.equal(f.get().directory.path,'C:/A');assert.equal(f.get().canGoBack,false,'Failed first navigation creates no history');
  await navigate('load','C:/B');await navigate('load','C:/C');
  await navigate('back',undefined,true);
  assert.equal(f.get().directory.path,'C:/C','Failed Back retains the current directory and cursor');
  await navigate('back');assert.equal(f.get().directory.path,'C:/B');assert.equal(f.get().canGoForward,true);
  await navigate('refresh');assert.equal(f.get().canGoForward,true,'Refresh preserves the forward branch');
  await navigate('load','C:/D',true);assert.equal(f.get().canGoForward,true,'Failed new navigation preserves the forward branch');
  await navigate('forward');assert.equal(f.get().directory.path,'C:/C');
  await navigate('back');await navigate('load','C:/D');
  assert.equal(f.get().canGoForward,false,'A successful new navigation truncates the forward branch');
  void f.get().back();const old=f.requests.at(-1);
  void f.get().back();const latest=f.requests.at(-1);
  assert.equal(latest.args.path,'C:/A','Rapid Back requests advance from the pending destination');
  latest.resolve(directory('C:/A'));await f.flush();old.resolve(directory('C:/B'));await f.flush();
  assert.equal(f.get().directory.path,'C:/A','Stale history response cannot move the cursor');
  assert.equal(f.get().canGoBack,false);assert.equal(f.get().canGoForward,true);
  await navigate('forward');assert.equal(f.get().directory.path,'C:/B');
  const cancelled=f.get().pickFolder('Choose');f.dialogs.at(-1)(null);await cancelled;await f.flush();
  assert.equal(f.get().canGoForward,true,'Cancelled picker preserves history');
  const picked=f.get().pickFolder('Choose');f.dialogs.at(-1)('E:/Picked');await Promise.resolve();
  f.requests.at(-1).resolve(directory('E:/Picked'));await picked;await f.flush();
  assert.equal(f.get().canGoForward,false);assert.equal(f.get().directory.path,'E:/Picked');
  await f.setActive(false);const count=f.requests.length;await f.get().back();
  assert.equal(f.requests.length,count,'Hidden explorer never starts filesystem reads');
  await f.setActive(true);f.requests.at(-1).resolve(directory('E:/Picked'));await f.flush();
  await navigate('back');assert.equal(f.get().directory.path,'C:/B','Tab switch refresh preserves the stack');
  void f.get().forward();const late=f.requests.at(-1);f.unmount();late.resolve(directory('E:/Picked'));await f.flush();
  assert.equal(f.get().directory.path,'C:/B','Unmounted traversal cannot publish a location');
  console.log('PASS real explorer hook history success/error/refresh/stale traversal/rapid Back/picker/activation; capture mouse buttons and cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
