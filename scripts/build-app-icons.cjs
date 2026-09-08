// Rasterize the selected Skinote vector mark; not needed for static builds.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const assets = path.join(__dirname, '../design/app/assets');
  const mark = fs.readFileSync(path.join(assets, 'app-mark.svg'), 'utf8');
  const shapes = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const square = scale => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="스키노트"><path fill="#f7f8f6" d="M0 0h512v512H0Z"/><g transform="translate(' + (512 - 46 * scale) / 2 + ' ' + (512 - 54 * scale) / 2 + ') scale(' + scale + ')">' + shapes + '</g></svg>\n';
  const original = square(8), maskable = square(5.5);
  fs.writeFileSync(path.join(assets, 'app-icon.svg'), original);
  fs.writeFileSync(path.join(assets, 'app-icon-maskable.svg'), maskable);
  const browser = await chromium.launch({ headless: true, channel: process.env.SKI_CHROME_CHANNEL || 'chrome' });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const [size, name, svg] of [[192, 'app-icon-192.png', original], [512, 'app-icon-512.png', original], [512, 'app-icon-maskable-512.png', maskable], [180, 'apple-touch-icon.png', original], [32, 'favicon-32.png', original]]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent('<body style="margin:0"><img width="' + size + '" height="' + size + '" src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '"></body>');
      await page.locator('img').evaluate(image => image.decode());
      await page.screenshot({ path: path.join(assets, name), omitBackground: true });
      console.log(name);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
