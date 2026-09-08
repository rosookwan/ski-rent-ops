const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixture, person } = require('./workflows-fixtures.cjs');

test('standalone browser bundle works without UI bindings, and A4/labels fit their print areas', async () => {
  const root = path.join(__dirname, '..');
  execFileSync('python3', ['scripts/build.py'], { cwd: root, stdio: 'pipe' });
  const browser = await chromium.launch({ headless: true, channel: process.env.SKI_CHROME_CHANNEL || 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
    await page.route('**/*', route => route.abort());
    await page.route('https://workflows.test/', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="ko"><body></body></html>' }));
    await page.goto('https://workflows.test/');
    await page.addScriptTag({ content: readFileSync(path.join(root, 'dist/ski-workflows.js'), 'utf8') });
    const result = await page.evaluate(async () => {
      const repository = SkiReturnService.createMemoryRepository();
      const service = SkiWorkflowService.createService(repository, { shopId: 'test', actor: { id: 'counter', role: 'store' } }, () => '2026-09-09T00:00:00.000Z');
      service.execute({ type: 'stock.receive', requestId: 'browser-1', expectedVersion: 0, payload: { sku: 'ski', quantity: 3 } });
      const form = await SkiWorkflowClient.newIntakeCommand(service.snapshot(), { id: 'browser-form', customer: { name: '고객', phone: '010-1111-2222' }, expectedPeople: 1, expiresAt: '2026-09-10T00:00:00.000Z' });
      service.execute(form.command);
      return { quantity: service.snapshot().assets.length, clientReady: typeof SkiWorkflowClient.createHttpClient === 'function', safeLink: form.accessToken.length >= 43 && !JSON.stringify(service.snapshot()).includes(form.accessToken) };
    });
    assert.deepEqual(result, { quantity: 3, clientReady: true, safeLink: true });
    const f = fixture(), form = await f.form('team-1', 21); await form.submit(Array.from({ length: 21 }, (_, i) => person(i + 1)));
    f.call('intake.review', { id: 'team-1', submissionVersion: 1 });
    f.call('print.request', { id: 'a4', kind: 'a4', formIds: ['team-1'] });
    await page.setViewportSize({ width: Math.round(190 * 96 / 25.4), height: 1300 });
    await page.emulateMedia({ media: 'print' }); await page.setContent(f.store.print('a4').html);
    const pages = await page.locator('section').evaluateAll(sections => sections.map(section => ({ height: section.getBoundingClientRect().height, rows: section.querySelectorAll('tbody tr').length, width: section.scrollWidth })));
    assert.deepEqual(pages.map(p => p.rows), [20, 1]);
    assert.ok(pages.every(p => p.height < 277 * 96 / 25.4), 'every 20-row group fits the A4 printable height');
    assert.ok(pages.every(p => p.width <= Math.round(190 * 96 / 25.4)), 'no horizontal overflow');
    f.call('print.request', { id: 'labels', kind: 'labels', formIds: ['team-1'] });
    await page.setViewportSize({ width: Math.round(74 * 96 / 25.4), height: 500 });
    await page.setContent(f.store.print('labels').html);
    const label = await page.locator('.label').evaluate(node => ({ height: node.getBoundingClientRect().height, overflow: node.scrollHeight > node.clientHeight }));
    assert.ok(label.height <= 44 * 96 / 25.4 + 1); assert.equal(label.overflow, false, 'representative/contact/gear/delivery/version fit a label');
  } finally { await browser.close(); }
});
