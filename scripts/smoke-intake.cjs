const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.SKI_CHROME_CHANNEL||'chrome'});
  const page=await browser.newPage({viewport:{width:1024,height:768}});
  const f=page.frameLocator('iframe'),checks=[],errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()!=='GET')writes.push(request.method()+' '+request.url());});
  let raw,today;
  const base=process.env.SKI_DEMO_URL||'http://127.0.0.1:58148/';
  const nav=route=>f.locator('#so-navigation [data-go="'+route+'"]').click();
  const action=name=>f.locator('[data-action="'+name+'"]').click();
  const total=()=>f.locator('#ski-total-value').innerText();
  const presets=()=>raw.evaluate(()=>window.SkiIntake.getReturnPresets());
  const draft=()=>raw.evaluate(()=>window.SkiIntake.draft());
  const order=id=>raw.evaluate(id=>window.SkiOps.returns.store.get(id),id);
  const dateAfter=n=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  async function fresh(){
    await page.goto(base,{waitUntil:'networkidle'});
    raw=page.frames().find(frame=>frame.parentFrame());
    today=await raw.evaluate(()=>window.SkiOps.data.today);
    await action('login-shop');
    await nav('intake');
    if(await f.locator('[data-action="representative-done"]').isVisible())await action('representative-done');
  }
  async function test(name,run){await fresh();await run();checks.push(name);console.log('PASS '+name);}
  async function chooseDay(index){
    await action('toggle-use-day');
    await f.locator('[data-use-day][data-kind="equipment"]').nth(index).click();
  }
  async function editTime(id,label,time,offset){
    await f.locator('[data-action="return-time-edit"][data-id="'+id+'"]').click();
    await f.locator('[data-return-time="label"]').fill(label);
    await f.locator('[data-return-time="time"]').fill(time);
    await f.locator('[data-return-time="dayOffset"]').selectOption(String(offset));
    await action('return-time-save');
  }
  try{
    await test('same duration collapses and reopens without changing the draft',async()=>{
      await f.locator('[data-days="1"]').click();
      assert.equal(await f.locator('.ski-days').count(),0);
      assert.equal(await total(),'30,000원');
      await action('toggle-period');
      assert.equal(await f.locator('[data-period="startDate"]').inputValue(),today);
      await f.locator('[data-days="3"]').click();
      assert.equal(await total(),'90,000원');
      assert.equal(await f.locator('.ski-days').count(),0);
      await action('toggle-period');
      assert.equal(await f.locator('[data-period="endDate"]').inputValue(),dateAfter(2));
    });
    await test('day selection closes its selector and preserves per-day quantities',async()=>{
      await f.locator('[data-days="3"]').click();
      await chooseDay(1);
      assert.equal(await f.locator('.ski-day-tabs').count(),0);
      await f.locator('[data-product="ski"][data-delta="1"]').click();
      assert.equal(await total(),'110,000원');
      await chooseDay(0);assert.equal(await f.locator('output[aria-label="스키 수량"]').innerText(),'1');
      await chooseDay(1);assert.equal(await f.locator('output[aria-label="스키 수량"]').innerText(),'2');
    });
    await test('physical quantities open on differences and collapse after equalizing',async()=>{
      assert.equal(await f.locator('[data-physical-summary]').getAttribute('open'),null);
      await f.locator('[data-physical-summary] summary').click();
      assert.equal(await f.locator('[data-action="physical"]').isVisible(),true);
      await f.locator('[data-physical-summary] summary').click();
      await f.locator('[data-days="3"]').click();await chooseDay(1);
      await f.locator('[data-product="ski"][data-delta="1"]').click();
      assert.notEqual(await f.locator('[data-physical-summary]').getAttribute('open'),null);
      assert.match(await f.locator('.ski-physical-summary').innerText(),/실제 수량 확인 필요/);
      assert.equal(await f.locator('#ski-live-receipt > :first-child').getAttribute('data-physical-summary'),'');
      await f.locator('[data-copy-days="equipment"]').click();
      assert.equal(await f.locator('[data-physical-summary]').getAttribute('open'),null);
      assert.equal(await total(),'150,000원');
      assert.equal((await draft()).payload.items.find(item=>item.id==='ski').plannedQuantity,2);
    });
    await test('discount labels change while amounts and undo behavior remain intact',async()=>{
      assert.equal(await f.getByRole('button',{name:'할인 5,000원',exact:true}).count(),1);
      await f.locator('[data-order-discount="D-01"]').click();assert.equal(await total(),'25,000원');
      await f.locator('[data-order-discount="D-02"]').click();assert.equal(await total(),'15,000원');
      await action('undo-discount');assert.equal(await total(),'25,000원');
      await action('clear-discount');assert.equal(await total(),'30,000원');
      await f.locator('[data-discount-item="ski"]').click();
      assert.match(await f.locator('#ski-dialog-content').innerText(),/할인 5,000원/);
      await f.locator('[data-pick-discount="D-01"]').click();await action('discount-apply');
      assert.equal(await total(),'25,000원');
    });
    await test('invalid dates keep the editor available and valid dates collapse it',async()=>{
      await f.locator('[data-period="endDate"]').fill(dateAfter(-1));
      assert.match(await f.locator('#ski-period-feedback').innerText(),/종료일/);
      assert.equal(await f.locator('[data-product="ski"][data-delta="1"]').isEnabled(),false);
      await f.locator('[data-period="endDate"]').fill(dateAfter(2));
      assert.equal(await f.locator('.ski-days').count(),0);
      assert.equal(await total(),'90,000원');
    });
    await test('time edits share intake state and preserve saved schedules and literal labels',async()=>{
      const before=await order('R-021');
      await action('time-settings');
      assert.equal(await f.locator('[data-subtab="operations"]').getAttribute('aria-pressed'),'true');
      await editTime('afternoon','<b>오후 반납</b>','17:15',1);
      assert.match(await f.locator('.so-return-time-list').innerText(),/<b>오후 반납<\/b>/);
      assert.equal(await f.locator('.so-return-time-row strong b').count(),0);
      await f.locator('#so-page [data-go="intake"]').click();
      assert.equal(await f.locator('[data-return-preset="afternoon"]').innerText(),'<b>오후 반납</b>');
      const current=await draft();
      assert.equal(current.payload.returnPlan.date,dateAfter(1));assert.equal(current.payload.returnPlan.time,'17:15');
      assert.match(await f.locator('#ski-return-feedback').innerText(),/다음 날/);
      await action('quote');
      assert.match(await f.locator('.ski-quote-schedule').innerText(),/<b>오후 반납<\/b>/);
      assert.equal(await f.locator('.ski-quote-schedule b').count(),0);
      assert.deepEqual(await order('R-021'),before);
    });
    await test('time additions validate names and times before applying',async()=>{
      await action('time-settings');await f.locator('[data-action="return-time-edit"][data-id="new"]').click();
      await action('return-time-save');assert.equal((await presets()).length,3);
      assert.match(await f.locator('#so-return-time-error').innerText(),/이름/);
      await f.locator('[data-return-time="label"]').fill('오후타임 후');await action('return-time-save');
      assert.match(await f.locator('#so-return-time-error').innerText(),/구분/);
      await f.locator('[data-return-time="label"]').fill('오전 반납');await f.locator('[data-return-time="time"]').fill('');
      await action('return-time-save');assert.match(await f.locator('#so-return-time-error').innerText(),/시간/);
      await f.locator('[data-return-time="time"]').fill('10:30');
      await f.locator('[data-return-time="dayOffset"]').selectOption('1');await action('return-time-save');
      assert.equal((await presets()).length,4);
      await f.locator('#so-page [data-go="intake"]').click();await f.getByRole('button',{name:'오전 반납',exact:true}).click();
      assert.equal((await draft()).payload.returnPlan.time,'10:30');
      assert.equal((await draft()).payload.returnPlan.date,dateAfter(1));
    });
    await test('deleting active and all presets preserves the chosen manual schedule',async()=>{
      const before=await order('R-021'),plan=(await draft()).payload.returnPlan;
      await action('time-settings');
      for(const id of ['afternoon','night','next-morning']){
        await f.locator('[data-action="return-time-delete"][data-id="'+id+'"]').click();
        await action('return-time-delete-confirm');
      }
      assert.equal((await presets()).length,0);
      await f.locator('#so-page [data-go="intake"]').click();
      assert.equal(await f.locator('[data-return-preset]').count(),1);
      const after=(await draft()).payload.returnPlan;
      assert.equal(after.date,plan.date);assert.equal(after.time,plan.time);
      assert.equal(await f.locator('[data-field="manualReturnTime"]').inputValue(),'16:30');
      assert.deepEqual(await order('R-021'),before);
    });
    await test('physical confirmation continues into the shared return engine exactly once',async()=>{
      await f.locator('[data-days="3"]').click();await chooseDay(1);
      await f.locator('[data-product="ski"][data-delta="1"]').click();
      await action('save');assert.match(await f.locator('#ski-dialog-title').innerText(),/실제 지급/);
      await action('physical-apply');
      await f.locator('#so-dialog[open]').waitFor();
      assert.match(await f.locator('#so-dialog-title').innerText(),/접수 내용을 저장/);
      const saved=await order('R-100'),ski=saved.items.find(item=>item.id==='ski');
      assert.equal(saved.rental.amountWon,110000);assert.equal(saved.totals.issuedQuantity,0);
      assert.equal(ski.plannedQuantity,2);assert.deepEqual(ski.usage.map(day=>day.quantity),[1,2,1]);
      assert.equal(await raw.evaluate(()=>window.SkiOps.data.orders.filter(order=>order.id.startsWith('R-10')).length),1);
    });
    await test('new orders use edited times without rewriting a previously saved order',async()=>{
      await action('save');await f.locator('#so-dialog[open]').waitFor();
      await f.locator('#so-dialog').getByRole('button',{name:'계속 보기',exact:true}).click();
      const original=await order('R-100');
      await action('time-settings');await editTime('afternoon','오후 정리 후','18:00',0);
      await f.locator('#so-page [data-go="intake"]').click();await action('save');
      await f.locator('#so-dialog[open]').waitFor();
      assert.deepEqual(await order('R-100'),original);
      assert.equal((await order('R-101')).items.find(item=>item.id==='ski').returnPlan.time,'18:00');
      await page.reload({waitUntil:'networkidle'});raw=page.frames().find(frame=>frame.parentFrame());
      assert.equal((await presets()).length,3);assert.equal((await presets())[0].label,'오후타임 후');
    });
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    fs.mkdirSync(path.join(__dirname,'../work'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'../work/smoke-intake.json'),JSON.stringify({checks,errors,writes},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
