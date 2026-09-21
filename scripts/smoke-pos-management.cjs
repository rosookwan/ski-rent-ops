const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chooseTime } = require('./time-picker-helper.cjs');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKI_CHROME_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  const errors = [], writes = [], checks = [], screenshots = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('request', req => { if (!['GET', 'HEAD'].includes(req.method())) writes.push(req.url()); });
  const f = page.frameLocator('iframe'); let raw;
  const action = (name, id) => f.locator('[data-action="' + name + '"]' + (id == null ? '' : '[data-id="' + id + '"]') + ':visible').first().click();
  const field = name => f.locator('#so-dialog [data-pos-input="' + name + '"]');
  const nav = (route, id) => raw.evaluate(({ route, id }) => { window.SkiOps.close(); window.SkiOps.go(route, id ? { id } : {}); }, { route, id });
  const snapshot = () => raw.evaluate(() => window.SkiOps.posData.snapshot);
  const saved = async () => { try { await f.locator('#so-dialog').waitFor({ state: 'hidden', timeout: 8000 }); } catch (error) { console.error('DIALOG STILL OPEN · ' + await f.locator('#so-dialog-title').innerText() + ' · ' + await f.locator('#so-dialog #pos-error').innerText().catch(() => '') + ' · ' + JSON.stringify((await snapshot()).management.settings.discounts)); throw error; } };
  const test = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
  const uiRules = require('./pos-ui-rules.cjs').recorder('management');
  async function geometry(label, modal = false) {
    const result = await raw.evaluate(modal => {
      const container = document.querySelector(modal ? '#so-dialog' : '.pos-page');
      const body = container.querySelector(modal ? '.pos-modal-body' : '.pos-page-body');
      const footer = container.querySelector(modal ? '.pos-modal-footer' : '.pos-page-footer');
      const rect = footer.getBoundingClientRect();
      return { height: innerHeight, width: innerWidth, body: { client: body.clientHeight, scroll: body.scrollHeight }, footer: { top: rect.top, bottom: rect.bottom },
        controls: [...container.querySelectorAll('button,input:not([type="hidden"]),select')].filter(el => { if (!(el.getBoundingClientRect().width && getComputedStyle(el).display !== 'none')) return false; const scroller = el.closest('[data-pos-scroll]'); if (!scroller) return true; const r = el.getBoundingClientRect(), s = scroller.getBoundingClientRect(); return r.top >= s.top - 1 && r.bottom <= s.bottom + 1; }).map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent.trim().slice(0, 40), left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, primary: el.classList.contains('primary'), font: Number.parseFloat(getComputedStyle(el).fontSize) }; }) };
    }, modal);
    assert.ok(result.body.scroll <= result.body.client + 1, label + ' body scroll: ' + JSON.stringify(result));
    assert.ok(result.footer.bottom <= result.height + 1, label + ' footer clipped: ' + JSON.stringify(result));
    assert.ok(result.controls.every(r => r.left >= -1 && r.right <= result.width + 1 && r.bottom <= result.height + 1 && r.height >= (r.primary ? 56 : 52) && r.font >= 16), label + ' controls clipped/small: ' + JSON.stringify(result));
    await uiRules.add(label, raw);
    return result;
  }
  try {
    await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/', { waitUntil: 'networkidle' });
    raw = page.frames().find(frame => frame.parentFrame());
    await raw.waitForFunction(() => window.SkiOps?.posData?.snapshot?.management);
    await raw.evaluate(() => { window.SkiOps.state.authenticated = true; window.SkiOps.go('management'); });
    await test('management hub and inventory remain readable with a fixed action footer at three POS sizes', async () => {
      fs.mkdirSync('work/screens/pos-management', { recursive: true });
      for (const viewport of [{ width: 1024, height: 600 }, { width: 1024, height: 768 }, { width: 1366, height: 768 }]) {
        await page.setViewportSize(viewport); await nav('inventory'); await raw.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await geometry('inventory ' + viewport.width);
        const path = 'work/screens/pos-management/inventory-' + viewport.width + '-' + viewport.height + '.png'; await page.screenshot({ path }); screenshots.push(path);
        await nav('management'); await geometry('hub ' + viewport.width);
        await nav('partners'); await geometry('partners ' + viewport.width);
        await nav('customers'); await geometry('customers ' + viewport.width);
        await nav('settings'); await geometry('settings ' + viewport.width);
        await nav('guide'); await geometry('guide ' + viewport.width);
      }
      await page.setViewportSize({ width: 1024, height: 600 });
    });
    let assetId, partnerId, firstOrder, secondOrder, profileId;
    await test('inventory status writes change actual ready counts and found items require inspection before reuse', async () => {
      assetId = await raw.evaluate(async () => (await window.SkiOps.posData.execute('stock.receive', { sku: 'ski', quantity: 1, size: 'UI-QA' })).assetIds[0]);
      await nav('inventory');
      await f.locator('[data-pos-input="pmSkuFilter"]').selectOption('ski');
      await f.locator('[data-search="pm-assets"]').fill(assetId);
      await action('pm-asset-select', assetId); await action('pm-asset-state'); await geometry('asset state modal', true);
      await field('pmCondition').selectOption('cleaning'); await action('pm-asset-save'); await saved();
      assert.equal((await snapshot()).management.assets.find(a => a.id === assetId).condition, 'cleaning');
      await action('pm-asset-select', assetId); await action('pm-asset-state'); await field('pmCondition').selectOption('lost'); await field('pmReason').selectOption('실물 미확인·분실'); await action('pm-asset-save'); await saved();
      await action('pm-found', assetId); await geometry('found modal', true); await action('pm-found-save', assetId); await saved();
      const found = (await snapshot()).management.assets.find(a => a.id === assetId); assert.equal(found.condition, 'inspection'); assert.equal(found.location.kind, 'shop');
      await action('pm-asset-select', assetId); await action('pm-asset-state'); await field('pmCondition').selectOption('ready'); await field('pmReason').selectOption('정비 완료 확인'); await action('pm-asset-save'); await saved();
      assert.equal((await snapshot()).management.assets.find(a => a.id === assetId).condition, 'ready');
    });
    await test('partner borrowing, partial physical return and cash entries remain separate actual records', async () => {
      await nav('partners'); await action('pm-partner-edit'); await field('pmPartnerName').fill('POS 검증 거래처'); await field('pmPartnerPhone').fill('010-5555-6666'); await action('pm-partner-save'); await saved();
      partnerId = (await snapshot()).management.partners.find(p => p.name === 'POS 검증 거래처').id;
      await nav('partner-detail', partnerId); await action('pm-partner-borrow', partnerId); await geometry('partner borrow modal', true); await field('pmBorrowQuantity').fill('2'); await field('pmBorrowSize').fill('155'); await action('pm-borrow-save'); await saved();
      let p = (await snapshot()).management.partners.find(p => p.id === partnerId); assert.equal(p.loans[0].outstandingQuantity, 2); assert.equal(p.paidWon, 0);
      await action('pm-partner-return', partnerId); await action('pm-return-select', p.loans[0].assetIds[0]); await geometry('partner return modal', true); await action('pm-return-save'); await saved();
      p = (await snapshot()).management.partners.find(p => p.id === partnerId); assert.equal(p.loans[0].outstandingQuantity, 1); assert.equal(p.paidWon, 0); assert.equal(p.agreedChargeWon, null);
      const cashBefore = (await snapshot()).finance.cashMovementWon;
      await action('pm-partner-money', partnerId); await field('pmMoneyAmount').fill('12000'); await geometry('partner money modal', true); await action('pm-money-review'); await action('pm-money-save'); await saved();
      p = (await snapshot()).management.partners.find(p => p.id === partnerId); assert.equal(p.paidWon, 12000); assert.equal(p.loans[0].outstandingQuantity, 1); assert.equal((await snapshot()).finance.cashMovementWon, cashBefore - 12000);
      await action('pm-partner-tab', 'money'); await geometry('partner ledger'); await page.screenshot({ path: 'work/screens/pos-management/partner-ledger-1024-600.png' });
    });
    await test('partner lending, actual recovery, explicit obligations and offset keep physical stock and cash separate', async () => {
      await nav('partner-detail', partnerId); await action('pm-partner-tab', 'lendings'); await action('pm-partner-lend', partnerId);
      await field('pmLendQuery').fill(assetId); await action('pm-lend-select', assetId); await geometry('partner lend modal', true); await action('pm-lend-save'); await saved();
      let p = (await snapshot()).management.partners.find(p => p.id === partnerId); assert.equal(p.lendings[0].outstandingQuantity, 1); assert.equal((await snapshot()).management.assets.find(a => a.id === assetId).location.kind, 'vendor');
      await action('pm-partner-receive', partnerId); await action('pm-receive-select', assetId); await geometry('partner recovery modal', true); await action('pm-receive-save'); await saved();
      p = (await snapshot()).management.partners.find(p => p.id === partnerId); assert.equal(p.lendings[0].outstandingQuantity, 0); assert.equal((await snapshot()).management.assets.find(a => a.id === assetId).condition, 'inspection');
      await action('pm-partner-tab', 'agreements');
      for (const [kind, amount, reason] of [['payable', '30000', '차입 약정 확인'], ['receivable', '20000', '대여 약정 확인']]) { await action('pm-partner-agreement', partnerId); await field('pmAgreementKind').selectOption(kind); await field('pmAgreementAmount').fill(amount); await field('pmAgreementReason').fill(reason); await geometry('partner agreement modal', true); await action('pm-agreement-save'); await saved(); }
      p = (await snapshot()).management.partners.find(p => p.id === partnerId); assert.equal(p.payableWon, 30000); assert.equal(p.unallocatedPaymentWon, 12000);
      const payable = p.agreements.find(a => a.kind === 'payable').id, receivable = p.agreements.find(a => a.kind === 'receivable').id, cash = (await snapshot()).finance.cashMovementWon;
      await action('pm-partner-offset', partnerId); await field('pmOffsetPayable').selectOption(payable); await field('pmOffsetReceivable').selectOption(receivable); await field('pmOffsetAmount').fill('5000'); await field('pmOffsetReason').fill('양사 상계 합의'); await geometry('partner offset modal', true); await action('pm-offset-review'); await action('pm-offset-save'); await saved();
      p = (await snapshot()).management.partners.find(p => p.id === partnerId); assert.equal(p.payableWon, 25000); assert.equal(p.receivableWon, 15000); assert.equal((await snapshot()).finance.cashMovementWon, cash);
      await action('pm-agreement-money', payable); await field('pmMoneyAmount').fill('10000'); await geometry('partner allocated money modal', true); await action('pm-money-review'); assert.equal(await field('pmMoneyAgreement').inputValue(), payable); await geometry('partner allocated money confirmation', true); await action('pm-money-save'); await saved();
      p = (await snapshot()).management.partners.find(p => p.id === partnerId); assert.equal(p.payableWon, 15000); assert.equal(p.receivableWon, 15000); assert.equal((await snapshot()).finance.cashMovementWon, cash - 10000); await geometry('partner agreements ledger');
      await page.screenshot({ path: 'work/screens/pos-management/partner-agreements-1024-600.png' });
    });
    await test('customer contact changes preserve accepted visit snapshots and explicitly link only chosen candidates', async () => {
      [firstOrder, secondOrder] = await raw.evaluate(async () => {
        const D = window.SkiOps.posData, ids = ['pm-visit-first', 'pm-visit-second'];
        for (const id of ids) await D.execute('order.create', { id, customer: { name: '방문 당시 이름', phone: '010-7777-8888' }, batch: { id: 'first', lines: [{ id: 'ski-line', sku: 'ski', quantity: 1, start: D.today, end: D.today, price: { unitWon: 17000 } }] } });
        return ids;
      });
      await nav('customer-profile', 'visit:' + firstOrder); await action('pm-customer-edit', firstOrder); await field('pmCustomerName').fill('현재 연락처 이름'); await field('pmCustomerNote').fill('오후 연락 선호'); await geometry('customer modal', true); await action('pm-customer-save'); await saved();
      let p = (await snapshot()).management.customerProfiles.find(p => p.orderIds.includes(firstOrder)); profileId = p.id; assert.deepEqual(p.orderIds, [firstOrder]); assert.ok(p.matchingCandidates.some(c => c.orderId === secondOrder));
      assert.equal((await snapshot()).orders.find(o => o.id === firstOrder).customer.name, '방문 당시 이름');
      await action('pm-customer-link', profileId); await action('pm-link-select', secondOrder); await geometry('customer link modal', true); await action('pm-link-save'); await saved();
      p = (await snapshot()).management.customerProfiles.find(p => p.id === profileId); assert.deepEqual(p.orderIds, [firstOrder, secondOrder]); await geometry('customer visits'); await page.screenshot({ path: 'work/screens/pos-management/customer-visits-1024-600.png' });
    });
    await test('all setting tabs persist versions while existing charges stay unchanged', async () => {
      const charge = (await snapshot()).orders.find(o => o.id === firstOrder).finance.chargedWon;
      await nav('settings'); await action('pm-settings-tab', 'rates'); await action('pm-setting-edit', 'ski'); await field('pmSettingAmount').fill('23000'); await action('pm-setting-save'); await saved();
      // Places are kept by area: add an area, put a place in it, then fill the rest from a resort template (docs/44).
      await action('pm-settings-tab', 'places'); await geometry('settings places by area'); await action('pm-area-edit', 'new'); await field('pmAreaName').fill('검증 구역'); await geometry('area modal', true); await action('pm-area-save'); await saved();
      await action('pm-setting-edit', 'new'); await field('pmSettingName').fill('검증 주차장'); await geometry('place modal', true); await action('pm-setting-save'); await saved();
      let areas = (await snapshot()).management.settings.areas; assert.deepEqual(areas.find(a => a.name === '검증 구역').places, ['검증 주차장']);
      await action('pm-template'); await geometry('resort template modal', true); await action('pm-template-apply'); await saved();
      areas = (await snapshot()).management.settings.areas; assert.ok(areas.find(a => a.name === '만선').places.includes('만선 매표소 앞')); assert.deepEqual(areas.find(a => a.name === '검증 구역').places, ['검증 주차장'], 'template never removes existing places');
      assert.ok((await snapshot()).management.settings.returnTimes.some(t => t.time === '12:00'), 'template adds the morning return time');
      await action('pm-settings-tab', 'discounts'); await geometry('settings discounts'); await action('pm-setting-edit', 'new'); await field('pmDiscountAmount').fill('5000'); await geometry('discount modal', true); await action('pm-setting-save'); await saved();
      await action('pm-discount-kind', 'liftPercent'); await action('pm-setting-edit', 'new'); await field('pmDiscountPercent').fill('33'); await action('pm-setting-save'); await saved();
      const discounts = (await snapshot()).management.settings.discounts; assert.ok(discounts.some(d => d.kind === 'perUnit' && d.amountWon === 5000)); assert.ok(discounts.some(d => d.kind === 'liftPercent' && d.percent === 33));
      await action('pm-settings-tab', 'vehicles'); await action('pm-setting-edit', 'new'); await field('pmSettingName').fill('검증 차량'); await action('pm-setting-save'); await saved();
      await action('pm-settings-tab', 'returnTimes'); await action('pm-setting-edit', 'new'); await field('pmSettingName').fill('익일 오전'); await field('pmSettingDay').selectOption('1'); await chooseTime(f, '[data-pos-input="pmSettingTime"]', '09:30'); await geometry('return time modal', true); await action('pm-setting-save'); await saved();
      const vehicle = (await snapshot()).management.settings.vehicles.find(v => v.name === '검증 차량');
      await action('pm-settings-tab', 'staff'); await action('pm-setting-edit', 'new'); await field('pmSettingName').fill('검증 기사'); await field('pmSettingPhone').fill('010-1234-9876'); await field('pmSettingRole').selectOption('driver'); await field('pmSettingVehicle').selectOption(vehicle.id); await geometry('staff modal', true); await page.screenshot({ path: 'work/screens/pos-management/staff-dialog-1024-600.png' }); await action('pm-setting-save'); await saved();
      await action('pm-settings-tab', 'nightCutoff'); await action('pm-setting-edit', 'nightCutoff'); await field('pmSettingPolicy').selectOption('saved'); await chooseTime(f, '[data-pos-input="pmSettingTime"]', '03:00'); await action('pm-setting-save'); await saved();
      const s = await snapshot(); assert.equal(s.management.settings.rates.find(r => r.sku === 'ski').unitWon, 23000); assert.ok(s.management.settings.places.includes('검증 주차장')); assert.ok(s.management.settings.returnTimes.some(t => t.dayOffset === 1 && t.time === '09:30')); assert.equal(s.management.settings.staff.at(-1).vehicleId, vehicle.id); assert.equal(s.management.settings.nightCutoff, '03:00'); assert.equal(s.orders.find(o => o.id === firstOrder).finance.chargedWon, charge); assert.ok(s.management.settingVersions.length >= 6);
    });
    await test('new equipment and lift ticket catalogs can be added without changing existing items', async () => {
      await nav('settings'); await action('pm-settings-tab', 'rates'); const before = (await snapshot()).catalog.length;
      await action('pm-catalog-add'); await field('pmCatalogLabel').fill('검증 보호대'); await geometry('catalog modal', true); await action('pm-catalog-save'); await saved();
      await action('pm-catalog-add'); await field('pmCatalogLabel').fill('검증 5시간권'); await field('pmCatalogKind').selectOption('liftTicket'); await field('pmCatalogUnit').selectOption('매'); await field('pmCatalogHours').selectOption('5'); await action('pm-catalog-save'); await saved();
      const s = await snapshot(); assert.equal(s.catalog.length, before + 2); assert.equal(s.catalog.find(s => s.label === '검증 보호대').kind, 'equipment'); assert.equal(s.catalog.find(s => s.label === '검증 5시간권').hours, 5); assert.equal(s.management.settings.rates.some(r => r.sku === s.catalog.find(s => s.label === '검증 보호대').id), false);
    });
    await test('customer QR guidance keeps the existing guest route', async () => { await nav('guide'); await f.locator('#so-page [data-go="guest-guide"]').click(); await f.locator('.so-guest-shell').waitFor(); await f.locator('#so-public [data-go="guide"]').click(); await geometry('return from guest guide'); });
    await test('daily closing shows current partner obligations and preserves the confirmed balances separately from customer handover', async () => {
      await nav('closing'); await geometry('closing with partner entry'); await action('pos-closing-partners'); await geometry('current partner closing modal', true);
      assert.match(await f.locator('#so-dialog-body').innerText(), /15,000/); await f.locator('#so-dialog .pos-modal-footer [data-action="close"]').click();
      const closingId = await raw.evaluate(async () => { const D = window.SkiOps.posData, report = D.snapshot.finance, openingCashWon = 1000000, id = D.id('partner-close'); await D.execute('closing.close', { id, date: D.today, openingCashWon, countedCashWon: openingCashWon + report.cashMovementWon, handover: report.handoverDefaults.map(row => ({ orderId: row.orderId, reason: row.reason || 'scheduled', assignee: row.assignee || '검증 담당', nextDate: row.nextDate || D.today })) }); window.SkiOps.render(); return id; });
      const closed = (await snapshot()).closings.find(c => c.id === closingId); assert.equal(closed.snapshot.partnerBalances.find(p => p.id === partnerId).payableWon, 15000);
      await action('pos-closing-view', closingId); await action('pos-closing-partners', closingId); await geometry('preserved partner closing modal', true); assert.match(await f.locator('#so-dialog-title').innerText(), /마감 당시 거래처/); await page.screenshot({ path: 'work/screens/pos-management/closing-partners-1024-600.png' });
    });
    assert.deepEqual(errors, []); assert.deepEqual(writes, [], 'local smoke must not send actual external writes');
    fs.writeFileSync('work/screens/pos-management/report.json', JSON.stringify({ checks, screenshots, errors, writes }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, screenshots }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
