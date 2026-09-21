const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(process.env.SKI_FULFILLMENT_SCREENS_OUT || 'work/pos-ui-a1');
fs.mkdirSync(output, { recursive: true });
const { measure, totals, recorder } = require('./pos-ui-rules.cjs');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const checks = [], errors = [], writes = [], rulesRecorder = recorder('fulfillment-screens');
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
    for (const [width, height] of [[1024, 600], [1024, 768], [1366, 768], [907, 648], [875, 600]]) {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:58148/', { waitUntil: 'networkidle' });
      const frame = page.frames().find(item => item.parentFrame());
      await frame.waitForFunction(() => !!window.SkiOps?.posData?.snapshot && !!window.SkiOps?.posFulfillment);
      const login = frame.locator('[data-action="login-shop"]');
      if (await login.count()) await login.click();
      await frame.evaluate(async () => {
        const D = SkiOps.posData;
        for (const sku of ['ski', 'clothing', 'helmet']) await D.execute('stock.receive', { sku, quantity: 5 });
        await D.execute('order.create', { id: 'a1-review', customer: { name: '박준호 팀', phone: '010-0000-1234' }, batch: { id: 'a1-batch', lines: [
          { id: 'a1-ski', sku: 'ski', quantity: 2 },
          { id: 'a1-coat', sku: 'clothing', quantity: 2 },
          { id: 'a1-helmet', sku: 'helmet', quantity: 1 }
        ].map(line => ({ ...line, start: D.today, end: D.today, price: { unitWon: 20000 } })) } });
        SkiOps.go('preparation');
      });
      const click = async name => { const d = frame.locator('#so-dialog[open]'); await (await d.count() ? d : frame).getByRole('button', { name, exact: true }).click(); };
      const shot = async key => {
        await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const rules = await frame.evaluate(measure, { minFont: 16, minTarget: 52 });
        const geometry = await frame.evaluate(() => ({
          width: innerWidth, height: innerHeight,
          bodies: [...document.querySelectorAll('.pos-page-body,.pos-modal-body')].filter(el => el.getClientRects().length).map(el => ({ className: el.className, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight })),
          title: document.querySelector('#so-dialog[open] #so-dialog-title')?.textContent || document.querySelector('.pos-page-heading')?.textContent
        }));
        const file = `${key}-${width}x${height}.png`;
        await page.screenshot({ path: path.join(output, file) });
        checks.push({ key, file, rules: totals(rules), geometry });
        await rulesRecorder.add(key + '-' + width + 'x' + height, frame);
        assert.ok(Object.values(totals(rules)).every(value => value === 0), file + ': 화면 규칙 위반');
        assert.ok(geometry.bodies.every(body => body.scrollHeight <= body.clientHeight + 2), file + ': 본문 넘침');
      };
      await frame.locator('[data-action="pos-issue"][data-id="a1-review"]').click();
      await shot('issue');
      await click('선택 물품 지급 확정');
      await click('일부만 받음');
      await shot('partial-return');
      await click('취소');
      await frame.evaluate(() => SkiOps.go('returns'));
      await frame.locator('[data-action="pos-return-all"][data-id="a1-review"]').click();
      await shot('return-confirm');
    }
    const sourceRoot = path.resolve(__dirname, '../design/higgsfield/pos-rest-v1');
    const uri = file => 'data:image/' + (file.endsWith('.jpg') ? 'jpeg' : 'png') + ';base64,' + fs.readFileSync(file).toString('base64');
    for (const [key, reference, actual, title] of [
      ['issue-compare', 'p20-popup-issue.jpg', 'issue-1024x600.png', '지급 · 기존 시안과 A1 구현'],
      ['return-compare', 'p22-popup-return.jpg', 'return-confirm-1024x600.png', '반납 확인 · 기존 시안과 A1 구현']
    ]) {
      const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f4f2f8;color:#24222b;font-family:system-ui,sans-serif}h1{font-size:25px;margin:0 0 8px}p{font-size:17px;margin:0 0 20px;color:#575264}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:white;border:1px solid #dcd8e6;border-radius:12px;overflow:hidden}figcaption{font-size:19px;font-weight:650;padding:14px 16px;border-bottom:1px solid #e8e5ed}img{width:100%;height:352px;object-fit:contain;display:block;background:#fff}.note{margin-top:16px;font-size:16px}</style><h1>${title}</h1><p>현재 화면은 1024×600에서 촬영했습니다. 기존 글꼴과 공용 글자 크기를 유지했습니다.</p><div class="pair"><figure><figcaption>기존 힉스필드 시안</figcaption><img src="${uri(path.join(sourceRoot, reference))}"></figure><figure><figcaption>A1 구현 · 대표자 이름만 입력한 예시</figcaption><img src="${uri(path.join(output, actual))}"></figure></div><div class="note">화면 모양 비교용입니다. 현재 화면의 자료는 임시 체험 자료이며 시안과 날짜·번호가 다릅니다.</div></html>`;
      fs.writeFileSync(path.join(output, key + '.html'), html);
      await page.setViewportSize({ width: 1280, height: 532 });
      await page.setContent(html);
      await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
      await page.screenshot({ path: path.join(output, key + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify({ checks, errors, writes }, null, 2));
    console.log(JSON.stringify({ screenshots: checks.length, ruleTotals: checks.reduce((sum, check) => { for (const [key, value] of Object.entries(check.rules)) sum[key] = (sum[key] || 0) + value; return sum; }, {}), errors, writes }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
