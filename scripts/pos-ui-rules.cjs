'use strict';
// UI v4 rule measurements shared by the capture scripts (docs/42 section 6).
// `measure` runs inside the page, so it must stay self-contained (no outer references).
// It reports what a person at the screen would notice: ① text under 16px ② clipped text
// ③ half-cut cards/rows ④ touch targets under the minimum height ⑤ regions that scroll.
function measure(options) {
  const minFont = options?.minFont || 16, minTarget = options?.minTarget || 52;
  const root = document.querySelector('#so-dialog[open]') || document.querySelector('#ski-ops') || document.body;
  const view = { top: 0, left: 0, bottom: innerHeight, right: innerWidth };
  const intersects = (r, box) => r.bottom > box.top + 1 && r.top < box.bottom - 1 && r.right > box.left + 1 && r.left < box.right - 1;
  const scrollerBox = el => {
    let box = view;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowY) || ['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX)) {
        const r = p.getBoundingClientRect();
        box = { top: Math.max(box.top, r.top), left: Math.max(box.left, r.left), bottom: Math.min(box.bottom, r.bottom), right: Math.min(box.right, r.right) };
      }
    }
    return box;
  };
  const shown = el => {
    if (!el.getClientRects().length) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    if (s.clipPath && s.clipPath !== 'none' && s.clipPath.includes('inset(50%')) return false; // screen-reader-only text
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    return intersects(r, scrollerBox(el));
  };
  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const signature = el => {
    const name = node => node.tagName.toLowerCase() + (node.id ? '#' + node.id : typeof node.className === 'string' && node.className.trim() ? '.' + node.className.trim().split(/\s+/)[0] : '');
    return el.id || (typeof el.className === 'string' && el.className.trim()) ? name(el) : (el.parentElement ? name(el.parentElement) + '>' : '') + name(el);
  };
  const sample = el => (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const group = (rows, keyOf) => { const map = new Map(); for (const row of rows) { const key = keyOf(row); const hit = map.get(key); if (hit) hit.count += 1; else map.set(key, { ...row, count: 1 }); } return [...map.values()]; };
  const all = [...root.querySelectorAll('*')].filter(shown);

  const smallText = group(all.filter(el => ownText(el) && !el.closest('#pos-notice-bell') && parseFloat(getComputedStyle(el).fontSize) < minFont - 0.01)
    .map(el => ({ sel: signature(el), px: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10, sample: sample(el) })), row => row.sel + '|' + row.px);

  const clippedText = group(all.filter(el => {
    if (!(ownText(el) || el.tagName === 'BUTTON')) return false;
    const s = getComputedStyle(el), hidesX = ['hidden', 'clip'].includes(s.overflowX) || s.textOverflow === 'ellipsis', hidesY = ['hidden', 'clip'].includes(s.overflowY);
    const spills = el.tagName === 'BUTTON' && el.id !== 'pos-notice-bell' && el.scrollWidth > el.clientWidth + 1; // text running past a button edge overlaps its neighbour
    return spills || hidesX && el.scrollWidth > el.clientWidth + 1 || hidesY && el.scrollHeight > el.clientHeight + 2;
  }).map(el => ({ sel: signature(el), sample: sample(el), need: el.scrollWidth, has: el.clientWidth })), row => row.sel);

  const halfCut = group([...root.querySelectorAll('[data-pos-scroll],.pos-list,.pos-page-body,.pos-modal-body')].filter(el => el.getClientRects().length).flatMap(container => {
    const c = container.getBoundingClientRect(), box = { top: Math.max(c.top, 0), bottom: Math.min(c.bottom, innerHeight) };
    return [...container.querySelectorAll('.pos-card,.pos-row,.pos-tile,.pos-line-row')].filter(item => item.getClientRects().length).filter(item => {
      const r = item.getBoundingClientRect();
      return r.top < box.bottom - 1 && r.bottom > box.bottom + 1 || r.top < box.top - 1 && r.bottom > box.top + 1;
    }).map(item => ({ sel: signature(container) + ' ' + signature(item), sample: sample(item) }));
  }), row => row.sel + '|' + row.sample);

  const shortTargets = group(all.filter(el => el.matches('button,a[href],select,input:not([type="hidden"]),[data-go],[data-action],[role="button"]')).map(el => {
    const box = el.matches('input[type="checkbox"],input[type="radio"]') && el.closest('label') ? el.closest('label') : el;
    return { el, height: Math.round(box.getBoundingClientRect().height * 10) / 10 };
  }).filter(row => row.height < minTarget - 0.5).map(({ el, height }) => ({ sel: signature(el), height, sample: sample(el) })), row => row.sel + '|' + row.height);

  const scrolling = [...root.querySelectorAll('*')].filter(el => el.getClientRects().length && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2)
    .map(el => ({ sel: signature(el), need: el.scrollHeight, has: el.clientHeight, allowed: el.hasAttribute('data-pos-scroll-ok') })).filter(row => !row.allowed);

  return { minFont, minTarget, smallText, clippedText, halfCut, shortTargets, scrolling };
}
const METRICS = ['smallText', 'clippedText', 'halfCut', 'shortTargets', 'scrolling'];
const LABELS = { smallText: '① 16px 미만 글자', clippedText: '② 잘린 글자', halfCut: '③ 반쯤 잘린 카드·행', shortTargets: '④ 낮은 누르는 곳', scrolling: '⑤ 스크롤' };
const count = rows => rows.reduce((n, row) => n + (row.count || 1), 0);
const totals = rules => Object.fromEntries(METRICS.map(metric => [metric, count(rules?.[metric] || [])]));
// Smoke suites call recorder(...).add(name, pageOrFrame) next to their own layout checks, so every window they open is measured too.
function recorder(suite, options) {
  const fs = require('node:fs'), path = require('node:path'), file = path.resolve('work', 'pos-rules', suite + '.json'), checks = [];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return { async add(name, target) {
    const rules = await target.evaluate(measure, options || { minFont: 16, minTarget: 52 }), viewport = await target.evaluate(() => [innerWidth, innerHeight, !!document.querySelector('#so-dialog[open]')]);
    checks.push({ key: suite + ':' + name, viewport: viewport.slice(0, 2), modal: viewport[2], rules, ruleTotals: totals(rules) });
    fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2));
  } };
}
module.exports = { measure, METRICS, LABELS, totals, recorder };
