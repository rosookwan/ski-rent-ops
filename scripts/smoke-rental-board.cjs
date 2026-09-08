const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: process.env.SKI_CHROME_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.setDefaultTimeout(8000);
  const errors = [], writes = [], checks = []; let frame;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  const fresh = async () => { await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/', { waitUntil: 'networkidle' }); frame = page.frames().find(f => f.parentFrame()); await frame.evaluate(() => { SkiOps.state.authenticated = true; SkiOps.go('rentals'); }); await frame.evaluate(() => document.fonts.ready); };
  const click = label => frame.getByRole('button', { name: label, exact: true }).click();
  const detail = async id => { await frame.evaluate(id => { SkiOps.state.tabs.rental = 'return'; SkiOps.go('rental', { id }); }, id); };
  const current = id => frame.evaluate(id => SkiOps.workflow.projectOrder(id), id);
  const dialog = () => frame.locator('.so-rental-overlay[role="dialog"]');
  const test = async (name, run) => { await fresh(); await run(); checks.push(name); console.log('PASS ' + name); };
  fs.mkdirSync('work/rental-ui-parity', { recursive: true });
  try {
    await test('one combined menu, aliases, search, filters and sorting', async () => {
      assert.equal(await frame.locator('#so-navigation [data-go="returns"]').count(), 0);
      assert.equal(await frame.locator('#so-navigation [data-go="rentals"]').getAttribute('aria-label'), '렌탈·반납 현황');
      await frame.getByRole('searchbox', { name: '고객 찾기' }).fill('r-025');
      assert.equal(await frame.locator('#so-rental-rows [data-order-id]').count(), 1);
      await click('조건 지우기'); await click('빌린 순서');
      assert.equal(await frame.locator('#so-rental-rows h2').count(), 0);
      await click('반납 시간 묶음'); assert.ok(await frame.locator('#so-rental-rows h2').count() > 0);
      await frame.getByRole('searchbox', { name: '고객 찾기' }).fill('없는 고객');
      assert.match(await frame.locator('#so-rental-rows').innerText(), /조건에 맞는 접수가 없습니다/);
      await click('조건 지우기');
      await frame.evaluate(() => SkiOps.go('returns'));
      assert.equal(await frame.locator('#so-navigation [aria-current="page"]').getAttribute('data-go'), 'rentals');
      await frame.locator('[data-order-id="R-025"]').click();
      for (const name of ['반납 확인', '장비·리프트권', '결제·환불', '변경 이력']) { await frame.getByRole('tab', { name, exact: true }).click(); assert.equal(await frame.getByRole('tab', { name, exact: true }).getAttribute('aria-selected'), 'true'); }
      await click('목록으로'); assert.equal(await frame.locator('#ski-ops').getAttribute('data-page'), 'rentals');
    });
    await test('partial direct return updates the shared ledger and leaves other items held', async () => {
      await detail('R-021'); const before = await current('R-021');
      await click('고객 직접반납 받음');
      assert.equal(await frame.getByRole('button', { name: '직접반납 처리', exact: true }).isDisabled(), true);
      await click('스키 수량 늘리기'); await click('직접반납 처리');
      assert.equal(await dialog().count(), 0);
      const after = await current('R-021');
      assert.equal(after.totals.customerQuantity, before.totals.customerQuantity - 1);
      assert.equal(after.totals.shopQuantity, before.totals.shopQuantity + 1);
      assert.equal(after.items.find(i => i.id === 'clothes').customerQuantity, 2);
      assert.equal(await frame.evaluate(() => SkiOps.data.orders.find(o => o.id === 'R-021').returned), 1);
      await click('목록으로'); assert.match(await frame.locator('[data-order-id="R-021"]').innerText(), /일부만 받음/);
    });
    await test('vehicle handoff confirms only that customer, leaving other vehicle assets unchanged', async () => {
      await detail('R-024'); const before = await current('R-024');
      const vehicleBefore = await frame.evaluate(() => SkiOps.workflow.snap().assets.filter(a => a.location.kind === 'vehicle').length);
      await click('차량 인수분 최종 확인'); await click('매장 확인 완료');
      const after = await current('R-024');
      assert.equal(after.totals.vehicleQuantity, 0); assert.equal(after.totals.shopQuantity, before.totals.shopQuantity + before.totals.vehicleQuantity);
      assert.equal(await frame.evaluate(() => SkiOps.workflow.snap().assets.filter(a => a.location.kind === 'vehicle').length), vehicleBefore - before.totals.vehicleQuantity);
      assert.match(await frame.locator('.so-rental-board').innerText(), /반납 완료/);
      await click('수량 정정'); await click('스키 수량 늘리기'); await click('정정 저장');
      const corrected = await current('R-024'); assert.equal(corrected.totals.vehicleQuantity, 1); assert.equal(corrected.totals.customerQuantity, 0);
    });
    await test('direct-return correction restores customer custody and pending collection', async () => {
      await detail('R-021'); await click('고객 직접반납 받음'); await click('스키 수량 늘리기'); await click('직접반납 처리');
      await click('수량 정정'); await click('스키 수량 늘리기'); await click('정정 저장');
      const after = await current('R-021'); assert.equal(after.totals.customerQuantity, 5); assert.equal(after.totals.shopQuantity, 0);
      assert.equal(after.totals.vehicleQuantity, 0);
    });
    await test('item schedule changes update remaining vehicle tasks without changing sibling items', async () => {
      await detail('R-021');
      const before = await current('R-021');
      await frame.getByRole('button', { name: '예정 변경', exact: true }).first().click();
      await dialog().getByLabel('반납 방법', { exact: true }).selectOption('직접반납');
      await dialog().getByRole('button', { name: '예정 변경', exact: true }).click();
      assert.equal(await dialog().count(), 0);
      const after = await current('R-021'); assert.equal(after.items[0].returnPlan.method, 'direct');
      assert.equal(after.items[1].returnPlan.method, before.items[1].returnPlan.method);
      const remaining = await frame.evaluate(() => { const F = SkiOps.workflow; return F.snap().tasks.filter(t => t.customerId === 'R-021' && t.status === 'waiting').flatMap(t => F.remaining(t)); });
      assert.equal(remaining.length, 3);
    });
    await test('stale dialog fails without reapplying quantities to a newer ledger', async () => {
      await detail('R-021'); await click('고객 직접반납 받음'); await click('스키 수량 늘리기');
      const before = await frame.evaluate(() => { const F = SkiOps.workflow; const asset = F.snap().assets.find(a => a.location.kind === 'customer' && a.location.id === 'R-021' && a.sku === 'ski'); F.returnCustomer('R-021', [asset.id]); return F.snap().revision; });
      await click('직접반납 처리'); assert.match(await dialog().getByRole('alert').innerText(), /수량이나 일정이 변경/);
      assert.equal(await frame.evaluate(() => SkiOps.workflow.snap().revision), before);
      await click('창 닫기'); assert.equal((await current('R-021')).totals.shopQuantity, 1);
    });
    await test('whole-order schedule retains current fields and updates every pending item', async () => {
      await detail('R-021'); await click('반납 일정 변경');
      const tomorrow = await frame.evaluate(() => SkiOps.data.day(1));
      await dialog().getByLabel('반납일', { exact: true }).fill(tomorrow);
      await dialog().getByLabel('반납 방법', { exact: true }).selectOption('직접반납');
      await click('저장'); assert.equal(await dialog().count(), 0);
      const after = await current('R-021'); assert.ok(after.items.every(i => i.returnPlan.date === tomorrow && i.returnPlan.method === 'direct'));
      assert.equal(await frame.evaluate(() => SkiOps.workflow.snap().tasks.filter(t => t.customerId === 'R-021' && t.status === 'waiting').length), 0);
    });
    await test('return plans for delivered reservations remain visible after changing to direct return', async () => {
      await detail('morning');
      const tomorrow = await frame.evaluate(() => SkiOps.data.day(1));
      await frame.getByRole('button', { name: '예정 변경', exact: true }).first().click();
      await dialog().getByLabel('반납 예정일', { exact: true }).fill(tomorrow);
      await dialog().getByLabel('반납 방법', { exact: true }).selectOption('직접반납');
      await dialog().getByRole('button', { name: '예정 변경', exact: true }).click();
      assert.equal(await dialog().count(), 0);
      const after = await current('morning'); assert.equal(after.items[0].returnPlan.date, tomorrow); assert.equal(after.items[0].returnPlan.method, 'direct');
    });
    await test('unissued equipment and tickets retain issue and dispatch actions', async () => {
      await frame.locator('[data-order-id="R-022"]').click();
      assert.equal(await frame.getByRole('tab', { name: '장비·리프트권', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await frame.getByRole('button', { name: '장비 적재·배달', exact: true }).isVisible(), true);
      assert.equal(await frame.getByRole('button', { name: '리프트권 지급', exact: true }).isVisible(), true);
      await click('장비 지급 확인');
      const after = await current('R-022'); assert.equal(after.totals.customerQuantity, 3); assert.equal(after.totals.unissuedQuantity, 1);
      await frame.getByRole('tab', { name: '반납 확인', exact: true }).click();
      assert.equal(await frame.getByRole('button', { name: '고객 직접반납 받음', exact: true }).isDisabled(), false);
    });
    await test('keyboard focus, escape and navigation release modal isolation', async () => {
      await detail('R-021'); await click('고객 직접반납 받음');
      assert.equal(await frame.locator('.so-topbar').evaluate(el => el.inert), true);
      await page.keyboard.press('Escape'); assert.equal(await dialog().count(), 0);
      assert.equal(await frame.locator('.so-topbar').evaluate(el => el.inert), false);
      await click('고객 직접반납 받음'); await frame.evaluate(() => SkiOps.go('home'));
      assert.equal(await frame.locator('.so-sidebar').evaluate(el => el.inert), false);
      await frame.locator('#so-navigation [data-go="rentals"]').click();
      assert.equal(await dialog().count(), 0);
    });
    await test('customer text remains literal HTML-safe text', async () => {
      await frame.evaluate(() => { SkiOps.data.orders[0].name = '<b>고객</b>'; SkiOps.render(); });
      const card = frame.locator('[data-order-id="R-025"]'); assert.match(await card.innerText(), /<b>고객<\/b>/); assert.equal(await card.locator('b').count(), 0);
      await card.click(); assert.equal(await frame.locator('.so-rental-board h1 b').count(), 0);
    });
    await test('POS, wide and phone viewports keep page overflow contained and controls readable', async () => {
      for (const [width, height] of [[1024, 768], [1366, 768], [1440, 900], [1920, 1080], [390, 740], [360, 740]]) {
        await page.setViewportSize({ width, height });
        for (const route of ['rentals', 'rental']) {
          await frame.evaluate(route => { SkiOps.go(route, route === 'rental' ? { id: 'R-021' } : {}); }, route);
          const geometry = await frame.evaluate(() => ({ width: innerWidth, root: document.documentElement.scrollWidth, height: innerHeight, rootHeight: document.documentElement.scrollHeight, font: document.fonts.check('16px Pretendard'), buttons: [...document.querySelectorAll('.so-rental-board button')].filter(b => !b.closest('[aria-label="요약"]')).map(b => ({ width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height, font: parseFloat(getComputedStyle(b).fontSize) })) }));
          assert.ok(geometry.root <= width && geometry.rootHeight <= height, `${route} ${width}: ${JSON.stringify(geometry)}`);
          assert.ok(geometry.font); assert.ok(geometry.buttons.every(b => b.height >= 44 && b.font >= 14), 'reference-sized controls');
          await page.screenshot({ path: `work/rental-ui-parity/live-${route}-${width}.png` });
        }
      }
    });
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  } catch (error) { await page.screenshot({ path: 'work/rental-ui-parity/functional-failure.png' }); throw error; }
  finally { fs.writeFileSync('work/rental-ui-parity/functional.json', JSON.stringify({ checks, errors, nonGetRequests: writes }, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
