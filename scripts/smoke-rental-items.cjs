const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [], checks = []; let frame;
  page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  const click = name => frame.getByRole('button', { name, exact: true }).click();
  const tab = name => frame.getByRole('tab', { name, exact: true }).click();
  const card = id => frame.locator('[data-product-id="' + id + '"]');
  const fresh = async id => {
    await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58151/', { waitUntil: 'networkidle' });
    frame = page.frames().find(f => f.parentFrame());
    await frame.evaluate(id => { SkiOps.state.authenticated = true; SkiOps.state.tabs.rental = 'items'; SkiOps.go('rental', { id }); }, id);
    await frame.evaluate(() => document.fonts.ready);
  };
  const test = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
  fs.mkdirSync('work/rental-item-cards', { recursive: true });
  try {
    await test('equipment and tickets use separate quantities and ticket dates, without summing rental days', async () => {
      await fresh('R-025');
      assert.equal(await card('ski').locator('[data-product-issued]').innerText(), '4대');
      assert.equal(await card('lift-day1').locator('[data-product-issued]').innerText(), '4매');
      assert.equal(await card('lift-day2').locator('[data-product-issued]').innerText(), '0매');
      assert.equal(await card('lift-day2').locator('[data-product-planned]').innerText(), '3매');
      assert.match(await card('lift-day1').innerText(), /9\/9 이용/); assert.match(await card('lift-day2').innerText(), /9\/10 이용/);
      assert.match(await frame.locator('.rental-daily-grid').innerText(), /스키 4대.*80,000원.*스키 3대.*60,000원/s);
      assert.doesNotMatch(await frame.locator('.rental-products').innerText(), /실제 장비 수량|실제 지급\s*8\b/);
      assert.match(await frame.locator('.rental-summary-breakdown').first().innerText(), /스키 3대.*오후권 성인 4매/);
    });
    await test('pending skis and clothing stay at zero until the existing issue button delivers them', async () => {
      await fresh('R-027');
      assert.equal(await card('ski').locator('[data-product-issued]').innerText(), '0대');
      assert.equal(await card('clothes').locator('[data-product-planned]').innerText(), '2벌');
      assert.doesNotMatch(await frame.locator('.so-rental-board').innerText(), /발 사이즈|240mm|260|의류 L|사이즈/);
      assert.equal(await frame.locator('.rental-product-note').count(), 0);
      await click('장비 지급 확인');
      assert.equal(await card('ski').locator('[data-product-issued]').innerText(), '2대');
      assert.equal(await card('clothes').locator('[data-product-issued]').innerText(), '2벌');
      assert.equal(await card('clothes').locator('[data-product-count="customer"] strong').innerText(), '2벌');
    });
    await test('partial returns change only that item custody while issued quantity and price stay stable', async () => {
      await fresh('R-021');
      const before = await frame.evaluate(() => SkiOps.workflow.projectOrder('R-021').rental);
      await tab('반납 확인'); await click('고객 직접반납 받음'); await click('스키 수량 늘리기'); await click('직접반납 처리'); await tab('장비·리프트권');
      assert.equal(await card('ski').locator('[data-product-issued]').innerText(), '2대');
      assert.equal(await card('ski').locator('[data-product-count="customer"] strong').innerText(), '1대');
      assert.equal(await card('ski').locator('[data-product-count="confirmed"] strong').innerText(), '1대');
      assert.equal(await card('clothes').locator('[data-product-count="customer"] strong').innerText(), '2벌');
      assert.deepEqual(await frame.evaluate(() => SkiOps.workflow.projectOrder('R-021').rental), before);
      await click('일부 조기반납'); assert.equal(await frame.getByLabel('스키 조기반납', { exact: true }).count(), 1);
      await click('취소'); // The user paused redesigning this existing popup.
    });
    await test('vehicle custody only becomes store-confirmed after the existing handoff action', async () => {
      await fresh('R-024');
      assert.equal(await card('ski').locator('[data-product-count="vehicle"] strong').innerText(), '1대');
      assert.equal(await card('ski').locator('[data-product-count="confirmed"] strong').innerText(), '0대');
      await tab('반납 확인'); await click('차량 인수분 최종 확인'); await click('매장 확인 완료'); await tab('장비·리프트권');
      assert.equal(await card('ski').locator('[data-product-count="vehicle"] strong').innerText(), '0대');
      assert.equal(await card('ski').locator('[data-product-count="confirmed"] strong').innerText(), '1대');
      assert.match(await card('ski').innerText(), /반납 완료/);
    });
    await test('POS, low-height and phone layouts retain readable numbers, correct bounds and visible card content', async () => {
      for (const size of [[1366,768], [1024,768], [907,648], [390,740]]) {
        await page.setViewportSize({ width: size[0], height: size[1] });
        for (const id of ['R-025', 'R-027']) {
          await fresh(id);
          const measurements = await frame.locator('.rental-product-card').evaluateAll(cards => cards.map(card => {
            const box = card.getBoundingClientRect(), issued = card.querySelector('[data-product-issued] span');
            const counts = [...card.querySelectorAll('[data-product-count]')].map(node => node.getBoundingClientRect());
            return { left: box.left, right: box.right, scroll: card.scrollWidth, width: card.clientWidth, numberSize: parseFloat(getComputedStyle(issued).fontSize), counts: counts.map(r => ({ left: r.left, right: r.right })) };
          }));
          assert.ok(measurements.every(m => m.left >= 0 && m.right <= size[0] + 1 && m.scroll <= m.width + 1 && m.numberSize >= 26), JSON.stringify({ size, id, measurements }));
          for (const m of measurements) assert.ok(m.counts.every((c, index) => c.left >= m.left && c.right <= m.right && (index === 0 || c.left >= m.counts[index-1].right)));
          await page.screenshot({ path: 'work/rental-item-cards/' + id + '-' + size[0] + '.png' });
        }
      }
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync('work/rental-item-cards/functional.json', JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
