const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.SKI_CHROME_CHANNEL||'chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SKI_DEMO_URL||'http://127.0.0.1:58148/',{waitUntil:'networkidle'});
 const f=page.frames().find(x=>x.parentFrame());
 const frame=page.frameLocator('iframe');
 await f.evaluate(()=>document.fonts.ready);
 fs.mkdirSync(path.join(root,'work/screens'),{recursive:true});
 async function inspect(route,w,h,shot){
  await page.setViewportSize({width:w,height:h});
  await f.evaluate(route=>{window.SkiOps.state.authenticated=true;window.SkiOps.go(route);},route);
  await f.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const box=await f.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,root:document.getElementById('ski-ops').scrollWidth,font:document.fonts.check('16px Pretendard')}));
  assert.ok(box.document<=box.width+1&&box.root<=box.width+1,`${route} ${w}: ${JSON.stringify(box)}`);assert.equal(box.font,true);
  checks.push({route,width:w,height:h,...box});
  if(shot)await page.screenshot({path:path.join(root,'work/screens',shot+'.png'),fullPage:false});
 }
 for(const route of ['home','intake','rentals','dispatch','partners','closing','preparation','customers','inventory','settings','guide','login'])await inspect(route,1366,1024,route==='home'||route==='intake'||route==='login'?'polish-'+route:undefined);
 await inspect('vehicle',1024,800,'polish-vehicle-simple');
 for(const mode of ['detail','simple']){
  await frame.locator('[data-mode="'+mode+'"]').click();
  await frame.locator('.ski-actions button').first().waitFor();
  const sizes=await frame.locator('.ski-actions button').evaluateAll(bs=>bs.map(b=>({height:b.getBoundingClientRect().height,bottom:b.getBoundingClientRect().bottom})));
  assert.ok(sizes.every(s=>s.height>=72),`${mode} action targets: ${JSON.stringify(sizes)}`);
  await page.screenshot({path:path.join(root,'work/screens','polish-vehicle-'+mode+'.png')});
  checks.push({route:'vehicle',width:1024,mode,actions:sizes});
 }
 for(const w of [736,360])for(const route of ['home','rentals','intake','partners','closing','preparation','settings','guide','guest-guide','guest-form','login'])await inspect(route,w,900,(w===360&&['login','guest-guide','guest-form'].includes(route))?'polish-mobile-'+route:undefined);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(root,'work/visual-check.json'),JSON.stringify({checks,errors},null,2));
 await browser.close();console.log('PASS '+checks.length+' viewport / action checks');
})().catch(e=>{console.error(e);process.exitCode=1;process.exit();});
