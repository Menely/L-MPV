const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm'),esbuild=require('esbuild');
const helper={exports:{}};
new Function('module','exports',esbuild.buildSync({entryPoints:['src/utils/upscaleCompatibility.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text)(helper,helper.exports);
const source=fs.readFileSync('src/components/settings/sections/UpscalingSettingsSection.tsx','utf8');
const block=source.slice(source.indexOf('  const persistSettings ='),source.indexOf('  // Открытие папки моделей'));
assert(block.includes('const updateSettings'));
const initial={mode:'ai',backend:'TensorRT',active_slot:1,selected_model:'healthy.onnx'};
const status={aji_present:true,tensorrt_present:true,directml_present:true};
const dict={settings:{upscaling:{runtimeUpdateRequired:'update required',playerUpdateRequired:'player update',upscaleBusy:'busy',trtRebuildRequired:'rebuild required',errNeedBackend:()=> 'missing'}}};
function fixture(invoke,settings=initial,extraStatus={}) {
 const storage=new Map();let state={...settings},error;
 const context={...helper.exports,settings:{...settings},status:{...status,...extraStatus},dict,applyingSettingsRef:{current:false},setSettings:v=>{state=typeof v==='function'?v(state):v;},setErrorMessage:v=>{error=v;},localStorage:{setItem:(k,v)=>storage.set(k,v)},invoke,console:{error(){}}};
 vm.runInNewContext(ts.transpileModule(`function handlers(){${block};return {updateSettings,handleSelectBackend,persistSettings};} this.handlers=handlers();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 context.handlers.persistSettings(settings);
 return {context,storage,state:()=>state,error:()=>error};
}
(async()=>{
 let calls=[];
 const stale=fixture(async(cmd,args)=>{calls.push(args.settings);throw 'UPSCALE_MODEL_REBUILD';});
 await stale.context.handlers.updateSettings({active_slot:2,selected_model:'stale.onnx'});
 assert.equal(stale.state().mode,'ai');assert.equal(stale.state().selected_model,'healthy.onnx');
 assert.equal(stale.storage.get('l-mpv-upscale-selected-model'),'healthy.onnx');assert.equal(stale.error(),'rebuild required');
 assert.equal(calls.length,1,'Preflight rejection does not turn off healthy filter');
 calls=[];
 const absent=fixture(async()=>calls.push('unexpected'),initial,{tensorrt_update_required:true});
 await absent.context.handlers.updateSettings({active_slot:2});assert.equal(calls.length,0);assert.equal(absent.state().selected_model,'healthy.onnx');
 const broken=fixture(async(cmd,args)=>{calls.push(args.settings.mode);if(args.settings.mode==='ai')throw Error('native filter failed');});
 await broken.context.handlers.updateSettings({active_slot:2});assert.deepEqual(calls,['ai','off']);assert.equal(broken.state().mode,'off');
 let release;
 const pending=fixture(()=>new Promise(resolve=>{release=resolve;}));
 const first=pending.context.handlers.updateSettings({active_slot:2});
 await pending.context.handlers.updateSettings({active_slot:3});assert.equal(pending.error(),'busy');release();await first;
 assert.equal(pending.state().active_slot,2);
 const off=fixture(async()=>{throw Error('must not invoke while off');},{...initial,mode:'off'});
 await off.context.handlers.handleSelectBackend('DirectML');assert.equal(off.state().backend,'DirectML');
 console.log('PASS rejected stale selection rollback, no stale runtime invocation, native failure off, concurrent selection guard and idle backend selection');
})().catch(error=>{console.error(error);process.exitCode=1;});
