const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chooseTime}=require('./time-picker-helper.cjs');

(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.SKI_CHROME_CHANNEL||'chrome'});
  const page=await browser.newPage({viewport:{width:1024,height:768}});
  const f=page.frameLocator('iframe'),errors=[],writes=[],checks=[],screens=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());});
  const action=name=>f.locator('[data-action="'+name+'"]').click();
  const nav=route=>f.locator('#so-navigation [data-go="'+route+'"]').click();
  const test=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
  const time='[data-return-time="time"]',picker=f.locator('.so-time-picker');
  const trigger=selector=>f.locator(selector).locator('..').locator('[data-time-open]');
  try{
    await page.goto(process.env.SKI_DEMO_URL||'http://127.0.0.1:58148/',{waitUntil:'networkidle'});
    const raw=page.frames().find(frame=>frame.parentFrame());
    await action('login-shop');await nav('settings');await f.locator('[data-subtab="operations"]').click();
    await f.locator('[data-action="return-time-edit"][data-id="afternoon"]').click();
    await test('settings picker preserves midnight, noon and minute precision without a native time input',async()=>{
      for(const value of ['00:00','12:00','23:59','17:13']){
        await chooseTime(f,time,value);assert.equal(await f.locator(time).inputValue(),value);
        await trigger(time).click();assert.equal(await picker.locator('[data-time-preview]').innerText(),value);
        await picker.locator('[data-time-apply]').click();
        assert.equal(await f.locator(time).inputValue(),value);
      }
      assert.equal(await f.locator('input[type="time"]').count(),0);
      assert.equal(await trigger(time).evaluate(el=>el===document.activeElement),true);
    });
    await test('Escape and cancel discard drafts while keeping the parent settings dialog and focus',async()=>{
      await trigger(time).click();await picker.locator('[data-time-hour="17"]').press('ArrowRight');
      assert.equal(await picker.locator('[data-time-preview]').innerText(),'18:13');
      await picker.locator('[data-time-hour="18"]').press('Escape');
      assert.equal(await picker.count(),0);assert.equal(await f.locator('#so-dialog').isVisible(),true);
      assert.equal(await f.locator(time).inputValue(),'17:13');assert.equal(await trigger(time).evaluate(el=>el===document.activeElement),true);
      await trigger(time).click();await picker.locator('[data-time-clear]').click();
      await picker.getByRole('button',{name:'취소',exact:true}).click();
      assert.equal(await f.locator(time).inputValue(),'17:13');
      await trigger(time).click();await picker.locator('[data-time-apply]').press('Tab');
      assert.equal(await picker.locator('[data-time-cancel]').first().evaluate(el=>el===document.activeElement),true);
      await picker.locator('[data-time-cancel]').first().press('Shift+Tab');
      assert.equal(await picker.locator('[data-time-apply]').evaluate(el=>el===document.activeElement),true);
      await picker.locator('[data-time-apply]').press('Escape');
    });
    await test('touch controls fit POS and short tablet windows with a fixed apply button on mobile',async()=>{
      await trigger(time).click();fs.mkdirSync('work/screens',{recursive:true});
      for(const [width,height] of [[907,648],[1024,768],[1366,768],[1024,520],[360,740]]){
        await page.setViewportSize({width,height});
        const box=await picker.evaluate(dialog=>{
          const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
          const body=dialog.querySelector('.so-time-body');
          return {dialog:rect(dialog),footer:rect(dialog.querySelector('.so-time-footer')),body:{height:body.clientHeight,scroll:body.scrollHeight,width:body.clientWidth,scrollWidth:body.scrollWidth},buttons:[...dialog.querySelectorAll('button')].map(rect)};
        });
        assert.ok(box.dialog.top>=0&&box.dialog.bottom<=height&&box.dialog.left>=0&&box.dialog.right<=width,JSON.stringify(box));
        assert.ok(box.footer.bottom<=height&&box.body.scrollWidth<=box.body.width+1,JSON.stringify(box));
        assert.ok(box.buttons.every(button=>button.width>=44&&button.height>=44),JSON.stringify(box.buttons));
        if(width>=900){
          assert.ok(box.body.scroll<=box.body.height+1,JSON.stringify(box.body));
          assert.ok(box.buttons.every(button=>button.top>=box.dialog.top&&button.bottom<=box.dialog.bottom),JSON.stringify(box));
        }
        await page.screenshot({path:`work/screens/time-picker-${width}x${height}.png`});screens.push({width,height,...box});
      }
      await picker.getByRole('button',{name:'취소',exact:true}).click();await page.setViewportSize({width:1024,height:768});
    });
    await test('applying a preset updates its time without changing existing rental schedules',async()=>{
      const before=await raw.evaluate(()=>window.SkiOps.returns.store.get('R-021'));
      await action('return-time-save');
      assert.equal(await raw.evaluate(()=>window.SkiIntake.getReturnPresets().find(row=>row.id==='afternoon').time),'17:13');
      assert.deepEqual(await raw.evaluate(()=>window.SkiOps.returns.store.get('R-021')),before);
    });
    await test('intake picker applies exact minutes to the draft and survives nested dialog cancellation',async()=>{
      await nav('intake');await action('representative-done');await action('fulfillment');
      await f.locator('[data-return-preset="manual"]').click();
      const field='[data-field="manualReturnTime"]';
      await trigger(field).click();await picker.locator('[data-time-hour="9"]').click();
      await picker.locator('[data-time-hour="9"]').press('Escape');
      assert.equal(await f.locator('[data-intake-sheet="return"]').isVisible(),true);
      assert.equal(await f.locator(field).inputValue(),'17:13');
      assert.equal(await trigger(field).evaluate(el=>el===document.activeElement),true);
      await chooseTime(f,field,'19:47');assert.match(await f.locator('#ski-return-feedback').innerText(),/19:47/);
      await action('intake-sheet-done');
      assert.match(await f.locator('.ski-fulfillment-summary').innerText(),/19:47/);
      assert.equal((await raw.evaluate(()=>window.SkiIntake.draft())).payload.returnPlan.time,'19:47');
    });
    await test('saved item schedules use the same picker and allow removing an optional time',async()=>{
      await nav('returns');await f.locator('#so-page [data-go="return-detail"][data-id="R-025"]').click();
      const edit=()=>f.locator('[data-action="return-plan"][data-id="R-025|lift-day1"]').click();
      const plan=()=>raw.evaluate(()=>window.SkiOps.returns.store.get('R-025'));
      const before=await plan();await edit();assert.equal(await f.locator('input[type="time"]').count(),0);
      await chooseTime(f,'[data-return-plan="time"]','00:00');await action('return-apply');
      let after=await plan();assert.equal(after.items.find(item=>item.id==='lift-day1').returnPlan.time,'00:00');
      assert.deepEqual(after.rental,before.rental);
      assert.deepEqual(after.items.find(item=>item.id==='ski'),before.items.find(item=>item.id==='ski'));
      await edit();await chooseTime(f,'[data-return-plan="time"]','');await action('return-apply');
      after=await plan();assert.equal(after.items.find(item=>item.id==='lift-day1').returnPlan.time,null);
    });
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    fs.writeFileSync('work/time-picker-results.json',JSON.stringify({checks,screens,errors,writes},null,2));
    console.log(JSON.stringify({passed:checks.length,viewports:screens.length,errors,writes}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
