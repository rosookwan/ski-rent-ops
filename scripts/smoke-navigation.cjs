const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { storeNavigation } = require('./navigation-helper.cjs');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKI_CHROME_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.setDefaultTimeout(8000);
  const frame = page.frameLocator('iframe'), nav = storeNavigation(frame), checks = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const action = name => frame.locator('[data-action="' + name + '"]:visible').first().click();
  const toggle = () => frame.locator('#so-workspace-switch').click();
  const mode = () => frame.locator('#ski-ops').getAttribute('data-workspace');
  const current = () => frame.locator('#ski-ops').getAttribute('data-page');
  const routes = () => frame.locator('#so-navigation [data-go]').evaluateAll(buttons => buttons.map(b => b.dataset.go));
  let raw;
  const fresh = async () => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/');
    await action('login-shop'); raw = page.frames().find(f => f.parentFrame());
    await raw.evaluate(() => document.fonts.ready);
  };
  const test = async (name, run) => { await fresh(); await run(); checks.push(name); console.log('PASS ' + name); };
  fs.mkdirSync('work/menu-split', { recursive: true });
  try {
    await test('management and POS share the unchanged dashboard and have separate menus', async () => {
      assert.deepEqual(await routes(), ['home', 'intake', 'rentals', 'returns', 'dispatch', 'lift-reservations', 'preparation']);
      const dashboard = await frame.locator('#so-page').innerHTML();
      await page.screenshot({ path: 'work/menu-split/pos.png' });
      await toggle(); assert.equal(await mode(), 'management'); assert.equal(await current(), 'home');
      assert.deepEqual(await routes(), ['home', 'lift-reservations', 'partners', 'closing', 'customers', 'inventory', 'settings', 'guide']);
      assert.equal(await frame.locator('#so-page').innerHTML(), dashboard);
      assert.equal(await frame.locator('#so-workspace-switch').getAttribute('aria-label'), '포스화면으로');
      await page.screenshot({ path: 'work/menu-split/management.png' });
      await toggle(); assert.equal(await mode(), 'pos'); assert.equal(await frame.locator('#so-page').innerHTML(), dashboard);
      for (const route of ['partners', 'closing', 'customers', 'inventory', 'settings', 'guide', 'preparation', 'returns', 'dispatch']) {
        await nav(route); assert.equal(await current(), route);
        assert.equal(await frame.locator('#so-navigation [aria-current="page"]').getAttribute('data-go'), route);
      }
    });
    await test('counter intake draft survives management work and returns to the same screen', async () => {
      await nav('intake');
      await frame.locator('#ski-overlay [data-field="name"]').fill('메뉴 확인 고객');
      await frame.locator('#ski-overlay [data-field="phone"]').fill('010-0000-1111');
      await action('representative-done');
      await frame.locator('[data-product="ski"][data-delta="1"]').click();
      const draft = await raw.evaluate(() => SkiIntake.draft());
      assert.ok(draft?.payload, 'A valid unsaved intake is required');
      await toggle(); assert.equal(await current(), 'home'); assert.equal(await mode(), 'management');
      await nav('settings'); await frame.locator('[data-subtab="operations"]').click();
      await toggle(); assert.equal(await current(), 'intake'); assert.equal(await mode(), 'pos');
      assert.deepEqual(await raw.evaluate(() => SkiIntake.draft()), draft);
      assert.equal(await frame.locator('#ski-overlay').isVisible(), false);
    });
    await test('rental detail, customer filter and selected tab survive a management visit', async () => {
      await nav('rentals'); await frame.locator('[data-search="rentals"]').fill('김민수');
      await frame.locator('#so-rental-rows .so-button[data-id="R-025"]').click();
      await frame.locator('[data-subtab="payment"]').click();
      const detail = await frame.locator('#so-page').innerHTML();
      await toggle(); await nav('closing'); await toggle();
      assert.equal(await current(), 'rental'); assert.equal(await frame.locator('#so-page').innerHTML(), detail);
      await nav('rentals'); assert.equal(await frame.locator('[data-search="rentals"]').inputValue(), '김민수');
    });
    await test('lift reservations share saved data, filters and child pages in both workspaces', async () => {
      await nav('lift-reservations'); await action('wf-book-new');
      await frame.locator('#wf-book-name').fill('공유 예약 확인');
      await frame.locator('#wf-book-phone').fill('010-0000-2222');
      await frame.locator('#wf-book-0-3').fill('2'); await action('wf-book-save');
      assert.equal(await frame.locator('#so-dialog').isVisible(), false);
      const reservations = await raw.evaluate(() => SkiOps.workflow.snap().reservations);
      const content = await frame.locator('#so-page').innerHTML();
      assert.match(await frame.locator('#so-page').innerText(), /공유 예약 확인/);
      await toggle(); await nav('lift-reservations'); assert.equal(await mode(), 'management');
      assert.deepEqual(await raw.evaluate(() => SkiOps.workflow.snap().reservations), reservations);
      assert.equal(await frame.locator('#so-page').innerHTML(), content);
      await frame.locator('#so-page [data-go="lift-stock"]').click();
      assert.equal(await mode(), 'management');
      assert.equal(await frame.locator('#so-navigation [aria-current="page"]').getAttribute('data-go'), 'lift-reservations');
      await toggle(); assert.equal(await mode(), 'pos'); assert.equal(await current(), 'lift-reservations');
      assert.equal(await frame.locator('#so-page').innerHTML(), content);
    });
    await test('dashboard shortcuts choose the matching menu and back restores management context', async () => {
      await frame.locator('.so-home-shortcuts [data-go="partners"]').click();
      assert.equal(await mode(), 'management');
      await frame.locator('#so-page [data-go="partner"]').first().click(); await action('back');
      assert.equal(await current(), 'partners'); assert.equal(await mode(), 'management');
      await nav('home'); await frame.locator('#so-page .so-pagehead [data-go="intake"]').click();
      assert.equal(await mode(), 'pos'); await action('representative-done');
      await toggle(); await nav('lift-reservations');
      await raw.evaluate(() => SkiOps.go('return-detail', { id: 'R-021' }));
      assert.equal(await mode(), 'pos');
      await raw.evaluate(() => SkiOps.root.querySelector('[data-action="workspace-switch"]').click());
      assert.equal(await mode(), 'management');
      await action('logout'); await action('login-shop');
      assert.equal(await mode(), 'pos'); assert.equal(await current(), 'home');
      await toggle(); await toggle(); assert.equal(await current(), 'home');
    });
    await test('switch stays at the bottom while collapsed and expanded menus scroll on POS and mobile sizes', async () => {
      for (const [width, height] of [[1366, 768], [1024, 768], [1024, 600], [390, 740]]) {
        await page.setViewportSize({ width, height });
        for (const workspace of ['pos', 'management']) {
          if (await mode() !== workspace) await toggle();
          assert.equal(await frame.locator('#so-navigation').evaluate(el => el.scrollTop), 0);
          for (const expanded of [false, true]) {
            if ((await frame.locator('#so-menu-toggle').getAttribute('aria-expanded') === 'true') !== expanded) await frame.locator('#so-menu-toggle').click();
            const before = await frame.locator('#so-workspace-switch').boundingBox();
            await frame.locator('#so-navigation').evaluate(el => { el.scrollTop = el.scrollHeight; });
            const after = await frame.locator('#so-workspace-switch').boundingBox();
            assert.ok(before && after && Math.abs(before.y - after.y) < 1);
            assert.ok(after.height >= 48 && after.x >= 0 && after.x + after.width <= width && after.y + after.height <= height);
            const label = frame.locator(expanded ? '.so-workspace-long' : '.so-workspace-short');
            assert.equal(await label.isVisible(), true);
            assert.equal(await raw.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            if (width === 1366 && expanded) await page.screenshot({ path: 'work/menu-split/' + workspace + '-expanded.png' });
          }
          await frame.locator('#so-menu-toggle').click();
        }
      }
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync('work/menu-split/checks.json', JSON.stringify({ checks, errors }, null, 2) + '\n');
  } catch (error) {
    await page.screenshot({ path: 'work/menu-split/failure.png' });
    console.error('Navigation failure viewport:', page.viewportSize());
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
