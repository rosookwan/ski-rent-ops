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
    if (!tools) return;
    const D = S.posData;
    let html = D?.pending ? '<button type="button" class="pos-search-entry" data-action="pos-retry">앞선 처리 다시 확인</button>' : '';
    if (options.wait != null) html += '<span class="pos-wait"><span>처리 대기</span><strong>' + e(options.wait) + '</strong></span>';
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
    return '<section class="pos-page" aria-label="' + e(title) + '"><header class="pos-page-heading"><h1>' + e(title) + '</h1>'
      + (meaningful(options.toolbar) ? '<div class="pos-toolbar">' + options.toolbar + '</div>' : '') + (description ? '<p>' + e(description) + '</p>' : '')
      + '</header><div class="pos-page-body">' + body + '</div>' + (footer ? '<footer class="pos-page-footer">' + footer + '</footer>' : '') + '</section>';
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
  // One card. Fields are optional; missing ones are skipped so the same builder serves every list screen.
  function card(c) {
    const tone = c.tone || '', strong = ['red', 'orange', 'green'].includes(tone);
    const legend = strong && c.badge ? '<span class="pos-card-legend">' + e(c.badge[0]) + '</span>' : '';
    const badgeHtml = !legend && c.badge ? badge(c.badge[0], c.badge[1] || 'grey') : '';
    const head = '<span class="pos-card-head"><span class="pos-card-name">' + e(c.name) + '</span>' + (c.phone ? '<span class="pos-card-phone">' + e(c.phone) + '</span>' : '') + badgeHtml + '</span>';
    const meta = c.meta ? '<span class="pos-card-meta">' + e(c.meta) + '</span>' : '';
    const figures = c.figures?.length ? '<span class="pos-card-figures">' + c.figures.map(f => '<span><small>' + e(f.label) + '</small><strong' + (f.when ? ' class="is-when"' : '') + ' data-tone="' + e(f.tone || '') + '">' + e(f.value) + '</strong></span>').join('') + '</span>' : '';
    const items = c.items?.length ? '<span class="pos-card-items">' + c.items.map(([text, state, t, done]) => '<span class="pos-card-item' + (done ? ' is-done' : '') + '"><span>' + e(text) + '</span><span data-tone="' + e(t || 'grey') + '">' + e(state || '') + '</span></span>').join('') + '</span>' : '';
    const lines = c.lines?.length ? '<span class="pos-card-lines">' + c.lines.map(([text, t]) => '<span data-tone="' + e(t || '') + '">' + e(text) + '</span>').join('') + '</span>' : '';
    const money = c.money?.length ? '<span class="pos-card-money">' + c.money.map(([text, t]) => '<span data-tone="' + e(t || 'ink') + '">' + e(text) + '</span>').join('') + '</span>' : '';
    const inner = head + meta + figures + items + lines + money;
    const open = c.go ? '<button type="button" class="pos-card-open" data-go="' + e(c.go.page) + '" data-id="' + e(c.go.id ?? '') + '">' + inner + '</button>' : '<div class="pos-card-open">' + inner + '</div>';
    return '<article class="pos-card"' + (tone ? ' data-tone="' + e(tone) + '"' : '') + (c.id ? ' data-card-id="' + e(c.id) + '"' : '') + '>' + legend + open + (c.actions ? '<div class="pos-card-actions">' + c.actions + '</div>' : '') + '</article>';
  }
  // Grouped card grid. This is the only scrolling region of a list screen; header, toolbar and footer stay fixed.
  function cards(groups, options = {}) {
    const filled = groups.filter(g => g.cards && g.cards.length);
    if (!filled.length) return '<div class="pos-cards" data-pos-scroll><div class="pos-empty"><strong>' + e(options.empty || '항목 없음') + '</strong>' + (options.emptyNote ? '<span>' + e(options.emptyNote) + '</span>' : '') + (options.emptyAction || '') + '</div></div>';
    return '<div class="pos-cards" data-pos-scroll>' + filled.map(g => '<section class="pos-group">' + (g.title ? '<div class="pos-group-head">' + e(g.title) + (g.sub ? '<small>' + e(g.sub) + '</small>' : '') + '</div>' : '')
      + '<div class="pos-card-grid' + (options.steps ? ' is-steps' : '') + '">' + g.cards.join('') + '</div></section>').join('') + '</div>';
  }
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
  function modal(title, body, footer = '') {
    S.modal(title, '<div class="pos-modal-body">' + body + '</div>' + (footer ? '<footer class="pos-modal-footer">' + footer + '</footer>' : ''));
  }
  S.action('pos-page-change', (delta, target) => {
    const key = target.dataset.posKey;
    const modalList = target.closest('#so-dialog .pos-paged-list');
    setPage(key, getPage(key) + Number(delta), { render: !modalList });
    if (modalList) modalList.outerHTML = listRenders.get(pageKey(key))();
    const button = [...S.root.querySelectorAll('[data-action="pos-page-change"]')].find(el => el.dataset.posKey === key && el.dataset.id === delta && !el.disabled);
    (button || S.$('.pos-pager button:not(:disabled)'))?.focus({ preventScroll: true });
  });
  S.pos = Object.freeze({ navigation, page, button, row, pager, getPage, setPage, modal, prepareModal, card, cards, badge, search, chip, chipGo, toolbarLabel, group, terms, storeName, menus,
    field: (label, value = '', type = 'text', attrs = '') => S.field(e(label), value, type, attrs),
    label: value => '<span class="pos-label">' + e(value) + '</span>'
  });
})();
