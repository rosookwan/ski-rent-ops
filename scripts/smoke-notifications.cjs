const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SKI_CHROME_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [], mutations = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()); });
  const url = process.env.SKI_DEMO_URL || 'http://127.0.0.1:58148/';
  const f = page.frameLocator('iframe');
  const action = name => f.locator('[data-action="' + name + '"]:visible').click();
  const notice = name => f.locator('#so-notice-dialog [data-notice="' + name + '"]:visible').first().click();
  const nav = name => f.locator('#so-navigation [data-go="' + name + '"]').click();
  const bell = () => f.locator('#so-notice-bell').click();
  const raw = () => page.frames().find(frame => frame.parentFrame());
  const test = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
  const measureAudio = () => raw().evaluate(async () => {
    const samples = new Float32Array(2048); let peak = 0;
    for (let i = 0; i < 24; i++) {
      window.noticeAudioProbe.getFloatTimeDomainData(samples);
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return peak;
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await action('login-shop');
    await test('opening the inbox does not read notifications; the whole row acknowledges without changing returns', async () => {
      const before = await raw().evaluate(() => SkiOps.returns.store.get('R-024'));
      await bell(); assert.equal(await f.locator('.so-notice-row.is-unread').count(), 1);
      assert.match(await f.locator('#so-notice-bell').getAttribute('aria-label'), /미확인 1/);
      await f.locator('.so-notice-row').click({ position: { x: 8, y: 65 } });
      assert.match(await f.locator('#so-notice-bell').getAttribute('aria-label'), /모두 확인/);
      assert.deepEqual(await raw().evaluate(() => SkiOps.returns.store.get('R-024')), before);
      await notice('close'); assert.equal(await f.locator('#so-notice-bell').evaluate(el => el === el.ownerDocument.activeElement), true);
    });
    await test('PC sound preview produces an audio signal after all alerts are read and keeps the sound preference unchanged', async () => {
      await raw().evaluate(() => {
        const Original = window.AudioContext;
        window.AudioContext = class extends Original {
          constructor(...args) {
            super(...args);
            const analyser = this.createAnalyser(); analyser.fftSize = 2048;
            window.noticeAudioProbe = analyser;
            const createGain = this.createGain.bind(this);
            this.createGain = () => {
              const gain = createGain(), connect = gain.connect.bind(gain);
              gain.connect = (target, ...options) => {
                if (target === this.destination) { connect(analyser); analyser.connect(target); return target; }
                return connect(target, ...options);
              };
              return gain;
            };
          }
        };
      });
      await bell(); await notice('settings');
      assert.equal((await raw().evaluate(() => SkiOps.notifications.soundInfo())).preferences.sound, false);
      await notice('sound-test');
      const peak = await measureAudio(); assert.ok(peak > .01, 'PC preview is silent: peak=' + peak);
      assert.equal((await raw().evaluate(() => SkiOps.notifications.soundInfo())).preferences.sound, false);
      const volume = f.locator('[data-notice-volume]');
      await volume.press('Home'); assert.equal(await f.locator('[data-notice=sound-test]').isDisabled(), true);
      await volume.press('End'); assert.equal(await f.locator('[data-notice=sound-test]').isDisabled(), false);
      for (let i = 0; i < 4; i++) await volume.press('ArrowLeft');
      await notice('sound-toggle');
      assert.ok(await measureAudio() > .01, 'Enabling sound must play the complete preview without unread alerts');
      await notice('sound-toggle');
      assert.equal((await raw().evaluate(() => SkiOps.notifications.soundInfo())).preferences.sound, false);
      await notice('close');
    });
    await test('intake draft and its open period sheet survive notification arrival and nested inbox', async () => {
      await nav('intake'); await action('representative-done'); await action('toggle-period');
      const before = await raw().evaluate(() => SkiIntake.draft());
      await raw().evaluate(() => SkiOps.notifications.open());
      assert.equal(await f.locator('#so-notice-dialog').evaluate(el => el.open), true);
      await notice('close');
      assert.deepEqual(await raw().evaluate(() => SkiIntake.draft()), before);
      await action('intake-sheet-done');
    });
    await test('vehicle sound enables only by user action, repeats and stops after the banner is acknowledged', async () => {
      await f.locator('.so-topbar-right [data-go=vehicle]').click();
      await page.setViewportSize({ width: 1024, height: 520 });
      await bell(); await notice('settings'); await notice('sound-toggle');
      await raw().waitForFunction(() => SkiOps.notifications.soundInfo().ready, null, { timeout: 5000 });
      const count = (await raw().evaluate(() => SkiOps.notifications.soundInfo())).playedCount;
      assert.ok(count >= 1);
      assert.ok(await measureAudio() > .01, 'Vehicle sound must reach the audio graph');
      await page.evaluate(() => { const button = document.createElement('button'); button.id = 'focus-probe'; button.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0'; document.body.append(button); button.focus(); });
      assert.equal(await raw().evaluate(() => document.hasFocus()), false);
      assert.equal(await raw().evaluate(() => document.hidden), false);
      await raw().waitForFunction(count => SkiOps.notifications.soundInfo().playedCount > count, count, { timeout: 36000 });
      assert.ok((await raw().evaluate(() => SkiOps.notifications.soundInfo())).playedCount > count);
      assert.ok(await measureAudio() > .01, 'Visible PC screen should still sound when focus is outside the iframe');
      await page.locator('#focus-probe').evaluate(el => el.remove());
      await notice('close'); await action('ack');
      const stopped = (await raw().evaluate(() => SkiOps.notifications.soundInfo())).playedCount;
      await new Promise(resolve => setTimeout(resolve, 31000));
      assert.equal((await raw().evaluate(() => SkiOps.notifications.soundInfo())).playedCount, stopped);
      assert.equal(await f.locator('.ski-priority-button').count(), 0);
      assert.match(await f.locator('#so-notice-bell').getAttribute('aria-label'), /모두 확인/);
    });
    await test('store requests reach the vehicle and show the driver acknowledgement on the original request', async () => {
      await f.locator('.so-topbar-right [data-go=home]').click(); await nav('dispatch');
      await f.locator('[data-action=driver-alert][data-id="R-021"]').first().click();
      await f.locator('[data-notice-message]').fill('만선 티롤 앞에서 확인해 주세요.');
      await notice('send'); assert.match(await f.locator('.so-notice-list').innerText(), /확인 대기/);
      await notice('close'); await f.locator('.so-topbar-right [data-go=vehicle]').click();
      await bell();
      await f.locator('.so-notice-row').filter({ hasText: '만선 티롤 앞에서 확인해 주세요.' }).click();
      await notice('close'); await f.locator('.so-topbar-right [data-go=home]').click(); await bell();
      await f.locator('[data-notice=tab][data-value=sent]').click();
      assert.match(await f.locator('.so-notice-list').innerText(), /기사님 확인함/);
      await notice('close');
    });
    await test('driver requests can be sent using large quick choices and arrive in the POS inbox', async () => {
      await f.locator('.so-topbar-right [data-go=vehicle]').click(); await bell(); await notice('request');
      await f.locator('[data-notice-order]').selectOption('R-021');
      await f.locator('[data-notice=quick]').filter({ hasText: '수량 확인' }).click(); await notice('send');
      await notice('close'); await f.locator('.so-topbar-right [data-go=home]').click(); await bell();
      await f.locator('[data-notice=tab][data-value=unread]').click();
      assert.match(await f.locator('.so-notice-list').innerText(), /수량 확인이 필요해요/);
      await notice('close');
    });
    await test('an arriving alert updates the bell without replacing the open screen or shifting an inbox row', async () => {
      await bell();
      const existing = await f.locator('.so-notice-row').first().boundingBox();
      await raw().evaluate(() => {
        const order = SkiOps.returnUI.current('R-023');
        SkiOps.notificationRuntime.driver.execute(SkiNotificationClient.command('request', { orderId: order.id, expectedVersion: order.version, message: '새로운 확인 요청입니다.' }));
      });
      await f.locator('[data-notice=reload]').waitFor();
      const next = await f.locator('.so-notice-row').first().boundingBox();
      assert.equal(existing.y, next.y); await notice('reload');
      assert.match(await f.locator('.so-notice-list').innerText(), /새로운 확인 요청/);
      await notice('close');
    });
    await test('notification settings are reachable from store settings and preserve the other settings tabs', async () => {
      await nav('settings'); await f.locator('[data-subtab=notifications]').click();
      assert.equal(await f.locator('#so-notice-settings-page').count(), 1);
      await f.locator('[data-subtab=operations]').click();
      assert.ok(await f.locator('.so-operations-directory').count());
    });
    await test('POS and low vehicle viewports keep the bell, rows and panel controls visible', async () => {
      for (const [width, height, vehicle] of [[1024,768,false],[1366,768,false],[907,648,false],[907,710,false],[1024,520,true],[1024,600,true],[1024,800,true]]) {
        await page.setViewportSize({ width, height });
        if (vehicle && await f.locator('.so-topbar-right [data-go=vehicle]').count()) await f.locator('.so-topbar-right [data-go=vehicle]').click();
        await bell();
        const box = await f.locator('#so-notice-dialog').boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, JSON.stringify(box));
        const dimensions = await f.locator('#so-notice-dialog').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
        assert.ok(dimensions.scroll <= dimensions.client + 1);
        const close = await f.locator('#so-notice-dialog [data-notice=close]').boundingBox(); assert.ok(close.width >= 44 && close.height >= 44);
        await page.screenshot({ path: 'work/notifications-' + width + 'x' + height + (vehicle ? '-vehicle' : '-pos') + '.png' });
        if (vehicle && height === 520) {
          for (const screen of ['settings', 'request']) {
            await notice(screen);
            const content = await f.locator('.so-notice-content').evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight }));
            assert.ok(content.scroll <= content.client + 1, screen + ': ' + JSON.stringify(content));
            await page.screenshot({ path: 'work/notifications-compact-' + screen + '.png' });
            await notice('back');
          }
        }
        await notice('close');
        const bellBox = await f.locator('#so-notice-bell').boundingBox(); assert.ok(bellBox.width >= 48 && bellBox.height >= 48);
        const centered = await f.locator('#so-notice-bell').evaluate(el => {
          const svg = el.querySelector('svg'), previous = svg.style.animation; svg.style.animation = 'none';
          const button = el.getBoundingClientRect(), glyph = svg.getBoundingClientRect();
          const delta = { x: glyph.x + glyph.width / 2 - button.x - button.width / 2, y: glyph.y + glyph.height / 2 - button.y - button.height / 2 };
          svg.style.animation = previous; return delta;
        });
        assert.ok(Math.abs(centered.x) <= .5 && Math.abs(centered.y) <= .5, 'Bell is off-center: ' + JSON.stringify(centered));
        const header = await f.locator('.so-topbar-right').evaluate(el => [...el.querySelectorAll('button:not([hidden])')].map(el => el.getBoundingClientRect().toJSON()));
        for (let i = 1; i < header.length; i++) assert.ok(header[i].left >= header[i-1].right - 1);
        if (vehicle) {
          const segment = await f.locator('.ski-vehicle-head .ski-segment').boundingBox();
          assert.ok(segment.x + segment.width <= bellBox.x + 1);
        }
      }
    });
    await test('reduced motion disables shaking and public pages never show the staff bell', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await f.locator('#so-notice-bell>svg').evaluate(el => getComputedStyle(el).animationName), 'none');
      await action('logout'); assert.equal(await f.locator('#so-notice-bell').isVisible(), false);
      await f.locator('[data-go=guest-guide]').click(); assert.equal(await f.locator('#so-notice-bell').isVisible(), false);
    });
    await test('refresh restores only sample notifications and makes no external write requests', async () => {
      await page.reload({ waitUntil: 'networkidle' }); await action('login-shop'); await bell();
      assert.equal(await f.locator('.so-notice-row').count(), 1);
      assert.equal((await raw().evaluate(() => SkiOps.notifications.soundInfo())).preferences.sound, false);
      assert.deepEqual(errors, []); assert.deepEqual(mutations, []);
    });
    fs.writeFileSync('work/notifications-ui-verification.json', JSON.stringify({ url, checks, errors, mutations }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, errors, mutations }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
