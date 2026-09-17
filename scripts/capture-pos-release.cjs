'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('docs/pos-ui-v3'); fs.mkdirSync(out, { recursive: true });
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
      assert.deepEqual(geometry.overflow, [], key + ' overflow'); assert.equal(geometry.bodyScroll, false, key + ' core body scroll'); checks.push({ key, ...geometry });
      const file = key + '-' + geometry.viewport.join('x') + '.png'; await page.screenshot({ path: path.join(out, file) }); screens.push({ title, detail, file, size: geometry.viewport.join('×') });
    }
    const menus = [['home', '오늘 할 일', '9단계 업무 카드와 지금 급한 일을 한 화면에서 시작합니다.'], ['intake', '1 접수·예약', '수령 시간대별 카드 · 오늘/내일/전체 · 달력 · 정렬.'], ['preparation', '2 준비·지급', '사이즈 요청·지급·수납 버튼을 카드마다 하나씩 둡니다.'], ['rentals', '3 이용 중·변경', '이용 중 팀의 기간·수거 변경과 교환 진행을 확인합니다.'], ['returns', '4 반납·회수', '반납 타임별 카드 · 모두 받음 · 차량 입고 확인.'], ['closing', '5 정산·마감', '수납 대기·보증금·거래처 카드와 마감 확정.'], ['tickets', '리프트권', '발권 필요 · 지급 대기 · 사용 중 · 보관 권을 카드로 확인합니다.'], ['dispatch', '차량 운행', '차량별 배달·수거 카드와 보관 물품.'], ['management', '관리', '재고·거래처·고객·매장 설정·인쇄물·마감 이력 6장.'], ['settings', '매장 설정', '왼쪽 항목 탭 · 매장 정보 탭 추가.'], ['closing-history', '마감 이력', '날짜별 마감표 카드.']];
    for (const size of [{ width: 1024, height: 600 }, { width: 1024, height: 768 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(size);
      for (const [route, title, detail] of menus) { await frame.evaluate(route => window.SkiOps.go(route), route); await capture(route, title, detail); }
    }
    await page.setViewportSize({ width: 1024, height: 600 });
    await frame.evaluate(() => window.SkiOps.go('intake'));
    await frame.locator('[data-action="pos-new"]').click();
    await frame.locator('[data-pos-input="name"]').fill('30명 일행 추가 검증팀'); await frame.locator('[data-pos-input="phone"]').fill('010-1234-5678');
    await frame.locator('[data-action="pos-draft-next"]').click(); await frame.locator('[data-pos-input="personId"]').selectOption('__many'); await frame.locator('[data-action="pos-people-add"][data-id="30"]').click();
    await frame.locator('[data-action="pos-line-add"]').click(); await capture('group-30', '30명 일행 한 번에 접수', '실명 입력 없이 30명에게 사람별 품목 행을 생성합니다. 목록은 페이지로 나누고 합계와 확정은 고정합니다.');
    await frame.locator('[data-action="pos-draft-next"]').click(); await capture('group-review', '추가 전 최종 확인', '이번 인원·품목·기간·청구액을 확인한 뒤 저장합니다.');
    await frame.locator('[data-action="pos-draft-save"]').click(); await frame.locator('[data-action="pos-add"]').waitFor();
    assert.equal(await frame.evaluate(() => window.SkiOps.posData.order().people.length), 30);
    assert.equal(await frame.evaluate(() => window.SkiOps.posData.order().lines.length), 30);
    await capture('order-detail', '통합접수 상세', '일행 추가, 사전입력, 기간 변경, 수납과 문제 해결을 한 접수에서 이어갑니다.');
    await frame.locator('[data-action="pos-preinput"]').click(); await capture('preinput', '사전입력·준비표', '이번 차수에서 새로 입력할 일행만 요청합니다.');
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
    await frame.locator('[data-go="order-detail"]').first().click(); await capture('twelve-products', '12종 품목 · 개별 일정', '여러 품목의 수량과 일정이 별도 행으로 유지됩니다.');
    assert.deepEqual(errors, []);
    const report = { generatedAt: new Date().toISOString(), mode: 'static memory demonstration; screenshots are not evidence of physical hardware', checks, errors, screens };
    fs.writeFileSync(path.join(out, 'screens.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SKINOTE UI v3 화면</title><style>body{margin:0;background:#f3f1f8;color:#242031;font:17px/1.6 system-ui,sans-serif}header,main{max-width:1400px;margin:auto;padding:28px}h1{margin:0}nav{display:flex;gap:12px;flex-wrap:wrap}button{font:inherit;padding:10px 16px;border:1px solid #ccc;border-radius:10px;background:white;cursor:pointer}article{background:white;border:1px solid #ded9e6;border-radius:16px;padding:22px;margin:24px 0}img{width:100%;height:auto;border:1px solid #ddd}p{margin:8px 0 18px}.tag{color:#66508c}a{color:#574282}</style><header><h1>SKINOTE · UI v3 화면 모음</h1><p>2026-09-16 · 96px 아이콘 레일 · 카드 목록 · 표준 문구로 바꾼 화면을 브라우저에서 촬영했습니다. 아래 기본 메뉴·단체 접수는 체험 데이터입니다. 화면 전체를 눌러 원본 크기로 확인할 수 있습니다.</p><p>핵심 고정 영역: 고객·접수번호, 수량·금액, 다음 처리·확정. 실제 표시 영역 1024×600 / 1024×768 / 1366×768에서 검사했습니다. 실물 포스·프린터·문자·카드 단말 검증은 별도입니다.</p><nav><button onclick="pick(\'all\')">모두</button><button onclick="pick(\'1024×600\')">1024×600</button><button onclick="pick(\'1024×768\')">1024×768</button><button onclick="pick(\'1366×768\')">1366×768</button></nav></header><main>' + screens.map(s => '<article data-size="' + s.size + '"><span class="tag">' + s.size + '</span><h2>' + escape(s.title) + '</h2><p>' + escape(s.detail) + '</p><a href="' + s.file + '"><img loading="lazy" src="' + s.file + '" alt="' + escape(s.title) + '"></a></article>').join('') + '</main><script>function pick(size){for(const el of document.querySelectorAll("article"))el.hidden=size!=="all"&&el.dataset.size!==size}</script></html>');
    console.log(JSON.stringify({ screenshots: screens.length, geometryChecks: checks.length, errors: errors.length, output: out }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
