const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const dist = path.resolve(__dirname, '../dist');
  const types = {
    'index.html': 'text/html; charset=utf-8',
    'manifest.webmanifest': 'application/manifest+json',
    'assets/app-icon.svg': 'image/svg+xml',
    'assets/app-icon-192.png': 'image/png',
    'assets/app-icon-512.png': 'image/png',
    'assets/app-icon-maskable-512.png': 'image/png',
    'assets/apple-touch-icon.png': 'image/png',
    'assets/favicon-32.png': 'image/png',
    'assets/app-mark.svg': 'image/svg+xml',
    'assets/app-icon-maskable.svg': 'image/svg+xml',
  };
  const files = Object.fromEntries(Object.keys(types).map(name => [name, fs.readFileSync(path.join(dist, name))]));
  // Serve the built artifact at both localhost root and the Pages subdirectory.
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const name = url.pathname.replace(/^\/ski-rent-ops\//, '/').slice(1) || 'index.html';
    if (!Object.hasOwn(files, name)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': types[name], 'Cache-Control': 'no-store' });
    response.end(files[name]);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ski-pwa-check-'));
  let context, cdp, installed;
  const checks = [], errors = [];
  try {
    // Use a real window: Chrome's headless PWA compositor may not paint its iframe.
    context = await chromium.launchPersistentContext(profile, {
      channel: process.env.SKI_CHROME_CHANNEL || 'chrome', headless: process.env.SKI_PWA_HEADLESS === '1',
      viewport: { width: 1024, height: 768 },
    });
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = context.pages()[0];
    page.on('pageerror', error => errors.push(error.message));
    cdp = await context.newCDPSession(page);
    for (const prefix of ['/', '/ski-rent-ops/']) {
      const base = origin + prefix;
      await page.goto(base);
      const { manifest, errors: manifestErrors, url } = await cdp.send('Page.getAppManifest');
      assert.deepEqual(manifestErrors, []);
      assert.equal(url, base + 'manifest.webmanifest');
      assert.equal(manifest.id, base);
      assert.equal(manifest.scope, base);
      assert.equal(manifest.startUrl, base);
      assert.equal(manifest.display, 'kStandalone');
      assert.equal(manifest.name, '스키노트');
      assert.equal((await (await page.request.get(url)).json()).short_name, '스키노트');
      assert.match(await page.title(), /^스키노트/);
      assert.match(await page.locator('meta[name="description"]').getAttribute('content'), /^렌탈샵의 하루를 한눈에\./);
      assert.deepEqual((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, []);
      for (const icon of manifest.icons) {
        assert.ok(icon.url.startsWith(base + 'assets/'));
        const dimensions = await page.evaluate(async url => {
          const image = new Image(); image.src = url; await image.decode();
          return image.naturalWidth + 'x' + image.naturalHeight;
        }, icon.url);
        assert.equal(dimensions, icon.sizes);
      }
      const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
      assert.equal(await page.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode(); return image.naturalWidth;
      }, appleIcon), 180);
      checks.push('Installable manifest and icons resolve at ' + prefix);
      console.log('PASS ' + checks.at(-1));
    }

    const manifestId = origin + '/ski-rent-ops/';
    await cdp.send('PWA.install', { manifestId, installUrlOrBundleUrl: manifestId });
    installed = manifestId;
    // CDP installation skips the normal dialog's "open as window" choice.
    await cdp.send('PWA.changeAppUserSettings', { manifestId, displayMode: 'standalone' });
    const [appPage, appTarget] = await Promise.all([
      context.waitForEvent('page', { timeout: 15000 }),
      cdp.send('PWA.launch', { manifestId }),
    ]);
    await appPage.waitForLoadState('domcontentloaded');
    await appPage.waitForURL(manifestId);
    const { windowId } = await cdp.send('Browser.getWindowForTarget', appTarget);
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: 1100, height: 840, windowState: 'normal' } });
    await appPage.setViewportSize({ width: 1024, height: 768 });
    appPage.setDefaultTimeout(10000);
    await appPage.waitForFunction(() => matchMedia('(display-mode: standalone)').matches, null, { timeout: 10000 });
    assert.equal(await appPage.evaluate(() => matchMedia('(display-mode: standalone)').matches), true);
    const frame = appPage.frameLocator('iframe');
    await frame.locator('.so-installed-label').waitFor({state:'visible'});
    assert.equal(await frame.locator('[data-action="install-app"]').isVisible(), false);
    assert.equal(await frame.locator('.so-login-brand strong').textContent(), '스키노트');
    assert.equal(await frame.locator('.so-login-brand img').evaluate(image => image.complete && image.naturalWidth > 0), true);
    await frame.locator('[data-action="login-shop"]').click();
    const dashboard = await frame.locator('#so-page').innerHTML();
    await frame.locator('#so-workspace-switch').click();
    assert.equal(await frame.locator('#ski-ops').getAttribute('data-workspace'), 'management');
    assert.equal(await frame.locator('#so-page').innerHTML(), dashboard);
    await frame.locator('#so-navigation [data-go="lift-reservations"]').click();
    assert.equal(await frame.locator('#ski-ops').getAttribute('data-page'), 'lift-reservations');
    await frame.locator('#so-workspace-switch').click();
    assert.equal(await frame.locator('#ski-ops').getAttribute('data-workspace'), 'pos');
    assert.equal(appPage.url(), manifestId);
    assert.equal(await appPage.evaluate(() => matchMedia('(display-mode: standalone)').matches), true);
    checks.push('Installed app launches standalone and keeps POS/management navigation inside the app');
    console.log('PASS ' + checks.at(-1));

    await appPage.goBack();
    await frame.locator('#ski-ops[data-page="lift-reservations"][data-workspace="management"]').waitFor();
    await appPage.goForward();
    await frame.locator('#ski-ops[data-page="home"][data-workspace="pos"]').waitFor();
    assert.equal(appPage.url(), manifestId);
    const browserState = await appPage.evaluate(() => history.state);
    assert.deepEqual(Object.keys(browserState).sort(), ['position','skinoteSession']);
    checks.push('Native back/forward restores the screen and workspace without exposing rental data in the URL');
    console.log('PASS ' + checks.at(-1));

    await frame.locator('#so-navigation [data-go="rentals"]').click();
    await frame.locator('#so-page [data-go="rental"]').first().click();
    await frame.locator('#so-page [data-action="back"]').click();
    await frame.locator('#ski-ops[data-page="rentals"]').waitFor();
    await appPage.goForward();
    await frame.locator('#ski-ops[data-page="rental"]').waitFor();
    checks.push('In-app back and browser forward share the same navigation history');
    console.log('PASS ' + checks.at(-1));

    await frame.locator('[data-action="logout"]').click();
    await frame.locator('#ski-ops[data-page="login"]').waitFor();
    await appPage.goBack();
    assert.equal(await frame.locator('#ski-ops').getAttribute('data-page'), 'login');
    await appPage.reload();
    await frame.locator('#ski-ops[data-page="login"]').waitFor();
    assert.equal(await appPage.evaluate(() => matchMedia('(display-mode: standalone)').matches), true);
    const runtime = await frame.locator('#ski-ops').evaluate(root => {
      const app = root.ownerDocument.defaultView.SkiOps;
      return {persistent:app.returns.persistent,multiDevice:app.returns.multiDevice,authenticated:app.state.authenticated};
    });
    assert.deepEqual(runtime, {persistent:false,multiDevice:false,authenticated:false});
    checks.push('Logout and reload keep the demo boundary and do not restore protected screens');
    console.log('PASS ' + checks.at(-1));
    assert.deepEqual(errors, []);
    fs.mkdirSync('work/pwa', { recursive: true });
    await appPage.screenshot({ path: 'work/pwa/app-window.png' });
    fs.writeFileSync('work/pwa/checks.json', JSON.stringify({ browser: await cdp.send('Browser.getVersion'), checks, errors }, null, 2) + '\n');
    await appPage.close();
  } finally {
    try {
      if (installed) await cdp.send('PWA.uninstall', { manifestId: installed });
    } finally {
      if (context) await context.close();
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
