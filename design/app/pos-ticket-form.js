(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, O = S.posOrders, e = S.esc, b = P.button;
  let draft = null, api = null;
  const fields = { sku: 'ticket-sku', quantity: 'ticket-quantity', from: 'ticket-from', to: 'ticket-to', vendor: 'ticket-vendor', transfer: 'ticket-transfer' };
  function capture() { for (const [key, name] of Object.entries(fields)) { const value = O.read(name); if (value !== undefined) draft[key] = key === 'quantity' ? Number(value) : value; } }
  function render() {
    const d = draft, title = D.snapshot.catalog.find(sku => sku.id === d.sku)?.label || d.sku;
    const step = (text, delta, off) => '<button type="button" class="so-button pos-button" data-action="pos-ticket-count" data-id="' + delta + '"' + (off ? ' disabled' : '') + ' aria-label="발권 수량 ' + (delta < 0 ? '줄이기' : '늘리기') + '">' + text + '</button>';
    const hidden = Object.entries(fields).filter(([key]) => key !== 'vendor').map(([key, name]) => '<input type="hidden" data-pos-input="' + name + '" value="' + e(d[key]) + '">').join('');
    api.request(d.order.customer.name + ' · 발권 ' + d.quantity + '매', '<section class="pos-a3-form pos-a3-ticket">'
      + '<div class="pos-a3-row"><div><strong>발권·배정된 권</strong><span>추가 발권에서 제외</span></div><b>' + d.allocated + '매</b></div>'
      + '<div class="pos-a3-row"><div><strong>추가 발권</strong><span>실제 발권한 수량</span></div><div class="pos-stepper">' + step('−', -1, d.quantity <= 1) + '<b aria-label="실제 발권 수량">' + d.quantity + '</b>' + step('+', 1, d.quantity >= d.left) + '</div></div>'
      + '<div class="pos-a3-inline">' + O.input('발권처 관리번호', 'ticket-vendor', d.vendor, 'text', 'maxlength="100" placeholder="실제 발권처"') + '</div>'
      + '<div class="pos-a3-summary"><div><span>접수 매수</span><strong>' + d.line.quantity + '매</strong></div><div><span>접수 전체 미수</span><strong data-tone="red">' + S.money(d.order.finance.dueWon) + '</strong></div></div>'
      + hidden + '</section>', 'ops.ticketIssue', () => { capture(); return { orderId: d.order.id, lineId: d.line.id, quantity: d.quantity, sku: d.sku,
        ticket: { validFrom: d.from + ':00+09:00', validTo: d.to + ':00+09:00', acceptedTypes: [d.sku], transferable: d.transfer === 'true', vendorId: d.vendor } }; }, d.done, '실제 발권·배정 기록',
      (d.order.receiptNo || d.order.id) + ' · ' + title + ' · ' + d.line.start + ' 이용');
    api.state.request.revision = d.revision;
    const footer = S.$('#so-dialog .pos-modal-footer');
    if (api.state.operation?.modal) footer.querySelector('[data-action="close"]')?.setAttribute('data-action', 'pos-fulfillment-request-cancel');
    footer.insertAdjacentHTML('afterbegin', '<div class="pos-fulfillment-extra">' + b('권 조건 확인', 'pos-ticket-conditions') + b('예비권 확인', 'pos-ticket-stock', d.order.id) + '</div>');
    S.$('#so-dialog .pos-modal-sub').dataset.fit = 'auto';
    P.fitPage(S.$('#so-dialog'));
  }
  S.action('pos-ticket-count', delta => { capture(); draft.quantity = Math.max(1, Math.min(draft.left, draft.quantity + Number(delta))); render(); });
  S.action('pos-ticket-conditions', () => { capture(); const d = draft;
    P.modal('실제로 발권한 권의 조건', '<section class="pos-a3-form"><div class="pos-form-grid">'
      + O.select('실제 발권 권종', 'ticket-sku', D.snapshot.catalog.filter(sku => sku.kind === 'liftTicket' && !sku.requiresTypeConfirmation).map(sku => [sku.id, sku.label]), d.sku)
      + O.input('권의 유효 시작', 'ticket-from', d.from, 'datetime-local') + O.input('권의 유효 종료', 'ticket-to', d.to, 'datetime-local') + '</div>'
      + '<div class="so-field">반환 후 재사용 조건' + P.choice('ticket-transfer', [['false', '재사용 불가'], ['true', '유효시간 안에 양도 가능']], d.transfer) + '</div>'
      + '<p class="pos-label">실제 발권을 마친 권의 조건만 기록합니다.</p></section>', b('선택 적용', 'pos-ticket-conditions-save', '', 'primary'));
  });
  S.action('pos-ticket-conditions-save', () => { capture(); render(); });
  S.posTicketForm = { open(order, line, allocated, services, done) { api = services; draft = { order, line, allocated, left: line.unissuedQuantity - allocated, quantity: line.unissuedQuantity - allocated,
    sku: line.sku, from: line.start + 'T09:00', to: line.start + 'T18:00', vendor: '', transfer: 'false', revision: D.snapshot.revision, done }; render(); } };
})();
