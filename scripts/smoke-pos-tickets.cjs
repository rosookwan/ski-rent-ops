const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: process.env.SKI_CHROME_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  const output = process.env.SKI_TICKETS_OUTPUT || 'work/pos-tickets';
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
      return { width: innerWidth, height: innerHeight, outside, scroll };
    });
    layouts.push({ name, ...result }); assert.deepEqual(result.outside, [], name + ': content outside viewport'); assert.deepEqual(result.scroll, [], name + ': core needs scrolling');
  }
  const test = async (name, run) => { if (process.env.SKI_TICKETS_FILTER && !new RegExp(process.env.SKI_TICKETS_FILTER).test(name)) return; await fresh(); await run(); checks.push(name); console.log('PASS ' + name); };
  const openCorrection = async movementId => {
    for (let index = 0; index < 20 && !await action('pos-correct-movement', movementId).count(); index++) await click('다음');
    await action('pos-correct-movement', movementId).click();
  };
  async function issueTickets(quantity = 2, orderId = 'pos-smoke', lineId = 'lift', dayOffset = 0) {
    return frame.evaluate(async ({ quantity, orderId, lineId, dayOffset }) => {
      const D = SkiOps.posData, day = dayOffset ? SkiWorkflowCommon.nextDate(D.today) : D.today;
      return D.execute('ops.ticketIssue', { orderId, lineId, quantity, ticket: { validFrom: day + 'T09:00:00+09:00', validTo: day + 'T18:00:00+09:00', acceptedTypes: ['ticket-4h'], transferable: true, vendorId: 'resort-1' } });
    }, { quantity, orderId, lineId, dayOffset });
  }
  async function findAction(name, id) { for (let n = 0; n < 50 && !await action(name, id).count(); n++) await click('다음'); return action(name, id); }
  async function ticketStock() { await go('vehicle'); await action('pos-ticket-stock').click(); }
  try {
    await test('unissued cancellation releases all bindings and demand but retains next-day line, physical stock and payments', async () => {
      await fixture([{ id: 'lift', sku: 'ticket-4h', quantity: 2 }, { id: 'tomorrow', sku: 'ticket-4h', quantity: 1, tomorrow: true }]);
      await issueTickets(1); await issueTickets(1); await issueTickets(1, 'pos-smoke', 'tomorrow', 1);
      const before = await snapshot(); await go('order-detail'); await action('pos-line', 'lift').click(); await click('이 추가분 취소'); await layout('cancel-ticket-confirm-600');
      assert.equal(await dialog().locator('input,textarea').count(), 0); await click('이번 미지급분 취소'); await layout('cancel-ticket-result-600');
      const after = await snapshot(), lines = (await order()).lines;
      assert.equal(lines[0].cancelledQuantity, 2); assert.equal(lines[1].cancelledQuantity, 0); assert.equal(after.assets.length, before.assets.length);
      assert.deepEqual(after.assets.map(a => ({ id: a.id, location: a.location })), before.assets.map(a => ({ id: a.id, location: a.location })));
      assert.equal(after.allocations.filter(a => a.reservationId === 'pos-smoke' && a.status === 'active').length, 1);
      assert.deepEqual(after.reservations.find(r => r.id === 'pos-smoke').lines.map(l => l.cancelledQuantity), [1,1,0]);
      await click('회수권·발권처 반환'); await layout('cancelled-ticket-stock-600'); await page.screenshot({ path: output + '/cancelled-ticket-stock.png' });
    });
    await test('partly delivered cancellation gives actual recovery entry and never removes fulfillment or money', async () => {
      await fixture([{ id: 'lift', sku: 'ticket-4h', quantity: 2 }]); const result = await issueTickets(2);
      await frame.evaluate(async assetId => { await SkiOps.posData.execute('ops.issue', { orderId: 'pos-smoke', lineItems: [{ lineId: 'lift', assetIds: [assetId] }] }); SkiOps.render(); }, result.assetIds[0]);
      const before = await order(); await action('pos-line','lift').click(); await click('이 추가분 취소'); await layout('issued-ticket-recovery-guide-600');
      assert.match(await dialog().innerText(), /실물 회수/); await click('이 품목 권 회수'); await action('pos-fulfillment-step','lift').filter({hasText:'+'}).click(); await click('받은 수량 반납 확정');
      const after = await order(); assert.equal(after.lines[0].issuedQuantity, before.lines[0].issuedQuantity); assert.equal(after.lines[0].cancelledQuantity, 0); assert.equal(after.lines[0].customerQuantity, 0); assert.equal(after.amountWon, before.amountWon);
    });
    await test('recovered vehicle ticket requires actual shop receipt, binds the target sale row, then hands over through existing issue controls', async () => {
      await fixture([{ id: 'lift', sku: 'ticket-4h', quantity: 1 }]); const { assetIds } = await issueTickets(1);
      await frame.evaluate(async ids => {
        const D = SkiOps.posData; await D.execute('ops.issue', { orderId:'pos-smoke',lineItems:[{lineId:'lift',assetIds:ids}] });
        await D.execute('ops.return', { orderId:'pos-smoke',lineItems:[{lineId:'lift',assetIds:ids}],mode:'collect',vehicleId:'demo-van-2' });
        await D.execute('order.create',{id:'target-order',customer:{name:'회수권 받을 팀',phone:'010-3333-4444'},batch:{id:'target-first',lines:[{id:'target-line',sku:'ticket-4h',quantity:1,start:D.today,end:D.today,price:{unitWon:45000}}]}});
      }, assetIds);
      await ticketStock(); await (await findAction('pos-ticket-receive', assetIds[0])).click(); await layout('recovered-receive-600'); await click('실물 1매 매장 입고');
      assert.equal((await snapshot()).assets.find(a => a.id === assetIds[0]).location.kind, 'shop');
      await (await findAction('pos-ticket-target', assetIds[0])).click(); await (await findAction('pos-ticket-assign', 'target-order|target-line')).click(); await layout('recovered-assign-600'); await click('이 판매행에 1매 배정');
      assert.equal((await order('target-order')).lines[0].reservationBindings.length,1); await click('선택 물품 지급 확정');
      assert.equal((await snapshot()).assets.find(a => a.id === assetIds[0]).location.id, 'target-order'); assert.equal((await order()).lines[0].issuedQuantity,1);
      await page.screenshot({ path: output + '/reassigned-ticket-issued.png' });
    });
    await test('vendor refund request atomically records actual vehicle load and leaves actual refund amounts pending', async () => {
      await fixture([{ id:'lift',sku:'ticket-4h',quantity:1 }]); const {assetIds} = await issueTickets(1);
      await frame.evaluate(async ids => { const D=SkiOps.posData; await D.execute('ops.issue',{orderId:'pos-smoke',lineItems:[{lineId:'lift',assetIds:ids}]}); await D.execute('ops.return',{orderId:'pos-smoke',lineItems:[{lineId:'lift',assetIds:ids}],mode:'direct'}); },assetIds);
      await ticketStock(); await (await findAction('pos-ticket-refund',assetIds[0])).click(); await layout('vendor-refund-request-600'); await click('실제 적재·반환 요청');
      const after=await snapshot(), asset=after.assets.find(a=>a.id===assetIds[0]), refund=after.refunds.find(r=>r.assetIds.includes(asset.id));
      assert.equal(asset.location.kind,'vehicle'); assert.equal(asset.purpose,'refund'); assert.equal(refund.attempts.length,0); assert.equal(refund.completedAssetIds.length,0); assert.equal((await order()).lines[0].issuedQuantity,1);
    });
    await test('ticket stock pagination keeps 500-row lists within 600 and 768 viewport',async()=>{
      await frame.evaluate(async()=>{const D=SkiOps.posData;await D.execute('stock.opening',{sku:'ticket-4h',quantity:500,location:{kind:'shop',id:D.snapshot.shopId},ticket:{validFrom:D.today+'T09:00:00+09:00',validTo:D.today+'T18:00:00+09:00',acceptedTypes:['ticket-4h'],transferable:true,vendorId:'resort-1'}});});
      await ticketStock(); await layout('ticket-stock-500-600'); await click('다음'); await layout('ticket-stock-500-next-600'); await page.setViewportSize({width:1024,height:768}); await frame.waitForFunction(()=>innerHeight===768); await frame.evaluate(()=>SkiOps.render()); await layout('ticket-stock-500-768'); await page.screenshot({path:output+'/ticket-stock-500.png'});
    });
    assert.deepEqual(errors,[]); assert.deepEqual(writes,[]); fs.writeFileSync(output+'/result.json',JSON.stringify({checks,layouts,errors,writes},null,2)); console.log(checks.length+' POS ticket scenarios passed');
  } catch(error) { fs.writeFileSync(output+'/result.json',JSON.stringify({checks,layouts,errors,writes,failure:error.stack},null,2)); await page.screenshot({path:output+'/failure.png'}).catch(()=>{}); throw error;
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
