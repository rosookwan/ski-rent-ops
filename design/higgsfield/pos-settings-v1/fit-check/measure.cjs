// node measure.cjs → measures the three new layouts at real sizes (Pretendard, 16px minimum, 52px targets)
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), page = await browser.newPage(), out = [];
  for (const [w, h] of [[1024, 600], [907, 648], [1024, 768]]) for (const show of ['s05', 's06', 's07', 's08']) {
    await page.setViewportSize({ width: w, height: h }); await page.goto('file://' + path.join(__dirname, 'index.html') + '#' + show); await page.evaluate(show => { document.body.dataset.show = show; return document.fonts.ready; }, show);
    const r = await page.evaluate(show => {
      const root = show === 's05' ? document.querySelector('.work') : document.querySelector(show === 's06' ? '#dlg6' : show === 's07' ? '#dlg7' : '#dlg8');
      const clipped = [...root.querySelectorAll('button,dd,span,b,strong,h2,p')].filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent.trim().slice(0, 24) + ' ' + el.scrollWidth + '>' + el.clientWidth);
      const small = [...root.querySelectorAll('button')].filter(el => el.getClientRects().length && el.getBoundingClientRect().height < 51.5).length;
      const box = root.getBoundingClientRect(), inner = root.querySelector('.in');
      return { bottom: Math.round(box.bottom), height: Math.round(box.height), overflowY: inner ? inner.scrollHeight - inner.clientHeight : document.querySelector('#options').scrollHeight - document.querySelector('#options').clientHeight, clipped, small };
    }, show);
    out.push({ viewport: w + 'x' + h, show, ...r }); await page.screenshot({ path: path.join(__dirname, show + '-' + w + 'x' + h + '.png') });
  }
  for (const row of out) console.log(JSON.stringify(row));
  await browser.close();
})();
