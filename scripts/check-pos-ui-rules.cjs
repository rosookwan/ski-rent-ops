'use strict';
// Reads the rule measurements written by the capture scripts and fails when a screen inside the
// enforced scope (scripts/pos-ui-rules-scope.json) still has violations. The scope grows milestone
// by milestone (docs/42 section 5), so screens that are not converted yet only get reported.
const fs = require('node:fs');
const path = require('node:path');
const { METRICS, LABELS } = require('./pos-ui-rules.cjs');
const dir = path.resolve(process.env.SKI_SCREENS_OUT || 'docs/pos-ui-v4');
const scope = JSON.parse(fs.readFileSync(path.join(__dirname, 'pos-ui-rules-scope.json'), 'utf8'));
const read = file => fs.existsSync(path.join(dir, file)) ? JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) : null;
const entries = [
  ...(read('screens.json')?.checks || []).map(check => ({ source: 'pos', key: check.key, viewport: check.viewport.join('x'), rules: check.rules })),
  ...(read('driver-screens.json')?.results || []).map(result => ({ source: 'driver', key: 'driver-' + result.key, viewport: result.viewport.join('x'), rules: result.rules }))
].filter(entry => entry.rules);
if (!entries.length) { console.error('규칙 측정값이 없습니다. 먼저 npm run pos:screens (와 pos:screens:driver)를 실행하세요: ' + dir); process.exit(1); }
const count = rows => rows.reduce((n, row) => n + (row.count || 1), 0);
const enforced = (entry, metric) => scope.enforce.some(rule => (rule.keys === '*' || rule.keys.includes(entry.key)) && (rule.metrics === '*' || rule.metrics.includes(metric)) && (!rule.viewports || rule.viewports === '*' || rule.viewports.includes(entry.viewport)));
const failures = [], table = [];
for (const entry of entries) {
  const row = { 화면: entry.key, 크기: entry.viewport };
  for (const metric of METRICS) {
    const n = count(entry.rules[metric] || []); row[LABELS[metric]] = n + (enforced(entry, metric) ? ' *' : '');
    if (n && enforced(entry, metric)) failures.push({ key: entry.key, viewport: entry.viewport, metric, n, first: entry.rules[metric][0] });
  }
  table.push(row);
}
const totals = Object.fromEntries(METRICS.map(metric => [LABELS[metric], entries.reduce((n, entry) => n + count(entry.rules[metric] || []), 0)]));
if (process.env.SKI_RULES_TABLE !== '0') console.table(table);
console.log(JSON.stringify({ measured: entries.length, totals, enforcedFailures: failures.length }));
if (process.env.SKI_RULES_SUMMARY) fs.writeFileSync(path.resolve(process.env.SKI_RULES_SUMMARY), JSON.stringify({ generatedAt: new Date().toISOString(), note: '규칙 측정 요약. * 표시는 강제 범위(scripts/pos-ui-rules-scope.json).', totals, screens: table }, null, 2) + '\n');
if (failures.length) { for (const f of failures.slice(0, 20)) console.error('규칙 위반: ' + f.key + ' ' + f.viewport + ' · ' + LABELS[f.metric] + ' ' + f.n + '건 · 예: ' + JSON.stringify(f.first)); process.exit(1); }
