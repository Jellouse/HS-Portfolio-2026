
import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
let fail=0;
const root=new URL("../.vercel/output/static/",import.meta.url).pathname;
const M={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
const s=createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=join(root,p);if(!existsSync(f)||!statSync(f).isFile()){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':M[extname(f)]||''});r.end(readFileSync(f));}).listen(4352);
for(const [n,t] of [['chromium',chromium],['webkit',webkit]]){const b=await t.launch();
for(const w of [1440,390]){const pg=await b.newPage({viewport:{width:w,height:844}});
await pg.goto('http://127.0.0.1:4352/work/atomic-ski/',{waitUntil:'load'});await pg.evaluate(()=>scrollTo(0,document.body.scrollHeight));await pg.waitForTimeout(1500);
const r=await pg.evaluate(()=>{const f=document.querySelector('.footer-faces');const sv=[...f.querySelectorAll('.peeps-row svg')].map(e=>e.getBoundingClientRect());const st=f.querySelector('.peeps-static').getBoundingClientRect();return {fw:f.getBoundingClientRect().width,n:sv.length,min:Math.min(...sv.map(x=>x.left)),max:Math.max(...sv.map(x=>x.right)),st:[st.left,st.right,st.height]}});
const ok=Math.abs(r.fw-w)<2&&Math.abs(r.max-w)<2;if(!ok)fail=1;console.log((ok?"ok   ":"FAIL ")+n+" "+w+" footer faces "+Math.round(r.fw)+"/"+w);await pg.close();}
await b.close();}
s.close();console.log(fail?"footer-faces FAIL":"footer-faces OK");process.exit(fail);
