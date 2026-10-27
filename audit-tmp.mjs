import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const root='.vercel/output/static';
const M={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
const s=createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=join(root,p);if(!existsSync(f)||!statSync(f).isFile()){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':M[extname(f)]||''});r.end(readFileSync(f));}).listen(4351);
const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1440,height:900}});
for(const u of ['/','/work/industrial-bloom/','/work/atomic-ski/','/shop/','/shop/660/']){
await pg.goto('http://127.0.0.1:4351'+u,{waitUntil:'load'});await pg.waitForTimeout(1200);
const out=await pg.evaluate(()=>{const res=new Set();const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(!n.textContent.trim())continue;const e=n.parentElement;if(e.closest('.reveal-word,script,style,.sr-only,[hidden],.site-header,[aria-hidden=true],.contact-sheet,dialog'))continue;const r=e.getBoundingClientRect();if(!r.width)continue;if(getComputedStyle(e).visibility==='hidden')continue;res.add(e.tagName+'.'+e.className+': '+n.textContent.trim().slice(0,30));}return [...res];});
console.log(u,out);}
await b.close();s.close();
