const assert = require('node:assert/strict');
const esbuild = require('esbuild');

function load(entry, imports, globals = {}) {
  const compiled = esbuild.buildSync({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',external:['react','@tauri-apps/api/core']});
  const mod={exports:{}};
  new Function('module','exports','require',...Object.keys(globals),compiled.outputFiles[0].text)(mod,mod.exports,name=>imports[name],...Object.values(globals));
  return mod.exports;
}
const geometry=load('src/utils/timelineThumbnail.ts',{});
assert.equal(geometry.thumbnailTime(12.3456,false),12);
assert.equal(geometry.thumbnailTime(12.3456,true),12.346);
assert(geometry.supportsTimelineThumbnail('C:\\Video\\movie.mkv',true));
assert(!geometry.supportsTimelineThumbnail('https://host/video.mkv',true));
assert(!geometry.supportsTimelineThumbnail('C:/song.flac',false));
for(const ratio of [0,.5,1])for(const zoom of [1,1.5]){
  const left=geometry.timelinePreviewLeft(ratio,30,360,252*zoom,420,zoom);
  const center=30+left*zoom;
  assert(center-126*zoom>=8&&center+126*zoom<=412);
}

const hooks=[];let cursor=0,dirty=true,effects=[],props,result,clock=0,timerId=0;
const timers=new Map(),requests=[],cancellations=[],urls=new Set();let urlId=0;
const react={
  useState(initial){const i=cursor++;hooks[i]??={value:initial};return [hooks[i].value,value=>{const next=typeof value==='function'?value(hooks[i].value):value;if(!Object.is(next,hooks[i].value)){hooks[i].value=next;dirty=true}}]},
  useRef(initial){const i=cursor++;hooks[i]??={current:initial};return hooks[i]},
  useEffect(callback,deps){const i=cursor++;const old=hooks[i];if(!old||deps.some((dep,n)=>!Object.is(dep,old.deps[n]))){hooks[i]={deps,cleanup:old?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=callback()})}},
};
const invoke=(command,args)=>{
  if(command==='cancel_timeline_thumbnail'){cancellations.push(args.requestId);return Promise.resolve()}
  assert.equal(command,'get_timeline_thumbnail');
  return new Promise((resolve,reject)=>requests.push({args,resolve,reject}));
};
const {useTimelineThumbnail}=load('src/hooks/useTimelineThumbnail.ts',{'react':react,'@tauri-apps/api/core':{invoke}}, {
  URL:{createObjectURL(){const url='blob:frame-'+(++urlId);urls.add(url);return url},revokeObjectURL(url){urls.delete(url)}},
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,at:clock+ms});return id},
  clearTimeout(id){timers.delete(id)},
});
async function flush(){for(let i=0;i<12;i++){if(dirty){dirty=false;cursor=0;result=useTimelineThumbnail(...props);const pending=effects;effects=[];pending.forEach(fn=>fn())}await Promise.resolve()}}
async function update(next){props=next;dirty=true;await flush()}
async function advance(ms){clock+=ms;for(const [id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn()}await flush()}
const bytes=()=>new Uint8Array([255,216,1,255,217]).buffer;

(async()=>{
  await update(['C:/first.mkv',1,10.5,true]);
  assert.equal(requests.length,1);assert.equal(requests[0].args.seconds,10);
  await update(['C:/first.mkv',1,350.5,true]);
  assert.equal(requests.length,1,'only latest pending job is queued');
  requests[0].resolve(bytes());await flush();
  assert.equal(result.src,null,'late grid reply must not appear under a new timestamp');
  assert.equal(requests.length,2);assert.equal(requests[1].args.seconds,350);
  requests[1].resolve(bytes());await flush();assert(result.src);assert.equal(urls.size,1);
  await advance(180);assert.equal(requests[2].args.exact,true);assert.equal(requests[2].args.seconds,350.5);
  await update(['C:/first.mkv',1,351,true]);
  assert(cancellations.includes(requests[2].args.requestId));
  await advance(180);requests[2].resolve(bytes());await flush();
  assert.equal(requests.at(-1).args.seconds,351);assert.equal(urlId,1,'late precise reply discarded');
  const stale=requests.at(-1);
  await update(['C:/second.mkv',2,20,true]);
  assert.equal(result.src,null);assert.equal(urls.size,0);
  stale.resolve(bytes());await flush();assert.equal(urlId,1,'old source reply discarded');
  requests.at(-1).resolve(bytes());await flush();assert(result.src);assert.equal(urls.size,1);
  await update(['C:/second.mkv',2,20,false]);assert.equal(result.src,null);assert.equal(urls.size,0);
  await update(['C:/cached.mkv',1,10,true]);requests.at(-1).resolve(bytes());await flush();const firstFrame=result.src;
  await advance(180);requests.at(-1).reject('THUMBNAIL_TIMEOUT');await flush();
  assert.equal(result.src,firstFrame,'slow exact refinement retains the matching coarse frame');
  await update(['C:/cached.mkv',1,30,true]);requests.at(-1).resolve(bytes());await flush();
  const beforeHit=requests.length;
  await update(['C:/cached.mkv',1,10,true]);assert.equal(result.src,firstFrame);
  await advance(180);assert.equal(requests.length,beforeHit,'cached frame is reused without IPC, failed exact is not repeated');
  await update(['C:/late-error.mkv',1,10,true]);requests.at(-1).resolve(bytes());await flush();assert(result.src);
  await update(['C:/late-error.mkv',1,30,true]);requests.at(-1).reject(Error('decode'));await flush();
  assert.equal(result.src,null,'a failed new position must not retain an unrelated old frame');
  assert(result.failed);assert.equal(urls.size,0);
  await update(['C:/broken.mkv',1,10,true]);requests.at(-1).reject(Error('decode'));await flush();assert(result.failed);
  const failedCount=requests.length;
  await update(['C:/broken.mkv',1,10.1,true]);await advance(180);
  assert.equal(requests.length,failedCount,'terminal decode errors stop retries during this hover');
  await update(['C:/retry.mkv',1,10,true]);
  assert.equal(requests.length,failedCount+1,'a new source resets terminal failure');
  requests.at(-1).reject('THUMBNAIL_CANCELLED');await flush();await advance(180);
  assert.equal(requests.length,failedCount+2,'cancellation permits the pending precise request');
  requests.at(-1).resolve(bytes());await flush();assert(result.src);
  result.onImageError();await flush();assert(result.failed);assert.equal(urls.size,0);
  await update(['C:/retry.mkv',1,11,true]);await advance(180);
  assert.equal(requests.length,failedCount+2,'image errors also stop repeated extraction');
  for(let i=0;i<24;i++){
    await update(['C:/cache-limit.mkv',1,i*5,true]);requests.at(-1).resolve(bytes());await flush();
    assert(urls.size<=12,'ready image cache must stay bounded during long scrubbing');
  }
  const beforeEvicted=requests.length;
  await update(['C:/cache-limit.mkv',1,0,true]);assert.equal(requests.length,beforeEvicted+1,'evicted images can be requested again');
  requests.at(-1).resolve(bytes());await flush();
  hooks.forEach(hook=>hook.cleanup?.());assert.equal(urls.size,0);assert.equal(timers.size,0);
  console.log('PASS timeline geometry, local-video gating, latest queue, coarse/precise refinement, stale frames, cancellation and URL cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
