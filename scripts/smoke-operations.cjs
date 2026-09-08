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
 const nav=route=>f.locator('#so-navigation [data-go="'+route+'"]').click();
 const action=name=>f.locator('[data-action="'+name+'"]:visible').click();
 const operations=async()=>{await nav('settings');await f.locator('[data-subtab="operations"]').click();};
 const input=(kind,key)=>f.locator('[data-'+kind+'-field="'+key+'"]');
 const test=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
 const row=name=>f.getByRole('button',{name:name+' 정보 수정',exact:true});
 const addPerson=async(kind,name,phone,assignment)=>{
  await f.locator('[data-action="person-add"][data-id="'+kind+'"]').click();
  await input('person','name').fill(name);await input('person','phone').fill(phone);
  await input('person',kind==='driver'?'vehicleId':'role').selectOption(assignment);
  await action('person-save');
 };
 try{
  const url=process.env.SKI_DEMO_URL||'http://127.0.0.1:58148/';
  await page.goto(url,{waitUntil:'networkidle'});
  const raw=page.frames().find(frame=>frame.parentFrame());
  const draft=()=>raw.evaluate(()=>window.SkiIntake.draft());
  const order=()=>raw.evaluate(()=>window.SkiOps.returns.store.get('R-021'));
  const before=await order();await action('login-shop');await operations();
  await test('initial operations panels fit a low POS viewport without needless inner scrolling',async()=>{
   await page.setViewportSize({width:907,height:648});
   const panels=await f.locator('.so-operations-grid').evaluate(el=>[el.children[0].querySelector('.so-panel-pad'),el.children[1]].map(area=>({height:area.clientHeight,scroll:area.scrollHeight})));
   assert.ok(panels.every(area=>area.scroll<=area.height+1),JSON.stringify(panels));
   await page.setViewportSize({width:1024,height:768});
  });
  await test('time ordering moves stable presets into intake without changing the selected or saved schedule',async()=>{
   await f.locator('[data-action="return-time-edit"][data-id="new"]').click();
   await f.locator('[data-return-time="label"]').fill('오전타임');await chooseTime(f,'[data-return-time="time"]','12:00');await action('return-time-save');
   await action('return-time-order');
   for(let index=0;index<3;index++)await f.getByRole('button',{name:'오전타임 위로',exact:true}).click();
   assert.equal(await f.getByRole('button',{name:'오전타임 위로',exact:true}).isDisabled(),true);
   assert.deepEqual(await f.locator('[data-preset-row] strong').allTextContents(),['오전타임','오후타임 후','야간타임 후','익일 오전']);
   assert.equal(await f.getByRole('button',{name:'익일 오전 아래로',exact:true}).isDisabled(),true);
   await f.getByRole('button',{name:'야간타임 후 아래로',exact:true}).click();
   await action('return-time-order');await nav('intake');await action('representative-done');await action('fulfillment');
   assert.deepEqual(await f.locator('[data-return-preset]').allTextContents(),['오전타임','오후타임 후','익일 오전','야간타임 후','직접 시간 선택']);
   assert.equal(await f.locator('[data-return-preset="afternoon"]').getAttribute('aria-pressed'),'true');
   assert.equal((await draft()).payload.returnPlan.time,'16:30');assert.deepEqual(await order(),before);
   await action('intake-sheet-done');await operations();
  });
  await test('staff registration validates data, rejects duplicates and keeps edits cancellable',async()=>{
   await f.locator('[data-action="person-add"][data-id="staff"]').click();await action('person-save');
   assert.match(await f.locator('#so-operation-error').innerText(),/이름/);
   await input('person','name').fill('카운터 직원');await input('person','phone').fill('invalid');await action('person-save');
   assert.match(await f.locator('#so-operation-error').innerText(),/연락처/);
   await input('person','phone').fill('010-0000-1111');await action('person-save');
   await addPerson('staff','매장 관리자','','manager');
   assert.equal(await f.locator('.so-person-row').count(),2);
   await row('카운터 직원').locator('strong').click();await input('person','name').fill('취소할 이름');await f.locator('#so-dialog [data-action="close"]').first().click();
   assert.equal(await row('카운터 직원').count(),1);assert.equal(await row('취소할 이름').count(),0);
   await addPerson('staff','카운터 직원','01000001111','counter');assert.match(await f.locator('#so-operation-error').innerText(),/등록되어/);
   await f.locator('#so-dialog [data-action="close"]').first().click();
   await row('카운터 직원').click();await input('person','phone').fill('010-0000-3333');await input('person','role').selectOption('manager');await action('person-save');
   assert.match(await row('카운터 직원').innerText(),/관리자/);assert.match(await row('카운터 직원').innerText(),/010-0000-3333/);
  });
  await test('driver contacts and vehicle assignments stay separate from staff and shop numbers',async()=>{
   await f.locator('[data-action="person-add"][data-id="driver"]').click();await input('person','name').fill('1호 기사님');await action('person-save');
   assert.match(await f.locator('#so-operation-error').innerText(),/기사님 연락처/);
   await input('person','phone').fill('010-0000-2222');await input('person','vehicleId').selectOption('demo-van-1');await action('person-save');
   await addPerson('driver','2호 기사님','010-0000-4444','demo-van-2');
   await row('1호 기사님').click();await input('person','phone').fill('010-0000-5555');await action('person-save');
   assert.match(await row('1호 기사님').innerText(),/1호 차량/);assert.match(await row('2호 기사님').innerText(),/2호 차량/);
   await nav('dispatch');await action('operations-contacts');
   let text=await f.locator('.so-contact-directory').innerText();
   assert.match(text,/010-0000-0000/);assert.match(text,/010-0000-5555/);assert.match(text,/010-0000-4444/);assert.doesNotMatch(text,/010-0000-3333/);
   await f.locator('#so-dialog [data-action="close"]').first().click();await f.locator('#so-page [data-go="vehicle"]').click();
   await page.setViewportSize({width:1024,height:520});await action('operations-contacts');
   text=await f.locator('.so-contact-directory').innerText();assert.match(text,/1호 기사님/);assert.match(text,/2호 기사님/);
   await f.locator('#so-dialog [data-action="close"]').first().click();
   const controls=await f.locator('.ski-vehicle-tools').evaluate(el=>[...el.querySelectorAll('button,select')].filter(b=>!b.hidden).map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};}));
   assert.ok(controls.every(box=>box.left>=0&&box.right<=1024&&box.height>=44),JSON.stringify(controls));
   for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++)assert.ok(controls[i].right<=controls[j].left||controls[j].right<=controls[i].left||controls[i].bottom<=controls[j].top||controls[j].bottom<=controls[i].top,'vehicle controls overlap');
   await f.locator('.so-topbar [data-go="home"]').click();await page.setViewportSize({width:1024,height:768});await operations();
  });
  await test('shop contact changes reach customer guidance and only untouched intake defaults',async()=>{
   await action('shop-edit');await input('shop','name').fill('<b>눈꽃 스키샵</b>');await input('shop','phone').fill('063-000-1234');await input('shop','place').selectOption('설천 주차장');await action('shop-save');
   assert.match(await f.locator('.so-shop-summary').innerText(),/<b>눈꽃 스키샵<\/b>/);assert.equal(await f.locator('.so-shop-summary strong b').count(),0);
   assert.equal((await draft()).payload.returnPlan.place,'설천 주차장');assert.deepEqual(await order(),before);
   await nav('intake');await action('fulfillment');
   await f.locator('[data-field="place"]').selectOption('만선 광장');await action('intake-sheet-done');
   await operations();await action('shop-edit');await input('shop','place').selectOption('만선 티롤 앞');await action('shop-save');
   assert.equal((await draft()).payload.returnPlan.place,'만선 광장');
   await nav('guide');await f.locator('#so-page [data-go="guest-guide"]').first().click();await action('guide-contact');
   assert.match(await f.locator('#so-dialog-body').innerText(),/063-000-1234/);assert.match(await f.locator('#so-dialog-body').innerText(),/<b>눈꽃 스키샵<\/b>/);
   assert.equal(await f.locator('.so-contact-card strong b').count(),0);assert.doesNotMatch(await f.locator('#so-public').innerText(),/010-0000-5555|010-0000-3333/);
   await f.locator('#so-dialog [data-action="close"]').first().click();await f.locator('#so-public [data-go="guide"]').click();await operations();
  });
  await test('full-row editors and populated lists fit POS viewports without horizontal clipping',async()=>{
   fs.mkdirSync('work/screens',{recursive:true});
   for(const [width,height] of [[907,648],[1024,768],[1366,768]]){
    await page.setViewportSize({width,height});
    const boxes=await f.locator('.so-operations-grid').evaluate(el=>({pageWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,areas:[el,...el.children,el.querySelector('.so-panel-pad')].map(area=>({class:area.className,clientWidth:area.clientWidth,scrollWidth:area.scrollWidth})),buttons:[...el.querySelectorAll('button')].map(button=>({height:button.getBoundingClientRect().height,width:button.getBoundingClientRect().width}))}));
    assert.ok(boxes.documentWidth<=width&&boxes.areas.every(area=>area.scrollWidth<=area.clientWidth+1),JSON.stringify(boxes));
    assert.ok(boxes.buttons.every(button=>button.height>=44&&button.width>=44),JSON.stringify(boxes.buttons));
    await page.screenshot({path:`work/screens/operations-${width}x${height}.png`});screens.push({width,height,...boxes});
    await row('1호 기사님').click();
    const modal=await f.locator('#so-dialog').evaluate(el=>({bottom:el.getBoundingClientRect().bottom,top:el.getBoundingClientRect().top,footer:el.querySelector('.so-dialog-actions').getBoundingClientRect().bottom}));
    assert.ok(modal.top>=0&&modal.bottom<=height&&modal.footer<=height,JSON.stringify(modal));
    await f.locator('#so-dialog [data-action="close"]').first().click();
   }
  });
  await test('deleting a person clears only that contact and refresh restores demo defaults',async()=>{
   await row('1호 기사님').click();await action('person-delete');await f.locator('#so-dialog [data-action="close"]').first().click();assert.equal(await row('1호 기사님').count(),1);
   await row('1호 기사님').click();await action('person-delete');await action('person-delete-confirm');assert.equal(await row('1호 기사님').count(),0);assert.equal(await row('2호 기사님').count(),1);
   assert.deepEqual(await order(),before);
   await nav('dispatch');await action('operations-contacts');assert.doesNotMatch(await f.locator('.so-contact-directory').innerText(),/010-0000-5555/);
   await page.reload({waitUntil:'networkidle'});await action('login-shop');await operations();
   assert.equal(await f.locator('.so-person-row').count(),0);assert.match(await f.locator('.so-shop-summary').innerText(),/우리 스키샵/);
   assert.deepEqual(await f.locator('[data-preset-row] strong').allTextContents(),['오후타임 후','야간타임 후','익일 오전']);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  fs.writeFileSync('work/operations-results.json',JSON.stringify({checks,screens,errors,writes},null,2));
  console.log(JSON.stringify({passed:checks.length,viewports:screens.length,errors,writes}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
