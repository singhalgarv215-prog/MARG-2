const ROOT=require('path').resolve(__dirname,'..');
const fs=require('fs'),vm=require('vm');
function el(){const e=new Proxy(function(){},{get(t,p){if(p===Symbol.toPrimitive)return()=>'';if(p==='style')return new Proxy({}, {get:(t,k)=>(k==='setProperty'||k==='removeProperty'||k==='getPropertyValue')?()=>'':'',set:()=>true});if(p==='classList')return{add(){},remove(){},toggle(){},contains(){return false}};if(p==='dataset')return{};if(p==='children'||p==='childNodes')return[];if(p==='length')return 0;if(p==='value'||p==='innerHTML'||p==='textContent'||p==='innerText'||p==='className'||p==='id')return '';if(p==='querySelectorAll')return()=>[];if(p==='getBoundingClientRect')return()=>({top:0,left:0,width:0,height:0});return el()},set(){return true},apply(){return el()}});return e}
const store={};
const ls={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]},clear(){},key:()=>null,length:0};
const win={};
const ctx={console,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},localStorage:ls,sessionStorage:ls,location:{href:'http://x/',pathname:'/',search:'',hash:'',origin:'http://x',hostname:'x'},navigator:{userAgent:'node',language:'en',serviceWorker:undefined},
 document:new Proxy({},{get(t,p){if(p==='readyState')return'loading';if(p==='addEventListener')return()=>{};if(p==='cookie')return'';return typeof p==='string'?el():undefined}}),
 fetch:()=>Promise.reject(new Error('no net')),URL,URLSearchParams,AbortController,Intl,Date,Math,JSON,Promise,Blob:function(){},FormData:function(){},Image:function(){},Audio:function(){},
 requestAnimationFrame:()=>0,cancelAnimationFrame(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),IntersectionObserver:function(){return{observe(){},disconnect(){}}},MutationObserver:function(){return{observe(){},disconnect(){}}},ResizeObserver:function(){return{observe(){},disconnect(){}}},addEventListener(){},removeEventListener(){},getComputedStyle:()=>({}),performance:{now:()=>Date.now()},crypto:{randomUUID:()=>'u-'+Math.random(),getRandomValues:a=>a},TextEncoder,TextDecoder,atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),structuredClone};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;
vm.createContext(ctx);
const files=(process.env.MARG_FILES||'chat-topics.js,study-context.js,question-library.js,marg-training.js,slash-tools.js,time-mock-blueprints.js,cloudflare-worker.js,qa-engine.js,dilr-engine.js,marg-app.js').split(',');
for(const f of files){ if(!fs.existsSync(ROOT+'/'+f)) continue; try{let src=fs.readFileSync(ROOT+'/'+f,'utf8');if(f==='cloudflare-worker.js')src='globalThis.resolveMaxOutputTokens=(function(){'+src.replace(/export\s*\{[^}]*\};?/g,'').replace(/export default/g,'var __workerDefault =')+';return resolveMaxOutputTokens;})();';vm.runInContext(src,ctx,{filename:f});}catch(e){console.log('LOAD ERR',f,e.message.slice(0,200));} }
(async()=>{
 const names=Object.keys(ctx).filter(k=>/^run.*Tests$/.test(k)||/^runMarg.*Tests$/.test(k));
 const sel=process.argv.slice(2);
 for(const n of names){ if(sel.length&&!sel.includes(n))continue; try{const r=await ctx[n]();const arr=Array.isArray(r)?r:(r&&r.results)||[r];const fails=arr.filter(x=>x&&x.passed===false);console.log(n,(arr.length-fails.length)+'/'+arr.length);fails.forEach(f=>console.log('  FAIL',f.name||f.input||JSON.stringify(f).slice(0,200)));}catch(e){console.log(n,'ERR',e.message.slice(0,200))} }
})();
