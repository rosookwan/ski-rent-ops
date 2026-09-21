'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { readFileSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const path = require('node:path');
const OUT = path.resolve('work/pos-keypad'); mkdirSync(OUT, { recursive: true });
const checks = [], errors = [], writes = [], layouts = [];
let browser, server;
async function main() {
  server = createServer((request, response) => {
    const name = request.url === '/' ? 'index.html' : request.url.split('?')[0].slice(1);
    try {
      const file = path.resolve('dist', name); if (!file.startsWith(path.resolve('dist') + path.sep)) throw new Error('path');
      response.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' }); response.end(readFileSync(file));
    } catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  browser = await chromium.launch({ headless: true, channel: process.env.SKI_CHROME_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } }); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
  await page.goto('http://127.0.0.1:' + server.address().port); const frame = page.frames().find(frame => frame.parentFrame());
  await frame.waitForFunction(() => window.SkiOps?.posKeypad && window.SkiOps?.posData?.snapshot);
  const action = name => frame.locator('[data-action="' + name + '"]'), keypad = frame.locator('.pos-keypad');
  const field = name => frame.locator('[data-pos-input="' + name + '"]');
  const trigger = input => input.locator('..').locator('.pos-keypad-trigger');
  const key = value => keypad.locator('[data-keypad-key="' + value + '"]');
  const apply = () => keypad.locator('[data-keypad-apply]').click();
  async function digits(value) { for (const digit of value) await key(digit).click(); }
  async function layout(name) {
    const result = await keypad.evaluate(dialog => {
      const rect = element => element.getBoundingClientRect().toJSON();
      const elements = [dialog, ...dialog.querySelectorAll('header,.pos-keypad-values,button,footer,.pos-keypad-feedback')];
      return { dialog: rect(dialog), outside: elements.map(element => ({ text: element.textContent.slice(0, 40), box: rect(element) })).filter(({ box }) => box.top < 0 || box.left < 0 || box.right > innerWidth || box.bottom > innerHeight),
        scroll: [...dialog.querySelectorAll('*'), dialog].filter(element => element.clientHeight && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)).map(element => element.className || element.tagName),
        small: [...dialog.querySelectorAll('button')].map(rect).filter(box => box.height < 52 || box.width < 52) };
    });
    assert.deepEqual(result.outside, [], name + ' outside viewport'); assert.deepEqual(result.scroll, [], name + ' scrolling'); assert.deepEqual(result.small, [], name + ' touch target');
    layouts.push({ name, ...result }); await page.screenshot({ path: path.join(OUT, name + '.png') });
  }
  await action('login-shop').click();
  await frame.evaluate(async () => {
    const D = SkiOps.posData;
    await D.execute('order.create', { id: 'keypad-team', customer: { name: '숫자판 검증팀', phone: '010-1234-5678' }, people: [{ id: 'keypad-person', name: '일행 1' }], batch: { id: 'keypad-batch', lines: [{ id: 'keypad-line', sku: 'ski', quantity: 2, personId: 'keypad-person', start: D.today, end: D.today, price: { unitWon: 20000 } }] } });
    SkiOps.go('order-detail', { id: 'keypad-team' });
  });
  const original = await frame.evaluate(() => structuredClone(SkiOps.posData.snapshot));
  await action('pos-money').click(); await field('moneyAmount').fill('12345');
  await field('moneyAmount').press('Tab'); // Complete the native keyboard edit before observing keypad events.
  assert.equal(await keypad.count(), 0); assert.equal(await trigger(field('moneyAmount')).count(), 1);
  await field('moneyAmount').evaluate(input => {
    window.__keypadInput = input; window.__keypadEvents = [];
    for (const type of ['input', 'change']) input.addEventListener(type, () => window.__keypadEvents.push(type));
  });
  checks.push('Physical keyboard remains available; numeric focus does not force a popup');
  await trigger(field('moneyAmount')).click();
  assert.match(await keypad.locator('#pos-keypad-customer').innerText(), /숫자판 검증팀/);
  assert.match(await keypad.locator('#pos-keypad-title').innerText(), /실제로 처리한 금액/);
  assert.equal(await keypad.locator('[data-keypad-old]').innerText(), '12345');
  await digits('25000');
  for (const height of [600, 768]) { await page.setViewportSize({ width: 1024, height }); await layout('money-1024x' + height); }
  await keypad.locator('[data-keypad-cancel]').click();
  assert.equal(await field('moneyAmount').inputValue(), '12345'); assert.equal(await frame.locator('#so-dialog').isVisible(), true);
  assert.deepEqual(await frame.evaluate(() => window.__keypadEvents), []);
  assert.equal(await trigger(field('moneyAmount')).evaluate(button => button === document.activeElement), true);
  await trigger(field('moneyAmount')).click(); await key('7').click(); await keypad.press('Escape');
  assert.equal(await keypad.count(), 0); assert.equal(await field('moneyAmount').inputValue(), '12345'); assert.equal(await frame.locator('#so-dialog').isVisible(), true);
  checks.push('Cancel and Escape preserve the customer, original money modal, value, input identity and focus');
  await trigger(field('moneyAmount')).click(); await keypad.press('2'); await keypad.press('5'); await keypad.press('0'); await keypad.press('0'); await keypad.press('0');
  await keypad.locator('[data-keypad-apply]').press('Tab');
  assert.equal(await key('7').evaluate(button => button === document.activeElement), true);
  await key('7').press('Shift+Tab'); assert.equal(await keypad.locator('[data-keypad-apply]').evaluate(button => button === document.activeElement), true);
  await keypad.press('Enter');
  assert.equal(await field('moneyAmount').inputValue(), '25000');
  assert.equal(await field('moneyAmount').evaluate(input => input === window.__keypadInput), true);
  assert.deepEqual(await frame.evaluate(() => window.__keypadEvents), ['input', 'change']);
  assert.deepEqual(await frame.evaluate(() => structuredClone(SkiOps.posData.snapshot)), original);
  checks.push('Apply changes only the input once, retains its handlers and parent modal, and records no payment');
  await trigger(field('moneyAmount')).click(); await key('0').click(); await apply();
  assert.match(await keypad.locator('[data-keypad-error]').innerText(), /1 이상/); assert.equal(await field('moneyAmount').inputValue(), '25000');
  await page.setViewportSize({ width: 1024, height: 600 }); await layout('minimum-error-1024x600');
  await keypad.press('Escape'); await action('close').last().click();
  await action('pos-add').click(); await action('pos-draft-next').click();
  await field('unitWon').fill('40000'); const draft = await frame.evaluate(() => structuredClone(SkiOps.posOrders.state.draft));
  await trigger(field('quantity')).click(); await digits('501'); await apply();
  assert.match(await keypad.locator('[data-keypad-error]').innerText(), /500 이하/);
  await key('clear').click(); await digits('12'); await apply();
  assert.equal(await field('quantity').inputValue(), '12'); assert.equal(await field('unitWon').inputValue(), '40000');
  await trigger(field('discountWon')).click(); await digits('9000'); await keypad.locator('[data-keypad-cancel]').click();
  assert.equal(await field('discountWon').inputValue(), '0'); assert.equal(await field('quantity').inputValue(), '12');
  assert.deepEqual(await frame.evaluate(() => structuredClone(SkiOps.posOrders.state.draft)), draft);
  assert.deepEqual(await frame.evaluate(() => structuredClone(SkiOps.posData.snapshot)), original);
  checks.push('Quantity bounds are enforced; editing or cancelling preserves the existing added-person draft and other fields');
  await action('pos-line-add').click();
  assert.equal(await frame.evaluate(() => SkiOps.posOrders.state.draft.lines[0].quantity), 12);
  await frame.evaluate(() => { for (let count = 0; count < 50; count++) SkiOps.posKeypad.scan(); });
  const numericCount = await frame.locator('input[type="number"]').count();
  assert.equal(await frame.locator('.pos-keypad-trigger').count(), numericCount);
  assert.equal(await frame.locator('.pos-keypad-control .pos-keypad-control').count(), 0);
  await trigger(field('quantity')).click(); await frame.evaluate(() => SkiOps.go('order-detail', { id: 'keypad-team' }));
  assert.equal(await keypad.count(), 0);
  checks.push('Normal re-rendering creates one button per new input; repeated scans and navigation create no nested controls or orphan dialog');
  await action('pos-add').click(); await action('pos-draft-next').click(); await frame.locator('[data-action="pos-draft-plan"][data-id="pickup"]').click();
  assert.equal(await frame.locator('#so-dialog .pos-keypad-control').count(), 0);
  const planDate = await field('planDate').inputValue(), planTime = await field('planTime').inputValue();
  assert.equal(await field('planDate').evaluate(input => !!input.closest('.pos-keypad-control')), false);
  assert.equal(await field('planTime').evaluate(input => !!input.closest('.pos-keypad-control')), false);
  await frame.locator('#so-dialog [data-time-open]').click(); await frame.locator('.so-time-picker').press('Escape');
  assert.equal(await frame.locator('#so-dialog').isVisible(), true); assert.equal(await field('planDate').inputValue(), planDate); assert.equal(await field('planTime').inputValue(), planTime);
  await frame.locator('#so-dialog [data-action="close"]').last().click();
  checks.push('Intake pickup schedule keeps its date and existing time picker unchanged beside the numeric extension');
  // Constraint fixture uses the actual shared POS modal and native input constraints.
  await frame.evaluate(() => SkiOps.pos.modal('숫자 제약 확인', '<label class="so-field">반 단위 조정<input aria-label="반 단위 조정" type="number" id="keypad-decimal" value="1" min="-5" max="5" step="0.5"></label><label class="so-field">읽기 전용<input type="number" id="keypad-readonly" value="3" readonly></label><input type="tel" inputmode="numeric" id="keypad-phone" value="01012345678">', '<button type="button" data-action="close">닫기</button>'));
  const decimal = frame.locator('#keypad-decimal'); await trigger(decimal).click(); await key('clear').click(); await key('sign').click(); await digits('1'); await key('.').click(); await digits('2'); await apply();
  assert.match(await keypad.locator('[data-keypad-error]').innerText(), /0.5 단위/); assert.equal(await decimal.inputValue(), '1');
  await key('back').click(); await digits('5'); await layout('signed-decimal-1024x600'); await apply(); assert.equal(await decimal.inputValue(), '-1.5');
  assert.equal(await trigger(frame.locator('#keypad-readonly')).isDisabled(), true);
  assert.equal(await frame.locator('#keypad-phone').evaluate(input => !!input.closest('.pos-keypad-control')), false);
  await decimal.evaluate(input => { input.disabled = true; }); await frame.waitForFunction(() => document.querySelector('#keypad-decimal').nextElementSibling.disabled);
  assert.equal(await trigger(decimal).isDisabled(), true);
  checks.push('Fractional steps, signed adjustments and dynamic disabled/readonly state are respected; phone fields stay unchanged');
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  rmSync(path.join(OUT, 'failure.json'), { force: true });
  writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, layouts, errors, writes, surface: 'Built POS in static memory demo, actual browser controls', unverified: ['Physical POS touchscreen and OS virtual keyboard behavior', 'Hardware payment or printer integration'] }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, output: OUT, errors, writes }));
}
main().catch(error => { console.error(error.stack); writeFileSync(path.join(OUT, 'failure.json'), JSON.stringify({ checks, layouts, errors, error: error.stack }, null, 2)); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); if (server?.listening) await new Promise(resolve => server.close(resolve)); });
