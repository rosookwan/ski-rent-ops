(() => {
  'use strict';
  const S = window.SkiOps, e = S.esc;
  const pages = new Map(), limits = new Map(), listRenders = new Map();
  // Fixed rail (112px, 96px under 1000px wide): nine POS entries in work order, 관리 pinned to the bottom. 관리 swaps the rail to the management menu.
  const menus = [
    ['home', '오늘 할 일', '', 'clipboard-check'], ['intake', '접수·예약', '1', 'user-plus'], ['preparation', '준비·지급', '2', 'package'],
    ['rentals', '이용·변경', '3', 'refresh-cw'], ['returns', '반납·회수', '4', 'package-check'], ['closing', '정산·마감', '5', 'wallet'],
    ['tickets', '리프트권', '', 'ticket'], ['dispatch', '차량 운행', '', 'truck'], ['management', '관리', '', 'settings-2']
  ];
  const managementMenus = [
    ['pos-return', '포스로', '', 'arrow-left'], ['inventory', '재고·정비', '', 'wrench'], ['partners', '거래처 장부', '', 'book-open'],
    ['customers', '고객 관리', '', 'users'], ['settings', '매장 설정', '', 'sliders-horizontal'], ['guide', '인쇄물', '', 'printer'], ['closing-history', '마감 이력', '', 'archive']
  ];
  const alias = { 'partner-detail': 'partners', 'customer-profile': 'customers', 'order-preinput-guest': 'preparation' };
  // Shared status vocabulary. Nouns only; no conversational endings.
  const terms = Object.freeze({
    status: { awaiting_exchange: '교환 대기', awaiting_issue: '지급 전', in_use: '이용 중', partial_return: '일부만 받음', awaiting_shop: '차량 보관 중', returned: '반납 완료', cancelled: '취소', needs_review: '확인 필요' },
    statusTone: { awaiting_exchange: 'orange', awaiting_issue: 'red', in_use: 'blue', partial_return: 'orange', awaiting_shop: 'purple', returned: 'green', cancelled: 'grey', needs_review: 'red' },
    line: { unissued: '지급 전', partial: '일부 지급', issued: '지급 완료', customer: '대여 중', vehicle: '차량 보관', shop: '반납 완료', cancelled: '취소', ticketPending: '발권 예정' },
    method: { cash: '현금', card: '카드', transfer: '계좌이체' }
  });
  const pageKey = key => S.state.page + ':' + key;
  const driver = () => S.posData?.snapshot?.actor?.role === 'driver';
  function navigation(active, registered) {
    if (driver()) return '';
    const management = S.state.workspace === 'management';
    const current = management ? (alias[S.state.page] || S.state.page) : active;
    const list = management ? managementMenus : menus;
    return '<nav class="pos-rail" aria-label="' + (management ? '관리 메뉴' : '포스 메뉴') + '">' + list.map(([route, label, step, glyph], index) => {
      const attrs = route === 'pos-return' ? 'data-action="workspace-switch"' : 'data-go="' + route + '"';
      const enabled = route === 'pos-return' || registered(route);
      return '<button type="button" class="pos-rail-item' + (!management && index === list.length - 1 ? ' is-bottom' : '') + '" ' + attrs + ' aria-label="' + e((step ? step + '. ' : '') + label) + '"'
        + (route === current ? ' aria-current="page"' : '') + (enabled ? '' : ' disabled') + '>' + S.icon(glyph) + '<span>' + e((step ? step + ' ' : '') + label) + '</span></button>';
    }).join('') + '</nav>';
  }
  function storeName() {
    return S.posData?.snapshot?.management?.settings?.store?.name || S.operations?.store?.().name || '매장';
  }
  function header(options) {
    const tools = S.$('#so-page-tools'), left = S.$('.so-topbar-left');
    if (left) {
      // Same header on every screen: 스키노트 · 매장명 · 화면 제목 (docs/42 2-4).
      let shop = left.querySelector('.pos-shop');
      if (!shop) { shop = document.createElement('span'); shop.className = 'pos-shop'; left.insertBefore(shop, S.$('#so-breadcrumb')); }
      if (!left.querySelector('.pos-mark')) { const mark = document.createElement('span'); mark.className = 'pos-mark'; mark.textContent = '스키노트'; left.insertBefore(mark, shop); }
      shop.textContent = storeName();
    }
    if (options.title && S.$('#so-breadcrumb')) S.$('#so-breadcrumb').textContent = options.title;
    if (!tools) return;
    const D = S.posData;
    let html = D?.pending ? '<button type="button" class="pos-search-entry" data-action="pos-retry">앞선 처리 다시 확인</button>' : '';
    if (options.wait != null) html += '<span class="pos-wait">' + (options.waitLabel === '' ? '' : '<span>' + e(options.waitLabel || '처리 대기') + '</span>') + '<strong>' + e(options.wait) + '</strong></span>';
    for (const [label, value, tone] of options.sums || []) html += '<span class="pos-sum"><span>' + e(label) + '</span><strong' + (tone ? ' data-tone="' + e(tone) + '"' : '') + '>' + e(value) + '</strong></span>';
    if (options.wait == null && !options.sums && !D?.pending) html += '<button type="button" data-go="rentals" class="pos-search-entry">' + S.icon('search') + '고객 찾기</button>';
    tools.innerHTML = html; tools.hidden = false;
  }
  function button(text, action, id = '', kind = '') {
    return '<button type="button" class="so-button pos-button ' + e(kind) + '" data-action="' + e(action) + '" data-id="' + e(id) + '">' + e(text) + '</button>';
  }
  const meaningful = html => !!html && html.replace(/<span class="pos-toolbar-label">[\s\S]*?<\/span>/g, '').trim() !== '';
  function page(title, description, body, footer = '', options = {}) {
    header(options);
    // Card lists page by height (UI v4): the pager sits in the footer, just before the buttons.
    if (footer && body.includes('data-pos-cards=')) { const at = footer.lastIndexOf('<div class="so-actions">'), slot = '<nav class="pos-cards-pager" aria-label="목록 쪽" hidden></nav>'; footer = at < 0 ? footer + slot : footer.slice(0, at) + slot + footer.slice(at); }
    afterRender();
    return '<section class="pos-page" aria-label="' + e(title) + '"><header class="pos-page-heading"><h1>' + e(title) + '</h1>'
      + (meaningful(options.toolbar) ? '<div class="pos-toolbar">' + options.toolbar + '</div>' : '') + (description ? '<p>' + e(description) + '</p>' : '')
      + '</header><div class="pos-page-body' + (body.includes('data-pos-cards=') || body.includes('class="pos-split') ? ' is-cards' : '') + '">' + body + '</div>' + (footer ? '<footer class="pos-page-footer">' + footer + '</footer>' : '') + '</section>';
  }
  function row(title, description, actions = '') {
    return '<article class="pos-row"><div class="pos-row-copy"><strong>' + e(title) + '</strong>'
      + (description ? '<p>' + e(description) + '</p>' : '') + '</div><div class="pos-row-actions">' + actions + '</div></article>';
  }
  const badge = (text, tone = 'grey') => '<span class="pos-badge" data-tone="' + e(tone) + '">' + e(text) + '</span>';
  const search = (key, value, placeholder) => '<label class="pos-search">' + S.icon('search') + '<input type="text" data-search="' + e(key) + '" value="' + e(value) + '" placeholder="' + e(placeholder) + '" aria-label="' + e(placeholder) + '" autocomplete="off"></label>';
  const chip = (label, action, id, on, count, extra = '') => '<button type="button" class="pos-chip' + (extra ? ' ' + e(extra) : '') + '" data-action="' + e(action) + '" data-id="' + e(id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + e(label) + (count == null ? '' : '<b>' + e(count) + '</b>') + '</button>';
  const chipGo = (label, route, id = '', on = false, extra = '') => '<button type="button" class="pos-chip' + (extra ? ' ' + e(extra) : '') + '" data-go="' + e(route) + '" data-id="' + e(id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + e(label) + '</button>';
  const toolbarLabel = text => '<span class="pos-toolbar-label">' + e(text) + '</span>';
  const group = html => '<div class="pos-toolbar-group">' + html + '</div>';
  // Grouped card grid. Legacy mode scrolls inside this region; v4 lists pass { fixed: true } and page by height instead (no scrolling).
  function cards(groups, options = {}) {
    const filled = groups.filter(g => g.cards && g.cards.length);
    if (options.fixed && filled.length) {
      // UI v4 list: same-height cards, laid out after insertion by layoutCards(). The first rows are rendered right away as a fallback.
      const key = pageKey('cards'), signature = filled.map(g => g.title + ':' + g.cards.length).join('|') + '|' + (options.signature || '');
      if (cardSets.get(key)?.signature !== signature) pages.set(key, 0);
      cardSets.set(key, { groups: filled, signature, focus: options.focus });
      return '<div class="pos-cards" data-pos-scroll data-pos-cards="' + e(key) + '"' + (options.lines ? ' data-lines' : '') + (options.cardHeight ? ' data-card-h="' + Number(options.cardHeight) + '"' : '') + (options.cols ? ' data-cols="' + Number(options.cols) + '"' : '') + '><section class="pos-group"><div class="' + (options.lines ? 'pos-line-list' : 'pos-card-grid') + '">' + filled.flatMap(g => g.cards).slice(0, 4).join('') + '</div></section></div>';
    }
    if (!filled.length) return '<div class="pos-cards" data-pos-scroll><div class="pos-empty"><strong>' + e(options.empty || '항목 없음') + '</strong>' + (options.emptyNote ? '<span>' + e(options.emptyNote) + '</span>' : '') + (options.emptyAction || '') + '</div></div>';
    return '<div class="pos-cards" data-pos-scroll>' + filled.map(g => '<section class="pos-group">' + (g.title ? '<div class="pos-group-head">' + e(g.title) + (g.sub ? '<small>' + e(g.sub) + '</small>' : '') + '</div>' : '')
      + '<div class="pos-card-grid">' + g.cards.join('') + '</div></section>').join('') + '</div>';
  }
  // ---- UI v4 (docs/42 2-3 · 2-4): fixed four-row card, text that is fitted instead of clipped, paging by height ----
  // Rows are single lines. When a row is too narrow, whole low-priority parts are dropped (never an ellipsis):
  // parts arrive in priority order, item lines end with "외 N종".
  const partsAttr = list => e(JSON.stringify(list.filter(Boolean)));
  function orderCard(c) {
    const tone = c.tone || '', strong = ['red', 'orange', 'green'].includes(tone);
    const legend = strong && c.badge ? '<span class="pos-card-legend">' + e(c.badge[0]) + '</span>' : '';
    const badgeHtml = !legend && c.badge ? badge(c.badge[0], c.badge[1] || 'grey') : '';
    const metaParts = (c.metaParts || []).filter(Boolean), itemParts = (c.itemParts || []).filter(Boolean);
    const inner = '<span class="pos-card-head"><span class="pos-card-name">' + e(c.name) + '</span>' + (c.phone ? '<span class="pos-card-phone">' + e(c.phone) + '</span>' : '') + badgeHtml + '</span>'
      + '<span class="pos-card-meta" data-fit="parts" data-parts="' + partsAttr(metaParts) + '">' + e(metaParts.join(' · ')) + '</span>'
      + '<span class="pos-card-itemline"><span class="pos-card-itemtext" data-fit="' + (c.itemFit || 'items') + '" data-parts="' + partsAttr(itemParts) + '">' + e(itemParts.join(' · ')) + '</span>'
      + (c.state?.[0] ? '<span class="pos-state" data-tone="' + e(c.state[1] || 'grey') + '">' + e(c.state[0]) + '</span>' : '') + '</span>';
    const open = c.go ? '<button type="button" class="pos-card-open" data-go="' + e(c.go.page) + '" data-id="' + e(c.go.id ?? '') + '">' + inner + '</button>' : '<div class="pos-card-open">' + inner + '</div>';
    return '<article class="pos-card is-fixed"' + (tone ? ' data-tone="' + e(tone) + '"' : '') + (c.id ? ' data-card-id="' + e(c.id) + '"' : '') + '>' + legend + open
      + '<div class="pos-card-bottom"><span class="pos-card-money" data-tone="' + e(c.money?.[1] || 'ink') + '">' + e(c.money?.[0] || '') + '</span>' + (c.actions ? '<div class="pos-card-actions">' + c.actions + '</div>' : '') + '</div></article>';
  }
  // Home tile: the whole tile is one touch target, "열기" is only a hint. Lines may carry shorter alternatives ([long, shorter, shortest]).
  function tile(c) {
    const tone = c.tone || '', strong = ['red', 'orange', 'green'].includes(tone);
    const line = row => { const alts = [].concat(row?.[0] || []); return '<span class="pos-tile-line" data-tone="' + e(row?.[1] || '') + '" ' + (alts.length > 1 ? 'data-fit="alts" data-alts="' + partsAttr(alts) + '"' : 'data-fit="auto"') + '>' + e(alts[0] || '') + '</span>'; };
    return '<button type="button" class="pos-tile" ' + (c.action ? 'data-action="' + e(c.action) + '" data-id="' + e(c.id ?? '') + '"' : 'data-go="' + e(c.route) + '"') + (tone ? ' data-tone="' + e(tone) + '"' : '') + '>' + (strong && c.badge ? '<span class="pos-card-legend">' + e(c.badge[0]) + '</span>' : '')
      + '<span class="pos-tile-head"><strong>' + e(c.name) + '</strong>' + (!strong && c.badge ? badge(c.badge[0], c.badge[1] || 'grey') : '') + '</span>'
      + (c.figures ? '<span class="pos-tile-figures">' + c.figures.map(f => '<span><small>' + e(f.label) + '</small><b' + (f.when ? ' class="is-when"' : '') + ' data-tone="' + e(f.tone || '') + '">' + e(f.value) + '</b></span>').join('') + '</span>' : '')
      + (c.figures ? line(c.lines?.[0]) + '<span class="pos-tile-last">' + line(c.lines?.[1]) : '<span class="pos-tile-text">' + line(c.lines?.[0]) + line(c.lines?.[1]) + '</span><span class="pos-tile-last"><span class="pos-tile-line"></span>') + '<span class="pos-tile-open">' + e(c.open || '열기') + ' ›</span></span></button>';
  }
  // One-line list row (52px): the whole row is the touch target, the label at the end only names what a tap does.
  function lineRow(c) {
    const target = c.go ? 'data-go="' + e(c.go.page) + '" data-id="' + e(c.go.id ?? '') + '"' : 'data-action="' + e(c.action) + '" data-id="' + e(c.id ?? '') + '"';
    return '<button type="button" class="pos-line-row" ' + target + (c.selected == null ? '' : ' aria-pressed="' + (c.selected ? 'true' : 'false') + '"') + '><strong>' + e(c.name) + '</strong><span class="pos-line-note" data-fit="parts" data-parts="' + partsAttr(c.noteParts || []) + '">' + e((c.noteParts || []).filter(Boolean).join(' · ')) + '</span>'
      + '<b data-tone="' + e(c.tone || '') + '">' + e(c.amount || '') + '</b><span class="pos-line-do">' + e(c.label) + '</span></button>';
  }
  function fitParts(el) {
    if (el.dataset.fit === 'words') { // long names: whole words drop from the end until the text fits its one or two lines
      const full = el.dataset.full || (el.dataset.full = el.textContent), words = full.split(' '); el.textContent = full;
      while (words.length > 1 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) { words.pop(); el.textContent = words.join(' '); } return;
    }
    if (el.dataset.fit === 'alts') { let alts; try { alts = JSON.parse(el.dataset.alts || '[]'); } catch { return; } for (const text of alts) { el.textContent = text; if (el.scrollWidth <= el.clientWidth + 1) return; } return; }
    let parts; try { parts = JSON.parse(el.dataset.parts || '[]'); } catch { return; }
    const items = el.dataset.fit === 'items';
    for (let k = parts.length; k >= 1; k--) {
      el.textContent = parts.slice(0, k).join(' · ') + (items && k < parts.length ? ' 외 ' + (parts.length - k) + '종' : '');
      if (el.scrollWidth <= el.clientWidth + 1) return;
    }
    if (items && parts.length > 1) { el.textContent = '품목 ' + parts.length + '종'; return; }
    // Even the first part is too long (a very long name): whole words drop from its end.
    for (const words = String(parts[0] || '').split(' '); words.length > 1 && el.scrollWidth > el.clientWidth + 1;) { words.pop(); el.textContent = words.join(' '); }
  }
  function fitCard(card) {
    const name = card.querySelector('.pos-card-name'), phone = card.querySelector('.pos-card-phone'), over = el => el && el.scrollWidth > el.clientWidth + 1;
    card.classList.remove('is-longname', 'is-widemoney', 'is-widebutton'); if (phone) phone.hidden = false;
    if (over(name) && phone) phone.hidden = true;
    if (over(name)) card.classList.add('is-longname'); // the name takes two lines and the meta row gives way
    if (over(card.querySelector('.pos-card-money'))) card.classList.add('is-widemoney');
    if (over(card.querySelector('.pos-card-actions .pos-button'))) card.classList.add('is-widebutton');
    card.querySelectorAll('[data-fit]').forEach(fitParts);
  }
  // Row names: the note gives way first, then the name takes two lines, and as a last resort whole words drop from the end.
  function fitLine(row) {
    const name = row.querySelector('strong'), note = row.querySelector('.pos-line-note'); if (!name) return;
    const full = name.dataset.full || (name.dataset.full = name.textContent), over = () => name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 2;
    row.classList.remove('is-longname'); name.textContent = full; if (note) note.hidden = false;
    if (over() && note) note.hidden = true;
    if (over()) row.classList.add('is-longname');
    for (const words = full.split(' '); over() && words.length > 1;) { words.pop(); name.textContent = words.join(' '); }
    if (note && !note.hidden) { fitParts(note); if (note.scrollWidth > note.clientWidth + 1) note.hidden = true; }
  }
  function fitPage(scope) {
    const pageEl = scope || S.$('.pos-page'); if (!pageEl) return;
    const auto = el => { if (el && !el.dataset.parts) { el.dataset.fit = 'parts'; el.dataset.parts = JSON.stringify(el.textContent.split(' · ')); } };
    auto(pageEl.querySelector('.pos-page-footer > span:first-child')); pageEl.querySelectorAll('[data-fit="auto"]').forEach(auto);
    pageEl.querySelectorAll('[data-fit]').forEach(el => { if (!el.closest('.pos-card.is-fixed,.pos-line-row')) fitParts(el); });
    pageEl.querySelectorAll('.pos-line-row').forEach(fitLine);
    pageEl.querySelectorAll('.pos-item-card').forEach(card => { const name = card.querySelector('strong'); card.classList.remove('is-longname'); if (name && name.scrollWidth > name.clientWidth + 1) card.classList.add('is-longname'); });
    // Search hints are fitted the same way: whole words drop from the end instead of being cut by the field.
    pageEl.querySelectorAll('.pos-search input[placeholder]').forEach(input => {
      const full = input.dataset.hint || (input.dataset.hint = input.placeholder), parts = full.split(' · ');
      const context = fitPage.canvas || (fitPage.canvas = document.createElement('canvas').getContext('2d')); context.font = getComputedStyle(input).font;
      for (let k = parts.length; k >= 1; k--) { input.placeholder = parts.slice(0, k).join(' · '); if (context.measureText(input.placeholder).width <= input.clientWidth - 2) return; }
      input.placeholder = '검색';
    });
    pageEl.querySelectorAll('.pos-card.is-fixed').forEach(fitCard);
  }
  const cardSets = new Map();
  function joinTitles(titles) {
    if (titles.length < 2) return titles[0] || '';
    const split = titles.map(t => { const k = t.lastIndexOf(' '); return k > 0 ? [t.slice(0, k), t.slice(k + 1)] : [t, '']; }), tail = split[0][1];
    const same = tail && split.every(part => part[1] === tail), heads = same ? split.map(part => part[0]) : titles;
    return (heads.length > 2 ? heads[0] + ' ~ ' + heads.at(-1) : heads.join(' · ')) + (same ? ' ' + tail : '');
  }
  function joinSubs(subs) {
    const parsed = subs.map(sub => /^(\d+)(\D+)$/.exec(sub || ''));
    return parsed.every(Boolean) && parsed.every(m => m[2] === parsed[0][2]) ? parsed.reduce((n, m) => n + Number(m[1]), 0) + parsed[0][2] : subs.filter(Boolean).join(' · ');
  }
  // Whole cards only. Each page is filled group by group; when group headings would cost a row of cards
  // (low counters), the page gets one combined heading instead (docs/38 7-6).
  function paginate(flat, cols, height, cardHeight, headHeight, gap) {
    const result = []; let i = 0;
    const rowsIn = room => Math.floor((room - headHeight + gap) / (cardHeight + gap));
    while (i < flat.length) {
      const sections = []; let used = 0, j = i;
      while (j < flat.length) {
        const gi = flat[j].gi; let end = j; while (end < flat.length && flat[end].gi === gi) end++;
        const rows = rowsIn(height - used); if (rows < 1) break;
        const take = Math.min(end - j, rows * cols);
        sections.push({ gi, from: j, to: j + take }); used += headHeight + Math.ceil(take / cols) * (cardHeight + gap); j += take;
        if (j < end) break;
      }
      const combined = Math.min(Math.max(1, rowsIn(height)) * cols, flat.length - i);
      if (combined > j - i) { result.push({ sections: [{ gi: -1, from: i, to: i + combined }] }); i += combined; }
      else { result.push({ sections }); i = j; }
    }
    return result.length ? result : [{ sections: [] }];
  }
  function layoutCards(container, focusDelta) {
    const set = cardSets.get(container.dataset.posCards); if (!set) return;
    const flat = set.groups.flatMap((g, gi) => g.cards.map(html => ({ html, gi })));
    const css = getComputedStyle(container), num = name => parseFloat(css.getPropertyValue(name)) || 0;
    const lines = container.hasAttribute('data-lines');
    const gap = lines ? 0 : num('--pos-card-gap') || 12, cardHeight = lines ? num('--pos-line-h') || 52 : Number(container.dataset.cardH) || num('--pos-card-h') || 171, headHeight = lines || !set.groups.some(g => g.title) ? 0 : num('--pos-group-head') || 34;
    const cols = lines ? 1 : Number(container.dataset.cols) || Math.max(1, Math.min(3, Math.floor((container.clientWidth + gap) / (360 + gap))));
    const list = paginate(flat, cols, container.clientHeight, cardHeight, headHeight, gap);
    // A caller may ask for the page that holds one item (the selected person); paging by hand afterwards stays free.
    const wanted = set.focus == null ? -1 : list.findIndex(page => page.sections.some(section => section.from <= set.focus && set.focus < section.to)); set.focus = null;
    const index = Math.min(wanted >= 0 ? wanted : getPage('cards'), list.length - 1); limits.set(pageKey('cards'), list.length - 1); pages.set(pageKey('cards'), index);
    container.style.setProperty('--pos-cols', cols);
    container.innerHTML = list[index].sections.map(section => {
      const groupIds = [...new Set(flat.slice(section.from, section.to).map(item => item.gi))], groups = groupIds.map(gi => set.groups[gi]);
      const title = lines ? '' : joinTitles(groups.map(g => g.title).filter(Boolean)), sub = joinSubs(groups.map(g => g.sub));
      return '<section class="pos-group">' + (title ? '<div class="pos-group-head"><span>' + e(title) + '</span>' + (sub ? '<small>' + e(sub) + '</small>' : '') + '</div>' : '')
        + '<div class="' + (lines ? 'pos-line-list' : 'pos-card-grid') + '">' + flat.slice(section.from, section.to).map(item => item.html).join('') + '</div></section>';
    }).join('');
    S.icons?.();
    const nav = S.$('.pos-cards-pager');
    if (nav) {
      nav.hidden = list.length < 2;
      const move = (label, name, delta, off) => '<button type="button" class="so-button pos-button" data-action="pos-cards-page" data-id="' + delta + '" aria-label="' + name + '"' + (off ? ' disabled' : '') + '>' + label + '</button>';
      nav.innerHTML = move('‹', '이전 쪽', -1, index === 0) + '<span aria-live="polite">' + (index + 1) + ' / ' + list.length + '쪽</span>' + move('›', '다음 쪽', 1, index === list.length - 1);
      if (focusDelta) (nav.querySelector('[data-id="' + focusDelta + '"]:not(:disabled)') || nav.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
    }
    fitPage();
  }
  let renderQueued = false;
  function afterRender() {
    if (renderQueued) return; renderQueued = true;
    queueMicrotask(() => { renderQueued = false; const container = S.$('.pos-cards[data-pos-cards]'); if (container) layoutCards(container); else fitPage(); });
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(afterRender, 120); });
  document.fonts?.ready?.then(afterRender);
  function getPage(key) { return pages.get(pageKey(key)) || 0; }
  function setPage(key, index, options = {}) {
    const fullKey = pageKey(key), max = limits.get(fullKey) ?? 0;
    pages.set(fullKey, Math.max(0, Math.min(max, Math.floor(Number(index) || 0))));
    if (options.render !== false) S.render();
  }
  function pager(rows, key, renderRow, pageSize = 4) {
    const size = Math.max(1, Math.floor(Number(pageSize) || 4)), count = Math.max(1, Math.ceil(rows.length / size));
    const fullKey = pageKey(key), index = Math.min(getPage(key), count - 1), start = index * size;
    listRenders.set(fullKey, () => pager(rows, key, renderRow, pageSize));
    limits.set(fullKey, count - 1); pages.set(fullKey, index);
    const move = (label, delta, disabled) => '<button type="button" class="so-button pos-button" data-action="pos-page-change" data-pos-key="' + e(key) + '" data-id="' + delta + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
    return '<section class="pos-paged-list" data-pos-list-key="' + e(key) + '" aria-label="목록"><div class="pos-list">'
      + (rows.length ? rows.slice(start, start + size).map((value, offset) => renderRow(value, start + offset)).join('') : '<p class="pos-empty"><strong>항목 없음</strong></p>')
      + '</div><nav class="pos-pager" aria-label="목록 페이지"><span>전체 ' + rows.length + '건' + (rows.length ? ' · ' + (start + 1) + '–' + Math.min(start + size, rows.length) + '건' : '') + '</span>'
      + '<div>' + move('이전', -1, index === 0) + '<span aria-live="polite">' + (index + 1) + ' / ' + count + '쪽</span>' + move('다음', 1, index === count - 1) + '</div></nav></section>';
  }
  function prepareModal() {
    const body = S.$('#so-dialog-body');
    if (body.querySelector(':scope > .pos-modal-body')) return;
    const content = document.createElement('div'); content.className = 'pos-modal-body';
    const footer = document.createElement('div'); footer.className = 'pos-modal-footer';
    for (const child of [...body.childNodes]) {
      if (child.nodeType === 1 && child.matches('.so-dialog-actions,.pos-modal-footer')) footer.append(...child.childNodes);
      else content.append(child);
    }
    body.replaceChildren(content);
    if (footer.childNodes.length) body.append(footer);
  }
  function modal(title, body, footer = '', sub = '') {
    S.$('#so-dialog')?.classList.remove('is-wide'); // only the confirm window asks for the wide frame, right after opening
    S.modal(title, '<div class="pos-modal-body">' + (sub ? '<p class="pos-modal-sub">' + e(sub) + '</p>' : '') + body + '</div>' + (footer ? '<footer class="pos-modal-footer">' + footer + '</footer>' : ''));
    fitPage(S.$('#so-dialog'));
  }
  // Option buttons that fill a hidden input, so windows can offer choices without a drop-down (read them like any other input).
  const choice = (name, values, value) => '<div class="pos-choice"><input type="hidden" data-pos-input="' + e(name) + '" value="' + e(value) + '">' + values.map(([id, text]) => '<button type="button" class="so-button pos-button pos-option" data-action="pos-choice" data-id="' + e(id) + '" aria-pressed="' + (String(id) === String(value)) + '">' + e(text) + '</button>').join('') + '</div>';
  S.action('pos-choice', (value, target) => { const box = target.closest('.pos-choice'); box.querySelector('input').value = value; box.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === target))); });
  // Month calendar window (P30): every day is one 52px button with its count; no native date picker.
  let calendarState = null;
  function calendar(options) { calendarState = { ...options, month: (options.selected || options.today).slice(0, 7) }; drawCalendar(); }
  function drawCalendar() {
    const c = calendarState, [year, month] = c.month.split('-').map(Number), lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(), days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const move = (label, name, delta) => '<button type="button" class="so-button pos-button" data-action="pos-calendar-move" data-id="' + delta + '" aria-label="' + name + '">' + label + '</button>';
    const cells = Array.from({ length: lead }, () => '<span></span>');
    for (let day = 1; day <= days; day++) { const date = c.month + '-' + String(day).padStart(2, '0'), n = c.count?.(date) || 0; cells.push('<button type="button" class="pos-cal-day" data-action="' + e(c.action) + '" data-id="' + date + '" aria-pressed="' + (date === c.selected) + '"' + (date === c.today ? ' data-today="true"' : '') + '><b>' + day + '</b>' + (n ? '<small>' + n + e(c.unit || '팀') + '</small>' : '') + '</button>'); }
    modal(c.title, '<div class="pos-cal-head">' + move('‹', '이전 달', -1) + '<strong>' + year + '년 ' + month + '월</strong>' + move('›', '다음 달', 1) + '<span></span>' + (c.clear ? button(c.clear[0], c.clear[1]) : '') + '</div>'
      + '<div class="pos-cal-grid is-week">' + ['일', '월', '화', '수', '목', '금', '토'].map(day => '<span>' + day + '</span>').join('') + '</div><div class="pos-cal-grid">' + cells.join('') + '</div>');
  }
  S.action('pos-calendar-move', delta => { const c = calendarState; if (!c) return; const [year, month] = c.month.split('-').map(Number), next = new Date(Date.UTC(year, month - 1 + Number(delta), 1)); c.month = next.toISOString().slice(0, 7); drawCalendar(); });
  S.action('pos-page-change', (delta, target) => {
    const key = target.dataset.posKey;
    const modalList = target.closest('#so-dialog .pos-paged-list');
    setPage(key, getPage(key) + Number(delta), { render: !modalList });
    if (modalList) { modalList.outerHTML = listRenders.get(pageKey(key))(); fitPage(S.$('#so-dialog')); }
    const button = [...S.root.querySelectorAll('[data-action="pos-page-change"]')].find(el => el.dataset.posKey === key && el.dataset.id === delta && !el.disabled);
    (button || S.$('.pos-pager button:not(:disabled)'))?.focus({ preventScroll: true });
  });
  S.action('pos-cards-page', delta => {
    const container = S.$('.pos-cards[data-pos-cards]'); if (!container) return;
    setPage('cards', getPage('cards') + Number(delta), { render: false }); layoutCards(container, delta);
  });
  S.pos = Object.freeze({ navigation, page, button, row, pager, getPage, setPage, modal, prepareModal, orderCard, tile, lineRow, cards, fitPage, choice, calendar, badge, search, chip, chipGo, toolbarLabel, group, terms, storeName, menus,
    field: (label, value = '', type = 'text', attrs = '') => S.field(e(label), value, type, attrs),
    label: value => '<span class="pos-label">' + e(value) + '</span>'
  });
})();
