// Visual parity is measured against the original source served independently.
// Data is normalized only in these isolated browser contexts; the app fixture
// and real workflow are checked separately by smoke-rental-board.cjs.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { PNG } = require(path.join(path.dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
const directory = process.env.SKI_REFERENCE_DIR;
assert.ok(directory, 'Set SKI_REFERENCE_DIR to the supplied UI 개선 6 folder');
const name = fs.readdirSync(directory).find(p => p.normalize('NFC') === '04 렌탈·반납 현황.dc.html');
const original = fs.readFileSync(path.join(directory, name), 'utf8');
const source = original.match(/<script type="text\/x-dc"[\s\S]*?>([\s\S]*?)<\/script>/)[1];
const fixture = vm.runInNewContext(source.split('class Component')[0] + '; ORDERS', { Date, Intl });
const referenceURL = (process.env.SKI_REFERENCE_URL || 'http://127.0.0.1:58149/') + encodeURIComponent(name);
const appURL = process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/';
const output = path.resolve('work/rental-ui-parity');
fs.mkdirSync(output, { recursive: true });

function pixels(a, b, filename) {
  const x = PNG.sync.read(a), y = PNG.sync.read(b);
  assert.equal(x.width, y.width); assert.equal(x.height, y.height);
  const diff = new PNG({ width: x.width, height: x.height });
  let different = 0, maximum = 0, total = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    let delta = 0;
    for (let k = 0; k < 3; k++) delta = Math.max(delta, Math.abs(x.data[i + k] - y.data[i + k]));
    if (delta) different++;
    maximum = Math.max(maximum, delta); total += delta;
    diff.data[i] = delta ? 255 : x.data[i];
    diff.data[i + 1] = delta ? 0 : x.data[i + 1];
    diff.data[i + 2] = delta ? 180 : x.data[i + 2]; diff.data[i + 3] = 255;
  }
  if (different) fs.writeFileSync(filename, PNG.sync.write(diff));
  else if (fs.existsSync(filename)) fs.unlinkSync(filename);
  return { width: x.width, height: x.height, differentPixels: different, totalPixels: x.width * x.height, percent: different * 100 / (x.width * x.height), maxChannelDelta: maximum, meanMaxChannelDelta: total / (x.width * x.height) };
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
  const data = await frame.evaluate(fixture => {
    const S = SkiOps, F = S.workflow;
    S.state.authenticated = true;
    const snap = { ...F.snap(), tasks: [], assets: [], reservations: [], forms: [] };
    F.snap = () => snap; F.store.history = () => ({ movements: [] }); F.orders.clear();
    S.data.orders.splice(0, S.data.orders.length, ...fixture);
    for (const o of fixture) {
      const items = o.items.map((i, n) => ({ id: 'fixture-' + n, label: i.name, category: i.name === '리프트권' ? 'liftTicket' : 'equipment', plannedQuantity: i.total,
        customerQuantity: o.stage === 'pickup' ? 0 : i.customer, vehicleQuantity: i.vehicle, shopQuantity: i.confirmed, unissuedQuantity: o.stage === 'pickup' ? i.total : 0,
        returnPlan: { date: i.due, method: i.method === '차량 수거' ? 'vehicle' : 'direct', time: o.time, place: o.place } }));
      F.orders.set(o.id, { id: o.id, customer: { name: o.name, phone: o.phone }, items, bindings: items.map(i => ({ item: i, assetIds: [] })) });
    }
    F.projectOrder = id => F.orders.get(id);
    S.go('rentals'); return S.rentalBoard.snapshot();
  }, fixture);
  // Preserve the reference's markup, styles and rendering logic. Only data is
  // matched so dates, physical counts and changed histories cannot mask UI drift.
  let normalized = original.replace(/const ORDERS = \[[\s\S]*?\n\];/, 'const ORDERS = ' + JSON.stringify(data) + ';');
  // The explicitly requested early-return entry is the sole new baseline control.
  // Inject the same button into this isolated comparison, preserving the source file.
  const exchangeButton = normalized.match(/<button type="button" onClick="{{ openExchange }}"[^>]*>[\s\S]*?<\/button>/)[0];
  normalized = normalized.replace(exchangeButton, exchangeButton.replace('onClick="{{ openExchange }}"', '').replace('장비 교환</button>', '일부 조기반납</button>') + exchangeButton);
  await ref.route(referenceURL, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: normalized }));
  await ref.goto(referenceURL, { waitUntil: 'networkidle' });
  await ref.getByRole('heading', { name: '렌탈·반납 현황', exact: true }).waitFor();
  const widths = process.env.SKI_PARITY_QUICK ? [[1366, 768]] : [[1366, 768], [1024, 768], [1440, 900], [1920, 1080]];
  const settle = async () => { await Promise.all([frame.evaluate(() => document.fonts.ready), ref.evaluate(() => document.fonts.ready)]); await app.mouse.move(1, 1); await ref.mouse.move(1, 1); for (const f of [frame, ref]) await f.evaluate(() => { document.activeElement?.blur(); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }); };
  async function capture(label, modal = false) {
    await settle();
    const selector = modal ? '[role="dialog"]:visible>div' : '[data-main]';
    const [a, r] = [frame.locator(selector), ref.locator(selector)];
    const prefix = label + '-' + app.viewportSize().width;
    const [actual, expected, am, rm] = await Promise.all([a.screenshot({ path: path.join(output, prefix + '-actual.png'), animations: 'disabled' }), r.screenshot({ path: path.join(output, prefix + '-reference.png'), animations: 'disabled' }), a.evaluate(measure), r.evaluate(measure)]);
    const delta = pixels(expected, actual, path.join(output, prefix + '-diff.png'));
    const geometry = [];
    for (let i = 0; i < Math.max(am.length, rm.length); i++) if (JSON.stringify(am[i]) !== JSON.stringify(rm[i])) geometry.push({ index: i, actual: am[i], reference: rm[i] });
    results.push({ name: prefix, ...delta, measuredElements: am.length, mismatchedElements: geometry.length });
    fs.writeFileSync(path.join(output, prefix + '-measurements.json'), JSON.stringify({ geometry, actual: am, reference: rm }, null, 2));
    console.log(prefix + ': ' + delta.differentPixels + ' differing pixels (' + delta.percent.toFixed(5) + '%), ' + geometry.length + ' element differences');
  }
  try {
    for (const [width, height] of widths) {
      await Promise.all([app.setViewportSize({ width, height }), ref.setViewportSize({ width, height })]);
      if (await ref.getByRole('button', { name: '목록으로', exact: true }).count()) await ref.getByRole('button', { name: '목록으로', exact: true }).click();
      await frame.evaluate(() => SkiOps.go('rentals'));
      await capture('list-grouped');
      await Promise.all([frame.getByRole('button', { name: '빌린 순서', exact: true }).click(), ref.getByRole('button', { name: '빌린 순서', exact: true }).click()]);
      await capture('list-rented');
      await Promise.all([frame.getByRole('button', { name: '반납 시간 묶음', exact: true }).click(), ref.getByRole('button', { name: '반납 시간 묶음', exact: true }).click()]);
      for (const [label, id] of [['일부만 받음', 'partial'], ['반납 완료', 'complete'], ['예정일 지남', 'late']]) {
        const name = new RegExp('^' + label + '\\s*\\d+$');
        await Promise.all([frame.getByRole('button', { name }).click(), ref.getByRole('button', { name }).click()]);
        await capture('list-' + id);
      }
      await Promise.all([frame.getByRole('button', { name: '조건 지우기', exact: true }).click(), ref.getByRole('button', { name: '조건 지우기', exact: true }).click()]);
      await Promise.all([frame.getByRole('searchbox', { name: '고객 찾기' }).fill('없는 고객'), ref.getByRole('searchbox', { name: '고객 찾기' }).fill('없는 고객')]);
      await capture('list-empty');
      await Promise.all([frame.getByRole('button', { name: '조건 지우기', exact: true }).click(), ref.getByRole('button', { name: '조건 지우기', exact: true }).click()]);
      await Promise.all([frame.locator('[data-order-id="R-025"]').click(), ref.getByRole('button').filter({ hasText: '김민수' }).click()]);
      for (const title of ['반납 확인', '장비·리프트권', '결제·환불', '변경 이력']) {
        await Promise.all([frame.getByRole('tab', { name: title, exact: true }).click(), ref.getByRole('tab', { name: title, exact: true }).click()]);
        // This tab was explicitly redesigned into per-item cards. Its data and
        // responsive layout are verified by smoke-rental-items, not old pixels.
        if (title === '장비·리프트권') continue;
        await capture('detail-' + ({ '반납 확인': 'return', '장비·리프트권': 'items', '결제·환불': 'payment', '변경 이력': 'history' })[title]);
      }
      await Promise.all([frame.getByRole('tab', { name: '반납 확인', exact: true }).click(), ref.getByRole('tab', { name: '반납 확인', exact: true }).click()]);
      await Promise.all([frame.getByRole('button', { name: '고객 직접반납 받음', exact: true }).click(), ref.getByRole('button', { name: '고객 직접반납 받음', exact: true }).click()]);
      await capture('dialog-direct', true);
      await Promise.all([frame.getByRole('button', { name: '창 닫기', exact: true }).click(), ref.getByRole('button', { name: '창 닫기', exact: true }).click()]);
      // Row scroll is explicit in the supplied source at 1024px.
      await Promise.all([frame.getByRole('button', { name: '예정 변경', exact: true }).first().click(), ref.getByRole('button', { name: '예정 변경', exact: true }).first().click()]);
      await capture('dialog-plan', true);
      await Promise.all([frame.getByRole('button', { name: '창 닫기', exact: true }).click(), ref.getByRole('button', { name: '창 닫기', exact: true }).click()]);
    }
    assert.deepEqual(errors, []);
  } finally {
    fs.writeFileSync(path.join(output, 'parity.json'), JSON.stringify({ source: path.join(directory, name), scope: 'Main list, return/payment/history detail, dialogs; matching data in isolated browser contexts. Explicitly redesigned item cards are excluded and verified with smoke-rental-items.', results, errors }, null, 2));
    await browser.close();
  }
  // An opaque iframe and the reference's top-level page can rasterize a few
  // rounded-edge pixels differently. Never allow any measured layout/style
  // difference, and retain the unthresholded PNG counts in the report.
  assert.ok(results.every(r => r.percent <= 0.05 && r.maxChannelDelta <= 40 && r.mismatchedElements === 0), 'Reference parity failed; inspect work/rental-ui-parity/*-diff.png and *-measurements.json');
})().catch(error => { console.error(error); process.exitCode = 1; });
