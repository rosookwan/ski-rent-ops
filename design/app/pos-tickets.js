(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, O = S.posOrders, F = S.posFulfillment, e = S.esc, button = P.button;
  const state = { orderId: null, tab: 'all', assetId: null, request: null };
  const size = () => innerHeight < 700 ? 2 : 4;
  const assetOf = () => D.snapshot.assets.find(a => a.id === state.assetId);
  const title = asset => D.snapshot.catalog.find(sku => sku.id === asset.sku)?.label || asset.sku;
  const local = at => new Date(Date.parse(at) + 9 * 3600000).toISOString();
  const period = asset => local(asset.ticket.validFrom).slice(5, 16).replace('T', ' ') + '–' + local(asset.ticket.validTo).slice(5, 16).replace('T', ' ');
  const pending = asset => D.snapshot.allocations.find(a => a.assetId === asset.id && a.status === 'active' && !(a.fulfilledAt && a.returnedAt));
  const related = (order, asset) => order.lines.some(line => [...(line.customerAssetIds || []), ...(line.vehicleAssetIds || []), ...(line.shopAssetIds || []), ...(line.reservationBindings || []).flatMap(b => b.assetIds || [])].includes(asset.id));
  const errorBox = () => '<p class="pos-error" data-ticket-error role="alert" hidden></p>';
  function fail(error) { const box = S.$('#so-dialog[open] [data-ticket-error]') || S.$('[data-ticket-error]'); if (box) { box.hidden = false; box.textContent = error.message || error; } else S.toast(error.message || error); }
  const back = () => state.orderId && D.order(state.orderId) ? O.go('고객 상세로', 'order-detail', state.orderId) : '<button class="so-button pos-button" data-go="vehicle">차량 보관으로</button>';
  function request(titleText, body, label, type, payload, done) {
    state.request = { revision: D.snapshot.revision, busy: false, type, payload, done };
    P.modal(titleText, body + errorBox(), button('닫기', 'close') + button(label, 'pos-ticket-save', '', 'primary'));
  }
  function stockRow(asset) {
    const assigned = pending(asset), location = asset.location.kind === 'shop' ? '매장 보관' : F.vehicleName(asset.location.id);
    const order = assigned && D.order(assigned.reservationId);
    const actions = asset.condition !== 'ready' ? '<button class="so-button pos-button" data-go="inventory">분실·상태 확인</button>' : asset.refundId ? '<button class="so-button pos-button" data-go="dispatch">발권처 반환 업무</button>' : assigned ? order ? O.go('연결 접수 확인', 'order-detail', order.id) : '<button class="so-button pos-button" data-go="lift-reservations">연결 예약 확인</button>'
      : (asset.location.kind === 'vehicle' ? button('실제 매장 입고', 'pos-ticket-receive', asset.id) : button('판매행에 배정', 'pos-ticket-target', asset.id))
        + button('예비 보관', 'pos-ticket-spare', asset.id) + button('발권처 반환', 'pos-ticket-refund', asset.id);
    return P.row(title(asset) + ' · ' + location, asset.id + ' · ' + period(asset) + ' · ' + (asset.condition !== 'ready' ? ({lost:'분실 · 발견 확인 필요',inspection:'점검 대기',repair:'수리 대기',cleaning:'세척 대기'}[asset.condition] || asset.condition) : asset.refundId ? '발권처 반환 대기' : assigned ? (order?.customer.name || assigned.reservationId) + ' 배정 중' : asset.ticket.transferable ? '양도 가능' : '양도 불가'), actions);
  }
  function stockPage() {
    const order = D.order(state.orderId), tabs = [['all', '전체 보관'], ['shop', '매장'], ['vehicle', '차량']];
    let rows = D.snapshot.assets.filter(a => a.ticket && ['shop', 'vehicle'].includes(a.location.kind));
    if (order) rows = rows.filter(a => related(order, a));
    if (state.tab !== 'all') rows = rows.filter(a => a.location.kind === state.tab);
    const toolbar = '<div class="pos-fulfillment-toolbar">' + tabs.map(([id, label]) => button(label, 'pos-ticket-tab', id, state.tab === id ? 'primary' : '')).join('') + (order ? button('모든 고객 보관권', 'pos-ticket-all') : '') + '</div>';
    return P.page('회수권·발권처 반환', (order ? order.customer.name + ' 연결 권 · ' : '') + '차량권은 실제 입고 → 판매행 배정 → 준비·지급 순서로 처리합니다.', toolbar + P.pager(rows, 'ticket-stock-' + (order?.id || 'all') + state.tab, stockRow, size()) + errorBox(), back());
  }
  function targetPage() {
    const asset = assetOf(); if (!asset) return P.page('회수권을 선택하세요', '', button('보관권 목록', 'pos-ticket-stock'));
    const rows = D.snapshot.orders.flatMap(order => order.lines.filter(line => line.category === 'liftTicket' && line.unissuedQuantity > 0 && ![...line.customerAssetIds,...line.vehicleAssetIds,...line.shopAssetIds,...line.unknownAssetIds].includes(asset.id) && asset.ticket.acceptedTypes.includes(line.sku)).map(line => ({ order, line })));
    rows.sort((a, b) => Number(b.order.id === state.orderId) - Number(a.order.id === state.orderId) || a.line.start.localeCompare(b.line.start));
    return P.page('재배정할 접수·품목 선택', title(asset) + ' · ' + period(asset) + ' · 실제 지급은 배정 후 별도로 확인합니다.', P.pager(rows, 'ticket-target', ({ order, line }) => P.row(order.customer.name + ' · ' + title({ sku: line.sku }), O.lineDescription(order, line) + ' · 미지급 ' + line.unissuedQuantity + '매', button('이 판매행 선택', 'pos-ticket-assign', order.id + '|' + line.id)), size()) + errorBox(), button('보관권 목록', 'pos-ticket-back'));
  }
  const isTicket = line => line.category === 'liftTicket' || D.snapshot.catalog.find(sku => sku.id === line.sku)?.kind === 'liftTicket';
  let listFilter = 'all', listQuery = '';
  function ticketRows() {
    const q = listQuery.replace(/[\s-]/g, '').toLowerCase();
    return D.snapshot.orders.flatMap(order => order.lines.filter(line => isTicket(line) && line.cancelledQuantity < line.quantity).map(line => {
      const allocated = D.snapshot.allocations.filter(a => a.reservationId === order.id && a.status === 'active' && !a.fulfilledAt && (line.reservationBindings || []).some(b => b.lineId === a.lineId)).length;
      const need = Math.max(0, line.unissuedQuantity - allocated), stored = [...(line.vehicleAssetIds || []), ...(line.shopAssetIds || [])].length;
      const stage = need ? 'issue' : line.unissuedQuantity ? 'hand' : line.customerQuantity ? 'using' : stored ? 'stored' : 'done';
      return { order, line, allocated, need, stored, stage };
    })).filter(row => (row.order.customer.name + row.order.customer.phone + (row.order.receiptNo || row.order.id) + title({ sku: row.line.sku })).replace(/[\s-]/g, '').toLowerCase().includes(q));
  }
  function ticketCard(row) {
    const { order, line, need, stage } = row, badge = { issue: ['발권 필요', 'red'], hand: ['지급 대기', 'orange'], using: ['사용 중', 'blue'], stored: ['보관 · 회수 대기', 'purple'], done: ['지급 완료', 'green'] }[stage];
    const action = stage === 'issue' ? button('발권 ' + need + '매', 'pos-ticket-open-issue', order.id, 'soft') : stage === 'hand' ? button('지급 ' + line.unissuedQuantity + '매', 'pos-ticket-open-issue', order.id, 'soft') : stage === 'using' ? button('회수 ' + line.customerQuantity + '매', 'pos-ticket-open-return', order.id) : stage === 'stored' ? button('보관 권 확인', 'pos-ticket-stock', order.id) : O.go('접수 상세', 'order-detail', order.id);
    return P.card({ tone: ['red', 'orange', 'green'].includes(badge[1]) ? badge[1] : '', badge, name: order.customer.name + ' 팀', phone: order.customer.phone || '', meta: (order.receiptNo || order.id) + ' · ' + line.start.slice(5).replace('-', '/') + ' 이용 · ' + title({ sku: line.sku }),
      items: [[O.itemText(line), O.lineState(line)[0], O.lineState(line)[1]], ['발권·배정 ' + row.allocated + '매 · 지급 ' + line.issuedQuantity + '매 · 보관 ' + row.stored + '매', '', 'grey']],
      money: order.finance.dueWon ? [['미수 ' + S.money(order.finance.dueWon), 'red']] : [], actions: action, go: { page: 'order-detail', id: order.id } });
  }
  function ticketsPage() {
    const rows = ticketRows(), stock = D.snapshot.assets.filter(a => a.ticket && ['shop', 'vehicle'].includes(a.location.kind)).length;
    const count = stage => rows.filter(r => r.stage === stage).length, need = rows.reduce((n, r) => n + r.need, 0), hand = rows.filter(r => r.stage === 'hand').reduce((n, r) => n + r.line.unissuedQuantity, 0);
    const shown = listFilter === 'all' ? rows : rows.filter(r => r.stage === listFilter);
    const groups = [['issue', '발권 필요'], ['hand', '지급 대기'], ['using', '사용 중'], ['stored', '보관 · 회수 대기'], ['done', '지급 완료']].map(([stage, name]) => ({ title: name, sub: shown.filter(r => r.stage === stage).length + '건', cards: shown.filter(r => r.stage === stage).map(ticketCard) }));
    const toolbar = P.search('pos-tickets-search', listQuery, '이름 · 접수번호 · 권종') + P.toolbarLabel('발권일')
      + P.group(P.chip('전체', 'pos-tickets-filter', 'all', listFilter === 'all', rows.length) + P.chip('발권 필요', 'pos-tickets-filter', 'issue', listFilter === 'issue', count('issue')) + P.chip('지급 대기', 'pos-tickets-filter', 'hand', listFilter === 'hand', count('hand')) + P.chip('사용 중', 'pos-tickets-filter', 'using', listFilter === 'using', count('using')));
    return P.page('리프트권', '', P.cards(groups, { empty: listQuery ? '검색 결과 없음' : '리프트권 접수 없음' }),
      '<span>' + e('발권 필요 ' + need + '매 · 지급 대기 ' + hand + '매 · 보관 권 ' + stock + '매') + '</span><div class="so-actions">' + button('보관 권 ' + stock + '매', 'pos-ticket-stock') + (D.pending ? button('같은 요청 다시 확인', 'pos-retry', '', 'soft') : button('최신 기록 확인', 'pos-refresh')) + '</div>',
      { toolbar, wait: need ? '발권 ' + need + '매' : hand ? '지급 ' + hand + '매' : '없음', sums: [['발권 필요', need + '매', need ? 'red' : ''], ['지급 대기', hand + '매', hand ? 'orange' : ''], ['보관 권', stock + '매', stock ? 'purple' : '']] });
  }
  S.search('pos-tickets-search', value => { listQuery = value; const cursor = S.$('[data-search="pos-tickets-search"]')?.selectionStart; S.render(); const el = S.$('[data-search="pos-tickets-search"]'); el?.focus(); if (el && cursor != null) el.setSelectionRange(cursor, cursor); });
  S.action('pos-tickets-filter', value => { listFilter = value; S.render(); });
  S.action('pos-ticket-open-issue', id => F.open('issue', id));
  S.action('pos-ticket-open-return', id => F.open('return', id));
  S.register('tickets', { title: '리프트권', pos: true, render: ticketsPage });
  S.register('ticket-stock', { title: '회수권·발권처 반환', pos: true, parent: 'tickets', render: stockPage });
  S.register('ticket-target', { title: '회수권 재배정', pos: true, parent: 'tickets', render: targetPage });
  S.action('pos-ticket-stock', id => { S.close(); state.orderId = D.order(id)?.id || null; state.tab = 'all'; S.go('ticket-stock'); });
  S.action('pos-ticket-all', () => { state.orderId = null; S.render(); });
  S.action('pos-ticket-tab', tab => { state.tab = tab; S.render(); });
  S.action('pos-ticket-back', () => S.go('ticket-stock'));
  S.action('pos-ticket-target', id => { state.assetId = id; P.setPage('ticket-target', 0, { render: false }); S.go('ticket-target'); });
  S.action('pos-ticket-assign', value => {
    const [orderId, lineId] = value.split('|'), asset = assetOf(), order = D.order(orderId), line = order.lines.find(line => line.id === lineId);
    const from = local(asset.ticket.validFrom), to = local(asset.ticket.validTo);
    request('이 접수에 회수권을 배정할까요?', '<div class="pos-info"><strong>' + e(order.customer.name + ' · ' + title(asset)) + '</strong><p>' + e(line.start + ' 이용 · ' + asset.id + ' · ' + period(asset)) + '</p></div><div class="pos-form-grid">'
      + O.input('고객 이용 시작', 'reuse-from', from.slice(0, 10) === line.start ? from.slice(11, 16) : '09:00', 'time')
      + O.input('고객 이용 종료', 'reuse-to', to.slice(0, 10) === line.start ? to.slice(11, 16) : '18:00', 'time') + '</div><p class="pos-label">유효시간·양도 조건·다른 배정을 확인합니다. 판매 수량과 금액은 유지됩니다.</p>', '이 판매행에 1매 배정', 'tickets.assign', () => ({ orderId, lineId, assetIds: [asset.id], startTime: O.read('reuse-from'), endTime: O.read('reuse-to') }), () => F.open('issue', orderId));
  });
  S.action('pos-ticket-receive', id => {
    const asset = D.snapshot.assets.find(a => a.id === id);
    request('차량의 권을 실제로 매장에 받았나요?', '<div class="pos-info"><strong>' + e(title(asset) + ' · ' + asset.id) + '</strong><p>' + e(F.vehicleName(asset.location.id)) + ' → 매장 보관</p></div>', '실물 1매 매장 입고', 'tickets.receive', { assetIds: [id] });
  });
  S.action('pos-ticket-spare', id => {
    const asset = D.snapshot.assets.find(a => a.id === id);
    if (asset.purpose === 'spare' && !pending(asset) && !asset.refundId) { S.toast('현재 위치에 예비 보관 중입니다.'); return; }
    request('현재 위치에 예비 보관할까요?', '<div class="pos-info"><strong>' + e(title(asset) + ' · ' + asset.id) + '</strong><p>실제 보관 위치와 유효시간을 유지합니다. 고객 배정·발권처 반환을 예약하지 않습니다.</p></div>', '예비 보관 확인', 'tickets.spare', { assetIds: [id] });
  });
  S.action('pos-ticket-refund', id => {
    const asset = D.snapshot.assets.find(a => a.id === id), vehicles = F.vehicleNames;
    if (!vehicles.length) { fail('관리의 차량 설정에서 실제 운행 차량을 등록해 주세요.'); return; }
    request('발권처 반환 차량에 실었나요?', '<div class="pos-info"><strong>' + e(title(asset) + ' · ' + asset.id) + '</strong><p>발권처 ' + e(asset.ticket.vendorId) + ' · 실제 반환·환불 금액은 기사 업무에서 확인합니다.</p></div><div class="pos-form-grid">'
      + O.select('실제 적재 차량', 'refund-vehicle', vehicles, asset.location.kind === 'vehicle' ? asset.location.id : vehicles[0][0])
      + O.input('방문 날짜', 'refund-date', D.today, 'date') + O.input('방문 시간', 'refund-time', '17:00', 'time')
      + O.input('반환할 발권처 위치', 'refund-place', asset.ticket.vendorId, 'text', 'maxlength="160"') + '</div>', '실제 적재·반환 요청', 'tickets.refundDispatch', () => ({ id: D.id('ticket-refund'), assetIds: [id], vehicleId: O.read('refund-vehicle'), vendorId: asset.ticket.vendorId, date: O.read('refund-date'), time: O.read('refund-time'), place: O.read('refund-place') }), () => { S.go('dispatch'); S.toast('실제 적재를 기록했습니다. 발권처 반환 완료와 금액은 차량 업무에서 확인하세요.'); });
  });
  S.action('pos-ticket-save', async () => {
    const request = state.request; if (!request || request.busy) return;
    try {
      if (request.revision !== D.snapshot.revision) throw new Error('다른 처리로 기록이 바뀌었습니다. 닫고 최신 보관권에서 다시 선택하세요.');
      request.busy = true; await D.execute(request.type, typeof request.payload === 'function' ? request.payload() : request.payload); S.close(); state.request = null;
      if (request.done) request.done(); else { S.render(); S.toast('실물·배정 기록을 저장했습니다.'); }
    } catch (error) { request.busy = false; fail(error); }
  });
  S.posTickets = { state };
})();
