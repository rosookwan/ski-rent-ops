(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, e = S.esc, b = P.button;
  const choices = [['damage', '파손'], ['lost', '분실'], ['missing', '못 받음'], ['quantity', '수량 정정'], ['money', '금액 정정'], ['cancel', '접수 취소']];
  let state = null;
  const label = line => line.label || D.snapshot.catalog.find(item => item.id === line.sku)?.label || line.sku;
  const choice = (text, action, id, selected) => '<button type="button" class="so-button pos-button pos-option" data-action="' + action + '" data-id="' + e(id) + '" aria-pressed="' + selected + '"><span data-fit="words">' + e(text) + '</span></button>';
  function render() {
    const { order, kind, api } = state, whole = ['money', 'cancel'].includes(kind);
    const quantity = line => kind === 'quantity' ? line.issuedQuantity : api.lineAssets(order, line).length;
    const lines = order.lines.filter(line => quantity(line)), pages = Math.max(1, Math.ceil(lines.length / 3));
    state.page = Math.max(0, Math.min(state.page, pages - 1));
    if (!lines.some(line => line.id === state.lineId)) state.lineId = lines[0]?.id;
    const notes = { damage: '실물 선택 뒤 파손 상태 확인', lost: '실물 선택 뒤 분실 상태 확인', missing: '실물별 현재 보관 위치 확인', quantity: '원래 처리 기록에서 정정', money: '접수 전체 수납·환불에서 확인', cancel: '연결된 준비·배달부터 확인' };
    P.modal(order.customer.name + ' · 문제 해결·정정', '<section class="pos-a2-form pos-a2-problem"><strong>처리 선택</strong><div class="pos-a2-choice-grid">'
      + choices.map(([id, name]) => choice(name, 'pos-problem-choice', id, kind === id)).join('') + '</div>'
      + '<strong>' + (whole ? '확인 범위' : '대상 품목') + '</strong>'
      + (whole ? '<div class="pos-info">접수 전체 · 다음 화면에서 실제 기록 선택</div>' : lines.length ? '<div class="pos-a2-choice-grid">' + lines.slice(state.page * 3, (state.page + 1) * 3).map(line => choice(label(line) + ' ' + quantity(line), 'pos-problem-line', line.id, line.id === state.lineId)).join('') + '</div>'
        + (pages > 1 ? '<div class="pos-pager"><span>' + (state.page + 1) + ' / ' + pages + '쪽</span><div>' + b('이전', 'pos-problem-picker-page', '-1') + b('다음', 'pos-problem-picker-page', '1') + '</div></div>' : '') : '<div class="pos-info">이 접수에 연결된 처리 대상 실물이 없습니다.</div>')
      + '<div class="pos-a2-problem-note">' + e(notes[kind]) + ' · 금액은 별도 확인</div></section>', '<div class="pos-fulfillment-extra">' + b('전체 처리 이력', 'pos-problem-records') + '</div>' + b('취소', 'close') + b('다음 · ' + choices.find(([id]) => id === kind)[1], 'pos-problem-next', '', 'primary'),
      (order.receiptNo || order.id) + ' · 품목 ' + order.lines.length + ' · 미수 ' + S.money(order.finance.dueWon));
    S.$('[data-action="pos-problem-next"]').disabled = !whole && !lines.length;
    S.$('#so-dialog .pos-modal-sub').dataset.fit = 'auto'; P.fitPage(S.$('#so-dialog'));
  }
  S.action('pos-problem-choice', kind => { state.kind = kind; render(); });
  S.action('pos-problem-line', id => { state.lineId = id; render(); });
  S.action('pos-problem-picker-page', delta => { state.page += Number(delta); render(); });
  S.action('pos-problem-records', () => state.api.records(state.order.id));
  S.action('pos-problem-next', () => {
    const { kind, order, lineId, api } = state;
    if (kind === 'money') { S.posFinance.openMoney(order.id); return; }
    if (kind === 'cancel') { api.records(order.id, 'cancel'); return; }
    if (kind === 'quantity') { api.records(order.id, 'history', order.lines.find(line => line.id === lineId)); return; }
    api.assets(lineId, { damage: 'repair', lost: 'lost' }[kind] || null);
  });
  S.posProblemPicker = { open(order, api) { state = { order, api, kind: 'damage', lineId: null, page: 0 }; render(); } };
})();
