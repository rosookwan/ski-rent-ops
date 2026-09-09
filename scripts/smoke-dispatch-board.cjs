const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: process.env.SKI_CHROME_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const url = process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/';
  const output = process.env.SKI_DISPATCH_OUTPUT || 'work/dispatch-ui-parity'; fs.mkdirSync(output, { recursive: true });
  const errors = [], writes = [], checks = []; let frame;
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (r.method() !== 'GET') writes.push(r.url()); });
  const fresh = async () => { await page.setViewportSize({ width: 1366, height: 768 }); await page.goto(url, { waitUntil: 'networkidle' }); frame = page.frames().find(f => f.parentFrame()); await frame.evaluate(() => { SkiOps.state.authenticated = true; SkiOps.go('dispatch'); }); await frame.evaluate(() => document.fonts.ready); };
  const click = name => frame.getByRole('button', { name, exact: true }).click();
  const dialog = () => frame.locator('.so-dispatch-overlay');
  const visits = () => frame.locator('[data-visit-id]');
  const vehicle = n => frame.locator('[aria-label="담당 차량"]').getByRole('button', { name: new RegExp('^' + n + '호 차량') }).click();
  const test = async (name, run) => { await fresh(); await run(); checks.push(name); console.log('PASS ' + name); };
  const fixture = async (partial = false) => frame.evaluate(partial => {
    const S = SkiOps, F = S.workflow, ids = F.run('stock.receive', { sku: 'ski', quantity: 2 }).assetIds;
    F.saveTask({ id: 'ui-load', kind: 'delivery', customerId: 'ui-customer', title: '적재 검사', assetIds: ids, date: S.data.today, time: '10:00', place: '만선 광장' });
    if (partial) F.run('stock.move', { kind: 'load', from: F.shop, to: F.van, assetIds: [ids[0]], purpose: 'delivery' });
    S.render(); return { ids, count: F.snap().assets.length };
  }, partial);
  try {
    await test('three source panels, vehicle/day filters, and empty states use the shared ledger', async () => {
      for (const name of ['매장 → 차량 · 필요한 물품 싣기', '차량 · 방문 순서', '수거 · 매장 인계']) assert.equal(await frame.getByRole('region', { name }).isVisible(), true);
      const original = await visits().count(); assert.ok(original > 0);
      await click('내일'); assert.ok(await visits().count() > 0);
      assert.equal(await frame.evaluate(() => SkiOps.dispatchBoard.context().date), await frame.evaluate(() => SkiOps.data.day(1)));
      await vehicle(2); assert.equal(await visits().count(), 0); assert.match(await frame.locator('.so-dispatch-board').innerText(), /방문 업무가 없습니다/);
      await click('오늘'); await vehicle(1); assert.equal(await visits().count(), original);
    });
    await test('registered rental is visible before loading and uses the same task after loading', async () => {
      const before = await frame.evaluate(() => ({ count: SkiOps.workflow.snap().assets.length, revision: SkiOps.workflow.snap().revision }));
      const planned = frame.locator('[data-load-id="R-022-delivery-equipment"]'); assert.match(await planned.innerText(), /박준호/);
      assert.equal(await frame.evaluate(() => SkiOps.workflow.snap().revision), before.revision);
      await planned.getByRole('button', { name: '실었어요' }).click();
      assert.equal(await planned.count(), 1);
      const after = await frame.evaluate(() => { const F = SkiOps.workflow; return { task: F.snap().tasks.find(t => t.orderId === 'R-022' && t.kind === 'delivery'), count: F.snap().assets.length }; });
      assert.equal(after.count, before.count); assert.equal(after.task.assetIds.length, 3);
      assert.match(await frame.locator('[data-load-id="' + after.task.id + '"]').innerText(), /실림/);
      assert.equal(await frame.locator('[data-visit-id="' + after.task.id + '"]').count(), 1);
    });
    await test('one-click team loading moves only assigned physical assets and cannot double count', async () => {
      const data = await fixture();
      const before = await frame.evaluate(() => SkiOps.workflow.snap().assets.filter(a => a.location.kind === 'vehicle').length);
      await frame.locator('[data-load-id="ui-load"]').getByRole('button', { name: '실었어요' }).click();
      assert.equal(await frame.locator('[data-load-id="ui-load"]').getByRole('button', { name: '실었어요' }).isVisible(), false);
      const after = await frame.evaluate(ids => ({ total: SkiOps.workflow.snap().assets.length, onboard: SkiOps.workflow.assets(ids).every(a => a.location.id === SkiOps.workflow.vehicleId), allVehicle: SkiOps.workflow.snap().assets.filter(a => a.location.kind === 'vehicle').length, task: SkiOps.workflow.snap().tasks.find(t => t.id === 'ui-load') }), data.ids);
      assert.equal(after.total, data.count); assert.ok(after.onboard); assert.equal(after.allVehicle, before + 2); assert.equal(after.task.status, 'waiting');
      await frame.evaluate(() => SkiOps.go('rentals')); await frame.evaluate(() => SkiOps.go('dispatch'));
      assert.match(await frame.locator('[data-load-id="ui-load"]').innerText(), /실림/);
    });
    await test('partial preload loads only what remains in the shop; stale loading is rejected', async () => {
      const data = await fixture(true);
      const before = await frame.evaluate(() => SkiOps.workflow.snap().assets.filter(a => a.location.kind === 'vehicle').length);
      await frame.locator('[data-load-id="ui-load"]').getByRole('button', { name: '실었어요' }).click();
      assert.equal(await frame.evaluate(() => SkiOps.workflow.snap().assets.filter(a => a.location.kind === 'vehicle').length), before + 1);
      assert.equal(await frame.evaluate(() => SkiOps.workflow.snap().assets.length), data.count);
      await fresh(); await fixture();
      const revision = await frame.evaluate(() => { SkiOps.workflow.run('stock.receive', { sku: 'helmet', quantity: 1 }); return SkiOps.workflow.snap().revision; });
      await frame.locator('[data-load-id="ui-load"]').getByRole('button', { name: '실었어요' }).click();
      assert.equal(await frame.evaluate(() => SkiOps.workflow.snap().revision), revision);
      assert.match(await frame.locator('#so-toast').innerText(), /변경됐습니다/);
    });
    await test('tickets held by another customer stay recovery-dependent until actually collected', async () => {
      const id = await frame.evaluate(() => SkiOps.dispatchBoard.snapshot().jobs.find(j => j.kind === 'liftDeliver').id);
      const card = frame.locator('[data-load-id="' + id + '"]');
      assert.match(await card.innerText(), /수거한 권으로 전달/); assert.equal(await card.getByRole('button', { name: '실었어요' }).isVisible(), false);
      const before = await frame.evaluate(() => SkiOps.workflow.snap().assets.length);
      await frame.evaluate(() => { const F = SkiOps.workflow, t = F.snap().tasks.find(t => t.customerId === 'morning' && t.kind === 'collection'); F.run('stock.move', { kind: 'collect', assetIds: F.remaining(t), from: { kind: 'customer', id: 'morning' }, to: F.van, taskId: t.id }, 'driver'); SkiOps.render(); });
      assert.match(await card.innerText(), /실림/); assert.equal(await frame.evaluate(() => SkiOps.workflow.snap().assets.length), before);
    });
    await test('order buttons preserve appointment times and priority remains independent of order restoration', async () => {
      const data = await frame.evaluate(() => { const F = SkiOps.workflow; return F.store.board({ vehicleId: F.vehicleId, date: SkiOps.data.today }).pending.map(t => ({ id: t.id, time: t.time })); });
      const second = frame.locator('[data-visit-id="' + data[1].id + '"]');
      await second.getByRole('button', { name: '위로', exact: true }).click();
      assert.equal(await frame.evaluate(() => { const F = SkiOps.workflow; return F.store.board({ vehicleId: F.vehicleId, date: SkiOps.data.today }).pending[0].id; }), data[1].id);
      assert.equal(await second.getAttribute('aria-pressed'), 'false'); await second.click();
      await frame.getByRole('button', { name: /팀 기사님께 알리기$/ }).click();
      await click('시간순 되돌리기');
      const after = await frame.evaluate(() => { const F = SkiOps.workflow; return { pending: F.store.board({ vehicleId: F.vehicleId, date: SkiOps.data.today }).pending.map(t => ({ id: t.id, time: t.time })), notices: SkiOps.notificationRuntime.driver.sync(0).records }; });
      assert.deepEqual(after.pending, data); assert.ok(after.notices.some(n => n.type === 'priority' && n.lifecycle === 'active')); assert.ok(after.notices.some(n => n.type === 'sequence' && n.lifecycle === 'active'));
    });
    await test('partial collection and shop handoff show current custody, not an assumed full return', async () => {
      const id = await frame.evaluate(() => { const F = SkiOps.workflow, task = F.snap().tasks.find(t => t.customerId === 'R-021' && t.status === 'waiting'); const assetId = F.remaining(task)[0]; F.run('stock.move', { kind: 'collect', assetIds: [assetId], from: { kind: 'customer', id: 'R-021' }, to: F.van, taskId: task.id }, 'driver'); SkiOps.render(); return { task: task.id, asset: assetId }; });
      assert.match(await frame.locator('[data-return-id="' + id.task + '"]').innerText(), /미수거 \d+ · 차에 1 · 매장 인계 0/);
      assert.match(await frame.locator('[data-visit-id="' + id.task + '"]').innerText(), /일부만 처리/);
      await frame.evaluate(id => { const F = SkiOps.workflow; F.run('stock.move', { kind: 'receive', assetIds: [id], from: F.van, to: F.shop }); SkiOps.render(); }, id.asset);
      assert.match(await frame.locator('[data-return-id="' + id.task + '"]').innerText(), /차에 0 · 매장 인계 1/);
    });
    await test('yesterday returns continue across several collect/unload trips without closing the day', async () => {
      const before = await frame.evaluate(() => {
        const S = SkiOps, F = S.workflow;
        F.run('catalog.add', { id: 'trip-ski', label: '왕복 스키', kind: 'equipment', unit: '개' });
        const ids = F.run('stock.opening', { sku: 'trip-ski', quantity: 4, location: { kind: 'customer', id: 'trip-customer' } }).assetIds;
        F.saveTask({ id: 'trip-collect', kind: 'collection', customerId: 'trip-customer', title: '전날 반납', assetIds: ids, date: S.data.day(-1), time: '18:00' });
        S.render(); return { ids, count: F.snap().assets.length, others: F.snap().assets.filter(a => !ids.includes(a.id)), tasks: F.snap().tasks.filter(t => t.id !== 'trip-collect') };
      });
      const card = frame.locator('[data-return-id="trip-collect"]');
      assert.match(await card.innerText(), /미수거 4 · 차에 0 · 매장 인계 0/);
      const collect = async n => { await card.getByRole('button', { name: '일부만 받음', exact: true }).click(); await frame.getByLabel('왕복 스키 수량', { exact: true }).fill(String(n)); await click('선택 수량 확인'); };
      const unload = async n => { await click('매장에 내리기'); await frame.getByLabel('왕복 스키 수량', { exact: true }).fill(String(n)); await click('선택 수량 확인'); };
      await collect(2); assert.match(await card.innerText(), /미수거 2 · 차에 2 · 매장 인계 0/);
      await unload(1); assert.match(await card.innerText(), /미수거 2 · 차에 1 · 매장 인계 1/);
      await unload(1); assert.match(await card.innerText(), /미수거 2 · 차에 0 · 매장 인계 2/);
      await page.screenshot({ path: path.join(output, 'repeat-trip-remaining.png') });
      await collect(2); assert.match(await card.innerText(), /미수거 0 · 차에 2 · 매장 인계 2/);
      assert.equal(await card.getByRole('button', { name: '일부만 받음', exact: true }).count(), 0);
      await unload(2); assert.equal(await card.count(), 0);
      const after = await frame.evaluate(ids => { const F = SkiOps.workflow; return { count: F.snap().assets.length, rows: F.assets(ids), others: F.snap().assets.filter(a => !ids.includes(a.id)), tasks: F.snap().tasks.filter(t => t.id !== 'trip-collect'), task: F.snap().tasks.find(t => t.id === 'trip-collect'), moves: F.store.history().movements.filter(m => ['collect', 'receive'].includes(m.kind) && m.assetIds.some(id => ids.includes(id))).map(m => [m.kind, m.assetIds.length]) }; }, before.ids);
      assert.equal(after.count, before.count); assert.ok(after.rows.every(a => a.location.kind === 'shop')); assert.equal(after.task.status, 'completed');
      assert.deepEqual(after.others, before.others); assert.deepEqual(after.tasks, before.tasks);
      assert.deepEqual(after.moves, [['collect', 2], ['receive', 1], ['receive', 1], ['collect', 2], ['receive', 2]]);
      await frame.evaluate(id => { const F = SkiOps.workflow; F.saveTask({ id: 'reload-delivery', kind: 'delivery', customerId: 'reload-customer', title: '다음 고객', date: SkiOps.data.today, time: '18:00', place: '스키장', assetIds: [id] }); SkiOps.render(); }, before.ids[0]);
      await frame.locator('[data-load-id="reload-delivery"]').getByRole('button', { name: '실었어요' }).click();
      const oldReturn = await frame.evaluate(() => SkiOps.dispatchBoard.snapshot().jobs.find(j => j.id === 'trip-collect'));
      assert.equal(oldReturn.inCar, 0); assert.equal(oldReturn.received, 4); assert.equal(await card.count(), 0);
    });
    await test('received selections and all-received shortcut preserve the unselected customer items', async () => {
      const task = await frame.evaluate(() => SkiOps.workflow.snap().tasks.find(t => t.customerId === 'R-021' && t.status === 'waiting').id);
      const card = frame.locator('[data-return-id="' + task + '"]'), modal = frame.locator('#so-dialog');
      await card.getByRole('button', { name: '일부만 받음', exact: true }).click();
      assert.equal(await modal.getByRole('button', { name: '선택 수량 확인' }).isDisabled(), true);
      await modal.getByRole('checkbox', { name: '스키 받음', exact: true }).check();
      assert.equal(await modal.getByRole('spinbutton', { name: '스키 수량', exact: true }).inputValue(), '2');
      await modal.getByRole('button', { name: '스키 줄이기', exact: true }).click();
      await click('선택 수량 확인');
      const partial = await frame.evaluate(() => SkiOps.workflow.projectOrder('R-021'));
      assert.equal(partial.items.find(i => i.label === '스키').customerQuantity, 1);
      assert.equal(partial.items.find(i => i.label === '의류').customerQuantity, 2);
      await card.getByRole('button', { name: '모두 받음', exact: true }).click();
      assert.equal(await modal.getByRole('spinbutton', { name: '스키 수량', exact: true }).inputValue(), '1');
      await click('선택 수량 확인');
      const done = await frame.evaluate(() => SkiOps.workflow.projectOrder('R-021'));
      assert.equal(done.totals.customerQuantity, 0); assert.equal(done.totals.vehicleQuantity, 5); assert.equal(done.totals.shopQuantity, 0);
      await click('추가로 싣기');
      assert.equal(await modal.getByRole('spinbutton', { name: /스키|보드|의류|헬멧/ }).count(), 0);
      assert.ok(await modal.getByRole('spinbutton', { name: /시간권/ }).count() > 0);
    });
    await test('ticket-only reloads use the selected vehicle and preserve existing cargo and tasks', async () => {
      const before = await frame.evaluate(() => {
        const S = SkiOps, F = S.workflow, sku = 'trip-ticket';
        F.run('catalog.add', { id: sku, label: '추가 리프트권', kind: 'liftTicket', unit: '매', hours: 3 });
        const ids = F.run('stock.opening', { sku, quantity: 3, location: F.shop, ticket: { validFrom: S.data.today + 'T00:00:00+09:00', validTo: S.data.day(1) + 'T23:59:59+09:00', acceptedTypes: [sku], transferable: false, vendorId: 'resort' } }).assetIds;
        F.run('stock.opening', { sku: 'ski', quantity: 2, location: { kind: 'vehicle', id: 'demo-van-2' } });
        S.render(); return { ids, count: F.snap().assets.length, others: F.snap().assets.filter(a => !ids.includes(a.id)), tasks: F.snap().tasks };
      });
      await vehicle(2);
      for (const n of [1, 2]) { await click('추가로 싣기'); assert.match(await frame.locator('#so-dialog').innerText(), /2호 차량 · 추가로 싣기/); await frame.getByLabel('추가 리프트권 수량', { exact: true }).fill(String(n)); await click('선택 수량 확인'); }
      const loaded = await frame.evaluate(ids => { const F = SkiOps.workflow; return { count: F.snap().assets.length, rows: F.assets(ids), others: F.snap().assets.filter(a => !ids.includes(a.id)), tasks: F.snap().tasks }; }, before.ids);
      assert.equal(loaded.count, before.count); assert.ok(loaded.rows.every(a => a.location.id === 'demo-van-2'));
      assert.deepEqual(loaded.others, before.others); assert.deepEqual(loaded.tasks, before.tasks);
      await click('매장에 내리기'); await frame.getByLabel('추가 리프트권 수량', { exact: true }).fill('1'); await click('선택 수량 확인');
      assert.equal(await frame.evaluate(ids => SkiOps.workflow.assets(ids).filter(a => a.location.kind === 'vehicle').length, before.ids), 2);
      assert.deepEqual(await frame.evaluate(ids => SkiOps.workflow.snap().assets.filter(a => !ids.includes(a.id)), before.ids), before.others);
    });
    await test('opening returns do not reappear after shop receipt followed by a new load', async () => {
      const result = await frame.evaluate(() => {
        const S = SkiOps, F = S.workflow, initial = S.dispatchBoard.snapshot().jobs.find(j => j.id.startsWith('initial-'));
        const asset = F.orders.get(initial.id.replace('initial-', '')).bindings.flatMap(b => b.initialVehicleAssetIds)[0];
        F.run('stock.move', { kind: 'receive', from: F.van, to: F.shop, assetIds: [asset] });
        F.run('stock.move', { kind: 'load', from: F.shop, to: F.van, assetIds: [asset] }); S.render();
        return { before: initial.inCar, after: S.dispatchBoard.snapshot().jobs.find(j => j.id === initial.id)?.inCar || 0 };
      });
      assert.equal(result.after, result.before - 1);
    });
    await test('transfer picker rejects stale quantities without moving other cargo', async () => {
      await click('매장에 내리기'); await click('모두 선택');
      const before = await frame.evaluate(() => { const F = SkiOps.workflow; F.run('stock.receive', { sku: 'ski', quantity: 1 }); return F.snap().assets; });
      await click('선택 수량 확인');
      assert.match(await frame.locator('#wf-error').innerText(), /변경됐습니다/);
      assert.deepEqual(await frame.evaluate(() => SkiOps.workflow.snap().assets), before);
      await click('취소');
    });
    await test('purpose changes preserve quantity and location and refund cancellation keeps physical tickets', async () => {
      const initial = await frame.evaluate(() => SkiOps.workflow.snap().assets.map(a => [a.id, a.location]));
      await frame.getByRole('button', { name: /용도 바꾸기/ }).click();
      const spare = await frame.evaluate(() => SkiOps.dispatchBoard.snapshot().lifts.find(l => l.vehicleId === 'v1' && l.purpose === 'spare').id);
      await dialog().locator('[data-lift-id="' + spare + '"]').getByRole('button', { name: '고객 전달', exact: true }).click();
      assert.equal(await dialog().locator('[data-lift-id="' + spare + '"]').getByRole('button', { name: '고객 전달', exact: true }).getAttribute('aria-pressed'), 'true');
      const refund = await frame.evaluate(() => SkiOps.dispatchBoard.snapshot().lifts.find(l => l.vehicleId === 'v1' && l.refundId));
      await dialog().locator('[data-lift-id="' + refund.id + '"]').getByRole('button', { name: '차량 예비분', exact: true }).click();
      assert.equal(await frame.evaluate(id => SkiOps.workflow.snap().refunds.find(r => r.id === id).remainingQuantity, refund.refundId), 0);
      assert.deepEqual(await frame.evaluate(() => SkiOps.workflow.snap().assets.map(a => [a.id, a.location])), initial);
    });
    await test('refund purpose uses the existing assignment workflow and never fabricates a payout', async () => {
      const group = await frame.evaluate(() => SkiOps.dispatchBoard.snapshot().lifts.find(l => l.vehicleId === 'v1' && l.purpose === 'spare'));
      const initial = await frame.evaluate(() => SkiOps.workflow.snap().assets.map(a => [a.id, a.location]));
      await frame.getByRole('button', { name: /용도 바꾸기/ }).click();
      await dialog().locator('[data-lift-id="' + group.id + '"]').getByRole('button', { name: '환불할 권', exact: true }).click();
      assert.equal(await dialog().count(), 0); assert.equal(await frame.locator('#so-dialog').evaluate(d => d.open), true);
      await frame.locator('[data-action="wf-pick-all"]').click(); await frame.locator('[data-action="wf-pick-apply"]').click();
      const refund = await frame.evaluate(id => SkiOps.workflow.snap().refunds.find(r => r.assetIds.includes(id)), group.id);
      assert.equal(refund.remainingQuantity, group.qty); assert.equal(refund.amountWon, 0);
      assert.deepEqual(await frame.evaluate(() => SkiOps.workflow.snap().assets.map(a => [a.id, a.location])), initial);
    });
    await test('stale purpose popup cannot edit items that have left the vehicle', async () => {
      await frame.getByRole('button', { name: /용도 바꾸기/ }).click();
      const group = await frame.evaluate(() => SkiOps.dispatchBoard.snapshot().lifts.find(l => l.vehicleId === 'v1' && l.purpose === 'spare'));
      const revision = await frame.evaluate(ids => { const F = SkiOps.workflow; F.run('stock.move', { kind: 'receive', assetIds: ids, from: F.van, to: F.shop }); return F.snap().revision; }, group.assetIds);
      await dialog().locator('[data-lift-id="' + group.id + '"]').getByRole('button', { name: '고객 전달', exact: true }).click();
      assert.match(await dialog().getByRole('alert').innerText(), /변경됐습니다/); assert.equal(await frame.evaluate(() => SkiOps.workflow.snap().revision), revision);
    });
    await test('keyboard selection and modal isolation survive escape and navigation', async () => {
      const row = visits().first(); await row.focus(); await page.keyboard.press('Enter'); assert.equal(await row.getAttribute('aria-pressed'), 'true');
      await frame.getByRole('button', { name: /용도 바꾸기/ }).click(); assert.equal(await frame.locator('.so-topbar').evaluate(el => el.inert), true);
      await page.keyboard.press('Escape'); assert.equal(await dialog().count(), 0); assert.equal(await frame.locator('.so-topbar').evaluate(el => el.inert), false);
      await frame.getByRole('button', { name: /용도 바꾸기/ }).click(); await frame.evaluate(() => SkiOps.go('rentals'));
      assert.equal(await frame.locator('.so-sidebar').evaluate(el => el.inert), false);
      await frame.locator('#so-navigation [data-go="dispatch"]').click(); assert.equal(await dialog().count(), 0);
    });
    await test('existing management date, completion, cancellation and vehicle navigation remain reachable', async () => {
      await fixture(); await click('업무 관리');
      assert.equal(await frame.getByLabel('조회 날짜', { exact: true }).isVisible(), true);
      await click('완료 내역 보기'); assert.equal(await frame.getByRole('button', { name: '남은 업무 보기', exact: true }).isVisible(), true);
      await click('남은 업무 보기');
      await frame.locator('#so-dialog .wf-row').filter({ hasText: '적재 검사' }).getByRole('button', { name: '업무 취소', exact: true }).click();
      await click('업무 취소'); assert.equal(await frame.locator('[data-visit-id="ui-load"]').count(), 0);
      await click('업무 관리'); await frame.getByLabel('조회 날짜', { exact: true }).fill(await frame.evaluate(() => SkiOps.data.day(1)));
      const t = await frame.evaluate(() => { const F = SkiOps.workflow; return F.store.board({ vehicleId: F.vehicleId, date: SkiOps.data.day(1) }).pending[0].id; });
      await frame.locator('#so-dialog [data-action="dispatch-task"][data-id="' + t + '"]').click();
      assert.equal(await frame.locator('#ski-ops').getAttribute('data-page'), 'vehicle');
      assert.equal(await frame.locator('[data-vehicle-job="' + t + '"]').isVisible(), true);
    });
    await test('literal customer text stays escaped and POS layouts contain overflow', async () => {
      await frame.evaluate(() => { const F = SkiOps.workflow; const ids = F.run('stock.receive', { sku: 'ski', quantity: 1 }).assetIds; F.saveTask({ id: 'unsafe-name', kind: 'delivery', customerId: 'escaped', title: '<b>이름</b>', assetIds: ids }); SkiOps.render(); });
      assert.match(await frame.locator('[data-load-id="unsafe-name"]').innerText(), /<b>이름<\/b>/); assert.equal(await frame.locator('[data-load-id="unsafe-name"] b').count(), 0);
      await fresh();
      for (const [width, height] of [[1024, 768], [1366, 768], [1440, 900], [1920, 1080], [390, 740], [360, 740]]) {
        await page.setViewportSize({ width, height }); await frame.evaluate(() => document.fonts.ready);
        const size = await frame.evaluate(() => ({ w: innerWidth, sw: document.documentElement.scrollWidth, h: innerHeight, sh: document.documentElement.scrollHeight, font: document.fonts.check('16px Pretendard') }));
        assert.ok(size.sw <= width && size.sh <= height, JSON.stringify(size)); assert.ok(size.font);
        if (width === 1024) { await frame.getByRole('button', { name: /^수거·매장 인계/ }).click(); assert.equal(await frame.getByRole('region', { name: '수거 · 매장 인계' }).isVisible(), true); }
        await page.screenshot({ path: path.join(output, 'live-dispatch-' + width + '.png') });
      }
    });
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  } catch (error) { await page.screenshot({ path: path.join(output, 'functional-failure.png') }); throw error; }
  finally { fs.writeFileSync(path.join(output, 'functional.json'), JSON.stringify({ url, checks, errors, nonGetRequests: writes }, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
