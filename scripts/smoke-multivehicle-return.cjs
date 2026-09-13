const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: process.env.SKI_CHROME_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const output = process.env.SKI_MULTIVEHICLE_OUTPUT || 'work/multivehicle-return';
  const checks = [], errors = [], writes = [];
  let frame;
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  fs.mkdirSync(output, { recursive: true });
  const click = name => frame.getByRole('button', { name, exact: true }).click();
  const detail = () => frame.evaluate(() => { SkiOps.state.tabs.rental = 'return'; SkiOps.go('rental', { id: 'R-021' }); });
  const order = () => frame.evaluate(() => SkiOps.workflow.projectOrder('R-021'));
  const dialog = () => frame.locator('.so-rental-overlay[role="dialog"]');
  const state = () => frame.evaluate(() => SkiOps.workflow.snap());
  const fresh = async () => {
    await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/', { waitUntil: 'networkidle' });
    frame = page.frames().find(f => f.parentFrame());
    await frame.evaluate(() => { SkiOps.state.authenticated = true; SkiOps.go('dispatch'); });
  };
  // Fixture assignment only. All collection, receipt and schedule changes below
  // use the same visible buttons as the counter operator.
  const assign = split => frame.evaluate(async split => {
    const S = SkiOps, F = S.workflow;
    const original = F.snap().tasks.find(t => t.customerId === 'R-021' && t.kind === 'collection' && t.status === 'waiting');
    const ids = original.assetIds;
    if (split) F.run('task.save', { ...F.taskPayload(original), assetIds: ids.slice(0, 1) });
    const stored = await S.returns.store.get('R-021');
    await S.returns.store.execute(S.returns.newCommand('assignVehicle', stored, { vehicleId: 'demo-van-2' }));
    F.orders.get('R-021').vehicleId = 'demo-van-2';
    const secondId = split ? 'multi-vehicle-collect' : original.id;
    F.run('task.save', { ...F.taskPayload(original), id: secondId, vehicleId: 'demo-van-2', assetIds: split ? ids.slice(1) : ids });
    const spare = F.run('stock.receive', { sku: 'helmet', quantity: 1 }).assetIds;
    F.run('stock.move', { kind: 'load', from: F.shop, to: { kind: 'vehicle', id: 'demo-van-2' }, assetIds: spare, purpose: 'spare' });
    S.render();
    return { ids, tasks: split ? [[original.id, 1], [secondId, 2]] : [[secondId, 2]], others: F.snap().assets.filter(a => !ids.includes(a.id)) };
  }, split);
  const collect = async fixture => {
    for (const [id, number] of fixture.tasks) {
      await frame.locator('[aria-label="담당 차량"]').getByRole('button', { name: new RegExp('^' + number + '호 차량') }).click();
      await frame.locator('[data-return-id="' + id + '"]').getByRole('button', { name: '모두 받음', exact: true }).click();
      await click('선택 수량 확인');
    }
  };
  const test = async (name, run) => { await fresh(); await run(); checks.push(name); console.log('PASS ' + name); };
  try {
    await test('second vehicle receipt succeeds from the rental detail and preserves unrelated inventory', async () => {
      const fixture = await assign(false);
      await collect(fixture); await detail();
      assert.equal((await order()).totals.vehicleQuantity, fixture.ids.length);
      await click('차량 인수분 최종 확인'); await click('매장 확인 완료');
      assert.equal(await dialog().count(), 0);
      assert.equal((await order()).totals.vehicleQuantity, 0);
      assert.equal((await order()).totals.shopQuantity, fixture.ids.length);
      const after = await state();
      assert.deepEqual(after.assets.filter(a => !fixture.ids.includes(a.id)), fixture.others);
      assert.ok(after.assets.filter(a => fixture.ids.includes(a.id)).every(a => a.location.kind === 'shop'));
      await page.screenshot({ path: output + '/second-vehicle-received.png' });
    });
    await test('one customer split across two vehicles is received together and corrections restore the original vehicle', async () => {
      const fixture = await assign(true);
      await collect(fixture); await detail();
      const before = await state();
      assert.deepEqual([...new Set(before.assets.filter(a => fixture.ids.includes(a.id)).map(a => a.location.id))].sort(), ['demo-van-1', 'demo-van-2']);
      await click('차량 인수분 최종 확인'); await click('매장 확인 완료');
      assert.equal(await dialog().count(), 0);
      const after = await state();
      assert.equal((await order()).totals.vehicleQuantity, 0);
      assert.equal((await order()).totals.shopQuantity, fixture.ids.length);
      assert.deepEqual(after.assets.filter(a => !fixture.ids.includes(a.id)), fixture.others);
      const received = await frame.evaluate(ids => SkiOps.workflow.store.history().movements.filter(m => m.kind === 'receive' && m.assetIds.some(id => ids.includes(id))), fixture.ids);
      assert.deepEqual(received.map(m => [m.from.id, m.assetIds.length]).sort(), [['demo-van-1', 1], ['demo-van-2', 4]]);
      await click('수량 정정'); await click('스키 수량 늘리기'); await click('스키 수량 늘리기'); await click('정정 저장');
      assert.equal(await dialog().count(), 0);
      const corrected = await state();
      for (const id of fixture.ids.slice(0, 2)) assert.deepEqual(corrected.assets.find(a => a.id === id).location, before.assets.find(a => a.id === id).location);
      assert.equal((await order()).totals.vehicleQuantity, 2);
      assert.equal((await order()).totals.shopQuantity, fixture.ids.length - 2);
    });
    await test('a stale multi-vehicle receipt leaves all current quantities unchanged', async () => {
      const fixture = await assign(true);
      await collect(fixture); await detail(); await click('차량 인수분 최종 확인');
      const before = await frame.evaluate(() => {
        const F = SkiOps.workflow;
        F.run('stock.receive', { sku: 'helmet', quantity: 1 });
        return F.snap();
      });
      await click('매장 확인 완료');
      assert.match(await dialog().getByRole('alert').innerText(), /수량이나 일정이 변경/);
      assert.deepEqual(await state(), before);
      assert.equal((await order()).totals.vehicleQuantity, fixture.ids.length);
      await page.screenshot({ path: output + '/stale-receipt-rejected.png' });
    });
    await test('failed second-vehicle receipt rolls back the earlier vehicle in the same operation', async () => {
      const fixture = await assign(true);
      await collect(fixture); await detail(); await click('차량 인수분 최종 확인');
      const before = await state();
      // Inject a failure at the domain boundary without changing application
      // state, to verify that the UI uses one transaction for both vehicles.
      await frame.evaluate(() => {
        const W = SkiWorkflows, execute = W.execute;
        window.restoreReceiptExecute = () => { W.execute = execute; };
        W.execute = (state, command, context) => {
          if (command.type === 'stock.move' && command.payload.kind === 'receive' && command.payload.from.id === 'demo-van-2') throw new Error('검사용 두 번째 차량 입고 실패');
          return execute(state, command, context);
        };
      });
      await click('매장 확인 완료');
      assert.match(await dialog().getByRole('alert').innerText(), /두 번째 차량 입고 실패/);
      assert.deepEqual(await state(), before);
      await frame.evaluate(() => { restoreReceiptExecute(); delete window.restoreReceiptExecute; });
      await click('매장 확인 완료');
      assert.equal(await dialog().count(), 0);
      assert.equal((await order()).totals.vehicleQuantity, 0);
    });
    await test('whole-order schedule changes preserve split vehicle assignments', async () => {
      const fixture = await assign(true);
      const before = await state();
      const assignments = Object.fromEntries(before.tasks.filter(t => fixture.tasks.some(([id]) => id === t.id)).flatMap(t => t.assetIds.map(id => [id, t.vehicleId])));
      await detail(); await click('반납 일정 변경');
      const tomorrow = await frame.evaluate(() => SkiOps.data.day(1));
      await dialog().getByLabel('반납일', { exact: true }).fill(tomorrow); await click('저장');
      assert.equal(await dialog().count(), 0);
      const after = await state();
      const tasks = after.tasks.filter(t => t.customerId === 'R-021' && t.kind === 'collection' && t.status === 'waiting');
      assert.equal(tasks.length, 2);
      assert.ok(tasks.every(t => t.date === tomorrow));
      assert.deepEqual(Object.fromEntries(tasks.flatMap(t => t.assetIds.map(id => [id, t.vehicleId]))), assignments);
      assert.deepEqual(after.assets, before.assets);
    });
    await test('switching a second-vehicle item to direct and back retains its assigned vehicle', async () => {
      await assign(false); await detail();
      for (const method of ['직접반납', '차량 수거']) {
        await frame.getByRole('button', { name: '예정 변경', exact: true }).first().click();
        await dialog().getByLabel('반납 방법', { exact: true }).selectOption(method);
        await dialog().getByRole('button', { name: '예정 변경', exact: true }).click();
        assert.equal(await dialog().count(), 0);
      }
      const tasks = (await state()).tasks.filter(t => t.customerId === 'R-021' && t.kind === 'collection' && t.status === 'waiting');
      assert.ok(tasks.length > 0 && tasks.every(t => t.vehicleId === 'demo-van-2'));
    });
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    fs.writeFileSync(output + '/result.json', JSON.stringify({ checks, errors, writes }, null, 2));
    console.log(checks.length + ' multi-vehicle return scenarios passed');
  } catch (error) {
    fs.writeFileSync(output + '/result.json', JSON.stringify({ checks, errors, writes, failure: error.stack }, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
