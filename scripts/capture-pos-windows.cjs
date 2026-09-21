const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { measure, totals, recorder } = require('./pos-ui-rules.cjs');
const output = path.resolve(process.env.SKI_WINDOWS_SCREENS_OUT || 'work/pos-ui-a3');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage(), checks = [], scenarios = [], errors = [], writes = [], rulesRecorder = recorder('workflow-windows');
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  let frame;
  const action = (name, id) => { const selector = '[data-action="' + name + '"]' + (id ? '[data-id="' + id + '"]' : ''); return frame.locator('#so-dialog[open] ' + selector + ', #ski-ops:not(:has(#so-dialog[open])) ' + selector); };
  const dialog = () => frame.locator('#so-dialog[open]');
  const field = name => dialog().locator('[data-pos-input="' + name + '"]');
  const click = async name => { const scope = await dialog().count() ? dialog() : frame; await scope.getByRole('button', { name, exact: true }).click(); };
  const snapshot = () => frame.evaluate(() => SkiOps.posData.snapshot);
  const finishHandover = async () => {
    for (let count = 0; await action('pos-closing-reason').count(); count++) {
      assert.ok(count < 100, 'handover must terminate');
      await action('pos-closing-reason').click(); await action('pos-closing-pick-reason', 'awaiting_payment').click(); await field('assignee').fill('매장 확인'); await action('pos-closing-next').click();
    }
  };
  try {
    const sizes = process.env.SKI_WINDOWS_QUICK ? [[1024, 600]] : [[1024, 600], [1024, 768], [1366, 768], [907, 648], [875, 600]];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:58148/', { waitUntil: 'networkidle' });
      frame = page.frames().find(item => item.parentFrame());
      await frame.waitForFunction(() => !!window.SkiOps?.posPreinput && !!window.SkiOps?.posData?.snapshot);
      if (await action('login-shop').count()) await action('login-shop').click();
      await frame.evaluate(async () => {
        const D = SkiOps.posData;
        await D.execute('order.create', { id: 'a3-team', customer: { name: '이수진', phone: '010-0000-0023' }, people: [{ id: 'p1', name: '일행 1' }, { id: 'p2', name: '일행 2' }], batch: { id: 'a3-batch', label: '첫 접수', lines: [
          { id: 'a3-ski', personId: 'p1', sku: 'ski', quantity: 1 }, { id: 'a3-board', personId: 'p2', sku: 'board', quantity: 1 }, { id: 'a3-ticket', sku: 'ticket-4h', quantity: 3 }
        ].map(line => ({ ...line, start: D.today, end: D.today, price: { unitWon: 20000 } })) } });
        await D.execute('order.create', { id: 'a3-representative', customer: { name: '박준호', phone: '010-0000-0022' }, batch: { id: 'a3-shared', lines: [{ id: 'a3-shared-ski', sku: 'ski', quantity: 2, start: D.today, end: D.today, price: { unitWon: 20000 } }] } });
        SkiOps.go('preparation');
      });
      const shot = async key => {
        await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const rules = await frame.evaluate(measure, { minFont: 16, minTarget: 52 });
        const geometry = await frame.evaluate(() => {
          const root = document.querySelector('#so-dialog[open]') || document.querySelector('.pos-page'), modal = root.id === 'so-dialog';
          const body = root.querySelector(modal ? '.pos-modal-body' : '.pos-page-body');
          return { dialog: modal ? root.getBoundingClientRect().toJSON() : null, body: { client: body.clientHeight, scroll: body.scrollHeight },
            outside: [...root.querySelectorAll('button,input,select,textarea,h2,.pos-row,.pos-line-row')].filter(el => el.getClientRects().length).map(el => ({ text: el.textContent.slice(0, 60), rect: el.getBoundingClientRect().toJSON() })).filter(({ rect: r }) => r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) };
        });
        const file = `${key}-${width}x${height}.png`;
        await page.screenshot({ path: path.join(output, file) });
        checks.push({ key, file, rules: totals(rules), geometry }); await rulesRecorder.add(key + '-' + width + 'x' + height, frame);
        assert.ok(Object.values(totals(rules)).every(value => value === 0), file + ': ' + JSON.stringify(rules));
        assert.ok(geometry.body.scroll <= geometry.body.client + 2, file + ': 본문 넘침'); assert.deepEqual(geometry.outside, [], file + ': 화면 밖');
        assert.ok(!geometry.dialog || geometry.dialog.height <= height - 48 + 1, file + ': 창 높이');
      };
      await action('pos-size-status').click(); await shot('size-status');
      await action('pos-size-prints', 'a3-representative').click(); assert.match(await frame.locator('#so-page').innerText(), /준비표/);
      await frame.evaluate(() => SkiOps.go('order-detail', { id: 'a3-representative' })); await action('pos-preinput').click(); await action('pos-preinput-new').click(); assert.equal(await action('pos-preinput-create').isDisabled(), true); await click('취소');
      await frame.evaluate(() => SkiOps.go('order-detail', { id: 'a3-team' })); await action('pos-preinput').click(); await shot('preinput');
      const beforeRequest = await snapshot(); await action('pos-preinput-new').click(); await shot('size-request');
      await action('pos-preinput-people').click(); await action('pos-preinput-person', 'p2').click(); await action('pos-preinput-request-back').click(); assert.match(await dialog().innerText(), /1명 입력 링크 준비/); assert.deepEqual(await snapshot(), beforeRequest);
      await action('pos-preinput-create').click(); assert.match(await dialog().innerText(), /고객 입력 체험/);
      const form = (await snapshot()).forms.find(form => form.orderId === 'a3-team'); assert.deepEqual(form.orderPersonIds, ['p1']); assert.equal((await snapshot()).deliveries.find(row => row.formId === form.id).status, 'prepared'); await click('닫기');
      await frame.evaluate(() => SkiOps.go('order-detail', { id: 'a3-team' })); await click('준비·지급하기'); await action('pos-ticket-issue', 'a3-ticket').click();
      await field('ticket-vendor').fill('vendor-check'); await action('pos-ticket-count', '-1').click(); assert.equal(await field('ticket-vendor').inputValue(), 'vendor-check');
      await shot('ticket'); const beforeTicket = await snapshot(); await action('pos-ticket-conditions').click(); await shot('ticket-conditions'); await click('유효시간 안에 양도 가능'); await click('선택 적용'); await click('취소'); assert.deepEqual(await snapshot(), beforeTicket); assert.match(await dialog().locator('#so-dialog-title').innerText(), /지급/);
      if (width === 1024 && height === 600) {
        await action('pos-ticket-issue', 'a3-ticket').click(); await field('ticket-vendor').fill('vendor-check');
        const changed = await frame.evaluate(async () => { await SkiOps.posData.execute('stock.receive', { sku: 'helmet', quantity: 1 }); return SkiOps.posData.snapshot; });
        await action('pos-ticket-conditions').click(); await click('선택 적용'); await click('실제 발권·배정 기록'); assert.match(await dialog().getByRole('alert').innerText(), /다른 처리|최신 수량/); assert.deepEqual(await snapshot(), changed); await shot('ticket-stale'); await click('취소');
        scenarios.push('권 조건 왕복 뒤에도 오래된 자료로 발권하지 않음');
      }
      await action('pos-ticket-issue', 'a3-ticket').click(); await field('ticket-vendor').fill('vendor-check'); await action('pos-ticket-count', '-1').click(); await click('실제 발권·배정 기록');
      const issued = (await snapshot()).orders.find(order => order.id === 'a3-team').lines.find(line => line.id === 'a3-ticket'); assert.equal(issued.issuedQuantity, 0); assert.equal(issued.unissuedQuantity, 3); assert.equal(issued.reservationBindings[0].assetIds.length, 2); await click('취소');
      await frame.evaluate(() => SkiOps.go('closing')); const beforeClosing = await snapshot(); await action('pos-closing-start').click(); await action('pos-closing-opening').click(); await field('closingOpening').fill('380000'); await click('선택 적용'); await field('countedCashWon').fill('360000'); await action('pos-closing-reason-edit').click(); await field('closingDifferenceReason').fill('실사 차이 기록'); await click('선택 적용'); await shot('closing-cash');
      await action('pos-closing-partners').click(); await click('마감으로'); assert.equal(await field('countedCashWon').inputValue(), '360000');
      await action('pos-closing-next').click(); await shot('closing-handover'); if (width === 1024 && height === 600) { await action('pos-closing-next').click(); assert.match(await dialog().getByRole('alert').innerText(), /사유와 담당자/); await shot('closing-handover-error'); } await finishHandover(); await shot('closing-confirm'); await click('취소'); assert.deepEqual(await snapshot(), beforeClosing);
      if (width === 1024 && height === 600) {
        await action('pos-closing-start').click(); await field('countedCashWon').fill('1'); await action('pos-closing-next').click(); assert.match(await dialog().getByRole('alert').innerText(), /현금 차이/); await shot('closing-error');
        await action('pos-closing-reason-edit').click(); await field('closingDifferenceReason').fill('검사 중 현금 실사'); await click('선택 적용'); await action('pos-closing-next').click(); await finishHandover();
        const changed = await frame.evaluate(async () => { await SkiOps.posData.execute('stock.receive', { sku: 'helmet', quantity: 1 }); return SkiOps.posData.snapshot; });
        await action('pos-closing-save').click(); assert.match(await dialog().getByRole('alert').innerText(), /다시 확인/); assert.deepEqual(await snapshot(), changed); await click('취소');
        await action('pos-closing-start').click(); await field('countedCashWon').fill('1'); await action('pos-closing-reason-edit').click(); await field('closingDifferenceReason').fill('검사 중 현금 실사'); await click('선택 적용'); await action('pos-closing-next').click(); await finishHandover(); await action('pos-closing-save').click(); assert.equal(await dialog().count(), 0); assert.equal((await snapshot()).closings.length, changed.closings.length + 1);
        scenarios.push('마감 차이 사유 필수, 취소 보존, 거래처 왕복 값 보존, 오래된 마감 거부, 현금·인계 확정');
      }
      await action('pos-notices').click(); await shot('alerts'); const beforeNotice = await snapshot();
      if (await action('pos-notice-detail').count()) {
        await action('pos-notice-detail').first().click(); assert.deepEqual(await snapshot(), beforeNotice); if (await action('pos-notice-ack').count()) { await action('pos-notice-ack').click(); assert.match(await dialog().innerText(), /확인 또는 업무/); }
      }
      if (width === 1024 && height === 600) scenarios.push('대표자 접수에 개인별 입력 강요 없음', '선택한 일행의 링크만 준비하고 자동 발송 없음', '발권 수량·발권처 보존과 취소 복귀, 발권 후 실제 지급은 별도', '알림 열람만으로 확인 처리하지 않음');
    }
    const uri = file => 'data:image/' + (file.endsWith('.jpg') ? 'jpeg' : 'png') + ';base64,' + fs.readFileSync(file).toString('base64');
    for (const [key, ref, actual, title] of [
      ['ticket', 'p27-popup-ticket', 'ticket', '발권'], ['closing', 'p28-popup-closing', 'closing-cash', '마감 확정'], ['size-status', 'p14-size-status', 'size-status', '사이즈 입력 현황'], ['size-request', 'p31-popup-size-request', 'size-request', '사이즈 요청'], ['alerts', 'p32-popup-alerts', 'alerts', '업무 알림']
    ]) {
      const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f4f2f8;color:#24222b;font-family:system-ui,sans-serif}h1{font-size:25px;margin:0 0 8px}p{font-size:17px;margin:0 0 20px;color:#575264}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:white;border:1px solid #dcd8e6;border-radius:12px;overflow:hidden}figcaption{font-size:19px;font-weight:650;padding:14px 16px;border-bottom:1px solid #e8e5ed}img{width:100%;height:352px;object-fit:contain;display:block;background:#fff}</style><h1>${title} · 기존 시안과 A3 구현</h1><p>현재 화면은 1024×600에서 촬영했습니다. 기존 글꼴과 공용 크기를 유지했습니다.</p><div class="pair"><figure><figcaption>기존 힉스필드 시안</figcaption><img src="${uri(path.resolve('design/higgsfield/pos-rest-v1', ref + '.jpg'))}"></figure><figure><figcaption>A3 구현 · 임시 체험 자료</figcaption><img src="${uri(path.join(output, actual + '-1024x600.png'))}"></figure></div><p style="margin-top:16px">날짜·이름·금액은 시안과 다릅니다. 발권·링크 준비·실물 처리는 기존 확인 절차를 유지합니다.</p></html>`;
      fs.writeFileSync(path.join(output, key + '-compare.html'), html); await page.setViewportSize({ width: 1280, height: 550 }); await page.setContent(html); await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode()))); await page.screenshot({ path: path.join(output, key + '-compare.png'), fullPage: true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify({ checks, scenarios, errors, writes }, null, 2));
    console.log(JSON.stringify({ screenshots: checks.length, scenarios, ruleTotals: checks.reduce((sum, check) => { for (const [key, value] of Object.entries(check.rules)) sum[key] = (sum[key] || 0) + value; return sum; }, {}), errors, writes }));
  } catch (error) { await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
