const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { measure, totals, recorder } = require('./pos-ui-rules.cjs');
const output = path.resolve(process.env.SKI_MANAGEMENT_SCREENS_OUT || 'work/pos-ui-a4');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  const checks = [], scenarios = [], errors = [], writes = [], rulesRecorder = recorder('management-details');
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
  try {
    await page.goto('http://127.0.0.1:58148/', { waitUntil: 'networkidle' });
    const frame = page.frames().find(item => item.parentFrame());
    await frame.waitForFunction(() => !!window.SkiOps?.posData?.snapshot?.management);
    const action = (name, id) => frame.locator('[data-action="' + name + '"]' + (id == null ? '' : '[data-id="' + id + '"]') + ':visible').first();
    const nav = (route, id) => frame.evaluate(({ route, id }) => { SkiOps.close(); SkiOps.go(route, id ? { id } : {}); }, { route, id });
    const snapshot = () => frame.evaluate(() => SkiOps.posData.snapshot);
    const fixture = await frame.evaluate(async () => {
      const D = SkiOps.posData, run = (type, payload) => D.execute(type, payload), partnerId = 'a4-partner';
      SkiOps.state.authenticated = true;
      for (const [id, label] of [['a4-boots', '부츠'], ['a4-protector', '보호대']]) { await run('catalog.add', { id, label, kind: 'equipment', unit: '개' }); await run('stock.receive', { sku: id, quantity: 4, size: 'M' }); }
      const boots = D.snapshot.management.assets.filter(row => row.sku === 'a4-boots');
      await run('management.asset', { assetIds: boots.slice(0, 2).map(row => row.id), condition: 'repair', reason: '시안 비교용 정비 기록' });
      await run('partner.save', { id: partnerId, name: 'A스키샵', phone: '063-000-0001' });
      const gear = (await run('stock.receive', { sku: 'ski', quantity: 12, size: '155' })).assetIds;
      await run('partner.lend', { id: 'a4-lend', partnerId, assetIds: gear.slice(0, 5), dueDate: D.today, reason: '실물 전달 확인' });
      await run('partner.receive', { id: 'a4-receive', assetIds: gear.slice(0, 3), reason: '실물 회수 확인' });
      for (let i = 0; i < 4; i++) await run('partner.borrow', { id: 'a4-borrow-' + i, partnerId, sku: i % 2 ? 'board' : 'ski', quantity: 2, size: '150', dueDate: D.today });
      await run('partner.agreement', { id: 'a4-receivable', partnerId, kind: 'receivable', amountWon: 100000, reason: '스키 5대 대여 약정' });
      await run('partner.agreement', { id: 'a4-payable', partnerId, kind: 'payable', amountWon: 25000, reason: '장비 차입 약정' });
      await run('partner.money', { id: 'a4-paid', partnerId, kind: 'payment', amountWon: 5000, method: 'cash', reason: '실제 지급 확인', agreementId: 'a4-payable' });
      for (let i = 0; i < 8; i++) await run('order.create', { id: 'a4-visit-' + i, customer: { name: '김민수', phone: '010-0000-0025' }, batch: { id: 'first', lines: [{ id: 'ski-line', sku: 'ski', quantity: 1, start: D.today, end: D.today, price: { unitWon: 20000 } }] } });
      const profile = await run('management.customer', { orderId: 'a4-visit-0', name: '김민수', phone: '010-0000-0025', note: '오후 연락 선호 · 이전 방문과 이번 접수는 각각 확인' });
      await run('management.customer.link', { profileId: profile.profileId, orderIds: Array.from({ length: 6 }, (_, i) => 'a4-visit-' + (i + 1)) });
      await run('ops.prepare', { orderId: 'a4-visit-0', lineItems: [{ lineId: 'ski-line', assets: [{ assetId: gear[5], size: '155' }] }] });
      SkiOps.go('inventory'); return { partnerId, profileId: profile.profileId, preparedId: gear[5] };
    });
    const shot = async key => {
      await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const rules = await frame.evaluate(measure, { minFont: 16, minTarget: 52 });
      const geometry = await frame.evaluate(() => {
        const body = document.querySelector('.pos-page-body'), footer = document.querySelector('.pos-page-footer');
        return { viewport: [innerWidth, innerHeight], body: { client: body.clientHeight, scroll: body.scrollHeight }, footer: footer.getBoundingClientRect().toJSON(),
          outside: [...document.querySelectorAll('.pos-page button,.pos-page input,.pos-page select,.pos-detail-side,.pm-balance-lines')].filter(el => el.getClientRects().length).map(el => ({ text: el.textContent.slice(0, 50), rect: el.getBoundingClientRect().toJSON() })).filter(({ rect: r }) => r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) };
      });
      const file = key + '-' + geometry.viewport.join('x') + '.png'; await page.screenshot({ path: path.join(output, file) });
      checks.push({ key, file, rules: totals(rules), geometry }); await rulesRecorder.add(key + '-' + geometry.viewport.join('x'), frame);
      assert.ok(Object.values(totals(rules)).every(n => n === 0), file + ': ' + JSON.stringify(rules));
      assert.ok(geometry.body.scroll <= geometry.body.client + 2, file + ': 본문 넘침'); assert.deepEqual(geometry.outside, [], file + ': 화면 밖');
    };
    const sizes = process.env.SKI_MANAGEMENT_QUICK ? [[1024, 600]] : [[1024, 600], [1024, 768], [1366, 768], [907, 648], [875, 600]];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height }); await nav('inventory'); await action('pm-inventory-state', '').click(); await shot('inventory');
      await action('pm-inventory-state', 'service').click(); await shot('inventory-service'); await action('pm-inventory-state', '').click();
      await action('pm-inventory-open', 'ski').click(); await shot('inventory-assets');
      assert.equal(await frame.locator('.pos-rail-item[aria-current="page"][data-go="inventory"]').count(), 1);
      await nav('partner-detail', fixture.partnerId);
      for (const tab of ['loans', 'lendings', 'agreements', 'money']) { await action('pm-partner-tab', tab).click(); await shot('partner-' + tab); }
      await nav('customer-profile', fixture.profileId); await shot('customer');
      await nav('customer-profile', 'visit:a4-visit-7'); await shot('customer-unregistered');
    }
    await page.setViewportSize({ width: 1024, height: 600 }); const before = await snapshot();
    await nav('inventory'); await action('pm-inventory-state', 'available').click(); await action('pm-inventory-open', 'ski').click();
    const expected = before.management.inventory.find(row => row.sku === 'ski').available, ids = [];
    while (true) {
      ids.push(...await frame.locator('[data-action="pm-asset-select"]').evaluateAll(els => els.map(el => el.dataset.id)));
      const next = frame.locator('[data-pos-key="management-assets"][data-id="1"]'); if (await next.isDisabled()) break; await next.click();
    }
    assert.equal(ids.length, expected); assert.equal(new Set(ids).size, ids.length); assert.ok(!ids.includes(fixture.preparedId));
    await frame.locator('[data-search="pm-assets"]').fill(fixture.preparedId); assert.equal(await action('pm-asset-select').count(), 0);
    await frame.locator('[data-pos-input="pmConditionFilter"]').selectOption(''); await action('pm-asset-select', fixture.preparedId).click();
    await frame.locator('[data-pos-input="pmSkuFilter"]').selectOption('board'); assert.match(await frame.locator('.pos-page-footer').innerText(), /0개 선택/);
    scenarios.push('대여 가능 수량과 실물 목록 일치, 준비 배정된 물품 제외, 필터 변경 시 선택 해제');
    await nav('partner-detail', fixture.partnerId); await action('pm-partner-tab', 'loans').click();
    await action('pos-cards-page', '1').click(); await shot('partner-loans-next');
    assert.match(await frame.locator('.pm-balance-lines').innerText(), /25,000원[\s\S]*5,000원[\s\S]*20,000원/);
    scenarios.push('차입 목록 다음 쪽에서도 거래처 전체 약정·실제 금액 구분 유지');
    await nav('customer-profile', fixture.profileId); await action('pos-cards-page', '1').click(); await shot('customer-next');
    assert.equal(await action('pm-customer-link', fixture.profileId).count(), 1);
    const visitId = await frame.locator('.pos-card-actions [data-go="order-detail"]').first().getAttribute('data-id'); await frame.locator('.pos-card-actions [data-go="order-detail"]').first().click();
    assert.equal(await frame.evaluate(() => SkiOps.state.params.id), visitId); await nav('customer-profile', fixture.profileId);
    scenarios.push('여러 방문의 쪽 나눔과 선택한 방문 열기, 미등록 방문의 연락처 수정 입구 유지');
    assert.deepEqual(await snapshot(), before, '화면 탐색만으로 업무 자료가 바뀌면 안 됨'); assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    const uri = file => 'data:image/' + (file.endsWith('.jpg') ? 'jpeg' : 'png') + ';base64,' + fs.readFileSync(file).toString('base64');
    for (const [key, reference, actual, title, note] of [
      ['inventory', 'pos-rest-v1/m02-inventory', 'inventory', '재고·정비', '품목 타일에서 실제 물품을 고르는 기존 상태 변경 절차로 이어집니다.'],
      ['partner', 'pos-rest-v1/m04-partner-detail', 'partner-lendings', '거래처 상세', '물품 이동·약정·실제 금액은 기존 기록을 각각 표시합니다.'],
      ['customer', 'pos-main-v1/p04-order-detail', 'customer', '고객 상세', '고객 상세 전용 시안은 없어 인계 문서가 지정한 접수 상세의 좌우 배치를 적용했습니다.']
    ]) {
      const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f4f2f8;color:#24222b;font-family:system-ui,sans-serif}h1{font-size:25px;margin:0 0 8px}p{font-size:17px;margin:0 0 20px;color:#575264}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:white;border:1px solid #dcd8e6;border-radius:12px;overflow:hidden}figcaption{font-size:19px;font-weight:650;padding:14px 16px;border-bottom:1px solid #e8e5ed}img{width:100%;height:352px;object-fit:contain;display:block;background:#fff}</style><h1>${title} · 시안과 A4 구현</h1><p>현재 화면은 1024×600에서 촬영했습니다. 기존 글꼴과 공용 크기를 유지했습니다.</p><div class="pair"><figure><figcaption>${key === 'customer' ? '좌우 배치 기준 · 접수 상세 P04' : '기존 힉스필드 시안'}</figcaption><img src="${uri(path.resolve('design/higgsfield', reference + '.jpg'))}"></figure><figure><figcaption>A4 구현 · 임시 체험 자료</figcaption><img src="${uri(path.join(output, actual + '-1024x600.png'))}"></figure></div><p style="margin-top:16px">${note}</p></html>`;
      await page.setViewportSize({ width: 1280, height: 550 }); await page.setContent(html); await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode()))); await page.screenshot({ path: path.join(output, key + '-compare.png'), fullPage: true });
    }
    fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify({ checks, scenarios, errors, writes }, null, 2));
    console.log(JSON.stringify({ screenshots: checks.length, scenarios, errors, writes, rules: checks.reduce((result, check) => { for (const [key, value] of Object.entries(check.rules)) result[key] = (result[key] || 0) + value; return result; }, {}) }));
  } catch (error) { await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
