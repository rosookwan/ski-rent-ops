(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, e = S.esc, b = P.button;
  const names = { issue: '지급', return: '반납 확인', receive: '매장 입고' };
  const label = line => line.label || D.snapshot.catalog.find(item => item.id === line.sku)?.label || line.sku;
  const key = op => 'fulfillment-' + op.orderId + op.kind;
  const total = op => op.rows.reduce((sum, row) => sum + row.count, 0);
  function row(item, op, api) {
    const order = D.order(op.orderId), line = order.lines.find(line => line.id === item.lineId), max = api.limit(item);
    const step = delta => '<button type="button" class="so-button pos-button" data-action="pos-fulfillment-step" data-id="' + e(item.lineId) + '" data-delta="' + delta + '" aria-label="' + e(label(line) + ' 수량 ' + (delta < 0 ? '줄이기' : '늘리기')) + '"' + ((delta < 0 ? !item.count : item.count >= max) ? ' disabled' : '') + '>' + (delta < 0 ? '−' : '+') + '</button>';
    const note = op.kind === 'issue' ? [...(line.start > D.today ? ['예정일 ' + line.start.slice(5), '자동 선택 안 함'] : []), '예약 ' + line.quantity, '지급 ' + line.issuedQuantity]
      : op.kind === 'receive' ? [...new Set(item.ids.map(id => api.vehicleName(D.snapshot.assets.find(asset => asset.id === id).location.id))), '차량 보관 ' + max] : ['고객 보유 ' + max, '반납 완료 ' + line.shopQuantity];
    const prepare = op.kind === 'issue' ? b(line.category === 'liftTicket' ? '발권 기록' : '규격·준비', line.category === 'liftTicket' ? 'pos-ticket-issue' : 'pos-prepare-line', line.id) : '';
    return '<article class="pos-row pos-fulfillment-row"><div class="pos-row-copy"><strong data-fit="words" title="' + e(label(line)) + '">' + e(label(line) + ' ' + line.quantity) + '</strong><p data-fit="parts" data-parts="' + e(JSON.stringify(note)) + '" title="' + e(note.join(' · ')) + '">' + e(note.join(' · ')) + '</p></div><div class="pos-row-actions">' + prepare
      + '<div class="pos-stepper" role="group" aria-label="' + e(label(line) + ' 이번 수량') + '">' + step(-1) + '<output aria-label="선택 수량"><b>' + item.count + '</b></output>' + step(1) + '</div></div></article>';
  }
  function show(op, api) {
    const order = D.order(op.orderId), focused = document.activeElement?.dataset;
    const reserve = op.error ? 76 : 0;
    let size = Math.max(1, Math.min(4, Math.floor((innerHeight - 336 - reserve) / 70)));
    if (op.rows.length > size) size = Math.max(1, Math.min(4, Math.floor((innerHeight - 396 - reserve) / 70)));
    const rows = op.rows.length > size ? P.pager(op.rows, key(op), item => row(item, op, api), size) : '<div class="pos-list">' + op.rows.map(item => row(item, op, api)).join('') + '</div>';
    const plans = order.lines.filter(line => op.rows.some(row => row.lineId === line.id)).map(line => op.kind === 'issue' ? line.pickupPlan : line.returnPlan);
    const short = date => date ? Number(date.slice(5, 7)) + '/' + Number(date.slice(8, 10)) : '', verb = op.kind === 'issue' ? '수령' : op.kind === 'receive' ? '입고' : '반납';
    const appointments = [...new Set(plans.map(plan => [[short(plan?.date), plan?.time].filter(Boolean).join(' ') + ' ' + verb, plan?.place === '매장' ? (op.kind === 'issue' ? '매장 수령' : '매장 직접') : plan?.place].filter(Boolean).join(' · ')))].filter(Boolean);
    const summary = (order.receiptNo || order.id) + (appointments.length ? ' · ' + appointments.join(' / ') : '');
    const money = '<div class="pos-fulfillment-money"><span>' + (order.finance.dueWon ? '미수 · ' + (op.kind === 'issue' ? '지급' : op.kind === 'receive' ? '입고' : '반납') + ' 시 수납' : '미수') + '</span><b data-tone="' + (order.finance.dueWon ? 'red' : 'green') + '">' + e(S.money(order.finance.dueWon)) + '</b>' + b('수납', 'pos-fulfillment-money', order.id) + '</div>';
    const primary = op.kind === 'return' && op.all ? '모두 반납 확정' : api.confirmLabels[op.kind];
    const extra = op.error ? b('최신 수량으로 다시 선택', 'pos-fulfillment-refresh') : op.kind === 'return' && op.all ? '' : b('수량 설정', 'pos-fulfillment-tools');
    const some = !op.error && op.kind === 'return' && op.all ? b('일부만 받음', 'pos-fulfillment-partial') : '';
    P.modal(order.customer.name + (order.customer.name.endsWith(' 팀') ? '' : ' 팀') + ' · ' + names[op.kind] + ' ' + total(op) + '개', '<section class="pos-fulfillment-picker" aria-label="이번 확인 ' + total(op) + '개">' + rows + '</section>' + money + '<p class="pos-error" data-fulfillment-error role="alert"' + (op.error ? '' : ' hidden') + '>' + e(op.error || '') + '</p>',
      '<div class="pos-fulfillment-extra">' + extra + '</div>' + b('취소', 'close') + some + b(primary, 'pos-fulfillment-confirm', '', 'primary'), summary);
    S.$('#so-dialog .pos-modal-sub').dataset.fit = 'auto';
    S.$('#so-dialog .pos-modal-sub').title = summary;
    P.fitPage(S.$('#so-dialog'));
    if (focused?.action) [...S.$('#so-dialog').querySelectorAll('button')].find(el => el.dataset.action === focused.action && el.dataset.id === focused.id && el.dataset.delta === focused.delta && !el.disabled)?.focus();
  }
  S.posFulfillmentView = { show, key };
})();
