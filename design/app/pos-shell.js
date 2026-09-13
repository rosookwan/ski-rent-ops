(() => {
  'use strict';
  const S = window.SkiOps, e = S.esc;
  const pages = new Map(), limits = new Map(), listRenders = new Map();
  const menus = [
    ['home', '오늘 할 일', ''], ['intake', '접수·예약', '1'], ['preparation', '준비·지급', '2'],
    ['rentals', '이용·변경', '3'], ['returns', '반납·회수', '4'], ['closing', '정산·마감', '5'],
    ['dispatch', '차량 운행', ''], ['management', '관리', '']
  ];
  const pageKey = key => S.state.page + ':' + key;
  function navigation(active, registered) {
    const allowed = window.SkiPosOperating && S.posData?.snapshot?.actor?.role === 'driver' ? menus.filter(([route]) => route === 'dispatch') : menus;
    return '<div class="pos-navigation">' + allowed.map(([route, label, step]) =>
      '<button type="button" class="pos-nav-button" data-go="' + route + '" aria-label="' + (step ? step + '. ' : '') + label + '"'
      + (route === active ? ' aria-current="page"' : '') + (registered(route) ? '' : ' disabled') + '>'
      + (step ? '<span class="pos-nav-step" aria-hidden="true">' + step + '</span>' : '')
      + '<span>' + label + '</span></button>').join('') + '</div>';
  }
  function button(text, action, id = '', kind = '') {
    return '<button type="button" class="so-button pos-button ' + e(kind) + '" data-action="' + e(action) + '" data-id="' + e(id) + '">' + e(text) + '</button>';
  }
  function page(title, description, body, footer = '') {
    return '<section class="pos-page" aria-label="' + e(title) + '"><header class="pos-page-heading"><h1>' + e(title) + '</h1>'
      + (description ? '<p>' + e(description) + '</p>' : '') + '</header><div class="pos-page-body">' + body + '</div>'
      + (footer ? '<footer class="pos-page-footer">' + footer + '</footer>' : '') + '</section>';
  }
  function row(title, description, actions = '') {
    return '<article class="pos-row"><div class="pos-row-copy"><strong>' + e(title) + '</strong>'
      + (description ? '<p>' + e(description) + '</p>' : '') + '</div><div class="pos-row-actions">' + actions + '</div></article>';
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
      + (rows.length ? rows.slice(start, start + size).map((value, offset) => renderRow(value, start + offset)).join('') : '<p class="pos-empty">표시할 항목이 없습니다.</p>')
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
  S.pos = Object.freeze({ navigation, page, button, row, pager, getPage, setPage, modal, prepareModal,
    field: (label, value = '', type = 'text', attrs = '') => S.field(e(label), value, type, attrs),
    label: value => '<span class="pos-label">' + e(value) + '</span>'
  });
})();
