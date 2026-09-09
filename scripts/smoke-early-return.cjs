const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(10000); let frame; const errors = [], checks = []; page.on('pageerror', e => errors.push(e.message));
  const click = name => frame.getByRole('button', { name, exact: true }).click();
  const fresh = async () => { await page.setViewportSize({ width: 1366, height: 900 }); await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58151/'); frame = page.frames().find(f => f.parentFrame()); await frame.evaluate(() => { SkiOps.state.authenticated = true; SkiOps.go('rental', { id: 'R-021' }); }); };
  const test = async (name, fn) => { await fresh(); await fn(); checks.push(name); console.log('PASS', name); };
  const order = () => frame.evaluate(() => ({ projection: SkiOps.workflow.projectOrder('R-021'), base: SkiOps.data.orders.find(o => o.id === 'R-021') }));
  const one = async () => { await click('일부 조기반납'); await frame.getByLabel('스키 조기반납', { exact: true }).check(); assert.equal(await frame.getByLabel('스키 조기반납 수량', { exact: true }).inputValue(), '2'); await frame.getByLabel('스키 조기반납 수량', { exact: true }).fill('1'); };
  try {
    await test('injured guest returns one of two skis at the shop and keeps other items, money and schedule', async () => {
      const before = await order(); await one(); await frame.getByLabel('조기반납 메모', { exact: true }).fill('부상으로 일행 1명만 먼저 반납'); await click('조기반납 저장');
      const after = await order(); assert.equal(after.projection.items.find(i => i.id === 'ski').customerQuantity, 1); assert.equal(after.projection.items.find(i => i.id === 'ski').shopQuantity, 1);
      assert.equal(after.projection.items.find(i => i.label === '의류').customerQuantity, 2); assert.equal(after.base.amount, before.base.amount); assert.equal(after.base.paid, before.base.paid); assert.equal(after.base.time, before.base.time);
      assert.match(await frame.locator('[aria-label="조기반납 내역"]').innerText(), /스키 1대.*부상/); await frame.getByRole('tab', { name: '변경 이력', exact: true }).click(); assert.match(await frame.locator('.so-rental-board').innerText(), /일행 1명만 먼저 반납/);
    });
    await test('one ski is collected at 13:00 while its companion retains 16:30, including POS, vehicle and store handoff', async () => {
      const before = await order(); await one(); await frame.getByLabel('조기반납 방법', { exact: true }).selectOption('vehicle'); await frame.getByLabel('조기수거 장소', { exact: true }).fill('만선 티롤 앞'); await click('조기반납 저장');
      const data = await frame.evaluate(() => { const F = SkiOps.workflow, early = F.snap().earlyReturns.at(-1); return { early, original: F.snap().tasks.find(t => t.id === 'R-021-collect-0'), newTask: F.snap().tasks.find(t => t.id === early.taskIds[0]) }; });
      assert.equal(data.newTask.time, '13:00'); assert.equal(data.original.time, '16:30'); assert.equal(data.original.assetIds.length, 4); assert.equal(data.newTask.assetIds.length, 1);
      assert.equal((await order()).projection.totals.customerQuantity, 5); assert.match(await frame.locator('.so-rental-board').innerText(), /조기 1세트 · 9\/9 13:00/);
      await page.screenshot({ path: 'work/early-return-split.png' });
      await frame.evaluate(() => SkiOps.go('dispatch')); assert.match(await frame.locator('[data-visit-id="' + data.newTask.id + '"]').innerText(), /13:00.*조기반납.*부상/s);
      await frame.locator('.so-topbar-right [data-go="vehicle"]').click(); await frame.locator('[data-vehicle-job="' + data.newTask.id + '"]').click(); assert.match(await frame.locator('.so-vehicle-board').innerText(), /조기반납 · 스키 1대 · 부상/);
      await click('수거 완료'); await frame.locator('.so-vehicle-overlay').getByRole('button', { name: '수거 완료', exact: true }).click();
      let o = await order(); assert.equal(o.projection.items.find(i => i.id === 'ski').customerQuantity, 1); assert.equal(o.projection.items.find(i => i.id === 'ski').vehicleQuantity, 1); assert.equal(o.projection.items.find(i => i.id === 'ski').shopQuantity, 0);
      await click('매장 화면으로'); await frame.evaluate(() => SkiOps.go('rental', { id: 'R-021' })); await click('차량 인수분 최종 확인'); await click('매장 확인 완료');
      o = await order(); assert.equal(o.projection.items.find(i => i.id === 'ski').shopQuantity, 1); assert.equal(o.base.amount, before.base.amount); assert.equal(o.base.paid, before.base.paid);
      assert.match(await frame.locator('[aria-label="조기반납 내역"]').innerText(), /매장 확인 1\/1/);
      await click('일부 조기반납'); assert.equal(await frame.getByLabel('스키 조기반납 수량', { exact: true }).getAttribute('max'), '1');
    });
    await test('invalid or stale early-return input is rejected and the modal remains usable on a phone', async () => {
      await one(); await frame.getByLabel('조기반납 사유', { exact: true }).selectOption('other'); await click('조기반납 저장'); assert.match(await frame.locator('#wf-error').innerText(), /기타 사유/);
      await frame.getByLabel('조기반납 메모', { exact: true }).fill('개인 사정'); await frame.evaluate(() => SkiOps.workflow.run('stock.receive', { sku: 'helmet', quantity: 1 })); await click('조기반납 저장'); assert.match(await frame.locator('#wf-error').innerText(), /변경됐습니다/); assert.equal((await order()).projection.items.find(i => i.id === 'ski').customerQuantity, 2);
      await click('취소'); await one(); await page.setViewportSize({ width: 390, height: 740 }); assert.equal(await frame.getByRole('button', { name: '조기반납 저장', exact: true }).isVisible(), true); await page.screenshot({ path: 'work/early-return-phone.png' }); await page.keyboard.press('Escape'); assert.equal(await frame.locator('#so-dialog').isVisible(), false);
    });
    assert.deepEqual(errors, []); fs.writeFileSync('work/early-return-functional.json', JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
