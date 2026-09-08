const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const suite=process.argv[2]||'rentals';
const url=process.env.SKI_DEMO_URL||'http://127.0.0.1:58148/';
for(const module of ['settings','partners','closing','preparation','guide','login']){const p=path.join(__dirname,'smoke-'+module+'.cjs');if(fs.existsSync(p))require(p);}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.SKI_CHROME_CHANNEL||'chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const errors=[],mutations=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))mutations.push(r.url());});
 const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
 await page.goto(url,{waitUntil:'networkidle'});
 const f=page.frameLocator('iframe');
 const nav=require('./navigation-helper.cjs').storeNavigation(f);
 const close=async()=>{await f.locator('#so-dialog [data-action="close"]').first().click();};
 if(await f.locator('[data-action="login-shop"]').count())await f.locator('[data-action="login-shop"]').click();
 fs.mkdirSync(path.join(root,'work/screens'),{recursive:true});
 const snap=async(name)=>page.screenshot({path:path.join(root,'work/screens',name+'.png'),fullPage:true});
 try {
  if(suite==='rentals'||suite==='all'){
   await test('rental search and detailed tabs',async()=>{
    await nav('rentals');await f.locator('[data-search="rentals"]').fill('김민수');
    assert.equal(await f.locator('#so-rental-rows tr').count(),1);
    await f.locator('#so-rental-rows .so-button[data-id="R-025"]').click();
    assert.match(await f.locator('#so-page').innerText(),/415,000원|115,000원/);
    for(const id of ['return','payment','history','items'])await f.locator('[data-subtab="'+id+'"]').click();
    await snap('01-rental-detail');
   });
   await test('extension exchange return and contact previews do not alter sample order',async()=>{
    for(const a of ['rental-extend','rental-exchange','rental-contact']){await f.locator('[data-action="'+a+'"]').click();assert.equal(await f.locator('#so-dialog').isVisible(),true);await close();}
    await f.locator('[data-subtab="return"]').click();await f.locator('[data-action="rental-return"]').click();await f.locator('#so-dialog input[type="number"]').first().fill('2');await close();
    assert.match(await f.locator('#so-page').innerText(),/고객에게 남음\s*7/);
   });
   await test('legacy intake tabs and draft calculation still available',async()=>{
    await nav('intake');if(await f.locator('#ski-overlay [data-action=representative-done]').isVisible())await f.locator('[data-action=representative-done]').click();await f.locator('[data-action="toggle-period"]').click();await f.locator('[data-days="2"]').click();assert.equal(await f.locator('#ski-total-value').innerText(),'60,000원');await f.locator('[data-product-tab="lift"]').click();assert.equal(await f.locator('[data-lift-date]').isVisible(),true);await f.locator('[data-product-tab="equipment"]').click();await f.locator('[data-action="quote"]').click();assert.match(await f.locator('#ski-dialog-title').innerText(),/견적/);await f.locator('#ski-overlay [data-action="close-dialog"]').first().click();
   });
   await test('intake header keeps the vehicle and store return controls distinct',async()=>{
    await nav('intake');
    await f.locator('.so-topbar-right [data-go="vehicle"]').click();
    await f.locator('.ski-visit').waitFor({state:'visible'});
    await f.locator('.so-topbar-right [data-go="home"]').click();
    assert.match(await f.locator('#so-breadcrumb').innerText(),/오늘 현황/);
    await nav('intake');
    await f.locator('#so-intake-tools [data-go="dispatch"]').click();
    assert.match(await f.locator('#so-breadcrumb').innerText(),/배달·수거/);
   });
   await test('dispatch filters and driver simple detail modes',async()=>{
    await nav('dispatch');await f.locator('[data-subtab="direct"]').click();assert.match(await f.locator('#so-page').innerText(),/매장 직접/);await f.locator('#so-page [data-go="vehicle"]').click();await f.locator('[data-mode="detail"]').click();assert.equal(await f.locator('.ski-job-list').isVisible(),true);await f.locator('[data-mode="simple"]').click();await f.locator('.so-topbar [data-go="home"]').click();
   });
  }
  if(suite==='settings'||suite==='all') await global.runSettingsChecks?.({f,nav,close,test,snap});
  if(suite==='partners'||suite==='all') await global.runPartnerChecks?.({f,nav,close,test,snap});
  if(suite==='closing'||suite==='all') await global.runClosingChecks?.({f,nav,close,test,snap});
  if(suite==='preparation'||suite==='all') await global.runPreparationChecks?.({f,nav,close,test,snap});
  if(suite==='guide'||suite==='all') await global.runGuideChecks?.({f,nav,close,test,snap});
  if(suite==='login'||suite==='all') await global.runLoginChecks?.({f,nav,close,test,snap,page});
  assert.ok(checks.length>0,'At least one browser scenario must run');assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
  fs.writeFileSync(path.join(root,'work',`smoke-${suite}.json`),JSON.stringify({suite,url,checks,errors,nonGetRequests:mutations},null,2)+'\n');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
