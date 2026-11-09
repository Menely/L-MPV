const assert = require('node:assert/strict');
const esbuild = require('esbuild');

const result = esbuild.buildSync({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
import {aggregateVideoBitrate,prepareVideoDisplay,prepareAudioDisplay,getHeatmapColumnCount,createHeatmapDisplayCache} from './src/components/player/heatmap/heatmapDisplay';
import {resolveHeatmapHoverMetrics} from './src/components/player/heatmap/heatmapHoverUtils';
import {WaveformMemoryCache} from './src/components/player/heatmap/waveformPalette';
import {renderWaveformToCanvas} from './src/components/player/heatmap/waveformDrawer';
import {DEFAULT_HEATMAP_CONFIG,getHeatmapConfig,normalizeHeatmapConfig} from './src/components/player/heatmap/heatmapTypes';
export {aggregateVideoBitrate,prepareVideoDisplay,prepareAudioDisplay,getHeatmapColumnCount,createHeatmapDisplayCache,resolveHeatmapHoverMetrics,WaveformMemoryCache,renderWaveformToCanvas,DEFAULT_HEATMAP_CONFIG,getHeatmapConfig,normalizeHeatmapConfig};
` }, bundle: true, write: false, platform: 'node', format: 'cjs' });
const compiled = {exports:{}};
new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);
const {aggregateVideoBitrate,prepareVideoDisplay,prepareAudioDisplay,getHeatmapColumnCount,createHeatmapDisplayCache,resolveHeatmapHoverMetrics,WaveformMemoryCache,renderWaveformToCanvas,DEFAULT_HEATMAP_CONFIG,getHeatmapConfig,normalizeHeatmapConfig}=compiled.exports;
const profile = (rates, duration=rates.length) => ({media_path:'test.mkv',stream_mode:'video_bitrate',track_idx:null,external_track_path:null,duration_sec:duration,step_duration_sec:1,start_time_offset:0,generation_id:1,visual_bins:rates.map(()=>0),metrics:{type:'video_bitrate',payload:{bitrate_kbps:rates,packet_counts:rates.map(()=>24)}}});

assert(Math.abs(aggregateVideoBitrate(profile([100,300],1.5),2,1.5)[0]-500/3)<1e-8,'Partial interval is duration weighted');
const long=profile(Array.from({length:7200},(_,i)=>i%4?100:1000));
assert.equal(prepareVideoDisplay(long,1920,7200).length,512,'Display resolution follows width, independently of source bins');
for(const [width,count] of [[720,192],[1280,341],[1920,512],[2560,683],[3840,1024],[10000,2048]]) {
  assert.equal(getHeatmapColumnCount(width,7200),count);
  assert.equal(getHeatmapColumnCount(width,2048),count,'Audio and video use the same density');
}
assert.equal(getHeatmapColumnCount(NaN,7200),0);
const audio={...profile([0,0]),stream_mode:'audio',metrics:{type:'audio',payload:{rms_db:[0,-60],peak_db:[0,-60]}}};
const expectedAudio=Math.round(((60+10*Math.log10(.5))/60)**.8*255);
assert.deepEqual(prepareAudioDisplay(audio,3,2),[expectedAudio],'Aggregate RMS in the energy domain');
assert.deepEqual(prepareAudioDisplay({...audio,metrics:{type:'audio',payload:{rms_db:[-60,-60],peak_db:[-60,-60]}}},3,2),[0],'Silence remains silent');
const cached=createHeatmapDisplayCache();
assert.strictEqual(cached(long,1920,7200),cached(long,1920,7200),'Playback redraw reuses preparation');
assert.notStrictEqual(cached(long,1920,7200),cached(long,960,7200),'Resize recomputes display resolution');

assert.deepEqual(prepareVideoDisplay(profile([100,1000]),100,2),[45,255],'Balanced is the only scale');
assert.deepEqual(prepareVideoDisplay(profile([0,0]),100,2),[0,0]);
const tail=profile([0,0,0,0,0,0,0,0,0,10,999],10.25);
const hover=resolveHeatmapHoverMetrics({hoverRatio:.93,duration:10.25,response:tail,dataSource:'video_bitrate',mediaInfo:null});
assert.match(hover.metricValue,/10 /,'Hover uses physical seconds, not array percentage');
const lru=new WaveformMemoryCache(128,10,v=>v.length);
lru.set('a',[1,2,3,4]);lru.set('b',[1,2,3,4]);lru.get('a');lru.set('c',[1,2,3,4]);
assert(lru.has('a')&&!lru.has('b')&&lru.has('c'),'Byte budget evicts least recently used data');
lru.set('a',[1]);lru.set('d',[1,2,3,4,5]);assert(lru.has('c'),'Updating entry releases old weight');lru.clear();assert(!lru.has('a'));
let segments=0;
const ctx=new Proxy({}, {get:(_,key)=>key==='bezierCurveTo'?()=>segments++:key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
renderWaveformToCanvas(ctx,{width:200,height:34,dpr:1},[255],.1,.5,null,{accentColor:'#aabbcc',accentRgb:'170,187,204'},{...DEFAULT_HEATMAP_CONFIG,dataSource:'video_bitrate',style:'spline'});
assert(segments>0,'Single-bin short video renders a full spline segment');
for(const style of ['bars','spline','blocks','area','steps','dots']) {
  assert.equal(normalizeHeatmapConfig({style}).style,style,'Every style survives settings validation');
  for(const height of [16,34,36]) {
    renderWaveformToCanvas(ctx,{width:1920,height,dpr:1.25},[0,128,255],1,2,null,{accentColor:'#aabbcc',accentRgb:'170,187,204'},{...DEFAULT_HEATMAP_CONFIG,dataSource:'video_bitrate',style});
  }
}
global.localStorage={getItem:()=>null};
assert.equal(getHeatmapConfig().enabled,false,'Fresh default is off');
assert.equal(DEFAULT_HEATMAP_CONFIG.enabled,false);
const normalized=normalizeHeatmapConfig({bitrateScale:'linear',showCrestLine:true,height:48,enabled:true});
assert.equal(normalized.height,36);assert.equal(normalized.enabled,true);
assert(!('bitrateScale' in normalized)&&!('showCrestLine' in normalized),'Retired fields discarded');
assert.equal(normalizeHeatmapConfig({style:'mirrored'}).style,'steps','Retired mirrored setting migrates to its replacement');
for(const height of [16,24,36])assert.equal(normalizeHeatmapConfig({height,_schemaVersion:3}).height,height);
const oldCached=cached(long,1920,7200);cached(null,0,0);assert.notStrictEqual(oldCached,cached(long,1920,7200),'Clear releases retained preparation');
console.log('PASS balanced aggregation, partial intervals, display density/cache release, hover timing, memory budget, single-bin spline, defaults and retired config fields');

// Load the real menu module twice against the same portable file and local cache.
// This catches migrations that appear successful but reverse after restarting.
async function checkMenuMigration() {
  const vm = require('node:vm');
  const menuBundle = esbuild.buildSync({entryPoints:['src/utils/contextMenuLayout.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['@tauri-apps/api/core']}).outputFiles[0].text;
  const storage = new Map();
  let disk = '';
  const load = () => {
    const context = {module:{exports:{}},console,Event,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},require:()=>({invoke:async(command,args)=>{
      if(command==='get_context_menu_layout')return disk;
      if(command==='save_context_menu_layout')disk=args.layoutJson;
    }})};
    vm.runInNewContext(menuBundle,context);
    context.window={dispatchEvent(){}};
    return context.module.exports;
  };
  let menu=load();
  const legacy=[...menu.DEFAULT_LAYOUT.slice(0,-1),{type:'item',id:'heatmap'},menu.DEFAULT_LAYOUT.at(-1)];
  disk=JSON.stringify(legacy);
  storage.set('l-mpv-context-menu-layout',disk);
  const hasHeatmap=layout=>layout.some(e=>e.id==='heatmap');
  assert(!hasHeatmap(menu.getSavedLayout()),'Synchronous cache migrates old default');
  assert(!hasHeatmap(await menu.initLayoutFromBackend()),'Backend does not undo synchronous migration');
  menu=load();
  assert(!hasHeatmap(await menu.initLayoutFromBackend()),'Migration survives a module restart');
  menu.saveLayout(legacy);
  menu=load();
  assert(hasHeatmap(await menu.initLayoutFromBackend()),'Explicitly restored heatmap remains in custom menu');
  storage.clear();disk=JSON.stringify([...legacy].reverse());menu=load();
  assert(hasHeatmap(await menu.initLayoutFromBackend()),'Custom ordering remains unchanged');
  console.log('PASS context menu migration persists across restart and preserves custom layouts');
}
checkMenuMigration().catch(error=>{console.error(error);process.exitCode=1;});
