const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(10000); let frame; const errors = [], checks = []; page.on('pageerror', e => errors.push(e.message));
  const click = name => frame.getByRole('button', { name, exact: true }).click();
  const fresh = async () => { await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58151/'); frame = page.frames().find(f => f.parentFrame()); await frame.evaluate(() => { SkiOps.state.authenticated = true; SkiOps.go('rental', { id: 'R-021' }); }); };
  const test = async (name, fn) => { await fresh(); await fn(); checks.push(name); console.log('PASS', name); };
  const order = () => frame.evaluate(() => SkiOps.workflow.projectOrder('R-021'));
  const open = async (kind = 'ski', method = 'vehicle') => { await click('장비 교환'); await frame.getByLabel('교환 품목', { exact: true }).selectOption(kind); await frame.getByLabel('교환 방법', { exact: true }).selectOption(method); await frame.getByLabel('기존 규격', { exact: true }).fill(kind === 'ski' ? '150' : '255'); await frame.getByLabel('새 규격', { exact: true }).fill(kind === 'ski' ? '150' : '260'); };
  const latest = () => frame.evaluate(() => SkiOps.workflow.snap().exchanges.at(-1));
  const prepare = async (label) => { await click('교환품 준비'); await frame.locator('#so-dialog input[aria-label="' + label + ' 수량"]').first().fill('1'); await click('선택 수량 확인'); };
  try {
    await test('rental exchange request connects POS loading, vehicle delivery, old pickup, damage and final rental return', async () => {
      const before = await order(); await open(); await frame.getByLabel('추가 메모', { exact: true }).fill('앞코 파손 · 고객 앞에서 확인'); await click('교환 요청 저장');
      const x = await latest(); assert.equal(x.units.length, 1); assert.equal((await order()).items[0].exchangePendingQuantity, 1);
      await prepare('스키'); await click('배달·수거 목록');
      const card = frame.locator('[data-load-id="' + x.id + '-new"]'); assert.match(await card.innerText(), /장비교환.*150 → 150/);
      await card.getByRole('button', { name: '실었어요', exact: true }).click();
      await frame.locator('.so-topbar-right [data-go="vehicle"]').click(); await frame.locator('[data-vehicle-job="' + x.id + '-new"]').click();
      assert.match(await frame.locator('.so-vehicle-board').innerText(), /앞코 파손 · 고객 앞에서 확인/);
      await click('전달 완료'); await frame.locator('.so-vehicle-overlay').getByRole('button', { name: '전달 완료', exact: true }).click();
      assert.equal((await order()).items[0].customerQuantity, 2); assert.equal((await latest()).units[0].receivedAt, undefined);
      await click('매장 화면으로'); await frame.evaluate(() => SkiOps.go('rental', { id: 'R-021' }));
      await click('고객 직접반납 받음'); for (const name of ['스키','스키','의류','의류','헬멧']) await click(name + ' 수량 늘리기'); await click('직접반납 처리');
      assert.equal((await order()).totals.customerQuantity, 0); assert.match(await frame.locator('.so-rental-board').innerText(), /장비교환 확인 필요/);
      assert.doesNotMatch(await frame.locator('.so-rental-board').innerText(), /모두 확인 완료/);
      await frame.evaluate(() => SkiOps.go('vehicle'));
      await frame.locator('[data-vehicle-job="' + x.id + '-old"]').click(); await click('일부만 받았어요'); await click('스키 받음'); await click('선택 수량 저장');
      assert.equal((await latest()).units[0].receivedAt, undefined); assert.equal((await order()).items[0].customerQuantity, 0);
      await click('매장 화면으로'); await frame.evaluate(() => SkiOps.go('dispatch')); await click('매장에 내리기');
      await click('모두 선택'); await click('선택 수량 확인');
      await frame.evaluate(() => SkiOps.go('rental', { id: 'R-021' }));
      assert.equal((await latest()).status, 'completed'); assert.equal((await order()).items[0].returnTarget, 2); assert.deepEqual((await order()).rental, before.rental);
      assert.equal((await order()).totals.customerQuantity, 0); assert.match(await frame.locator('.so-rental-board').innerText(), /모두 확인 완료/);
      assert.match(await frame.locator('.so-rental-board').innerText(), /장비교환/);
    });
    await test('boots use one pair, require confirmed old components and actual replacement stock, and preserve ski rental', async () => {
      await open('ski-boots', 'shop'); await frame.getByLabel('교환 사유', { exact: true }).selectOption('size'); await click('교환 요청 저장'); assert.match(await frame.locator('#wf-error').innerText(), /기존 구성품/);
      await frame.locator('#exchange-component').check(); await click('교환 요청 저장'); await click('교환품 준비'); assert.match(await frame.locator('#wf-error').innerText(), /재고가 없습니다/);
      assert.equal((await order()).items.find(i => i.id === 'ski').customerQuantity, 2);
      await click('매장 보유 교환품 등록'); await frame.getByLabel('입고·실사 기록번호', { exact: true }).fill('boots-ui-count-1'); await click('보유 수량 등록'); await prepare('스키부츠');
      await click('새 장비 전달'); await frame.getByLabel('스키부츠 받음', { exact: true }).check(); await click('선택 수량 확인');
      await click('기존품 받음'); await frame.getByLabel('스키부츠 받음', { exact: true }).check(); await click('선택 수량 확인');
      const o = await order(); assert.equal(o.items.find(i => i.id === 'ski').customerQuantity, 2); assert.equal(o.items.find(i => i.component).customerQuantity, 1); assert.equal((await latest()).status, 'completed');
      await click('닫기');
      await frame.getByRole('tab', { name: '장비·리프트권', exact: true }).click();
      const component = o.items.find(i => i.component);
      assert.equal(await frame.locator('[data-product-id="' + component.id + '"] [data-product-issued]').innerText(), '1개');
      assert.equal(await frame.locator('[data-product-id="ski"] [data-product-issued]').innerText(), '2대');
      await page.screenshot({ path: 'work/exchange-boots-complete.png' });
    });
    await test('request cancellation restores the selected return, and stale input changes nothing', async () => {
      await open('ski', 'shop'); await frame.evaluate(() => SkiOps.workflow.run('stock.receive', { sku: 'helmet', quantity: 1 })); await click('교환 요청 저장'); assert.match(await frame.locator('#wf-error').innerText(), /변경됐습니다/); assert.equal(await frame.evaluate(() => SkiOps.workflow.snap().exchanges.length), 0);
      await click('취소'); await open('ski', 'shop'); await click('교환 요청 저장'); await click('요청 취소'); await frame.getByLabel('취소 사유', { exact: true }).fill('고객 요청 철회'); await click('교환 요청 취소');
      assert.equal((await order()).items[0].customerQuantity, 2); assert.equal((await latest()).status, 'cancelled');
    });
    await test('all six categories are available and the new form stays usable at POS and phone widths', async () => {
      await open(); assert.deepEqual(await frame.locator('#exchange-kind option').allTextContents(), ['스키', '스키부츠', '폴대', '보드', '보드부츠', '기타']);
      for (const width of [1024, 390]) { await page.setViewportSize({ width, height: 768 }); assert.ok(await frame.getByRole('button', { name: '교환 요청 저장', exact: true }).isVisible()); await frame.getByLabel('방문 장소', { exact: true }).fill('만선 광장'); await page.screenshot({ path: 'work/exchange-form-' + width + '.png' }); }
      await page.keyboard.press('Escape'); assert.equal(await frame.locator('#so-dialog').isVisible(), false);
    });
    assert.deepEqual(errors, []); fs.writeFileSync('work/rental-changes-functional.json', JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
