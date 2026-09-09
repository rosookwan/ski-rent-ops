const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.setDefaultTimeout(8000);
  const errors = [], checks = []; page.on('pageerror', e => errors.push(e.message));
  let frame;
  const fresh = async () => { await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58151/', { waitUntil: 'networkidle' }); frame = page.frames().find(f => f.parentFrame()); await frame.evaluate(() => { SkiOps.state.authenticated = true; SkiOps.go('vehicle'); }); };
  const click = name => frame.getByRole('button', { name, exact: true }).click();
  const choose = id => frame.evaluate(id => SkiOps.vehicleBoard.selectTask(id), id);
  const order = () => frame.evaluate(() => SkiOps.workflow.projectOrder('R-021'));
  const test = async (name, fn) => { await fresh(); await fn(); checks.push(name); console.log('PASS ' + name); };
  try {
    await test('received selection starts empty and supports one of two, leaving other items and schedule', async () => {
      await choose('R-021-collect-0'); await click('일부만 받았어요');
      assert.equal(await frame.getByRole('button', { name: '선택 수량 저장' }).isDisabled(), true);
      await click('스키 받음'); await click('스키 수량 줄이기');
      assert.match(await frame.locator('.so-vehicle-overlay').innerText(), /받은 수량 1/);
      await click('선택 수량 저장');
      const o = await order(); assert.equal(o.items.find(i => i.label === '스키').customerQuantity, 1); assert.equal(o.totals.vehicleQuantity, 1); assert.equal(o.items.find(i => i.label === '의류').customerQuantity, 2);
      const task = await frame.evaluate(() => SkiOps.workflow.snap().tasks.find(t => t.id === 'R-021-collect-0'));
      assert.equal(task.time, '16:30'); assert.equal(task.status, 'waiting');
      await click('수거 완료'); await frame.locator('.so-vehicle-overlay').getByRole('button', { name: '수거 완료', exact: true }).click();
      assert.equal((await order()).totals.customerQuantity, 0); assert.equal((await order()).totals.vehicleQuantity, 5); assert.equal((await order()).totals.shopQuantity, 0);
      await frame.evaluate(() => SkiOps.go('rental', { id: 'R-021' })); await click('차량 인수분 최종 확인'); await click('매장 확인 완료'); assert.equal((await order()).totals.shopQuantity, 5);
    });
    await test('stale partial dialog cannot apply against new quantities', async () => {
      await choose('R-021-collect-0'); await click('일부만 받았어요'); await click('스키 받음');
      const before = await frame.evaluate(() => { SkiOps.workflow.run('stock.receive', { sku: 'helmet', quantity: 1 }); return SkiOps.workflow.snap().assets; });
      await click('선택 수량 저장'); assert.match(await frame.locator('.so-vehicle-overlay [role="alert"]').innerText(), /변경됐습니다/);
      assert.deepEqual(await frame.evaluate(() => SkiOps.workflow.snap().assets), before);
    });
    await test('uncollected tickets cannot be delivered and collection enables the correct next customer', async () => {
      const delivery = await frame.evaluate(() => SkiOps.workflow.snap().tasks.find(t => t.kind === 'delivery' && t.customerId === 'afternoon').id);
      await choose(delivery); assert.equal(await frame.getByRole('button', { name: '전달 완료', exact: true }).isDisabled(), true);
      await choose('morning-collect'); await click('수거 완료'); await frame.locator('.so-vehicle-overlay').getByRole('button', { name: '수거 완료', exact: true }).click();
      await choose(delivery); assert.equal(await frame.getByRole('button', { name: '전달 완료', exact: true }).isDisabled(), false);
      await click('전달 완료'); await frame.locator('.so-vehicle-overlay').getByRole('button', { name: '전달 완료', exact: true }).click();
      assert.equal(await frame.evaluate(id => SkiOps.workflow.snap().tasks.find(t => t.id === id).status, delivery), 'completed');
    });
    await test('bell stays connected after screen switches and acknowledgement changes no stock', async () => {
      const before = await frame.evaluate(() => SkiOps.workflow.snap().assets);
      await frame.locator('[aria-label="매장에서 보낸 변경·확인 요청"]').getByRole('button', { name: '확인했어요', exact: true }).first().click();
      assert.deepEqual(await frame.evaluate(() => SkiOps.workflow.snap().assets), before);
      await frame.locator('#so-notice-bell').click(); assert.equal(await frame.locator('#so-notice-dialog').isVisible(), true);
      await frame.locator('#so-notice-dialog [data-notice="close"]').click();
      await click('매장 화면으로'); assert.equal(await frame.locator('#so-notice-bell').count(), 1); await frame.evaluate(() => SkiOps.go('vehicle')); assert.equal(await frame.locator('[data-vehicle-bell] #so-notice-bell').count(), 1);
    });
    await test('calendar, stock, filtering and keyboard modal controls use the original layout', async () => {
      await click('보관 내역 자세히'); assert.equal(await frame.locator('[aria-label="차량 보관 내역"]').isVisible(), true); await click('업무 화면으로');
      await click('달력'); await frame.getByLabel('조회 날짜', { exact: true }).fill('2026-09-12');
      assert.match(await frame.locator('.so-vehicle-board').innerText(), /9\/12/);
      await click('오늘'); await choose('R-021-collect-0'); await click('일부만 받았어요'); await page.keyboard.press('Escape'); assert.equal(await frame.locator('.so-vehicle-overlay').count(), 0);
      for (const width of [1024, 1366, 1440, 1920]) { await page.setViewportSize({ width, height: 768 }); const size = await frame.locator('[aria-label="업무 목록"]').evaluate(el => el.parentElement.getBoundingClientRect().width); assert.equal(size, 330); }
    });
    assert.deepEqual(errors, []); fs.mkdirSync('work/vehicle-ui-parity', { recursive: true }); fs.writeFileSync('work/vehicle-ui-parity/functional.json', JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
