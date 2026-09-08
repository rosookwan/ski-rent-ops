const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKI_CHROME_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1024, height: 520 } });
  const errors = [], writes = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
  try {
    await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/', { waitUntil: 'networkidle' });
    const f = page.frameLocator('iframe'), frame = page.frames().find(frame => frame.parentFrame());
    const get = id => frame.evaluate(id => window.SkiOps.returns.store.get(id), id);
    const nav = id => f.locator('#so-navigation [data-go="' + id + '"]').click();
    const close = () => f.locator('#so-dialog [data-action="close"]').first().click();
    const apply = async () => { await f.locator('[data-action="return-apply"]').click(); await f.locator('#so-dialog').waitFor({ state: 'hidden' }); };
    const detail = async id => { await nav('returns'); await f.locator('#so-page [data-go="return-detail"][data-id="' + id + '"]').click(); };
    const action = name => f.locator('.so-return-buttons [data-action="' + name + '"]').click();
    const test = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
    await f.locator('[data-action="login-vehicle"]').click();
    await test('compact vehicle partial collection keeps missing clothes at customer', async () => {
      await f.locator('[data-action="partial-return"]').click();
      await f.locator('[data-action="return-missing"][data-id="1"]').click();
      assert.match(await f.locator('#so-return-totals').innerText(), /이번에 받음 3개/);
      await apply();
      const order = await get('R-021'), clothes = order.items.find(item => item.id === 'clothes');
      assert.equal(order.status, 'partial_return'); assert.equal(order.totals.vehicleQuantity, 3);
      assert.equal(clothes.customerQuantity, 2); assert.equal(clothes.returnPlan.method, 'direct');
      assert.equal(clothes.returnPlan.date, order.rental.endDate);
    });
    await test('driver can undo own collection and repeat collection without a reason field', async () => {
      await f.locator('[data-action="return-driver-undo"]').click(); await apply();
      let order = await get('R-021'); assert.equal(order.totals.vehicleQuantity, 0); assert.equal(order.totals.customerQuantity, 5);
      await f.locator('[data-action="complete"]').click(); await apply();
      order = await get('R-021'); assert.equal(order.totals.vehicleQuantity, 3); assert.equal(order.totals.customerQuantity, 2);
      assert.equal(order.items.find(item => item.id === 'clothes').customerQuantity, 2);
      await f.locator('.so-topbar [data-go="home"]').click(); await page.setViewportSize({ width: 1366, height: 768 });
    });
    await test('direct return and vehicle handoff complete separate balances', async () => {
      await detail('R-021'); await action('return-direct');
      assert.equal(await f.locator('[data-return-input]').count(), 1);
      await f.locator('[data-return-input]').fill('2'); await apply();
      let order = await get('R-021'); assert.equal(order.totals.customerQuantity, 0); assert.equal(order.totals.vehicleQuantity, 3); assert.equal(order.complete, false);
      await action('return-confirm'); await apply();
      order = await get('R-021'); assert.equal(order.complete, true); assert.equal(order.totals.shopQuantity, 5); assert.equal(order.totals.vehicleQuantity, 0);
      assert.equal(await f.locator('[data-action="return-direct"]').isDisabled(), true);
    });
    await test('record-specific correction reopens completion and rejects excess quantity', async () => {
      const before = await get('R-021'), receipt = before.recentMovements.find(m => m.type === 'receiveDirect');
      await action('return-correct'); await f.locator('[data-change="return-movement"]').selectOption(receipt.id);
      await f.locator('[data-return-input]').fill('1'); await apply();
      let order = await get('R-021'); assert.equal(order.status, 'partial_return'); assert.equal(order.totals.customerQuantity, 1);
      await action('return-direct'); await f.locator('[data-return-input]').fill('2'); await f.locator('[data-action="return-apply"]').click();
      await f.locator('#so-return-error').waitFor({ state: 'visible' }); assert.equal((await get('R-021')).version, order.version);
      await f.locator('[data-return-input]').fill('1'); await apply(); assert.equal((await get('R-021')).complete, true);
    });
    const today = await frame.evaluate(() => window.SkiOpsData.today), tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0,10);
    await test('ticket date changes appear in the next-day return list', async () => {
      await detail('R-025'); await f.locator('[data-action="return-plan"][data-id="R-025|lift-day1"]').click();
      await f.locator('[data-return-plan="date"]').fill(tomorrow); await apply();
      await nav('returns'); await f.locator('[data-change="return-date"]').selectOption(tomorrow); await f.locator('[data-subtab="liftUnreturned"]').click();
      await f.locator('#so-return-rows [data-id="R-025"]').waitFor();
      assert.match(await f.locator('#so-return-rows').innerText(), /김민수/);
      await f.locator('[data-action="return-reset"]').click();
    });
    await test('a stale dialog does not automatically retry against a newer version', async () => {
      await detail('R-025'); await action('return-direct'); await f.locator('[data-return-input]').first().fill('1');
      const version = await frame.evaluate(async () => { const api = window.SkiOps.returns, order = await api.store.get('R-025'); const result = await api.store.execute(api.newCommand('planReturn', order, { items: [{ itemId: 'ski', returnPlan: { place: '설천 주차장' } }] })); return result.order.version; });
      await f.locator('[data-action="return-apply"]').click(); await f.locator('#so-dialog').waitFor({ state: 'hidden' });
      assert.match(await f.locator('#so-toast').innerText(), /최신 수량/); assert.equal((await get('R-025')).version, version);
    });
    await test('new intake separates physical quantity from two-day pricing and actual issue', async () => {
      await nav('intake'); if (await f.locator('[data-action="representative-done"]').isVisible()) await f.locator('[data-action="representative-done"]').click();
      await f.locator('[data-action="toggle-period"]').click();await f.locator('[data-days="2"]').click(); assert.equal(await f.locator('#ski-total-value').innerText(), '60,000원');
      await f.locator('[data-product-tab="lift"]').click(); await f.locator('[data-lift-ticket="afternoon-adult"][data-delta="1"]').click();
      await f.locator('[data-action="fulfillment"]').click();await f.locator('.ski-split-return summary').click(); await f.locator('[data-field="ticketReturnMethod"]').selectOption('collect');
      const afterTomorrow = new Date(Date.parse(today) + 2*86400000).toISOString().slice(0,10);
      await f.locator('[data-field="ticketReturnDate"]').fill(afterTomorrow);
      await f.locator('[data-action="intake-sheet-done"]').click();
      await f.locator('[data-action="save"]').click(); await f.locator('#so-dialog [data-go="return-detail"]').click();
      let order = await get('R-100'); assert.equal(order.status, 'awaiting_issue'); assert.equal(order.totals.issuedQuantity, 0); assert.equal(order.totals.unissuedQuantity, 3); assert.equal(order.rental.amountWon, 105000);
      await action('return-issue'); await apply(); order = await get('R-100'); assert.equal(order.totals.issuedQuantity, 3); assert.equal(order.totals.customerQuantity, 3);
      const jobs = await frame.evaluate(() => window.SkiOps.returnUI.vehicleJobs().filter(job => job.orderId === 'R-100'));
      assert.equal(jobs.length, 2); assert.deepEqual(jobs.find(job => job.returnDate === tomorrow).targets.map(row => row.itemId), ['ski']);
      assert.deepEqual(jobs.find(job => job.returnDate === afterTomorrow).targets.map(row => row.itemId), ['ticket-0']);
    });
    await test('lift-only issue and direct receipt use shop-confirmed recovery value', async () => {
      await detail('R-026'); await action('return-issue'); await apply(); await action('return-direct');
      await f.locator('[data-return-input]').fill('2'); await apply();
      await nav('closing'); await f.locator('[data-subtab="tickets"]').click();
      assert.match(await f.locator('.so-lift-summary').innerText(), /오늘 매장 확인\s*2매/); assert.match(await f.locator('.so-lift-summary').innerText(), /2,000원/);
      await detail('R-026'); await f.locator('[data-action="return-plan"]').click(); await f.locator('[data-return-plan="method"]').selectOption('vehicle'); await f.locator('[data-return-plan="place"]').fill('설천 주차장'); await apply();
      await f.locator('.so-topbar [data-go="vehicle"]').click(); await f.locator('[data-field="dateOffset"]').selectOption('0'); await f.locator('[data-mode="detail"]').click(); await f.locator('[data-filter="return"]').click();
      await f.locator('.ski-job-item').filter({ hasText: '정하늘' }).click(); await f.locator('[data-action="complete"]').click(); await apply();
      await f.locator('.so-topbar [data-go="home"]').click(); await nav('closing');
      assert.match(await f.locator('.so-lift-summary').innerText(), /오늘 매장 확인\s*2매/); assert.match(await f.locator('.so-lift-note').innerText(), /차량 보관 2매/);
      const before = await frame.evaluate(() => window.SkiOps.returns.store.report());
      await detail('R-026'); await action('return-confirm'); await apply(); await nav('closing');
      assert.match(await f.locator('.so-lift-summary').innerText(), /오늘 매장 확인\s*4매/); assert.match(await f.locator('.so-lift-summary').innerText(), /4,000원/);
      const after = await frame.evaluate(() => window.SkiOps.returns.store.report()); assert.equal(after.recoveredQuantity, before.recoveredQuantity); assert.equal(after.recoveryValueWon, before.recoveryValueWon);
    });
    await test('a driver cannot undo stock already confirmed by the store', async () => {
      const before = await get('R-026');
      await f.locator('.so-topbar [data-go="vehicle"]').click(); await f.locator('[data-action="return-driver-undo"]').click();
      await f.locator('[data-action="return-apply"]').click(); await f.locator('#so-return-error').waitFor({ state: 'visible' });
      assert.match(await f.locator('#so-return-error').innerText(), /매장 확인 내역을 먼저 정정/);
      assert.equal((await get('R-026')).version, before.version); await close(); await f.locator('.so-topbar [data-go="home"]').click();
    });
    await test('new customer text is rendered literally across intake and rental screens', async () => {
      await nav('intake'); await f.locator('[data-intake-action="representative"]').click();
      await f.locator('#ski-overlay [data-field="name"]').fill('<b>손님</b>'); await f.locator('[data-action="representative-done"]').click();
      await f.locator('[data-action="save"]').click(); await f.locator('#so-dialog [data-go="return-detail"]').click();
      assert.equal((await get('R-101')).customer.name, '<b>손님</b>');
      assert.match(await f.locator('#so-page h1').innerText(), /<b>손님<\/b>/);
      assert.equal(await f.locator('#so-page h1 b').count(), 0);
      await nav('rentals'); await f.locator('[data-search="rentals"]').fill('손님');
      assert.match(await f.locator('#so-rental-rows td').first().innerText(), /<b>손님<\/b>/);
      assert.equal(await f.locator('#so-rental-rows td:first-child b').count(), 0);
    });
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    fs.mkdirSync('work', { recursive: true }); fs.writeFileSync('work/smoke-returns-ui.json', JSON.stringify({ checks, errors, nonGetRequests: writes }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
