'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { measure, totals } = require('./pos-ui-rules.cjs');
// UI v4 촬영본은 docs/pos-ui-v4에 쓴다. docs/pos-ui-v3은 v3 기록이므로 덮어쓰지 않는다. SKI_SCREENS_OUT으로 바꿀 수 있다.
const out = path.resolve(process.env.SKI_SCREENS_OUT || 'docs/pos-ui-v4'); fs.mkdirSync(out, { recursive: true });
const sizes = [{ width: 1024, height: 600 }, { width: 1024, height: 768 }, { width: 1366, height: 768 }, { width: 907, height: 648 }];
const escape = value => String(value).replace(/[&<>\"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  const errors = [], checks = [], screens = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/');
    const frame = page.frames().find(f => f.parentFrame());
    await frame.waitForFunction(() => window.SkiOps?.posData?.snapshot?.orders?.length);
    await frame.evaluate(() => { window.SkiOps.state.authenticated = true; window.SkiOps.go('home'); });
    async function capture(key, title, detail) {
      await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await frame.evaluate(() => {
        const container = document.querySelector('#so-dialog[open]') || document.querySelector('.pos-page');
        const boxes = [...container.querySelectorAll('.pos-page-body,.pos-modal-body,.pos-page-footer,.pos-modal-footer,h1,h2,p,input:not([type="hidden"]),select,button,.pos-row')].filter(el => { if (!(el.getClientRects().length && getComputedStyle(el).display !== 'none')) return false; const scroller = el.closest('[data-pos-scroll]'); if (!scroller) return true; const r = el.getBoundingClientRect(), s = scroller.getBoundingClientRect(); return r.top >= s.top - 1 && r.bottom <= s.bottom + 1; });
        return { viewport: [innerWidth, innerHeight], overflow: boxes.filter(el => { const r = el.getBoundingClientRect(); return r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1 || r.left < -1 || el.scrollHeight > el.clientHeight + 2 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY); }).map(el => ({ text: el.textContent.trim().slice(0, 70), tag: el.tagName })), bodyScroll: [...container.querySelectorAll('.pos-page-body,.pos-modal-body')].some(el => el.scrollHeight > el.clientHeight + 2) };
      });
      assert.deepEqual(geometry.overflow, [], key + ' overflow'); assert.equal(geometry.bodyScroll, false, key + ' core body scroll');
      // The store header spans the full viewport; every rail item must remain below it and visible.
      const shell = await frame.evaluate(() => {
        if (document.querySelector('#ski-ops').dataset.actor === 'driver') return null;
        const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { header: box('.so-topbar'), rail: box('.so-sidebar'), main: box('#so-main'),
          items: [...document.querySelectorAll('.pos-rail-item')].map(el => ({ label: el.textContent, ...el.getBoundingClientRect().toJSON() })) };
      });
      if (shell) {
        assert.equal(shell.header.left, 0, key + ' header left'); assert.equal(shell.header.width, geometry.viewport[0], key + ' full-width header');
        assert.equal(shell.rail.top, shell.header.bottom, key + ' rail below header');
        assert.equal(shell.main.top, shell.header.bottom, key + ' main below header'); assert.equal(shell.main.left, shell.rail.right, key + ' main beside rail');
        assert.ok(shell.items.length === 9 || shell.items.length === 7, key + ' complete store menu');
        assert.deepEqual(shell.items.filter(r => r.top < shell.rail.top || r.bottom > geometry.viewport[1] + 1 || r.left < 0 || r.right > shell.rail.right + 1 || r.height < 52), [], key + ' fully visible rail targets');
      }
      const rules = await frame.evaluate(measure, { minFont: 16, minTarget: 52 }); checks.push({ key, ...geometry, shell, rules, ruleTotals: totals(rules) });
      const file = key + '-' + geometry.viewport.join('x') + '.png'; await page.screenshot({ path: path.join(out, file) }); screens.push({ title, detail, file, size: geometry.viewport.join('×') });
    }
    const menus = [['home', '오늘 할 일', '지금 급한 일 한 줄과 여섯 가지 업무 타일. 타일 전체가 누르는 곳입니다.'], ['intake', '1 접수·예약', '수령 시간대별 카드 · 오늘/내일/전체 · 달력 · 정렬.'], ['preparation', '2 준비·지급', '사이즈 요청·지급·수납 버튼을 카드마다 하나씩 둡니다.'], ['rentals', '3 이용 중·변경', '이용 중 팀의 기간·수거 변경과 교환 진행을 확인합니다.'], ['returns', '4 반납·회수', '반납 타임별 카드 · 모두 받음 · 차량 입고 확인.'], ['closing', '5 정산·마감', '왼쪽은 수납 대기 행(한 줄 전체가 누르는 곳), 오른쪽은 오늘 마감 준비.'], ['tickets', '리프트권', '발권 필요 · 지급 대기 · 사용 중 · 보관 권을 카드로 확인합니다.'], ['dispatch', '차량 운행', '차량별 배달·수거 카드와 보관 물품.'], ['management', '관리', '재고·거래처·고객·매장 설정·인쇄물·마감 이력 6장.'], ['settings', '매장 설정', '왼쪽 항목 탭 · 매장 정보 탭 추가.'], ['closing-history', '마감 이력', '날짜별 마감표 카드.']];
    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const [route, title, detail] of menus) { await frame.evaluate(route => window.SkiOps.go(route), route); await capture(route, title, detail); }
    }
    await page.setViewportSize({ width: 1024, height: 600 });
    await frame.evaluate(() => window.SkiOps.go('intake'));
    await frame.locator('[data-action="pos-new"]').click();
    for (const key of ['0', '0', '2', '5']) await frame.locator('[data-action="pos-find-key"][data-id="' + key + '"]').click();
    await capture('intake-customer', '새 접수 1 · 고객 찾기', '연락처 끝 4자리로 기존 고객을 찾고, 처음 온 고객은 이름과 연락처만 입력합니다.');
    await frame.locator('[data-action="pos-find-new"]').click();
    await frame.locator('[data-pos-input="name"]').fill('30명 일행 추가 검증팀'); await frame.locator('[data-pos-input="phone"]').fill('010-1234-5678');
    await frame.locator('[data-action="pos-draft-next"]').click();
    await frame.locator('[data-action="pos-grid-add"][data-id="ski"]').click(); await frame.locator('[data-action="pos-grid-add"][data-id="ski"]').click(); await frame.locator('[data-action="pos-grid-add"][data-id="helmet"]').click();
    await capture('intake-items', '새 접수 2 · 품목', '품목을 누르면 1개씩 늘어나고, 오른쪽에서 수량·이용 일수·합계를 확인합니다.');
    await frame.locator('[data-action="pos-line-step"][data-id$=":-1"]').first().click(); await frame.locator('[data-action="pos-line-step"][data-id$=":-1"]').first().click(); await frame.locator('[data-action="pos-line-step"][data-id$=":-1"]').first().click();
    await frame.locator('[data-action="pos-people-many"]').click(); await frame.locator('[data-action="pos-people-add"][data-id="30"]').click();
    await frame.locator('[data-action="pos-grid-add"][data-id="ski"]').click(); await frame.locator('[data-action="pos-person-copy"][data-id="rest"]').click();
    await capture('group-30', '30명 일행 한 번에 접수', '실명 없이 30명을 만들고, 한 사람의 품목을 남은 일행 모두에게 같게 넣습니다. 일행 목록은 쪽으로 나눕니다.');
    await frame.locator('[data-action="pos-draft-next"]').click(); await capture('group-review', '새 접수 3 · 일정·장소', '수령일·이용 일수·수령 시간·장소·반납 시간을 버튼으로 고르고 합계를 확인합니다.');
    await frame.locator('[data-action="pos-place-open"]').first().click(); await capture('intake-place', '수령 장소 선택', '구역을 바꿔 가며 장소를 큰 버튼으로 고릅니다. 장소가 늘어도 접수 화면은 구역 버튼만 보입니다.');
    await frame.locator('[data-action="pos-place-choose"]').first().click(); await frame.locator('[data-action="pos-place-save"]').click();
    await frame.locator('[data-action="pos-draft-save"]').click(); await frame.locator('[data-action="pos-confirm-discount"][data-id="gear:perUnit"]').click();
    await capture('intake-confirm', '접수 확정 · 할인과 수납', '장비와 리프트권을 나눠 할인 하나와 결제 수단을 고르고 그 자리에서 수납합니다. 나중에 수납도 됩니다.');
    await frame.locator('[data-action="pos-confirm-save"][data-id="pay"]').click(); await frame.locator('#so-dialog[open] [data-go="intake"]').waitFor();
    await capture('intake-done', '접수 완료', '접수번호와 품목·일정·합계를 보여 주고 다음 할 일로 이어집니다.');
    await frame.locator('#so-dialog [data-action="close"]').last().click(); await frame.locator('[data-action="pos-add"]').waitFor();
    assert.equal(await frame.evaluate(() => window.SkiOps.posData.order().people.length), 30);
    assert.equal(await frame.evaluate(() => window.SkiOps.posData.order().lines.length), 30);
    await capture('order-detail', '통합접수 상세', '일행 추가, 사전입력, 기간 변경, 수납과 문제 해결을 한 접수에서 이어갑니다.');
    await frame.locator('[data-action="pos-preinput"]').click(); await capture('preinput', '사전입력·준비표', '이번 차수에서 새로 입력할 일행만 요청합니다.');
    await frame.evaluate(() => window.SkiOps.go('settings')); await frame.locator('[data-action="pm-settings-tab"][data-id="places"]').click(); await capture('settings-places', '매장 설정 · 수령 장소(구역별)', '구역 칩으로 나눠 그 구역의 장소만 봅니다. 스키장 템플릿으로 처음 값을 채웁니다.');
    await frame.locator('[data-action="pm-template"]').click(); await capture('settings-template', '스키장 템플릿', '스키장을 고르면 구역 · 장소 · 반납 타임 · 리프트권 권종이 채워집니다. 요금과 할인은 그대로.'); await frame.locator('#so-dialog [data-action="close"]').first().click();
    await frame.locator('[data-action="pm-settings-tab"][data-id="discounts"]').click(); await capture('settings-discounts', '매장 설정 · 할인', '장비당(하루 기준) · % · 금액 · 리프트권 % — 접수 확정 창의 할인 버튼으로 나옵니다.');
    await frame.evaluate(() => window.SkiOps.go('home')); await frame.locator('#pos-notice-bell').click(); await capture('notifications', '업무 알림', '현재 저장소의 업무 알림을 페이지로 확인하고 해당 업무를 엽니다.');
    await frame.evaluate(() => window.SkiOps.close());
    // Demo driver entry: 나가기 → 차량 화면 must show the driver row list without the rail, and 매장 POS must bring the rail back.
    await frame.locator('.so-topbar [data-action="logout"]').click(); await frame.locator('[data-action="login-vehicle"]').click(); await frame.locator('[data-pos-list-key="dispatch-tasks"]').waitFor();
    assert.equal(await frame.evaluate(() => document.querySelector('#ski-ops').dataset.actor), 'driver'); assert.equal(await frame.locator('.pos-rail').count(), 0);
    await capture('driver-demo', '차량 화면 (체험 기사 로그인)', '로그인 화면의 차량 화면으로 들어가면 기사 태블릿과 같은 행 목록을 봅니다.');
    await frame.locator('.so-topbar [data-action="logout"]').click(); await frame.locator('[data-action="login-shop"]').click(); await frame.locator('.pos-rail').waitFor();
    assert.equal(await frame.evaluate(() => document.querySelector('#ski-ops').dataset.actor), 'store');
    await frame.evaluate(async () => {
      const S = window.SkiOps, date = window.SkiWorkflowCommon.nextDate(S.posData.today);
      for (let i = 0; i < 12; i++) S.workflow.run('catalog.add', { id: 'qa-gear-' + i, label: '확인 장비 ' + (i + 1), kind: 'equipment', unit: '개' });
      for (let i = 0; i < 100; i++) S.workflow.run('order.create', { id: 'qa-order-' + i, customer: { name: '아주 긴 이름의 단체 접수 대표자 · 여러 일행 방문 확인 ' + (i + 1), phone: '010-1234-5678' }, batch: { id: 'qa-batch', lines: Array.from({ length: 12 }, (_, n) => ({ id: 'qa-line-' + n, sku: 'qa-gear-' + n, quantity: 1, start: date, end: date, price: { unitWon: 10000 } })) } });
      await S.posData.refresh(); S.go('preparation');
    });
    await frame.locator('[data-action="pos-period"][data-id="today"]').click();
    assert.ok(!(await frame.locator('.pos-cards').innerText()).includes('아주 긴 이름'));
    await frame.locator('[data-action="pos-period"][data-id="tomorrow"]').click();
    assert.ok((await frame.locator('.pos-cards').innerText()).includes('아주 긴 이름'));
    await capture('tomorrow-100', '내일 100팀 · 긴 이름', '오늘 준비와 내일 도착을 나누고, 긴 이름과 많은 기록도 페이지로 확인합니다.');
    await frame.evaluate(() => window.SkiOps.go('order-detail', { id: 'qa-order-0' })); assert.equal(await frame.evaluate(() => window.SkiOps.posData.order().lines.length), 12); await capture('twelve-products', '12종 품목 · 개별 일정', '여러 품목의 수량과 일정이 별도 행으로 유지됩니다.');
    assert.deepEqual(errors, []);
    const report = { generatedAt: new Date().toISOString(), mode: 'static memory demonstration; screenshots are not evidence of physical hardware', checks, errors, screens };
    fs.writeFileSync(path.join(out, 'screens.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SKINOTE UI v4 화면</title><style>body{margin:0;background:#f3f1f8;color:#242031;font:17px/1.6 system-ui,sans-serif}header,main{max-width:1400px;margin:auto;padding:28px}h1{margin:0}nav{display:flex;gap:12px;flex-wrap:wrap}button{font:inherit;padding:10px 16px;border:1px solid #ccc;border-radius:10px;background:white;cursor:pointer}article{background:white;border:1px solid #ded9e6;border-radius:16px;padding:22px;margin:24px 0}img{width:100%;height:auto;border:1px solid #ddd}p{margin:8px 0 18px}.tag{color:#66508c}a{color:#574282}</style><header><h1>SKINOTE · UI v4 화면 모음</h1><p>' + escape(new Date().toISOString().slice(0, 10)) + ' · 큰 글자 · 잘린 글자 0 · 스크롤 0을 목표로 다듬는 중인 화면을 브라우저에서 촬영했습니다(계획과 진행은 docs/42). 아래 기본 메뉴·단체 접수는 체험 데이터입니다. 화면 전체를 눌러 원본 크기로 확인할 수 있습니다.</p><p>실제 표시 영역 1024×600 / 1024×768 / 1366×768 / 907×648에서 촬영하면서 16px 미만 글자 · 잘린 글자 · 반쯤 잘린 카드 · 낮은 누르는 곳 · 스크롤을 셉니다(screens.json). 실물 포스·프린터·문자·카드 단말 검증은 별도입니다.</p><nav><button onclick="pick(\'all\')">모두</button>' + sizes.map(size => '<button onclick="pick(\'' + size.width + '×' + size.height + '\')">' + size.width + '×' + size.height + '</button>').join('') + '</nav></header><main>' + screens.map(s => '<article data-size="' + s.size + '"><span class="tag">' + s.size + '</span><h2>' + escape(s.title) + '</h2><p>' + escape(s.detail) + '</p><a href="' + s.file + '"><img loading="lazy" src="' + s.file + '" alt="' + escape(s.title) + '"></a></article>').join('') + '</main><script>function pick(size){for(const el of document.querySelectorAll("article"))el.hidden=size!=="all"&&el.dataset.size!==size}</script></html>');
    const ruleSum = checks.reduce((sum, check) => { for (const [metric, n] of Object.entries(check.ruleTotals)) sum[metric] = (sum[metric] || 0) + n; return sum; }, {});
    console.log(JSON.stringify({ screenshots: screens.length, geometryChecks: checks.length, errors: errors.length, rules: ruleSum, output: out }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
