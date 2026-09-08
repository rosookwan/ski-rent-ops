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
  await f.evaluate(route=>{window.SkiOps.state.authenticated=true;window.SkiOps.go(route,route==='return-detail'?{id:'R-021'}:{});},route);
  await f.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const box=await f.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,root:document.getElementById('ski-ops').scrollWidth,font:document.fonts.check('16px Pretendard')}));
  assert.ok(box.document<=box.width+1&&box.root<=box.width+1,`${route} ${w}: ${JSON.stringify(box)}`);assert.equal(box.font,true);
  checks.push({route,width:w,height:h,...box});
  if(route==='home'&&w>=901){
   const home=await f.evaluate(()=>{
    const bounds=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
    const list=document.querySelector('.so-work-list'),driver=document.querySelector('.so-driver-preview');
    return {panels:[list,driver].map(el=>({name:el.className,width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight,...bounds(el)})),rows:[...list.querySelectorAll('.so-work-item')].map(el=>({...bounds(el),cells:[...el.children].map(bounds)})),driverChildren:[...driver.children].map(bounds)};
   });
   for(const panel of home.panels)assert.ok(panel.scrollWidth<=panel.width+1&&panel.scrollHeight<=panel.height+1&&panel.bottom<=h,`home ${w}x${h} unnecessary scroll: ${JSON.stringify(panel)}`);
   assert.equal(home.rows.length,4);
   for(const row of home.rows){
    assert.ok(row.top>=home.panels[0].top&&row.bottom<=home.panels[0].bottom+1,`home ${w}x${h} task hidden: ${JSON.stringify(row)}`);
    assert.ok(row.cells.every(cell=>cell.left>=row.left&&cell.right<=row.right+1&&cell.top>=row.top&&cell.bottom<=row.bottom+1),`home ${w}x${h} task cell clipped: ${JSON.stringify(row)}`);
   }
   assert.ok(home.driverChildren.every(child=>child.top>=home.panels[1].top&&child.bottom<=home.panels[1].bottom+1),`home ${w}x${h} next job clipped`);
   checks.at(-1).home=home;
  }
  if(shot)await page.screenshot({path:path.join(root,'work/screens',shot+'.png'),fullPage:false});
 }
 for(const w of [1024,1366])for(const route of ['home','intake','rentals','returns','return-detail','rental','partner','response','dispatch','partners','closing','preparation','customers','inventory','settings','guide','login']){
  await inspect(route,w,768,`${route}-${w}x768`);
  if(route==='intake'){
   if(await frame.locator('[data-action="representative-done"]').isVisible())await frame.locator('[data-action="representative-done"]').click();
   const bottom=await frame.locator('.ski-checkout-footer').evaluate(el=>el.getBoundingClientRect().bottom);
   assert.ok(bottom<=768,`intake footer ${w}: ${bottom}`);
  }
 }
 for(const [w,h] of [[907,710],[907,648],[1024,648],[1366,648]])await inspect('home',w,h,`home-${w}x${h}`);
 for(const [w,h] of [[907,710],[907,648],[1024,768],[1366,768]]){
  await inspect('intake',w,h);
  if(await frame.locator('[data-action="representative-done"]').isVisible())await frame.locator('[data-action="representative-done"]').click();
  if(!await frame.locator('[data-days="3"]').isVisible())await frame.locator('[data-action="toggle-period"]').click();
  await frame.locator('[data-days="3"]').click();
  assert.equal(await frame.locator('.ski-days').count(),0);
  const products=await frame.locator('.ski-products').evaluate(el=>{
   const panel=el.closest('#ski-product-panel').getBoundingClientRect();
   return {panel:{top:panel.top,bottom:panel.bottom},cards:[...el.children].slice(0,2).map(card=>({top:card.getBoundingClientRect().top,bottom:card.getBoundingClientRect().bottom,titleSize:parseFloat(getComputedStyle(card.querySelector('.ski-product-title')).fontSize),buttons:[...card.querySelectorAll('button')].map(b=>({height:b.getBoundingClientRect().height,bottom:b.getBoundingClientRect().bottom}))}))};
  });
  assert.ok(products.cards.every(card=>card.top>=products.panel.top&&card.bottom<=products.panel.bottom+1&&card.titleSize>=18&&card.buttons.every(b=>b.height>=44&&b.bottom<=products.panel.bottom+1)),`intake ${w}x${h} products not readable: ${JSON.stringify(products)}`);
  checks.at(-1).products=products;
  await page.screenshot({path:path.join(root,'work/screens',`intake-collapsed-${w}x${h}.png`)});
 }
 for(const [w,h] of [[1024,520],[1024,600],[1024,650],[1280,600],[1024,800]]){
  await inspect('vehicle',w,h);
  for(const mode of ['detail','simple']){
   await frame.locator('[data-mode="'+mode+'"]').click();
   const sizes=await frame.locator('.ski-actions button').evaluateAll(bs=>bs.map(b=>({height:b.getBoundingClientRect().height,bottom:b.getBoundingClientRect().bottom})));
   assert.ok(sizes.every(s=>s.height>=72&&s.bottom<=h),`${mode} ${w}x${h} actions: ${JSON.stringify(sizes)}`);
   const content=await frame.locator('.ski-visit-inner').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth}));
   assert.ok(content.scroll<=content.height+1&&content.scrollWidth<=content.width+1,`${mode} ${w}x${h} core info clips: ${JSON.stringify(content)}`);
   await page.screenshot({path:path.join(root,'work/screens',`vehicle-${mode}-${w}x${h}.png`)});
   checks.push({route:'vehicle',width:w,height:h,mode,actions:sizes,content});
  }
 }
 await inspect('vehicle',1024,520);
 await frame.locator('[data-mode="detail"]').click();
 const jobIds=await frame.locator('.ski-job-item').evaluateAll(bs=>bs.map(b=>b.dataset.job));
 for(const id of jobIds){
  await frame.locator('.ski-job-item[data-job="'+id+'"]').click();
  for(const mode of ['simple','detail']){
   await frame.locator('[data-mode="'+mode+'"]').click();
   const content=await frame.locator('.ski-visit-inner').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth}));
   assert.ok(content.scroll<=content.height+1&&content.scrollWidth<=content.width+1,`${id} ${mode} clips: ${JSON.stringify(content)}`);
   checks.push({route:'vehicle',job:id,mode,width:1024,height:520,content});
  }
 }
 for(const w of [736,360])for(const route of ['home','rentals','intake','partners','closing','preparation','settings','guide','guest-guide','guest-form','login'])await inspect(route,w,900,(w===360&&['login','guest-guide','guest-form'].includes(route))?'polish-mobile-'+route:undefined);
 for(const w of [360,390]){
  await inspect('guest-form',w,740);
  for(let step=1;step<=4;step++){
   const footer=await frame.locator('.so-guest-shell footer').evaluate(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}));
   assert.ok(footer.top>=0&&footer.bottom<=740,`guest form ${w} step ${step} footer: ${JSON.stringify(footer)}`);
   const shell=await frame.locator('.so-guest-shell').evaluate(el=>el.getBoundingClientRect().width);
   assert.ok(shell<=390);
   checks.push({route:'guest-form',width:w,step,footer});
   if(step<4)await frame.locator('[data-action="guest-next"]').click();
  }
  await inspect('guest-guide',w,740);
  for(const id of ['return','faq','visit']){
   await frame.locator('[data-action="guide-jump"][data-id="'+id+'"]').click();
   const bounds=await frame.locator('#so-guide-'+id+' h2').evaluate(el=>el.getBoundingClientRect().top);
   const navBottom=await frame.locator('.so-guide-shortcuts').evaluate(el=>el.getBoundingClientRect().bottom);
   assert.ok(bounds>=navBottom,`guide section ${id} hidden by header`);
   checks.push({route:'guest-guide',width:w,section:id,headingTop:bounds});
  }
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(root,'work/visual-check.json'),JSON.stringify({checks,errors},null,2));
 await browser.close();console.log('PASS '+checks.length+' viewport / action checks');
})().catch(e=>{console.error(e);process.exitCode=1;process.exit();});
