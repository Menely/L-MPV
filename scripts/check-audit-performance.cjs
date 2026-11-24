const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { performance } = require('node:perf_hooks');
function load(file) {
 const mod = {exports:{}};
 const {outputFiles} = esbuild.buildSync({entryPoints:[file],bundle:true,write:false,platform:'node',format:'cjs'});
 new Function('module','exports',outputFiles[0].text)(mod,mod.exports);
 return mod.exports;
}
const {createSubtitleTimeIndex} = load('src/components/subtitles/lib/subtitleTimeIndex.ts');
const lines = Array.from({length:50000},(_,i)=>({index:i,start:i*.4,end:i*.4+.3,text:String(i)}));
// A long sign must not hide short dialogue, and index queries must preserve original order.
lines[0].end=20000;
const buildStarted=performance.now();
const index=createSubtitleTimeIndex(lines);
const buildMs=Math.round((performance.now()-buildStarted)*100)/100;
let seed=23;
for(let i=0;i<1000;i++) {
 seed=(seed*1664525+1013904223)>>>0;
 const t=seed/2**32*20010-5;
 assert.deepEqual(index.active(t),lines.filter(l=>t>=l.start&&t<l.end));
 const started=lines.filter(l=>l.start<=t);
 assert.equal(index.lastStarted(t),started.at(-1)?.index??-1);
}
for(const t of [0,.3,.4,19999.6,20000]) assert.deepEqual(index.active(t),lines.filter(l=>t>=l.start&&t<l.end));
const unsorted=[lines[5],lines[1],lines[2]];
assert.deepEqual(createSubtitleTimeIndex(unsorted).active(.9),unsorted.filter(l=>.9>=l.start&&.9<l.end));
const timings = fn => {const start=performance.now();let count=0;for(let i=0;i<2000;i++)count+=fn(i*9.99).length;return {ms:Math.round((performance.now()-start)*100)/100,count};};
const scan=timings(t=>lines.filter(l=>t>=l.start&&t<l.end));
const indexed=timings(t=>index.active(t));assert.equal(scan.count,indexed.count);
console.log('Subtitle lookup, 50k lines / 2k positions with long overlapping sign:',JSON.stringify({buildMs,scan,indexed}));
const {createPreviewTaskQueue}=load('src/utils/latestAsyncTask.ts');
(async()=>{
 let release,active=0,peak=0;const values=[];
 const queue=createPreviewTaskQueue(async value=>{active++;peak=Math.max(peak,active);values.push(value);if(value===1)await new Promise(r=>release=r);active--;if(value===4)throw Error('expected');});
 const first=queue.preview(1);await Promise.resolve();
 const second=queue.preview(2),third=queue.preview(3);release();await Promise.all([first,second,third]);
 assert.deepEqual(values,[1,3]);assert.equal(peak,1);
 await assert.rejects(queue.preview(4),/expected/);await queue.preview(5);assert.deepEqual(values,[1,3,4,5]);
 await queue.preview(6).then(()=>queue.preview(7));assert.equal(values.at(-1),7);
 let unblock;let runtime=0,stored=0;const order=[];
 const ambient=createPreviewTaskQueue(async v=>{order.push('preview'+v);if(v===10)await new Promise(r=>unblock=r);runtime=v;});
 const a=ambient.preview(10);await Promise.resolve();const b=ambient.preview(20);
 const save=ambient.command(async()=>{runtime=stored=30;order.push('save30');return 30;});
 unblock();await Promise.all([a,b,save]);assert.equal(runtime,30);assert.equal(stored,30);assert.deepEqual(order,['preview10','save30']);
 await ambient.preview(40);assert.equal(runtime,40);
 await assert.rejects(ambient.command(async()=>{throw Error('save failed');}),/save failed/);
 await ambient.preview(50);assert.equal(runtime,50);
 console.log('PASS indexed subtitle lookup; bounded preview queue, authoritative save invalidation, error recovery and completion submission');
})().catch(error=>{console.error(error);process.exitCode=1});
