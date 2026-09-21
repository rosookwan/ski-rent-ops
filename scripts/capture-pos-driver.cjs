'use strict';
// Captures the driver (vehicle tablet) screens against a real API server at tablet sizes
// and asserts nothing overflows and the page body never scrolls. Output: docs/pos-ui-v4/driver-*.png (SKI_DRIVER_OUT to change)
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createApiServer, tokenAuthenticator } = require('../server/returns-api.cjs');
const { createSqliteRepository } = require('../server/returns-repository.cjs');
const { createHttpClient, newCommand } = require('../src/workflows/client.js');
const { measure, totals } = require('./pos-ui-rules.cjs');
const OUT = path.resolve(process.env.SKI_DRIVER_OUT || 'docs/pos-ui-v4'); mkdirSync(OUT, { recursive: true });
const temp = mkdtempSync(path.join(tmpdir(), 'ski-pos-driver-'));
const token = 'local-driver-capture-store-'.padEnd(48, 'x'), driverToken = 'local-driver-capture-driver-'.padEnd(48, 'x');
const hash = value => createHash('sha256').update(value).digest('hex');
const sizes = [[1024, 520], [1024, 600], [1280, 720]];
let server, repository, browser;
const errors = [], results = [];
async function main() {
  repository = createSqliteRepository(path.join(temp, 'ops.sqlite'));
  server = createApiServer({ repository, authenticate: tokenAuthenticator([
    { tokenHash: hash(token), shopId: 'driver-capture-shop', actor: { id: 'manager', role: 'store', permissions: ['closing.reopen'] } },
    { tokenHash: hash(driverToken), shopId: 'driver-capture-shop', actor: { id: 'driver-1', role: 'driver', vehicleId: 'van-1' } }
  ]), clock: () => '2026-09-13T01:00:00.000Z', uiDirectory: path.resolve('dist') });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const baseUrl = 'http://127.0.0.1:' + server.address().port, client = createHttpClient({ baseUrl, token });
  const command = async (type, payload) => client.execute(newCommand(type, await client.snapshot(), payload));
  await command('stock.receive', { sku: 'ski', quantity: 16, size: '160' });
  await command('stock.receive', { sku: 'clothing', quantity: 8, size: 'L' });
  const stops = [['09:00', '김민재', '만선 광장'], ['09:40', '박서윤', '설천 주차장'], ['10:20', '이도윤', '만선 티롤 앞'], ['11:00', '최하은', '만선 광장'], ['13:30', '정지호', '설천 주차장'], ['14:10', '강수아', '만선 티롤 앞'], ['16:30', '윤서준', '만선 광장']];
  for (const [index, [time, name, place]] of stops.entries()) {
    const id = 'drv-order-' + index;
    await command('order.create', { id, customer: { name, phone: '010-1234-' + String(1000 + index) }, people: [{ id: 'p', name }], batch: { id: 'b', lines: [
      { id: 'ski', sku: 'ski', quantity: 2, personId: 'p', start: '2026-09-13', end: '2026-09-13', price: { unitWon: 20000 } },
      { id: 'coat', sku: 'clothing', quantity: 1, personId: 'p', start: '2026-09-13', end: '2026-09-13', price: { unitWon: 10000 } }] } });
    const snapshot = await client.snapshot();
    const free = sku => snapshot.assets.filter(a => a.sku === sku && a.location.kind === 'shop' && a.condition === 'ready' && !a.orderPreparation && !a.ticket).map(a => a.id);
    await command('ops.dispatch', { id: 'drv-dispatch-' + index, orderId: id, lineItems: [{ lineId: 'ski', assetIds: free('ski').slice(0, 2) }, { lineId: 'coat', assetIds: free('clothing').slice(0, 1) }], vehicleId: 'van-1', date: '2026-09-13', time, place });
  }
  browser = await chromium.launch({ channel: process.env.SKI_CHROME_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl + '/pos'); await page.locator('#pos-access-key').fill(driverToken); await page.locator('[data-action="pos-connect"]').click(); await page.locator('.pos-page').waitFor();
  assert.equal(await page.evaluate(() => window.SkiOps.posData.snapshot.actor.role), 'driver');
  async function capture(key, width, height) {
    await page.setViewportSize({ width, height }); await page.evaluate(() => { if (!document.querySelector('#so-dialog[open]')) window.SkiOps.render(); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.evaluate(() => {
      const root = document.querySelector('#so-dialog[open]') || document.querySelector('.pos-page');
      const outside = [...root.querySelectorAll('h2,p,input,select,button,output,.pos-page-footer,.pos-row,.pos-pager')].filter(el => el.getClientRects().length).map(el => ({ text: el.textContent.trim().slice(0, 50), box: el.getBoundingClientRect().toJSON() }))
        .filter(({ box }) => box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.top < -1 || box.left < -1);
      const body = root.querySelector('.pos-page-body');
      const buttons = [...root.querySelectorAll('button')].filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect().height);
      return { viewport: [innerWidth, innerHeight], outside, bodyScroll: body ? body.scrollHeight > body.clientHeight + 1 : false, rows: root.querySelectorAll('.pos-row').length, smallestButton: Math.min(...buttons), rail: !!document.querySelector('.pos-rail') };
    });
    assert.deepEqual(geometry.outside, [], key + ' outside viewport'); assert.equal(geometry.bodyScroll, false, key + ' body scroll'); assert.equal(geometry.rail, false, key + ' rail must be hidden for drivers');
    const rules = await page.evaluate(measure, { minFont: 16, minTarget: 56 });
    const file = 'driver-' + key + '-' + width + 'x' + height + '.png'; await page.screenshot({ path: path.join(OUT, file) }); results.push({ key, file, ...geometry, rules, ruleTotals: totals(rules) });
    assert.ok(Object.values(totals(rules)).every(n => n === 0), key + ' UI rules: ' + JSON.stringify(totals(rules)));
    if (await page.locator('#so-dialog[open]').count()) assert.ok((await page.locator('#so-dialog').boundingBox()).height <= height - 48, key + ' dialog height');
  }
  for (const [width, height] of sizes) { await page.evaluate(() => window.SkiOps.go('dispatch')); await capture('dispatch', width, height); }
  assert.equal(results.find(r => r.key === 'dispatch' && r.viewport[1] === 520).rows, 3); assert.equal(results.find(r => r.key === 'dispatch' && r.viewport[1] === 600).rows, 4);
  await page.setViewportSize({ width: 1024, height: 520 }); await page.evaluate(() => window.SkiOps.go('dispatch'));
  await page.locator('[data-action="pos-task"]').first().click(); await page.locator('[data-action="pos-task-complete"]').waitFor(); await capture('task', 1024, 520);
  await capture('task', 1024, 600); await capture('task', 1280, 720);
  const beforeMessage = await client.snapshot();
  await page.locator('[data-action="pos-task-message"]:visible').click(); await capture('message', 1024, 600);
  assert.match(await page.locator('.pos-task-message-copy').innerText(), /배달 차량이 출발했습니다\. 10분 이내 도착 예정/);
  assert.match(await page.locator('#so-dialog-body').innerText(), /고객에게 문자는 보내지 않습니다/);
  await page.locator('#so-dialog [data-action="close"]').last().click();
  assert.deepEqual(await client.snapshot(), beforeMessage, 'departure preview must not record SMS delivery or move stock');
  await page.evaluate(() => window.SkiOps.go('vehicle')); await page.locator('[data-pos-list-key="vehicle-stock"]').waitFor(); await capture('stock', 1024, 520);
  // Phones (docs/41): the same driver screens under 600px wide. 360×640 is the baseline; the list shows whole rows only.
  for (const [width, height] of [[360, 640], [390, 740], [412, 780]]) { await page.setViewportSize({ width, height }); await page.evaluate(() => window.SkiOps.go('dispatch')); await capture('phone-dispatch', width, height); }
  assert.equal(results.find(r => r.key === 'phone-dispatch' && r.viewport[1] === 640).rows, 4);
  await page.setViewportSize({ width: 360, height: 640 }); await page.evaluate(() => window.SkiOps.go('dispatch'));
  await page.locator('[data-action="pos-task"]').first().click(); await page.locator('[data-action="pos-task-complete"]').waitFor(); await capture('phone-task', 360, 640);
  await page.locator('[data-action="pos-task-message"]:visible').click(); await capture('phone-message', 360, 640); await page.locator('#so-dialog [data-action="close"]').last().click();
  await page.locator('[data-action="pos-task-visit"]').click(); await page.locator('#so-dialog[open]').waitFor(); await capture('phone-visit', 360, 640); await page.locator('#so-dialog [data-action="close"]').first().click();
  await page.evaluate(() => window.SkiOps.go('vehicle')); await page.locator('[data-pos-list-key="vehicle-stock"]').waitFor(); await capture('phone-stock', 360, 640);
  // Four item kinds require another page on a phone. Selection must survive paging and a zero-count error.
  await command('stock.receive', { sku: 'board', quantity: 1, size: '150' });
  await command('stock.receive', { sku: 'helmet', quantity: 1, size: 'M' });
  const skus = ['ski', 'board', 'clothing', 'helmet'];
  await command('order.create', { id: 'mixed-order', customer: { name: '김민재', phone: '010-1234-1000' }, people: [], batch: { id: 'mixed', lines: skus.map(sku => ({ id: sku, sku, quantity: 1, start: '2026-09-13', end: '2026-09-13', price: { unitWon: 10000 } })) } });
  const available = (await client.snapshot()).assets;
  const lineItems = skus.map(sku => ({ lineId: sku, assetIds: [available.find(a => a.sku === sku && a.location.kind === 'shop').id] }));
  await command('ops.dispatch', { id: 'mixed-task', orderId: 'mixed-order', lineItems, vehicleId: 'van-1', date: '2026-09-13', time: '09:00', place: '만선 광장' });
  await page.evaluate(async () => { await window.SkiOps.posData.refresh(); window.SkiOps.posDispatch.openTask('mixed-task'); });
  await capture('phone-task-many', 360, 640);
  assert.equal(await page.locator('.pos-row').count(), 2);
  for (const sku of skus.slice(0, 2)) await page.locator('[data-action="pos-task-step"][data-id="' + sku + '"][data-delta="-1"]').click();
  await page.locator('[data-pos-key="task-assets"][data-id="1"]').click();
  for (const sku of skus.slice(2)) await page.locator('[data-action="pos-task-step"][data-id="' + sku + '"][data-delta="-1"]').click();
  assert.equal(await page.locator('[data-action="pos-task-complete"]').innerText(), '실제 전달 확정 0개');
  const beforeZero = await client.snapshot(); await page.locator('[data-action="pos-task-complete"]').click();
  await capture('phone-task-zero', 360, 640); assert.deepEqual(await client.snapshot(), beforeZero);
  await page.locator('[data-pos-key="task-assets"][data-id="-1"]').click();
  assert.equal(await page.locator('[data-action="pos-task-complete"]').innerText(), '실제 전달 확정 0개');
  await page.locator('[data-action="pos-task-step"][data-id="ski"][data-delta="1"]').click();
  await capture('phone-task-many', 390, 740); await capture('phone-task-many', 412, 780);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForFunction(() => document.querySelectorAll('.pos-row').length === 2);
  assert.equal(await page.locator('[data-action="pos-task-complete"]').innerText(), '실제 전달 확정 1개');
  await capture('phone-task-resize', 360, 640);
  const assetIds = lineItems.flatMap(line => line.assetIds);
  await command('ops.taskMove', { taskId: 'mixed-task', assetIds });
  await command('task.save', { id: 'collect-task', kind: 'collection', vehicleId: 'van-1', date: '2026-09-13', time: '16:30', place: '만선 광장', customerId: 'mixed-order', orderId: 'mixed-order', title: '김민재 수거', assetIds });
  await page.evaluate(async () => { await window.SkiOps.posData.refresh(); window.SkiOps.posDispatch.openTask('collect-task'); });
  await capture('phone-collection', 360, 640);
  assert.equal(await page.locator('[data-action="pos-task-complete"]').innerText(), '실제 수거 확정 4개');
  await page.locator('[data-action="pos-task-message"]:visible').click();
  assert.match(await page.locator('.pos-task-message-copy').innerText(), /수거 차량이 출발했습니다\. 10분 이내 도착 예정/);
  assert.match(await page.locator('.pos-task-message-copy').innerText(), /장비와 함께 기다려 주세요/);
  await capture('phone-collection-message', 360, 640); await page.locator('#so-dialog [data-action="close"]').last().click();
  // Same comparison method as the A1-A4 scripts: original JPG and real browser capture, no generated UI images.
  const uri = file => 'data:image/' + (file.endsWith('.jpg') ? 'jpeg' : 'png') + ';base64,' + readFileSync(file).toString('base64');
  for (const [key, reference, actual, width, height, title] of [
    ['task', 'pos-rest-v1/d02-driver-task.jpg', 'driver-task-1024x600.png', 1024, 600, 'D02 · 기사 업무 처리'],
    ['phone-task', 'driver-phone-v1/d12-phone-task.jpg', 'driver-phone-task-360x640.png', 360, 640, 'D12 · 휴대폰 업무 처리']
  ]) {
    await page.setViewportSize({ width: width * 2 + 64, height: height + 190 });
    await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;font-family:system-ui,sans-serif;background:#f5f5f7;color:#222}h1{margin:0 0 8px;font-size:24px}p{margin:0 0 16px;font-size:16px}.pair{display:flex;gap:16px}figure{margin:0;background:#fff}figcaption{padding:10px 12px;font-size:18px;border:1px solid #ddd}img{display:block;width:' + width + 'px;height:' + height + 'px;object-fit:contain}footer{margin-top:14px;font-size:16px}</style><h1>' + title + '</h1><p>왼쪽: 기존 시안 / 오른쪽: 실제 화면 ' + width + '×' + height + '</p><div class="pair"><figure><figcaption>기존 시안</figcaption><img src="' + uri(path.resolve('design/higgsfield', reference)) + '"></figure><figure><figcaption>구현 · 가상 접수 자료</figcaption><img src="' + uri(path.join(OUT, actual)) + '"></figure></div><footer>사용자 결정: 촘촘한 행·쪽 나눔 유지, 예약금 미수 안내 보류. 글꼴 유지, 누르는 곳 56px 이상.</footer></html>');
    await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    await page.screenshot({ path: path.join(OUT, 'driver-' + key + '-compare.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  writeFileSync(path.join(OUT, 'driver-screens.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ screenshots: results.length, rows: results.map(r => [r.key, r.viewport.join('x'), r.rows]), smallestButton: Math.min(...results.map(r => r.smallestButton)), output: OUT }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.close(); repository?.close?.(); rmSync(temp, { recursive: true, force: true }); });
