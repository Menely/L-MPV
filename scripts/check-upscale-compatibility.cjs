const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const mod = { exports: {} };
const bundle = esbuild.buildSync({entryPoints:['src/utils/upscaleCompatibility.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
new Function('module','exports',bundle.outputFiles[0].text)(mod,mod.exports);
const {backendReady,backendNeedsUpdate,upscaleErrorMessage}=mod.exports;
const installed={aji_present:true,directml_present:true,tensorrt_present:true};
assert.equal(backendReady(installed,'TensorRT'),true);
assert.equal(backendReady({...installed,tensorrt_update_required:true},'TensorRT'),false);
assert.equal(backendReady({...installed,tensorrt_update_required:true},'DirectML'),true);
assert.equal(backendReady({...installed,player_update_required:true},'DirectML'),false);
assert.equal(backendReady({...installed,aji_present:false},'TensorRT'),false);
assert.equal(backendNeedsUpdate({...installed,directml_update_required:true},'DirectML'),true);
assert.equal(backendReady(null,'TensorRT'),false);
for(const language of ['ru','en']) {
 const dictionaryModule={exports:{}};
 const compiled=esbuild.buildSync({entryPoints:[`src/i18n/locales/${language}.ts`],bundle:true,write:false,platform:'node',format:'cjs'});
 new Function('module','exports',compiled.outputFiles[0].text)(dictionaryModule,dictionaryModule.exports);
 const dict=Object.values(dictionaryModule.exports).find(v=>v?.settings?.upscaling);
 assert(dict);
 for(const error of ['UPSCALE_PLAYER_UPDATE','UPSCALE_RESTART_REQUIRED','UPSCALE_RUNTIME_UPDATE:TensorRT','UPSCALE_MODEL_REBUILD','UPSCALE_DOWNLOAD_MISMATCH','UPSCALE_BUSY']) {
  const message=upscaleErrorMessage(error,dict);
  assert(message.length>20 && !message.includes('UPSCALE_'),`${language}: ${error}`);
 }
}
assert.equal(upscaleErrorMessage('native error',{settings:{upscaling:{}}}),'native error');
console.log('PASS backend readiness, stale/native mismatch, isolated backends and RU/EN actionable errors');
