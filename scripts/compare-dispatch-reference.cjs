// Compare UI 7 with equal data and the explicitly requested multi-trip changes.
// Keep the original file untouched; record each intentional reference extension.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PNG } = require(path.join(path.dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
const directory = process.env.SKI_DISPATCH_REFERENCE_DIR;
assert.ok(directory, 'Set SKI_DISPATCH_REFERENCE_DIR to UI 개선 7');
const name = fs.readdirSync(directory).find(p => p.normalize('NFC') === '05 배달·수거.dc.html');
const original = fs.readFileSync(path.join(directory, name), 'utf8');
const copyChanges = [
  ['① 아침 · 실을 팀', '차에 실을 팀'], ['③ 저녁 · 돌아올 팀', '수거·매장 인계'],
  ['① 아침 · 매장이 차에 실을 팀', '매장 → 차량 · 필요한 물품 싣기'], ['아침 · 매장이 차에 실을 팀', '매장 → 차량 · 필요한 물품 싣기'],
  ['② 낮 · 기사님이 가는 순서', '차량 · 방문 순서'], ['낮 · 기사님이 가는 순서', '차량 · 방문 순서'],
  ['③ 저녁 · 수거해서 매장으로', '수거 · 매장 인계'], ['저녁 · 수거해서 매장으로', '수거 · 매장 인계'],
  ['{{ handoverLine }} 장비 반납 확인은 <strong style="color:#1A1A1A">렌탈·반납 현황</strong>에서 합니다.', '차에 실은 수량과 매장에 내린 수량을 나눠 기록합니다. 미수거 물품은 다음 방문에 이어서 받으세요.']
];
function tripReference() {
  let html = copyChanges.reduce((s, [from, to]) => s.replaceAll(from, to), original);
  const footer = label => '<div style="flex-shrink:0;display:flex;padding:10px 14px 12px;box-shadow:0 -4px 12px rgba(0,0,0,.04)"><button type="button" style="flex:1;display:flex;align-items:center;justify-content:center;min-height:56px;padding:10px 16px;font-size:17px;font-weight:700;color:#fff;background:var(--mk-orange-500,#FE4E10);border:0;border-radius:var(--mk-radius-md,8px)" style-hover="background:var(--mk-orange-600,#EF3408)">' + label + '</button></div>';
  for (const [panel, label] of [['매장 → 차량 · 필요한 물품 싣기', '추가로 싣기'], ['수거 · 매장 인계', '매장에 내리기']]) {
    const pattern = new RegExp('(<section aria-label="' + panel + '"[\\s\\S]*?)(</section>)');
    assert.match(html, pattern); html = html.replace(pattern, (_, body, close) => body + footer(label) + close);
  }
  const collect = '<sc-if value="{{ r.canCollect }}"><button type="button" style="margin-top:8px;width:100%;display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 11px;font-size:16px;font-weight:700;color:#5D5D5D;background:#fff;border:0;border-radius:var(--mk-radius-md,8px);box-shadow:inset 0 0 0 1px var(--mk-neutral-200,#D1D1D1)">수거 수량 입력</button></sc-if>';
  html = html.replace('{{ r.line }}</span>', '{{ r.line }}</span>' + collect);
  html = html.replace("state: done ? '✓ 차에 있음'", "canCollect: j.kind === 'collect' && j.remainingCount > 0, state: j.returnState || (done ? '✓ 차에 있음'")
    .replace("'환불 예정' : '수거 예정'),", "'환불 예정' : '수거 예정')),");
  html = html.replace('returnTeams.filter(j => F.isDone(j)).length', 'returnTeams.filter(j => j.inCar > 0).length');
  return html;
}
const base = process.env.SKI_DISPATCH_REFERENCE_URL || 'http://127.0.0.1:58150/';
const referenceURL = base + encodeURIComponent(name);
const appURL = process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/';
const output = path.resolve(process.env.SKI_DISPATCH_OUTPUT || 'work/dispatch-ui-parity');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'reference-adjustments.json'), JSON.stringify({ original: path.join(directory, name), copyChanges, controls: ['추가로 싣기: original 56px/17px load button style in fixed footer', '매장에 내리기: same fixed footer', '수거 수량 입력: original 48px/16px neutral button style'], data: 'Physical remaining, on-vehicle and shop-received counts replace the reference completed=on-vehicle assumption.' }, null, 2));
function pixels(a, b, filename, rounded = false) {
  const x = PNG.sync.read(a), y = PNG.sync.read(b);
  assert.equal(x.width, y.width); assert.equal(x.height, y.height);
  const diff = new PNG({ width: x.width, height: x.height });
  let different = 0, maximum = 0, total = 0, interiorPixels = 0, interiorDifferences = 0, interiorMax = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    let delta = 0;
    for (let k = 0; k < 3; k++) delta = Math.max(delta, Math.abs(x.data[i + k] - y.data[i + k]));
    if (delta) different++;
    maximum = Math.max(maximum, delta); total += delta;
    const px = (i / 4) % x.width + .5, py = Math.floor(i / 4 / x.width) + .5;
    const cx = Math.max(14, Math.min(x.width - 14, px)), cy = Math.max(14, Math.min(x.height - 14, py));
    // The shared shell can show through the rounded, antialiased dialog edge.
    // Preserve every raw difference; separately check the opaque card interior.
    const interior = !rounded || px > 1 && py > 1 && px < x.width - 1 && py < x.height - 1 && (px - cx) ** 2 + (py - cy) ** 2 < 13 ** 2;
    if (interior) { interiorPixels++; if (delta) interiorDifferences++; interiorMax = Math.max(interiorMax, delta); }
    diff.data[i] = delta ? 255 : x.data[i];
    diff.data[i + 1] = delta ? 0 : x.data[i + 1];
    diff.data[i + 2] = delta ? 180 : x.data[i + 2]; diff.data[i + 3] = 255;
  }
  if (different) fs.writeFileSync(filename, PNG.sync.write(diff));
  else if (fs.existsSync(filename)) fs.unlinkSync(filename);
  return { width: x.width, height: x.height, differentPixels: different, totalPixels: x.width * x.height, percent: different * 100 / (x.width * x.height), maxChannelDelta: maximum, meanMaxChannelDelta: total / (x.width * x.height), interiorPixels, interiorDifferences, interiorPercent: interiorDifferences * 100 / interiorPixels, interiorMaxChannelDelta: interiorMax };
}
const measure = root => [...root.querySelectorAll('h1,h2,button,input,select,strong,small,[role="tablist"]')].map(el => {
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  return { tag: el.tagName, text: el.textContent.replace(/\s+/g, ' ').trim(), x: r.x, y: r.y, width: r.width, height: r.height, fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color: s.color, background: s.backgroundColor, padding: s.padding, gap: s.gap, border: s.border, borderRadius: s.borderRadius, boxShadow: s.boxShadow };
});

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKI_CHROME_CHANNEL || 'chrome' });
  const app = await browser.newPage(), ref = await browser.newPage();
  const results = [], errors = [];
  app.on('pageerror', e => errors.push('app: ' + e.message)); ref.on('pageerror', e => errors.push('reference: ' + e.message));
  await app.goto(appURL, { waitUntil: 'networkidle' });
  const frame = app.frames().find(f => f.parentFrame());
  const data = await frame.evaluate(() => {
    const S = SkiOps, F = S.workflow; S.state.authenticated = true;
    F.dispatchOrder('R-022', { date: S.data.today, time: '16:40', place: '설천 주차장' });
    const ids = F.run('stock.receive', { sku: 'board', quantity: 2 }).assetIds;
    F.saveTask({ id: 'parity-load', kind: 'delivery', title: '준비 고객', customerId: 'parity-customer', assetIds: ids, date: S.data.today, time: '10:00', place: '만선 광장' });
    const other = F.run('stock.receive', { sku: 'ski', quantity: 1 }).assetIds;
    F.saveTask({ id: 'parity-van2', kind: 'delivery', title: '둘째 고객', customerId: 'parity-other', vehicleId: 'demo-van-2', assetIds: other, date: S.data.today, time: '11:00', place: '설천 주차장' });
    S.go('dispatch'); return S.dispatchBoard.snapshot();
  });
  let currentData = data;
  const fleetScript = () => '(()=>{const data=' + JSON.stringify(currentData) + ';window.SkiFleet={VEHICLES:data.vehicles,ITEMS:data.items,KINDS:data.kinds,PURPOSE:data.purposes,jobsOf:(v,d)=>data.jobs.filter(j=>j.vehicleId===v&&j.dateOffset===d),lifts:v=>data.lifts.filter(l=>l.vehicleId===v),item:k=>data.items.find(i=>i.key===k),isDone:j=>j.status==="done",subscribe:()=>()=>{}};})();';
  await ref.route(base + 'fleet-data.js', route => route.fulfill({ contentType: 'text/javascript', body: fleetScript() }));
  await ref.route(referenceURL, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: tripReference().replace('loaded: {}', 'loaded: ' + JSON.stringify(Object.fromEntries(currentData.jobs.filter(j => j.loadedAt).map(j => [j.id, j.loadedAt])))) }));
  await ref.goto(referenceURL, { waitUntil: 'networkidle' });
  await ref.locator('[data-main] h1').waitFor();
  const views = process.env.SKI_PARITY_QUICK ? [[1366, 768]] : [[1366, 768], [1024, 768], [1440, 900], [1920, 1080]];
  const bothClick = async name => { await frame.getByRole('button', { name, exact: true }).click(); await ref.getByRole('button', { name, exact: true }).click(); };
  const vehicle = async n => {
    await frame.locator('[aria-label="담당 차량"]').getByRole('button', { name: new RegExp('^' + n + '호 차량') }).click();
    await ref.locator('[aria-label="담당 차량"]').getByRole('button', { name: new RegExp('^' + n + '호 차량') }).click();
  };
  async function capture(label, modal = false) {
    await Promise.all([frame.evaluate(() => document.fonts.ready), ref.evaluate(() => document.fonts.ready)]);
    await app.mouse.move(1, 1); await ref.mouse.move(1, 1);
    for (const f of [frame, ref]) await f.evaluate(() => { document.activeElement?.blur(); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    const selector = modal ? '[role="dialog"]:visible>div' : '[data-main]';
    const a = frame.locator(selector), r = ref.locator(selector), prefix = label + '-' + app.viewportSize().width;
    const [actual, expected, am, rm] = await Promise.all([a.screenshot({ path: path.join(output, prefix + '-actual.png'), animations: 'disabled' }), r.screenshot({ path: path.join(output, prefix + '-reference.png'), animations: 'disabled' }), a.evaluate(measure), r.evaluate(measure)]);
    const geometry = [];
    fs.writeFileSync(path.join(output, prefix + '-raw-measurements.json'), JSON.stringify({actual:am,reference:rm},null,2));
    const delta = pixels(expected, actual, path.join(output, prefix + '-diff.png'), modal);
    for (let i = 0; i < Math.max(am.length, rm.length); i++) if (JSON.stringify(am[i]) !== JSON.stringify(rm[i])) geometry.push({ index: i, actual: am[i], reference: rm[i] });
    results.push({ name: prefix, ...delta, measuredElements: am.length, mismatchedElements: geometry.length });
    fs.writeFileSync(path.join(output, prefix + '-measurements.json'), JSON.stringify({ geometry, actual: am, reference: rm }, null, 2));
    console.log(prefix + ': ' + delta.differentPixels + ' differing pixels (' + delta.percent.toFixed(5) + '%), ' + geometry.length + ' element differences');
  }
  try {
    for (const [width, height] of views) {
      await Promise.all([app.setViewportSize({ width, height }), ref.setViewportSize({ width, height })]);
      await vehicle(1); await bothClick('오늘');
      if (width < 1200) { await frame.getByRole('button', { name: /^차에 실을 팀/ }).click(); await ref.getByRole('button', { name: /^차에 실을 팀/ }).click(); }
      await capture('board-today');
      await frame.locator('[data-visit-id="parity-load"]').click();
      await ref.locator('[aria-label="방문 순서"] [role="button"]').filter({ hasText: '준비 고객 팀' }).click();
      await capture('board-selected');
      await frame.locator('[data-visit-id="parity-load"]').click();
      await ref.locator('[aria-label="방문 순서"] [role="button"]').filter({ hasText: '준비 고객 팀' }).click();
      if (width < 1200) {
        await frame.getByRole('button', { name: /^수거·매장 인계/ }).click(); await ref.getByRole('button', { name: /^수거·매장 인계/ }).click();
      }
      await capture('board-returns');
      if (width < 1200) { await frame.getByRole('button', { name: /^차에 실을 팀/ }).click(); await ref.getByRole('button', { name: /^차에 실을 팀/ }).click(); }
      await frame.getByRole('button', { name: /용도 바꾸기/ }).click(); await ref.getByRole('button', { name: /용도 바꾸기/ }).click();
      await capture('dialog-purpose', true); await bothClick('창 닫기');
      await bothClick('내일'); await capture('board-tomorrow');
      await vehicle(2); await bothClick('오늘'); await capture('board-vehicle2');
      await frame.getByRole('button', { name: /용도 바꾸기/ }).click(); await ref.getByRole('button', { name: /용도 바꾸기/ }).click();
      await capture('dialog-empty', true); await bothClick('창 닫기');
      await bothClick('내일'); await capture('board-empty');
    }
    assert.deepEqual(errors, []);
  } finally {
    fs.writeFileSync(path.join(output, 'parity.json'), JSON.stringify({ source: path.join(directory, name), appURL, scope: 'Main board and purpose dialogs with explicit multi-trip copy and controls listed in reference-adjustments.json; equal ledger-derived data in isolated contexts; existing app shell retained.', results, errors }, null, 2));
    await browser.close();
  }
  assert.ok(results.every(r => r.interiorPercent <= 0.05 && r.interiorMaxChannelDelta <= 40 && r.mismatchedElements === 0), 'Dispatch reference parity failed; inspect diff images and measurements.');
})().catch(error => { console.error(error); process.exitCode = 1; });
