// Render the unchanged supplied UI 7 file with equal ledger-derived data.
// Only the explicitly requested behavior, bell and existing app boundaries
// are adapted in the isolated reference browser, never in the source file.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { PNG } = require(path.join(path.dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
const directory = process.env.SKI_VEHICLE_REFERENCE_DIR || fs.readdirSync('/Users/sookwan/Downloads').map(p => path.join('/Users/sookwan/Downloads', p)).find(p => path.basename(p).normalize('NFC') === '# 스키렌탈샵 UI 개선 7');
const name = fs.readdirSync(directory).find(p => p.normalize('NFC') === '06 차량 배달·수거.dc.html');
const original = fs.readFileSync(path.join(directory, name), 'utf8');
const base = process.env.SKI_VEHICLE_REFERENCE_URL || 'http://127.0.0.1:58150/', url = base + encodeURIComponent(name);
const output = 'work/vehicle-ui-parity'; fs.mkdirSync(output, { recursive: true });
function reference() {
  let s = original.replace('<button type="button" onClick="{{ openInbox }}" style="{{ inboxStyle }}">알림함<span style="{{ inboxCountStyle }}">{{ inboxCount }}</span></button>', '<div data-vehicle-bell style="display:flex;flex-shrink:0;width:56px;height:56px"></div>');
  s = s.replace('<h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;line-height:1.2">배달 · 수거</h1>', '<h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;line-height:1.2"><button type="button" aria-label="매장 화면으로" style="font:inherit;letter-spacing:inherit;line-height:inherit;color:inherit;background:transparent;border:0;padding:0">배달 · 수거</button></h1>');
  s = s.replace(/hasLot: !!L,[\s\S]*?hasGuard: notInHand,/, "hasLot: !!selected?.lotLine, lotLine: selected?.lotLine || '', hasGuard: notInHand,");
  s = s.replace(/const notInHand = .*?;/, 'const notInHand = !!selected?.needsLoad;');
  s = s.replace(/'아직 회수하지 않은 리프트권이 있어 전달 완료로 처리할 수 없어요\.[^\n]+/, "'발권·적재 또는 앞 고객 수거가 필요한 물품이 있습니다. 실제 차량에 있는 수량만 전달할 수 있습니다.'");
  s = s.replace("return '이동 중 · 출발 안내 보냄'", "return '처리 중'");
  s = s.replaceAll('missing', 'received').replaceAll('setMissing', 'setReceived');
  s = s.replace("primary: '이 내용으로 ' + K.done", "primary: '선택 수량 저장'");
  s = s.replace("partialGuide: selected ? K.miss + ' 품목을 눌러 주세요. 누르면 이번 대상 전량이 ' + K.miss + ' 수량으로 표시돼요.' : ''", "partialGuide: selected?.task?.kind === 'delivery' ? '실제로 전달한 품목을 체크하고 전달한 수량을 맞춰 주세요.' : '받은 품목을 체크하고 실제 받은 수량을 맞춰 주세요.'");
  s = s.replace("partialEmpty: selected ? K.miss + ' 품목을 선택하세요' : ''", "partialEmpty: '아직 받은 품목이 없습니다.'");
  s = s.replace("(on ? K.miss + ' 수량 ' + miss + ' · ' : '모두 처리 · ')", "(on ? '받은 수량 ' + miss + ' · ' : '미선택 · ')");
  s = s.replace('decOff: miss <= 1', 'decOff: miss <= 0');
  s = s.replace('const draft = selected ? F.split(selected, s.draft ? s.draft.received : {})', 'const draft = selected ? F.split(selected, Object.fromEntries(Object.keys(selected.items).map(k => [k, selected.items[k] - (s.draft?.received?.[k] || 0)])))');
  s = s.replace(/draftLeft: draft.left.map\(l => \{[^\n]+/, "draftLeft: draft.left.map(l => ({ name:l.name,qty:l.qty,tag:'기존 일정 유지',tagStyle:'font-size:15px;font-weight:700;padding:5px 10px;border-radius:8px;background:#EDE8FF;color:#4A25BC;' })),");
  return s;
}
const measure = el => [...el.querySelectorAll('h1,h2,button,strong,output')].filter(e => !e.closest('[data-vehicle-bell]') && e.getBoundingClientRect().width).map(e => {
  const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return { tag: e.tagName, text: e.textContent.replace(/\s+/g, ' ').trim(), x: r.x, y: r.y, width: r.width, height: r.height, font: s.fontFamily, size: s.fontSize, weight: s.fontWeight, line: s.lineHeight, spacing: s.letterSpacing, color: s.color, background: s.backgroundColor, padding: s.padding, radius: s.borderRadius, border: s.border, shadow: s.boxShadow };
});
function pixels(a, b, target) {
  const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height);
  const diff = new PNG({ width: x.width, height: x.height }); let count = 0, visible = 0, max = 0;
  for (let i = 0; i < x.data.length; i += 4) { let delta = 0; for (let k = 0; k < 3; k++) delta = Math.max(delta, Math.abs(x.data[i + k] - y.data[i + k])); if (delta) count++; if (delta > 8) visible++; max = Math.max(max, delta); diff.data.set(delta ? [255, 0, 180, 255] : [x.data[i], x.data[i + 1], x.data[i + 2], 255], i); }
  if (count) fs.writeFileSync(target, PNG.sync.write(diff)); return { count, visible, visiblePercent: visible * 100 / (x.width * x.height), percent: count * 100 / (x.width * x.height), max };
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), app = await browser.newPage(), ref = await browser.newPage();
  const results = [], errors = []; app.on('pageerror', e => errors.push(e.message)); ref.on('pageerror', e => errors.push(e.message));
  try {
    await app.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58151/', { waitUntil: 'networkidle' }); const frame = app.frames().find(f => f.parentFrame());
    const data = await frame.evaluate(() => { SkiOps.state.authenticated = true; SkiOps.go('vehicle'); return SkiOps.vehicleBoard.snapshot(); });
    const fleet = '(()=>{const d=' + JSON.stringify(data) + ';window.SkiFleet={ITEMS:d.items,VEHICLES:d.vehicles,KINDS:d.kinds,subscribe:()=>()=>{},jobsOf:(v,n)=>d.jobs.filter(j=>j.vehicleId===v&&j.dateOffset===n),isDone:j=>j.status==="done",stock:()=>({st:d.st,collected:d.collected,refund:d.refund}),notices:()=>d.notices,job:id=>d.jobs.find(j=>j.id===id),item:key=>d.items.find(i=>i.key===key),liftView:()=>d.liftView,lot:()=>null,split:(j,missing)=>{const taken=[],left=[];for(const i of d.items){const n=j.items[i.key]||0,m=Math.max(0,Math.min(n,missing?.[i.key]||0));if(n>m)taken.push({key:i.key,name:i.short,qty:n-m});if(m)left.push({key:i.key,name:i.short,qty:m});}return{taken,left};}};})();';
    await ref.route(base + 'fleet-data.js', r => r.fulfill({ contentType: 'text/javascript', body: fleet })); await ref.route(url, r => r.fulfill({ contentType: 'text/html', body: reference() }));
    await ref.goto(url, { waitUntil: 'networkidle' });
    for (const p of [frame, ref]) await p.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}#so-notice-bell{visibility:hidden!important}'});
    const click = async name => { await frame.getByRole('button', { name, exact: true }).click(); await ref.getByRole('button', { name, exact: true }).click(); };
    async function capture(name) {
      await Promise.all([frame.evaluate(() => document.fonts.ready), ref.evaluate(() => document.fonts.ready)]);
      await app.mouse.move(0, 0); await ref.mouse.move(0, 0); for (const p of [frame, ref]) await p.evaluate(() => { document.activeElement?.blur(); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
      const selector = '[data-screen-label="차량 배달·수거"]', actual = frame.locator(selector), expected = ref.locator(selector), prefix = output + '/' + name + '-' + app.viewportSize().width;
      const [am, rm, a, b] = await Promise.all([actual.evaluate(measure), expected.evaluate(measure), actual.screenshot({ path: prefix + '-actual.png', animations: 'disabled' }), expected.screenshot({ path: prefix + '-reference.png', animations: 'disabled' })]);
      const differences = am.flatMap((m, i) => JSON.stringify(m) === JSON.stringify(rm[i]) ? [] : [{ actual: m, reference: rm[i] }]); if (am.length !== rm.length) differences.push({ lengths: [am.length, rm.length] });
      const pixel = pixels(a, b, prefix + '-diff.png'); results.push({ name, width: app.viewportSize().width, elements: am.length, differences, pixel });
      fs.writeFileSync(output + '/parity.json', JSON.stringify({ results, errors, exceptions: ['Bell icon hidden in its unchanged 56px slot; dialog compositing deltas up to 8 tracked separately', 'Received quantity and unchanged remaining plans', 'Ledger ticket validity text replaces resort example', 'Title button returns to POS'] }, null, 2));
      console.log(name, app.viewportSize().width, 'elements', am.length, 'differences', differences.length, 'pixels', pixel.percent.toFixed(5) + '%');
    }
    for (const size of [[1366, 768], [1024, 768], [1440, 900], [1920, 1080]]) {
      await Promise.all([app.setViewportSize({ width: size[0], height: size[1] }), ref.setViewportSize({ width: size[0], height: size[1] })]);
      await capture('jobs'); await click('보관 내역 자세히'); await capture('storage'); await click('업무 화면으로');
      await click('내일'); await capture('tomorrow'); await click('오늘');
      await click('일부만 받았어요'); await capture('partial-empty');
      await frame.getByRole('button', { name: '스키 받음', exact: true }).click(); await ref.locator('[role="dialog"]').getByRole('button', { name: /스키.*미선택/ }).click();
      await click('스키 수량 줄이기'); await capture('partial-one'); await frame.locator('[role="dialog"] button').first().click(); await ref.locator('[role="dialog"] button').first().click();
      await click('수거 완료'); await capture('complete'); await frame.locator('[role="dialog"] button').first().click(); await ref.locator('[role="dialog"] button').first().click();
    }
    assert.deepEqual(errors, []); assert.equal(results.reduce((n, r) => n + r.differences.length, 0), 0, 'Element geometry/styles differ');
    assert.ok(results.every(r => r.pixel.visiblePercent < .005 && r.pixel.max <= 40), 'Pixel threshold exceeded');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
