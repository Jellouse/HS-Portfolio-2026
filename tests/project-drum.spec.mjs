// Project photo drum motion: scroll-linked (same pose at the same scroll, either direction),
// flat at viewport centre, tilted near the edge, off under prefers-reduced-motion. Chromium + WebKit.
import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
let fail=0;const root=new URL("../.vercel/output/static/",import.meta.url).pathname;
const M={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
const s=createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=join(root,p);if(!existsSync(f)||!statSync(f).isFile()){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':M[extname(f)]||''});r.end(readFileSync(f));}).listen(4361);
const check=(c,m)=>{console.log((c?'ok   ':'FAIL ')+m);if(!c)fail=1;};
const pose=(pg,y)=>pg.evaluate(async(y)=>{scrollTo(0,y);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const f=document.querySelectorAll('.project .image-block > .frame, .project .pair > .frame')[2];return {t:f.style.transform,o:f.style.opacity,top:f.getBoundingClientRect().top};},y);
for(const [n,t] of [['chromium',chromium],['webkit',webkit]]){const b=await t.launch();
 for(const w of [1440,390]){
  const pg=await b.newPage({viewport:{width:w,height:844}});
  await pg.goto('http://127.0.0.1:4361/work/atomic-ski/',{waitUntil:'load'});await pg.waitForTimeout(400);
  const top=await pg.evaluate(()=>{const f=document.querySelectorAll('.project .image-block > .frame, .project .pair > .frame')[2];const r=f.getBoundingClientRect();return r.top+scrollY+r.height/2;});
  const centre=await pose(pg,Math.round(top-422));
  const m=centre.t.match(/rotateX\((-?[\d.]+)deg\)/);check(m&&Math.abs(+m[1])<3&&+centre.o>0.99,`${n} ${w} flat at centre (${centre.t})`);
  const edgeY=Math.round(top-422+300);const down=await pose(pg,edgeY);
  const m2=down.t.match(/rotateX\((-?[\d.]+)deg\)/);check(m2&&Math.abs(+m2[1])>5,`${n} ${w} tilted near edge (${m2&&m2[1]}deg)`);
  await pose(pg,edgeY+600);const up=await pose(pg,edgeY);check(up.t===down.t&&up.o===down.o,`${n} ${w} reversible`);
  await pg.close();
  const rm=await b.newPage({viewport:{width:w,height:844},reducedMotion:'reduce'});
  await rm.goto('http://127.0.0.1:4361/work/atomic-ski/',{waitUntil:'load'});const r=await pose(rm,Math.round(top-122));
  check(!r.t,`${n} ${w} reduced motion: no transform`);await rm.close();
 }
 await b.close();}
s.close();console.log(fail?'project-drum FAIL':'project-drum OK');process.exit(fail);
