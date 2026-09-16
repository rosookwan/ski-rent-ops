'use strict';
// Captures the driver (vehicle tablet) screens against a real API server at tablet sizes
// and asserts nothing overflows and the page body never scrolls. Output: docs/pos-ui-v3/driver-*.png
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createApiServer, tokenAuthenticator } = require('../server/returns-api.cjs');
const { createSqliteRepository } = require('../server/returns-repository.cjs');
const { createHttpClient, newCommand } = require('../src/workflows/client.js');
const OUT = path.resolve(process.env.SKI_DRIVER_OUT || 'docs/pos-ui-v3'); mkdirSync(OUT, { recursive: true });
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
    await page.setViewportSize({ width, height }); await page.evaluate(() => window.SkiOps.render());
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
    const file = 'driver-' + key + '-' + width + 'x' + height + '.png'; await page.screenshot({ path: path.join(OUT, file) }); results.push({ key, file, ...geometry });
  }
  for (const [width, height] of sizes) { await page.evaluate(() => window.SkiOps.go('dispatch')); await capture('dispatch', width, height); }
  assert.equal(results.find(r => r.key === 'dispatch' && r.viewport[1] === 520).rows, 3); assert.equal(results.find(r => r.key === 'dispatch' && r.viewport[1] === 600).rows, 4);
  await page.setViewportSize({ width: 1024, height: 520 }); await page.evaluate(() => window.SkiOps.go('dispatch'));
  await page.locator('[data-action="pos-task"]').first().click(); await page.locator('[data-action="pos-task-complete"]').waitFor(); await capture('task', 1024, 520);
  await page.evaluate(() => window.SkiOps.go('vehicle')); await page.locator('[data-pos-list-key="vehicle-stock"]').waitFor(); await capture('stock', 1024, 520);
  assert.deepEqual(errors, []);
  writeFileSync(path.join(OUT, 'driver-screens.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ screenshots: results.length, rows: results.map(r => [r.key, r.viewport.join('x'), r.rows]), smallestButton: Math.min(...results.map(r => r.smallestButton)), output: OUT }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.close(); repository?.close?.(); rmSync(temp, { recursive: true, force: true }); });
