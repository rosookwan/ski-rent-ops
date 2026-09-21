const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: process.env.SKI_CHROME_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  const output = process.env.SKI_FULFILLMENT_OUTPUT || 'work/pos-fulfillment';
  const uiRules = require('./pos-ui-rules.cjs').recorder('fulfillment');
  const checks = [], errors = [], writes = [], layouts = [];
  let frame;
  fs.mkdirSync(output, { recursive: true });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  const click = async text => {
    const scoped = frame.locator('#so-dialog[open]').getByRole('button', { name: text, exact: true });
    return (await scoped.count() ? scoped : frame.getByRole('button', { name: text, exact: true })).click();
  };
  const action = (name, id) => frame.locator('[data-action="' + name + '"]' + (id ? '[data-id="' + id + '"]' : ''));
  const dialog = () => frame.locator('#so-dialog[open]');
  const order = (id = 'pos-smoke') => frame.evaluate(id => SkiOps.posData.order(id), id);
  const snapshot = () => frame.evaluate(() => SkiOps.posData.snapshot);
  const go = (route, id = 'pos-smoke') => frame.evaluate(({ route, id }) => SkiOps.go(route, { id }), { route, id });
  const fresh = async () => {
    await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/', { waitUntil: 'networkidle' });
    frame = page.frames().find(frame => frame.parentFrame());
    await frame.waitForFunction(() => !!window.SkiOps?.posData?.snapshot && !!window.SkiOps?.posFulfillment && !!window.SkiWorkflowOrderOperations);
    if (await action('login-shop').count()) await action('login-shop').click();
  };
  // Only initial data uses commands directly. The action under test is always
  // performed with the actual POS controls in the built application.
  const fixture = async (lines = [{ id: 'ski-today', sku: 'ski', quantity: 2 }, { id: 'coat-today', sku: 'clothing', quantity: 1 }]) => frame.evaluate(async lines => {
    const D = SkiOps.posData, today = D.today, tomorrow = SkiWorkflowCommon.nextDate(today);
    await D.execute('stock.receive', { sku: 'ski', quantity: 15, size: '160' });
    await D.execute('stock.receive', { sku: 'clothing', quantity: 10, size: 'L' });
    await D.execute('order.create', { id: 'pos-smoke', customer: { name: '포스 검증 팀', phone: '010-1111-2222' }, people: [{ id: 'first-person', name: '첫 일행' }, { id: 'late-person', name: '늦은 일행' }],
      batch: { id: 'first-batch', lines: lines.map(line => ({ personId: line.tomorrow ? 'late-person' : 'first-person', start: line.tomorrow ? tomorrow : today, end: line.tomorrow ? tomorrow : today,
        price: { unitWon: 10000 }, ...Object.fromEntries(Object.entries(line).filter(([key]) => key !== 'tomorrow')) })) } });
    SkiOps.go('order-detail', { id: 'pos-smoke' });
  }, lines);
  async function layout(name) {
    const result = await frame.evaluate(() => {
      const modal = document.querySelector('#so-dialog[open]'), scope = modal || document.querySelector('#so-page');
      const selector = modal ? 'h2,input,select,.pos-modal-footer button,.pos-info,.pos-error:not([hidden])' : '.pos-page-heading,.pos-page-footer,.pos-pager,.pos-row,.pos-fulfillment-toolbar,.pos-fulfillment-tabs,.pos-error:not([hidden])';
      const outside = [...scope.querySelectorAll(selector)].filter(element => element.getClientRects().length).map(element => ({ text: element.textContent.trim().slice(0, 80), box: element.getBoundingClientRect().toJSON() }))
        .filter(({ box }) => box.top < -1 || box.left < -1 || box.bottom > innerHeight + 1 || box.right > innerWidth + 1);
      const scroll = [...scope.querySelectorAll('*'), scope].filter(element => !element.hasAttribute('data-pos-scroll') && element.clientHeight && element.scrollHeight > element.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY))
        .map(element => element.className || element.id);
      const body = modal?.querySelector('.pos-modal-body');
      if (body && body.scrollHeight > body.clientHeight + 2) scroll.push('pos-modal-body content overflow');
      return { width: innerWidth, height: innerHeight, outside, scroll };
    });
    layouts.push({ name, ...result }); assert.deepEqual(result.outside, [], name + ': content outside viewport'); assert.deepEqual(result.scroll, [], name + ': core needs scrolling'); await uiRules.add(name, frame);
  }
  const test = async (name, run) => { if (process.env.SKI_FULFILLMENT_FILTER && !new RegExp(process.env.SKI_FULFILLMENT_FILTER).test(name)) return; await fresh(); await run(); checks.push(name); console.log('PASS ' + name); };
  const openCorrection = async movementId => {
    for (let index = 0; index < 20 && !await action('pos-correct-movement', movementId).count(); index++) await click('다음');
    await action('pos-correct-movement', movementId).click();
  };
  try {
    await test('direct issue and full direct return use actual custody; full return takes two clicks and no typing', async () => {
      await fixture(); await click('준비·지급하기'); await layout('issue-600');
      await click('선택 물품 지급 확정'); assert.equal((await order()).totals.customerQuantity, 3);
      let clicks = 0; await click('모두 받음'); clicks++; await layout('return-confirm-600');
      assert.equal(await dialog().locator('input,select,textarea').count(), 0);
      await click('모두 반납 확정'); clicks++;
      const result = await order(); assert.equal(clicks, 2); assert.equal(result.totals.customerQuantity, 0); assert.equal(result.totals.shopQuantity, 3); assert.equal(result.totals.issuedQuantity, 3);
      await page.screenshot({ path: output + '/direct-return-complete.png' });
    });
    await test('next-day additions stay unissued and partial return affects only the chosen repeated-SKU line', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 2 }, { id: 'ski-tomorrow', sku: 'ski', quantity: 1, tomorrow: true }]);
      await click('준비·지급하기');
      assert.equal(await action('pos-fulfillment-step', 'ski-tomorrow').first().locator('..').getByLabel('선택 수량').innerText(), '0');
      await click('선택 물품 지급 확정'); assert.equal((await order()).lines.find(line => line.id === 'ski-tomorrow').unissuedQuantity, 1);
      await click('일부만 받음'); await action('pos-fulfillment-step', 'ski-today').filter({ hasText: '+' }).click(); await click('받은 수량 반납 확정');
      const result = await order(); assert.equal(result.lines[0].customerQuantity, 1); assert.equal(result.lines[0].shopQuantity, 1); assert.equal(result.lines[1].unissuedQuantity, 1); assert.equal(result.lines[1].issuedQuantity, 0);
    });
    await test('one order collected in two vehicles is received together without moving unrelated vehicle assets', async () => {
      await fixture(); await click('준비·지급하기'); await click('선택 물품 지급 확정');
      const initial = await frame.evaluate(async () => {
        const D = SkiOps.posData, order = D.order('pos-smoke'), ski = order.lines[0], coat = order.lines[1];
        await D.execute('ops.return', { orderId: order.id, mode: 'collect', vehicleId: 'demo-van-1', lineItems: [{ lineId: ski.id, assetIds: ski.customerAssetIds }] });
        await D.execute('ops.return', { orderId: order.id, mode: 'collect', vehicleId: 'demo-van-2', lineItems: [{ lineId: coat.id, assetIds: coat.customerAssetIds }] });
        const ids = [...ski.customerAssetIds, ...coat.customerAssetIds];
        SkiOps.render(); return { ids, others: D.snapshot.assets.filter(asset => !ids.includes(asset.id)) };
      });
      await click('차량에서 받은 물품 입고'); assert.match(await dialog().innerText(), /1호 차량/); assert.match(await dialog().innerText(), /2호 차량/); await layout('multi-vehicle-confirm-600');
      await click('매장 입고 확정'); const result = await snapshot();
      assert.equal((await order()).totals.vehicleQuantity, 0); assert.equal((await order()).totals.shopQuantity, 3);
      assert.deepEqual(result.assets.filter(asset => !initial.ids.includes(asset.id)), initial.others);
      await page.screenshot({ path: output + '/two-vehicle-received.png' });
    });
    await test('a changed revision rejects stale confirmation with all current data unchanged', async () => {
      await fixture(); await click('준비·지급하기'); await click('선택 물품 지급 확정'); await click('모두 받음');
      const before = await frame.evaluate(async () => { await SkiOps.posData.execute('stock.receive', { sku: 'helmet', quantity: 1 }); return SkiOps.posData.snapshot; });
      await click('모두 반납 확정'); assert.match(await dialog().getByRole('alert').innerText(), /다른 처리|최신 수량/); await layout('stale-error-600'); assert.deepEqual(await snapshot(), before);
    });
    await test('a returned asset reused by a later line is returned only for that later issue', async () => {
      await fixture([{ id: 'original-ski', sku: 'ski', quantity: 1 }]); await click('준비·지급하기'); await click('선택 물품 지급 확정');
      await frame.evaluate(async () => {
        const D = SkiOps.posData, line = D.order('pos-smoke').lines[0], assetIds = line.customerAssetIds;
        await D.execute('ops.return', { orderId: 'pos-smoke', mode: 'direct', lineItems: [{ lineId: line.id, assetIds }] });
        await D.execute('order.add', { orderId: 'pos-smoke', batch: { id: 'late-batch', lines: [{ id: 'late-ski', sku: 'ski', quantity: 1, start: D.today, end: D.today, price: { unitWon: 20000 } }] } });
        await D.execute('ops.issue', { orderId: 'pos-smoke', lineItems: [{ lineId: 'late-ski', assetIds }] }); SkiOps.render();
      });
      await click('모두 받음'); assert.match(await dialog().locator('#so-dialog-title').innerText(), /반납 확인 1개/); await click('모두 반납 확정');
      const result = await order(); assert.equal(result.lines[0].shopQuantity, 1); assert.equal(result.lines[1].shopQuantity, 1); assert.equal(result.totals.issuedQuantity, 2);
    });
    await test('500 order lines paginate without losing quantity selections or scrolling at 600 and 768 pixels', async () => {
      await fixture(Array.from({ length: 500 }, (_, index) => ({ id: 'line-' + index, sku: 'ski', quantity: 1 })));
      await click('준비·지급하기'); await click('수량 설정'); await click('선택 초기화'); await action('pos-fulfillment-step', 'line-0').filter({ hasText: '+' }).click();
      await click('다음'); await layout('500-lines-page-2-600'); await click('이전');
      assert.equal(await action('pos-fulfillment-step', 'line-0').first().locator('..').getByLabel('선택 수량').innerText(), '1');
      await page.screenshot({ path: output + '/500-lines-600.png' });
      await page.setViewportSize({ width: 1024, height: 768 }); await frame.waitForFunction(() => innerHeight === 768); await frame.evaluate(() => SkiOps.render()); await layout('500-lines-768');
      await page.setViewportSize({ width: 1024, height: 600 });
    });
    await test('payment from the issue window preserves selected quantities and cancel returns without writing', async () => {
      await fixture(); await click('준비·지급하기');
      await action('pos-fulfillment-step', 'ski-today').filter({ hasText: '−' }).click();
      const before = await snapshot(); await click('수납'); await click('취소');
      assert.deepEqual(await snapshot(), before);
      assert.equal(await action('pos-fulfillment-step', 'ski-today').first().locator('..').getByLabel('선택 수량').innerText(), '1');
      await click('수납'); await click('수납 내역 확인'); await click('실제 처리 확인·기록');
      assert.equal((await order()).finance.dueWon, 0);
      assert.equal(await action('pos-fulfillment-step', 'ski-today').first().locator('..').getByLabel('선택 수량').innerText(), '1');
      await layout('issue-after-payment-600'); await click('선택 물품 지급 확정');
      assert.equal((await order()).totals.customerQuantity, 2);
    });
    await test('reducing a full return changes the confirmation to partial and leaves the other asset with the customer', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 2 }]); await click('준비·지급하기'); await click('선택 물품 지급 확정'); await click('모두 받음');
      await action('pos-fulfillment-step', 'ski-today').filter({ hasText: '−' }).click();
      assert.equal(await dialog().getByRole('button', { name: '모두 반납 확정', exact: true }).count(), 0);
      await click('받은 수량 반납 확정');
      assert.equal((await order()).totals.customerQuantity, 1); assert.equal((await order()).totals.shopQuantity, 1);
    });
    await test('physical size preparation is saved and the same bound asset is issued', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 1 }]); await click('준비·지급하기'); await click('규격·준비');
      const before = await snapshot(); await click('취소'); assert.deepEqual(await snapshot(), before);
      assert.match(await dialog().locator('#so-dialog-title').innerText(), /지급 1개/); await click('규격·준비');
      const assetId = await dialog().getByLabel('준비할 실물', { exact: true }).inputValue();
      await dialog().getByLabel('실제 규격', { exact: true }).fill('165'); await layout('preparation-confirm-600'); await click('물품·규격 준비 확인');
      assert.equal((await snapshot()).assets.find(asset => asset.id === assetId).orderPreparation.lineId, 'ski-today');
      await click('선택 물품 지급 확정'); const result = await order(); assert.deepEqual(result.lines[0].customerAssetIds, [assetId]); assert.equal((await snapshot()).assets.find(asset => asset.id === assetId).size, '165');
    });
    await test('quantity detail retains per-line full selection and preparation without a second confirmation overlay', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 2 }]); await click('준비·지급하기'); await click('수량 설정'); await click('품목별 수량 상세');
      await click('최신 수량으로 다시 선택'); assert.equal(await dialog().count(), 0);
      await click('선택 초기화'); await click('전량');
      assert.equal(await action('pos-fulfillment-step', 'ski-today').first().locator('..').getByLabel('선택 수량').innerText(), '2');
      await click('규격·준비'); await dialog().getByLabel('실제 규격', { exact: true }).fill('165'); await click('물품·규격 준비 확인');
      assert.equal(await dialog().count(), 0); await click('선택 물품 지급 확정'); assert.equal((await order()).totals.customerQuantity, 2);
    });
    await test('cancelling an unissued prepared item leads to preparation release before cancelling only that item', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 1 }]); await click('준비·지급하기'); await click('규격·준비');
      await dialog().getByLabel('실제 규격', { exact: true }).fill('165'); await click('물품·규격 준비 확인'); await click('취소');
      await action('pos-problems').click(); await click('미도착·배달 취소'); await click('이 미지급분 취소');
      assert.match(await dialog().innerText(), /준비 배정을 해제한 뒤/); await click('이 준비 해제'); await click('미지급 준비 해제');
      assert.ok(!(await snapshot()).assets.some(asset => asset.orderPreparation?.orderId === 'pos-smoke')); assert.equal((await order()).lines[0].cancelledQuantity, 0);
      await click('이 미지급분 취소'); await click('이번 미지급분 취소'); assert.equal((await order()).lines[0].cancelledQuantity, 1);
    });
    await test('dispatch uses selected quantities and vehicle 2; cancellation unloads before cancelling the unissued line', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 2 }]);
      await frame.evaluate(() => SkiOps.posFulfillment.open('dispatch', 'pos-smoke'));
      await action('pos-fulfillment-step', 'ski-today').filter({ hasText: '+' }).click(); await click('배달 약속 확인');
      await dialog().getByLabel('담당 차량', { exact: true }).selectOption('demo-van-2'); await layout('dispatch-confirm-600'); await click('실물 적재·배달 배정 확정');
      const task = (await snapshot()).tasks.find(task => task.orderId === 'pos-smoke' && task.kind === 'delivery'); assert.equal(task.assetIds.length, 1); assert.equal(task.vehicleId, 'demo-van-2');
      await action('pos-problems').click(); await click('미도착·배달 취소'); await click('내리고 배달 해제'); await click('내린 물품 확인·배달 해제');
      assert.equal((await snapshot()).tasks.find(row => row.id === task.id).status, 'cancelled');
      assert.ok((await snapshot()).assets.filter(asset => task.assetIds.includes(asset.id)).every(asset => asset.location.kind === 'shop'));
      await click('이 미지급분 취소'); await click('이번 미지급분 취소'); assert.equal((await order()).lines[0].cancelledQuantity, 2);
    });
    await test('period extension and collection rescheduling change only the chosen line', async () => {
      await fixture(); await click('준비·지급하기'); await click('선택 물품 지급 확정'); const before = await order();
      await click('기간·수거 변경'); await action('pos-extend-line', 'ski-today').click(); await layout('extension-600'); await click('확인하고 저장');
      let result = await order(); assert.equal(result.extensions[0].amountWon, 20000); assert.equal(result.lines[1].end, before.lines[1].end); assert.notEqual(result.lines[0].end, before.lines[0].end);
      await action('pos-schedule-line', 'ski-today').click(); await dialog().getByLabel('담당 차량', { exact: true }).selectOption('demo-van-2'); await layout('schedule-600'); await click('확인하고 저장');
      result = await order(); assert.equal(result.lines[0].returnPlan.vehicleId, 'demo-van-2'); assert.equal(result.lines[1].returnPlan.method, 'direct');
      const tasks = (await snapshot()).tasks.filter(task => task.orderId === result.id && task.kind === 'collection' && task.status === 'waiting'); assert.equal(tasks.length, 1); assert.equal(tasks[0].assetIds.length, 2);
    });
    await test('lost stock is excluded from normal return and found confirmation restores it to inspection', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 2 }]); await click('준비·지급하기'); await click('선택 물품 지급 확정'); const assetId = (await order()).lines[0].customerAssetIds[0];
      await action('pos-problems').click(); await click('교환·분실·파손'); await click('상태·분실 확인'); await action('pos-condition-asset', assetId).click();
      await dialog().getByLabel('확인한 상태', { exact: true }).selectOption('lost'); await dialog().getByLabel('처리 사유', { exact: true }).selectOption('고객 분실 신고'); await layout('lost-confirm-600'); await click('확인하고 저장');
      assert.equal((await snapshot()).assets.find(asset => asset.id === assetId).condition, 'lost'); await go('order-detail');
      await click('모두 받음'); assert.match(await dialog().locator('#so-dialog-title').innerText(), /반납 확인 1개/); await click('모두 반납 확정');
      await action('pos-problems').click(); await click('교환·분실·파손'); await click('상태·분실 확인'); await click('실물 발견·매장 확인'); await click('실물 발견·매장 확인');
      const found = (await snapshot()).assets.find(asset => asset.id === assetId); assert.equal(found.condition, 'inspection'); assert.equal(found.location.kind, 'shop'); assert.equal((await order()).totals.customerQuantity, 0);
    });
    await test('shop exchange records preparation, new delivery and old receipt before the replacement returns normally', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 1 }]); await click('준비·지급하기'); await click('선택 물품 지급 확정');
      await action('pos-problems').click(); await click('교환·분실·파손'); await click('교환');
      await dialog().getByLabel('현재 규격', { exact: true }).fill('160'); await dialog().getByLabel('새 규격', { exact: true }).fill('165'); await layout('exchange-request-600');
      await click('교환 내용 확인'); await click('매장 교환 요청 생성'); await layout('exchange-flow-600');
      await click('새 장비 준비'); await click('교환 실물 준비 확인'); await click('교환품 지급'); await click('실물 확인·고객 지급');
      await click('기존품 직접 받음'); await click('실물 확인·직접 반납');
      const exchange = (await snapshot()).exchanges.find(exchange => exchange.orderId === 'pos-smoke'); assert.equal(exchange.status, 'completed');
      const result = await order(); assert.deepEqual(result.lines[0].customerAssetIds, [exchange.units[0].newAssetId]); assert.equal(result.totals.issuedQuantity, 1);
      await go('order-detail'); await click('모두 받음'); await click('모두 반납 확정'); assert.equal((await order()).totals.customerQuantity, 0);
    });
    await test('actual ticket issuance is separately recorded then the bound ticket is delivered', async () => {
      await fixture([{ id: 'ticket-today', sku: 'ticket-4h', quantity: 1 }]); await click('준비·지급하기'); await click('발권 기록');
      await dialog().getByLabel('발권처 관리번호', { exact: true }).fill('vendor-smoke'); await layout('ticket-issue-600'); await click('실제 발권·배정 기록');
      const before = await order(); assert.equal(before.lines[0].unissuedQuantity, 1); assert.equal(before.lines[0].reservationBindings.length, 1);
      await click('선택 물품 지급 확정'); const result = await order(); assert.equal(result.lines[0].unissuedQuantity, 0); assert.equal(result.lines[0].issuedQuantity, 1);
      const boundIds = before.lines[0].reservationBindings[0].assetIds; assert.deepEqual(result.lines[0].customerAssetIds, boundIds);
    });
    await test('a partial receipt correction allows the same selected quantity to be restored through its earlier collection', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 2 }]); await click('준비·지급하기'); await click('선택 물품 지급 확정');
      const collection = await frame.evaluate(async () => {
        const D = SkiOps.posData, line = D.order('pos-smoke').lines[0];
        const result = await D.execute('ops.return', { orderId: 'pos-smoke', mode: 'collect', vehicleId: 'demo-van-2', lineItems: [{ lineId: line.id, assetIds: line.customerAssetIds }] }); SkiOps.render(); return result.movementIds[0];
      });
      await click('차량에서 받은 물품 입고'); await click('매장 입고 확정');
      const receipt = await frame.evaluate(() => SkiOps.posData.history.movements.filter(movement => movement.orderId === 'pos-smoke' && movement.kind === 'receive').at(-1).id);
      await action('pos-problems').click(); await openCorrection(receipt); await dialog().getByLabel('되돌릴 수량', { exact: true }).fill('1'); await layout('partial-correction-600'); await click('원래 위치로 정정');
      assert.equal((await order()).totals.vehicleQuantity, 1); await openCorrection(collection); await click('원래 위치로 정정');
      const result = await order(); assert.equal(result.totals.vehicleQuantity, 0); assert.equal(result.totals.customerQuantity, 1); assert.equal(result.totals.shopQuantity, 1); assert.equal(result.totals.issuedQuantity, 2);
    });
    await test('exchange-specific correction reverses old receipt then new delivery and permits cancelling the restored request', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 1 }]); await click('준비·지급하기'); await click('선택 물품 지급 확정');
      await action('pos-problems').click(); await click('교환·분실·파손'); await click('교환');
      await dialog().getByLabel('현재 규격', { exact: true }).fill('160'); await dialog().getByLabel('새 규격', { exact: true }).fill('165');
      await click('교환 내용 확인'); await click('매장 교환 요청 생성'); await click('새 장비 준비'); await click('교환 실물 준비 확인');
      await click('교환품 지급'); await click('실물 확인·고객 지급'); await click('기존품 직접 받음'); await click('실물 확인·직접 반납');
      const records = await frame.evaluate(() => {
        const D = SkiOps.posData, exchange = D.snapshot.exchanges.find(exchange => exchange.orderId === 'pos-smoke');
        return { exchangeId: exchange.id, oldId: exchange.units[0].oldAssetId,
          receive: D.history.movements.find(movement => movement.exchangeId === exchange.id && movement.kind === 'directReturn').id,
          deliver: D.history.movements.find(movement => movement.exchangeId === exchange.id && movement.kind === 'deliver').id };
      });
      await click('교환 이동 기록'); await openCorrection(records.receive); await click('원래 위치로 정정'); await openCorrection(records.deliver); await click('원래 위치로 정정');
      let exchange = (await snapshot()).exchanges.find(exchange => exchange.id === records.exchangeId); assert.equal(exchange.status, 'open'); assert.equal(exchange.recoveries.length, 2); assert.equal(exchange.units[0].deliveredAt, undefined); assert.equal(exchange.units[0].receivedAt, undefined);
      await click('교환·분실·파손'); await click('교환 이어 처리'); await click('이 교환 요청 취소'); await click('교환 요청 취소');
      exchange = (await snapshot()).exchanges.find(exchange => exchange.id === records.exchangeId); assert.equal(exchange.status, 'cancelled'); assert.deepEqual((await order()).lines[0].customerAssetIds, [records.oldId]);
    });
    await test('partial return extends only the one remaining customer asset with its own period and extra charge', async () => {
      await fixture([{ id: 'ski-today', sku: 'ski', quantity: 2 }]); await click('준비·지급하기'); await click('선택 물품 지급 확정');
      await click('일부만 받음'); await action('pos-fulfillment-step', 'ski-today').filter({ hasText: '+' }).click(); await click('받은 수량 반납 확정');
      const before = await order(); await click('기간·수거 변경'); await click('남은 1개만 연장'); await layout('partial-extension-600');
      assert.equal(await dialog().getByLabel('이번 추가 청구액 (원)', { exact: true }).inputValue(), '10000'); assert.match(await dialog().innerText(), /남은 1개만 이용 연장/); await click('확인하고 저장');
      const after = await order(); assert.equal(after.lines[0].end, before.lines[0].end); assert.equal(after.lines[0].assetTerms.length, 1); assert.equal(after.lines[0].assetTerms[0].assetId, before.lines[0].customerAssetIds[0]);
      assert.deepEqual(after.lines[0].shopAssetIds, before.lines[0].shopAssetIds); assert.equal(after.extensions[0].amountWon, 10000); assert.equal(after.extensions[0].changes[0].scope, 'assets');
      await page.screenshot({ path: output + '/partial-extension.png' });
    });
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    fs.writeFileSync(output + '/result.json', JSON.stringify({ checks, layouts, errors, writes }, null, 2));
    console.log(checks.length + ' POS fulfillment scenarios passed');
  } catch (error) {
    fs.writeFileSync(output + '/result.json', JSON.stringify({ checks, layouts, errors, writes, failure: error.stack }, null, 2));
    await page.screenshot({ path: output + '/failure.png' }).catch(() => {}); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
