(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, O = S.posOrders, I = window.SkiWorkflowInventory, e = S.esc;
  const button = P.button, active = task => ['waiting', 'in_progress'].includes(task.status);
  const state = { operation: null, problemTab: 'history', historyAssetIds: null, request: null, exchange: null };
  const titles = { issue: '준비·직접 지급', return: '일부 직접반납', receive: '차량 물품 매장 입고', collect: '차량에 수거', dispatch: '배달 준비·적재' };
  const confirmLabels = { issue: '선택 물품 지급 확정', return: '받은 수량 반납 확정', receive: '매장 입고 확정', collect: '차량 수거 확정', dispatch: '배달 약속 확인' };
  const vehicleOptions = () => D.snapshot.management?.settings?.vehicles?.length ? D.snapshot.management.settings.vehicles.map(vehicle => [vehicle.id, vehicle.name])
    : [...new Set([...D.snapshot.tasks.map(task => task.vehicleId), ...D.snapshot.assets.filter(asset => asset.location.kind === 'vehicle').map(asset => asset.location.id)])].filter(Boolean).map(id => [id, id === 'demo-van-1' ? '1호 차량' : id === 'demo-van-2' ? '2호 차량' : id]);
  const vehicleName = id => vehicleOptions().find(row => row[0] === id)?.[1] || id;
  const product = line => D.snapshot.catalog.find(row => row.id === line.sku);
  const label = line => line.label || product(line)?.label || line.sku;
  const errorBox = () => '<p class="pos-error" data-fulfillment-error role="alert" hidden></p>';
  function error(reason) {
    const box = S.$('#so-dialog[open] [data-fulfillment-error]') || S.$('#so-page [data-fulfillment-error]');
    if (box) { box.hidden = false; box.textContent = reason.message || reason; } else S.toast(reason.message || reason);
  }
  function currentOrder(id) {
    const order = D.order(id); if (!order) throw new Error('접수를 찾지 못했습니다. 목록에서 다시 선택해 주세요.'); return order;
  }
  function candidates(order, line, from = 'shop', vehicleId) {
    const snapshot = { ...D.snapshot, movements: D.history.movements };
    return D.snapshot.assets.filter(asset => (asset.sku === line.sku || line.category === 'liftTicket' && asset.ticket) && !asset.componentBaseId && asset.location.kind === from && (!vehicleId || asset.location.id === vehicleId)
      && (!asset.orderPreparation || asset.orderPreparation.orderId === order.id && asset.orderPreparation.lineId === line.id)
      && asset.condition === 'ready' && I.allocatable(snapshot, asset, { kind: from === 'shop' ? 'deliver' : 'load', to: { kind: 'customer', id: order.id } })
      && (!asset.ticket || D.snapshot.allocations.some(a => a.assetId === asset.id && a.status === 'active' && !a.fulfilledAt && a.reservationId === order.id && (line.reservationBindings || []).some(binding => binding.lineId === a.lineId))))
      .sort((a, b) => Number(!!b.orderPreparation) - Number(!!a.orderPreparation));
  }
  function unassignedQuantity(order, line) {
    const reserved = new Set(orderTasks(order).filter(task => task.kind === 'delivery' && active(task)).flatMap(task => (task.lineItems || []).filter(row => row.lineId === line.id)
      .flatMap(row => row.assetIds.filter(id => !(task.fulfilledElsewhereAssetIds || []).includes(id) && !D.history.movements.some(movement => movement.kind === 'deliver' && movement.taskId === task.id && effectiveIds(movement).includes(id))))));
    return Math.max(0, line.unissuedQuantity - reserved.size);
  }
  function createOperation(kind, orderId, all = false) {
    const order = currentOrder(orderId), used = new Set();
    const lines = order.lines.filter(line => kind === 'issue' || kind === 'dispatch' ? line.unissuedQuantity > 0 : kind === 'receive' ? line.vehicleAssetIds.length > 0 : line.customerAssetIds.length > 0);
    const rows = lines.map(line => {
      const ids = kind === 'issue' || kind === 'dispatch' ? candidates(order, line).map(a => a.id) : (kind === 'receive' ? line.vehicleAssetIds : line.customerAssetIds).filter(id => D.snapshot.assets.find(asset => asset.id === id)?.condition !== 'lost');
      const due = line.start <= D.today, max = kind === 'issue' || kind === 'dispatch' ? Math.min(unassignedQuantity(order, line), ids.filter(id => !used.has(id)).length) : ids.length;
      const count = all || (kind === 'issue' && due) ? max : 0;
      if (kind === 'issue' || kind === 'dispatch') ids.filter(id => !used.has(id)).slice(0, count).forEach(id => used.add(id));
      return { lineId: line.id, ids, count };
    }).filter(row => ['issue', 'dispatch'].includes(kind) || row.ids.length);
    return { kind, orderId, revision: D.snapshot.revision, rows, all, modal: all, busy: false };
  }
  function count(operation = state.operation) { return operation.rows.reduce((total, row) => total + row.count, 0); }
  function lineItems(operation = state.operation) {
    const used = new Set();
    return operation.rows.filter(row => row.count > 0).map(row => {
      const assetIds = row.ids.filter(id => !used.has(id)).slice(0, row.count);
      if (assetIds.length !== row.count) throw new Error('선택한 품목끼리 같은 재고를 사용합니다. 수량을 다시 확인해 주세요.');
      assetIds.forEach(id => used.add(id)); return { lineId: row.lineId, assetIds };
    });
  }
  function limit(row, operation = state.operation) {
    const line = currentOrder(operation.orderId).lines.find(line => line.id === row.lineId);
    if (!['issue', 'dispatch'].includes(operation.kind)) return row.ids.length;
    const occupied = new Set();
    for (const other of operation.rows.filter(other => other !== row)) other.ids.filter(id => !occupied.has(id)).slice(0, other.count).forEach(id => occupied.add(id));
    return Math.min(unassignedQuantity(currentOrder(operation.orderId), line), row.ids.filter(id => !occupied.has(id)).length);
  }
  function footer(operation) {
    return '<div class="so-actions">' + O.go('고객 상세로', 'order-detail', operation.orderId) + '<span class="pos-selected-count" aria-live="polite">선택 <b>' + count(operation) + '</b>개</span></div>'
      + '<div class="so-actions">' + (D.pending ? button('같은 요청 다시 확인', 'pos-retry') : '')
      + button(confirmLabels[operation.kind], 'pos-fulfillment-confirm', '', 'primary') + '</div>';
  }
  function pickerRow(row) {
    const operation = state.operation, order = currentOrder(operation.orderId), line = order.lines.find(line => line.id === row.lineId), max = limit(row), future = ['issue', 'dispatch'].includes(operation.kind) && line.start > D.today;
    const step = (delta, title, disabled) => '<button type="button" class="so-button pos-button" data-action="pos-fulfillment-step" data-id="' + e(row.lineId) + '" data-delta="' + delta + '" aria-label="' + e(label(line) + ' ' + title) + '"' + (disabled ? ' disabled' : '') + '>' + (delta > 0 ? '+' : '−') + '</button>';
    const controls = '<div class="pos-quantity" role="group" aria-label="' + e(label(line) + ' 이번 수량') + '">' + step(-1, '수량 줄이기', row.count <= 0)
      + '<output aria-label="선택 수량">' + row.count + '</output>' + step(1, '수량 늘리기', row.count >= max)
      + '<button type="button" class="so-button pos-button" data-action="pos-fulfillment-max" data-id="' + e(row.lineId) + '"' + (!max ? ' disabled' : '') + '>전량</button></div>';
    const note = (future ? '예정일 ' + line.start + ' · 오늘 자동 선택 안 함' : O.lineDescription(order, line))
      + ' · ' + (['issue', 'dispatch'].includes(operation.kind) ? '지급 가능 ' + max : '미처리 ' + max) + (['issue', 'dispatch'].includes(operation.kind) && !row.ids.length ? ' · 재고·배정 확인' : '');
    const prepare = operation.kind === 'issue' ? button(line.category === 'liftTicket' ? '발권 기록' : '규격·준비', line.category === 'liftTicket' ? 'pos-ticket-issue' : 'pos-prepare-line', line.id) : '';
    return P.row(label(line), note, (!max && line.category !== 'liftTicket' && ['issue', 'dispatch'].includes(operation.kind) ? '<button class="so-button pos-button" data-go="partners">거래처 장비 확보</button>' : prepare) + controls);
  }
  function fulfillment() {
    const operation = state.operation;
    if (!operation) return P.page('처리할 업무를 선택해 주세요', '고객 상세에서 지급·반납·입고를 선택하세요.', O.go('고객 상세로', 'order-detail', S.state.params.id));
    const order = currentOrder(operation.orderId), description = order.customer.name + ' · ' + operation.orderId + ' · ' + (operation.kind === 'issue' ? '실제로 건네줄 물품만 선택하세요. 다음날 일행은 별도로 남습니다.' : '실제로 받은 수량만 선택하세요. 남은 물품은 계속 표시됩니다.');
    const body = '<div class="pos-fulfillment-toolbar">' + button('선택 초기화', 'pos-fulfillment-clear') + button('최신 수량으로 다시 선택', 'pos-fulfillment-refresh') + '</div>'
      + P.pager(operation.rows, 'fulfillment-' + operation.orderId + operation.kind, pickerRow, innerHeight < 700 ? 2 : 4) + errorBox();
    return P.page(titles[operation.kind], description, body, footer(operation));
  }
  function showSummary(operation) {
    const order = currentOrder(operation.orderId), groups = new Map();
    for (const row of operation.rows) {
      const line = order.lines.find(line => line.id === row.lineId), key = operation.kind === 'receive' ? null : (line.category || product(line)?.kind || line.sku);
      if (operation.kind === 'receive') for (const id of row.ids) {
        const asset = D.snapshot.assets.find(asset => asset.id === id), name = vehicleName(asset.location.id);
        groups.set(name, (groups.get(name) || 0) + 1);
      } else { const name = key === 'liftTicket' ? label(line) + ' · ' + line.start : { equipment: '장비', clothing: '의류', helmet: '헬멧' }[key] || label(line); groups.set(name, (groups.get(name) || 0) + row.count); }
    }
    const pages = Math.ceil(groups.size / 4), index = Math.max(0, Math.min(pages - 1, operation.summaryPage || 0));
    operation.summaryPage = index;
    const pageControls = pages > 1 ? '<div class="pos-summary-pages">' + button('앞 내역', 'pos-summary-page', '-1') + '<span>' + (index + 1) + ' / ' + pages + '쪽</span>' + button('뒤 내역', 'pos-summary-page', '1') + '</div>' : '';
    P.modal(operation.kind === 'receive' ? '차량에서 받은 물품을 매장 입고할까요?' : '고객에게 모두 직접 받았나요?',
      '<div class="pos-confirm-summary"><strong>' + e(order.customer.name) + ' · ' + e(operation.orderId) + '</strong><span>이번 확인 <b>' + count(operation) + '개</b></span></div>'
      + '<div class="pos-return-summary">' + [...groups].slice(index * 4, index * 4 + 4).map(([name, quantity]) => '<div><span>' + e(name) + '</span><strong>' + quantity + '개</strong></div>').join('') + '</div>' + pageControls
      + '<p class="pos-label">' + (operation.kind === 'receive' ? '실제 보관 차량별로 입고합니다.' : '고객이 지금 보유한 반납 대상만 처리합니다.') + ' 금액 정산은 고객 상세에서 이어집니다.</p>' + errorBox(),
      button('수량을 따로 선택', 'pos-fulfillment-partial') + button('취소', 'close') + button(operation.kind === 'receive' ? '매장 입고 확정' : '모두 반납 확정', 'pos-fulfillment-confirm', '', 'primary'));
  }
  function open(kind, id, all = false) {
    try {
      const operation = createOperation(kind, id, all); state.operation = operation;
      if (!operation.rows.length) { S.toast('처리할 실물이 없습니다. 분실품은 문제 해결에서 발견을 확인하세요.'); return; }
      if (all) showSummary(operation); else S.go(['issue', 'dispatch'].includes(kind) ? 'order-issue' : 'order-fulfillment', { id });
    } catch (reason) { error(reason); }
  }
  function ensureFresh(operation) {
    if (operation.revision !== D.snapshot.revision) throw new Error('다른 처리가 반영되었습니다. 최신 수량으로 다시 선택한 뒤 확정해 주세요.');
  }
  async function confirm() {
    const operation = state.operation; if (!operation || operation.busy) return;
    operation.busy = true;
    const controls = [...S.root.querySelectorAll('[data-action="pos-fulfillment-confirm"]')]; controls.forEach(el => { el.disabled = true; });
    try {
      ensureFresh(operation); const rows = lineItems(operation);
      if (!rows.length) throw new Error('실제로 처리할 수량을 하나 이상 선택해 주세요.');
      if (operation.kind === 'dispatch') {
        const order = currentOrder(operation.orderId), plans = order.lines.filter(line => rows.some(row => row.lineId === line.id)).map(line => line.pickupPlan), plan = plans.find(plan => plan.method === 'delivery');
        request('배달 약속과 적재 물품 확인', '<div class="pos-info"><strong>' + e(order.customer.name) + ' · 적재 ' + count(operation) + '개</strong><p>실제로 물품을 실은 차량과 방문 약속을 확인해 주세요.</p></div><div class="pos-form-grid">'
          + O.select('담당 차량', 'dispatch-vehicle', [['', '차량 선택'], ...vehicleOptions()], plan?.vehicleId || '')
          + O.input('배달일', 'dispatch-date', plan?.date || D.today, 'date')
          + O.input('배달 시각', 'dispatch-time', plan?.time || '18:00', 'time')
          + O.input('배달 장소', 'dispatch-place', plan?.place || S.operations.store().place) + '</div>', 'ops.dispatch',
          () => ({ id: D.id('delivery'), orderId: operation.orderId, lineItems: rows, vehicleId: O.read('dispatch-vehicle'), date: O.read('dispatch-date'), time: O.read('dispatch-time'), place: O.read('dispatch-place') }),
          () => { state.operation = null; S.go('order-detail', { id: operation.orderId }); S.toast('차량에 적재하고 배달 업무를 배정했습니다.'); }, '실물 적재·배달 배정 확정');
        return;
      }
      const type = operation.kind === 'issue' ? 'ops.issue' : operation.kind === 'receive' ? 'ops.receive' : 'ops.return';
      const payload = operation.kind === 'receive' ? { orderId: operation.orderId, assetIds: rows.flatMap(row => row.assetIds) }
        : { orderId: operation.orderId, lineItems: rows, ...(operation.kind === 'issue' ? {} : { mode: operation.kind === 'collect' ? 'collect' : 'direct' }) };
      await D.execute(type, payload); const id = operation.orderId; state.operation = null; S.go('order-detail', { id });
      S.toast(operation.kind === 'issue' ? '선택한 물품을 지급했습니다.' : operation.kind === 'receive' ? '실제 차량 보관 물품을 매장에 입고했습니다.' : '받은 수량을 반납 처리했습니다. 남은 물품과 정산을 확인하세요.');
    } catch (reason) { error(reason); }
    finally { operation.busy = false; controls.forEach(el => { el.disabled = false; }); }
  }
  function request(title, body, type, payload, done, confirmLabel = '확인하고 저장') {
    state.request = { revision: D.snapshot.revision, type, payload, done, busy: false };
    P.modal(title, body + errorBox(), button('취소', 'close') + button(confirmLabel, 'pos-fulfillment-save', '', 'primary'));
  }
  S.action('pos-fulfillment-save', async () => {
    const current = state.request; if (!current || current.busy) return;
    current.busy = true; const submit = S.$('[data-action="pos-fulfillment-save"]'); submit.disabled = true;
    try {
      ensureFresh(current); const payload = typeof current.payload === 'function' ? current.payload() : current.payload;
      const result = await D.execute(current.type, payload); state.request = null; S.close();
      if (current.done) current.done(result); else { S.render(); S.toast('처리 결과를 저장했습니다.'); }
    } catch (reason) { error(reason); }
    finally { current.busy = false; submit.disabled = false; }
  });
  const reasonSelect = (reasons, selected) => O.select('처리 사유', 'fulfillment-reason', reasons.map(value => [value, value]), selected || reasons[0]);
  const readReason = () => O.read('fulfillment-reason');
  function orderTasks(order) { return D.snapshot.tasks.filter(task => task.orderId === order.id || task.customerId === order.id); }
  function changes() {
    const order = currentOrder(S.state.params.id), rows = order.lines.filter(line => !line.cancelledQuantity && (line.customerQuantity || line.unissuedQuantity));
    return P.page('기간·수거 변경', order.customer.name + ' · 변경할 품목을 선택하세요. 다른 일행과 추가 접수의 일정은 유지됩니다.',
      P.pager(rows, 'change-lines', line => P.row(label(line), O.lineDescription(order, line),
        (line.category !== 'liftTicket' ? button(line.customerQuantity ? '남은 ' + line.customerQuantity + '개만 연장' : '기간 연장', 'pos-extend-line', line.id) : '')
        + (line.customerQuantity ? button('수거 약속', 'pos-schedule-line', line.id) : '')), innerHeight < 700 ? 3 : 4), O.go('고객 상세로', 'order-detail', order.id));
  }
  S.action('pos-change', id => S.go('order-changes', { id }));
  function extensionTerms(line) {
    return line.customerAssetIds.length ? line.customerAssetIds.map(id => (line.assetTerms || []).find(term => term.assetId === id)?.end || line.end) : Array(line.unissuedQuantity).fill(line.end);
  }
  function extensionAmount(line, end) { return extensionTerms(line).reduce((sum, previous) => sum + Math.max(0, (Date.parse(end) - Date.parse(previous)) / 86400000) * line.price.unitWon, 0); }
  S.action('pos-extend-line', id => {
    const order = currentOrder(), line = order.lines.find(line => line.id === id), terms = extensionTerms(line), lastEnd = terms.slice().sort().at(-1) || line.end, end = window.SkiWorkflowCommon.nextDate(lastEnd);
    request(line.customerQuantity ? '남은 ' + line.customerQuantity + '개만 이용 연장' : '이 미지급 품목의 이용 기간 연장', '<div class="pos-info"><strong>' + e(label(line)) + ' · ' + terms.length + '개</strong><p>현재 이용 종료 ' + e([...new Set(terms)].join(' / ')) + ' → 아래 선택일까지</p></div><div class="pos-form-grid">'
      + O.input('새 이용 종료일', 'fulfillment-end', end, 'date', 'min="' + end + '" data-change="pos-extension-date"')
      + O.input('이번 추가 청구액 (원)', 'fulfillment-amount', extensionAmount(line, end), 'number', 'min="0" inputmode="numeric"') + '</div>'
      + reasonSelect(['고객 요청 기간 연장', '접수 시 이용 기간 누락']) + '<p class="pos-label">반납한 실물의 기간은 유지합니다. 남은 이용분의 추가 일수만 별도로 청구합니다.</p>', 'ops.extend',
      () => ({ orderId: order.id, lineIds: [line.id], end: O.read('fulfillment-end'), amountWon: Number(O.read('fulfillment-amount')), reason: readReason() }));
    state.request.line = line;
  });
  S.change('pos-extension-date', value => {
    const line = state.request?.line, input = S.$('[data-pos-input="fulfillment-amount"]');
    if (line && input) input.value = extensionAmount(line, value);
  });
  S.action('pos-schedule-line', id => {
    const order = currentOrder(), line = order.lines.find(line => line.id === id), plan = line.returnPlan;
    const task = orderTasks(order).find(task => active(task) && task.kind === 'collection' && task.assetIds.some(id => line.customerAssetIds.includes(id)));
    request('수거 날짜·장소·차량 변경', '<div class="pos-info"><strong>' + e(label(line)) + ' · 고객 보유 ' + line.customerQuantity + '개</strong><p>선택한 품목의 남은 수거 약속만 바꿉니다.</p></div><div class="pos-form-grid">'
      + O.input('수거일', 'fulfillment-date', task?.date || plan.date, 'date') + O.input('수거 시각', 'fulfillment-time', task?.time || plan.time || '18:00', 'time')
      + O.input('수거 장소', 'fulfillment-place', task?.place || (plan.method === 'vehicle' ? plan.place : S.operations.store().place))
      + O.select('담당 차량', 'fulfillment-vehicle', [['', '차량 선택'], ...vehicleOptions()], task?.vehicleId || plan.vehicleId || '') + '</div>', 'ops.schedule',
      () => ({ orderId: order.id, lineItems: [{ lineId: id, assetIds: line.customerAssetIds }], date: O.read('fulfillment-date'), time: O.read('fulfillment-time'), place: O.read('fulfillment-place'), vehicleId: O.read('fulfillment-vehicle') }));
  });
  const movementNames = { load: '차량 적재', deliver: '고객 지급', collect: '차량 수거', receive: '매장 입고', directReturn: '직접 반납', opening: '이관 보관 확인', stock: '재고 입고', ticketIssue: '발권', refund: '발권처 환불' };
  const locationName = location => !location ? '기록' : location.kind === 'vehicle' ? vehicleName(location.id) : { customer: '고객', shop: '매장', vendor: '발권처' }[location.kind] || location.kind;
  const effectiveIds = movement => movement.assetIds.filter(id => !(movement.reversedAssetIds || []).includes(id));
  function movements(order) {
    const taskIds = new Set(orderTasks(order).map(task => task.id));
    return D.history.movements.filter(movement => movement.orderId === order.id || movement.from?.kind === 'customer' && movement.from.id === order.id || movement.to?.kind === 'customer' && movement.to.id === order.id || taskIds.has(movement.taskId))
      .filter(movement => !state.historyAssetIds || movement.assetIds.some(id => state.historyAssetIds.includes(id))).slice().sort((a, b) => b.revision - a.revision || b.id.localeCompare(a.id));
  }
  function reversibleIds(movement) {
    const exchange = exchangeForMovement(movement);
    if (!['load', 'deliver', 'collect', 'receive', 'directReturn'].includes(movement.kind) || !exchange && (movement.exchangeId || movement.intakeId)) return [];
    if (!exchange && D.snapshot.exchanges.some(x => x.status !== 'cancelled' && x.units.some(unit => movement.assetIds.includes(unit.oldAssetId) || movement.assetIds.includes(unit.newAssetId)))) return [];
    return effectiveIds(movement).filter(id => (!exchange || exchange.units.some(unit => unit.oldAssetId === id || unit.newAssetId === id)) && D.snapshot.assets.find(asset => asset.id === id)?.lastRevision === movement.revision);
  }
  function exchangeForMovement(movement) {
    return D.snapshot.exchanges.find(exchange => exchange.status !== 'cancelled' && movement.revision >= (exchange.createdRevision || 0)
      && (movement.exchangeId === exchange.id || exchange.units.some(unit => movement.assetIds.includes(unit.oldAssetId) || movement.assetIds.includes(unit.newAssetId))));
  }
  function historyRow(movement) {
    const ids = effectiveIds(movement), available = reversibleIds(movement);
    const title = (movementNames[movement.kind] || '물품 기록') + ' · ' + ids.length + '개' + (!ids.length ? ' · 정정됨' : '');
    const stamp = new Date(Date.parse(movement.at) + 9 * 3600000).toISOString().slice(5, 16).replace('T', ' ');
    const description = stamp + ' · ' + locationName(movement.from) + ' → ' + locationName(movement.to) + ' · ' + movement.id;
    return P.row(title, description, !ids.length ? '' : available.length ? button(exchangeForMovement(movement) ? '교환 기록 정정' : '이 기록 정정', 'pos-correct-movement', movement.id)
      : button('뒤 기록 확인', 'pos-movement-dependencies', movement.id));
  }
  function problems() {
    const order = currentOrder(S.state.params.id), tabs = [['history', '잘못 누른 처리'], ['cancel', '미도착·배달 취소'], ['equipment', '교환·분실·파손']];
    const menu = '<div class="pos-fulfillment-tabs">' + tabs.map(([id, text]) => '<button type="button" class="so-button pos-button" data-action="pos-problem-tab" data-id="' + id + '" aria-pressed="' + (state.problemTab === id) + '">' + text + '</button>').join('') + '</div>';
    let rows, renderRow;
    if (state.problemTab === 'cancel') {
      rows = [...orderTasks(order).filter(task => task.kind === 'delivery' && active(task)).map(task => ({ task })), ...(order.preparations || []).filter(preparation => preparation.status === 'prepared' && D.snapshot.assets.some(asset => asset.orderPreparation?.preparationId === preparation.id)).map(preparation => ({ preparation })), ...order.lines.filter(line => line.unissuedQuantity && !line.issuedQuantity).map(line => ({ line }))];
      renderRow = row => row.task ? P.row('배달 해제 · ' + vehicleName(row.task.vehicleId), row.task.date + ' ' + row.task.time + ' · ' + row.task.place, button('내리고 배달 해제', 'pos-cancel-delivery', row.task.id))
        : row.preparation ? P.row('미지급 준비 물품 해제', row.preparation.id + ' · 규격을 확인하여 배정한 물품', button('이 준비 해제', 'pos-prepare-cancel', row.preparation.id))
        : P.row(label(row.line) + ' · 미지급 ' + row.line.unissuedQuantity + '개', O.lineDescription(order, row.line), button('이 미지급분 취소', 'pos-cancel-unissued', row.line.id));
    } else if (state.problemTab === 'equipment') {
      rows = [...(D.snapshot.exchanges || []).filter(exchange => exchange.orderId === order.id && exchange.status !== 'cancelled').map(exchange => ({ exchange })), ...order.lines.filter(line => line.customerAssetIds.length || line.vehicleAssetIds.length || line.unknownAssetIds.length).map(line => ({ line }))];
      renderRow = row => row.exchange ? P.row((row.exchange.status === 'completed' ? '완료 교환 · ' : '진행 교환 · ') + (row.exchange.kind || '장비'), row.exchange.units.length + '개 · 교환품 지급과 기존품 회수를 따로 확인합니다.', button(row.exchange.status === 'completed' ? '교환 내역 확인' : '교환 이어 처리', 'pos-exchange-open', row.exchange.id))
        : P.row(label(row.line), O.lineDescription(order, row.line), (['ski', 'board'].includes(row.line.sku) && row.line.customerQuantity ? button('교환', 'pos-exchange-start', row.line.id) : '') + button('상태·분실 확인', 'pos-asset-problem', row.line.id));
    } else { rows = movements(order); renderRow = historyRow; }
    return P.page('잘못 입력함·문제 해결', order.customer.name + ' · 원래 처리 기록을 선택하세요. 뒤에 이어진 처리가 있으면 그 기록부터 확인합니다.', menu
      + P.pager(rows, 'problem-' + state.problemTab, renderRow, innerHeight < 700 ? 2 : 4) + errorBox(), '<div>' + O.go('고객 상세로', 'order-detail', order.id) + '</div>'
      + (state.historyAssetIds ? button('접수 전체 이력 보기', 'pos-history-all') : '<span>금액 정정은 고객 상세의 수납·환불에서 처리합니다.</span>'));
  }
  S.action('pos-problems', id => { state.problemTab = 'history'; state.historyAssetIds = null; S.go('order-problems', { id }); });
  S.action('pos-problem-tab', tab => { state.problemTab = tab; S.render(); });
  S.action('pos-history-all', () => { state.historyAssetIds = null; S.render(); });
  S.action('pos-movement-dependencies', id => {
    const movement = D.history.movements.find(row => row.id === id); state.historyAssetIds = effectiveIds(movement); state.problemTab = 'history';
    P.setPage('problem-history', 0, { render: false }); S.render();
    error('같은 물품의 기록만 표시합니다. 위쪽의 나중 처리부터 확인하세요. 교환·배정에 연결된 기록은 해당 업무에서 먼저 해제합니다.');
  });
  S.action('pos-correct-movement', id => {
    const movement = D.history.movements.find(row => row.id === id), ids = reversibleIds(movement), exchange = exchangeForMovement(movement);
    request('원래 물품 이동을 되돌릴까요?', '<div class="pos-confirm-summary"><strong>' + e(movementNames[movement.kind]) + ' · 이번 정정 ' + ids.length + '개</strong><span>'
      + e(locationName(movement.to)) + ' → ' + e(locationName(movement.from)) + '</span><span>원래 기록 ' + e(id) + '</span></div>'
      + '<div class="pos-form-grid">' + O.input('되돌릴 수량', 'correction-quantity', ids.length, 'number', 'min="1" max="' + ids.length + '"')
      + reasonSelect(['받은 수량을 잘못 누름', '지급·적재 수량을 잘못 누름', '다른 고객의 처리를 잘못 누름', '동일 물품을 다시 확인함']) + '</div>'
      + '<p class="pos-label">실물 위치가 되돌릴 위치와 일치하는지 확인하세요. 이후 처리에 연결된 물품은 이번 정정에서 제외됩니다.</p>', exchange ? 'exchange.recover' : 'movement.undo',
      () => { const quantity = Number(O.read('correction-quantity')); window.SkiWorkflowCommon.integer(quantity, 1, ids.length);
        return { ...(exchange ? { id: exchange.id } : {}), movementId: id, assetIds: ids.slice(0, quantity), reason: readReason() }; }, null, '원래 위치로 정정');
  });
  function cancelUnissued(id) {
    const order = currentOrder(), line = order.lines.find(line => line.id === id);
    if (line.category === 'liftTicket' && line.issuedQuantity) {
      P.modal('지급한 권은 실물 회수부터 확인하세요', '<div class="pos-info"><strong>' + e(label(line)) + ' · 지급 이력 ' + line.issuedQuantity + '매</strong><p>지급 이력이 있는 품목은 미지급 취소로 지우지 않습니다. 현재 고객·차량 보유 권을 실제로 받은 뒤, 발권처 반환과 고객 수납·환불을 각각 처리하세요.</p></div>',
        button('닫기', 'close') + (line.customerQuantity ? button('이 품목 권 회수', 'pos-ticket-return-line', id, 'primary') : line.vehicleQuantity ? button('이 품목 권 입고', 'pos-ticket-receive-line', id, 'primary') : button('회수권·발권처 반환', 'pos-ticket-stock', order.id)) + button('수납·환불 확인', 'pos-money', order.id));
      return;
    }
    const delivery = orderTasks(order).find(task => task.kind === 'delivery' && active(task) && ((task.lineItems || []).some(row => row.lineId === id) || (task.plannedItems || []).some(row => row.itemId === id)));
    const prepared = D.snapshot.assets.find(asset => asset.orderPreparation?.orderId === order.id && asset.orderPreparation.lineId === id);
    if (delivery || prepared) {
      P.modal('취소 전에 연결된 물품부터 확인하세요', '<div class="pos-info"><strong>' + e(label(line)) + '</strong><p>'
        + (delivery ? '이 품목은 배달에 배정되어 있습니다. 미전달 물품을 매장에 내리고 배달을 해제한 뒤 취소합니다.' : '이 품목에 실물이 준비되어 있습니다. 준비 배정을 해제한 뒤 이 미지급분만 취소합니다.') + '</p></div>',
        button('닫기', 'close') + button(delivery ? '내리고 배달 해제' : '이 준비 해제', delivery ? 'pos-cancel-delivery' : 'pos-prepare-cancel', delivery?.id || prepared.orderPreparation.preparationId, 'primary'));
      return;
    }
    const ticket = line.category === 'liftTicket';
    request(ticket ? '미지급 발권 배정·예약·접수를 함께 취소할까요?' : '이번 미지급 품목만 취소할까요?', '<div class="pos-info"><strong>' + e(label(line)) + ' · ' + line.unissuedQuantity + (ticket ? '매' : '개') + '</strong><p>' + e(O.lineDescription(order, line)) + '</p></div>'
      + reasonSelect(['일행 미도착', '고객 요청 취소', '중복 접수', '품목을 잘못 접수함']) + '<p class="pos-label">' + (ticket ? '이번 판매행의 발권 배정과 예약 수요만 함께 해제합니다. 실제 권은 현재 보관 위치에 남고, 수납·환불 금액은 자동으로 바뀌지 않습니다.' : '연결된 배달이 있으면 먼저 내리고 배달을 해제하세요. 이미 지급한 일행은 계속 유지됩니다.') + '</p>',
      ticket ? 'ops.cancelTicket' : 'order.cancel', () => ({ orderId: order.id, ...(ticket ? { lineId: id } : { lineIds: [id] }), reason: readReason() }),
      ticket ? () => { S.render(); P.modal('미지급 발권·접수 취소 완료', '<div class="pos-info"><strong>발권 배정·예약 수요·이번 접수를 함께 취소했습니다.</strong><p>실제 권은 삭제하지 않았습니다. 권 보관·발권처 반환과 고객 수납·환불을 필요한 순서로 이어가세요.</p></div>', button('닫기', 'close') + button('회수권·발권처 반환', 'pos-ticket-stock', order.id) + button('수납·환불 확인', 'pos-money', order.id, 'primary')); } : null, '이번 미지급분 취소');
  }
  S.action('pos-cancel-unissued', cancelUnissued);
  S.action('pos-cancel-line', cancelUnissued);
  S.action('pos-ticket-return-line', id => { const order = currentOrder(); open('return', order.id); if (state.operation) { state.operation.rows = state.operation.rows.filter(row => row.lineId === id); S.render(); } });
  S.action('pos-ticket-receive-line', id => { const order = currentOrder(); state.operation = createOperation('receive', order.id, true); state.operation.rows = state.operation.rows.filter(row => row.lineId === id); if (state.operation.rows.length) showSummary(state.operation); });
  S.action('pos-cancel-delivery', id => {
    const task = D.snapshot.tasks.find(task => task.id === id), onboard = task.assetIds.filter(id => D.snapshot.assets.find(asset => asset.id === id)?.location.kind === 'vehicle');
    request('미전달 물품을 매장에 내렸나요?', '<div class="pos-confirm-summary"><strong>' + e(vehicleName(task.vehicleId)) + ' · 차량에 ' + onboard.length + '개</strong><span>' + e(task.date + ' ' + task.time + ' · ' + task.place) + '</span></div>'
      + reasonSelect(['고객이 매장에 직접 방문함', '배달 요청 취소', '일행 미도착', '배달 접수를 잘못함']) + '<p class="pos-label">실제로 매장에 내린 물품만 확인하세요. 이미 고객에게 전달한 물품은 지급 기록을 유지합니다.</p>',
      'ops.deliveryCancel', () => ({ taskId: id, reason: readReason(), unload: true }), null, '내린 물품 확인·배달 해제');
  });
  const conditionNames = { ready: '준비 완료', cleaning: '세척 대기', inspection: '점검 대기', repair: '수리 대기', damaged: '파손 확인', lost: '분실' };
  function lineAssets(order, line) {
    const ids = [...line.customerAssetIds, ...line.vehicleAssetIds, ...line.unknownAssetIds];
    return D.snapshot.assets.filter(asset => ids.includes(asset.id));
  }
  function assetsPage() {
    const order = currentOrder(S.state.params.id), line = order.lines.find(line => line.id === state.assetLineId);
    if (!line) return problems();
    return P.page(label(line) + ' · 상태·분실 확인', order.customer.name + ' · 실물 관리번호와 현재 보관 위치를 확인해 주세요.',
      P.pager(lineAssets(order, line), 'asset-problems-' + line.id, asset => P.row((asset.size || '규격 미기록') + ' · ' + (conditionNames[asset.condition] || asset.condition),
        asset.id + ' · ' + (asset.condition === 'lost' ? '마지막 확인 ' : '') + locationName(asset.location),
        button(asset.condition === 'lost' ? '실물 발견·매장 확인' : '상태·분실 기록', asset.condition === 'lost' ? 'pos-found-asset' : 'pos-condition-asset', asset.id)), innerHeight < 700 ? 3 : 4), O.go('문제 해결로', 'order-problems', order.id));
  }
  S.action('pos-asset-problem', id => { state.assetLineId = id; S.go('order-assets', { id: currentOrder().id }); });
  S.action('pos-condition-asset', id => {
    const asset = D.snapshot.assets.find(asset => asset.id === id);
    request('현재 물품의 상태 기록', '<div class="pos-info"><strong>' + e(id) + '</strong><p>' + e(locationName(asset.location) + ' · ' + (asset.size || '규격 미기록')) + '</p></div><div class="pos-form-grid">'
      + O.select('확인한 상태', 'fulfillment-condition', [['inspection', '점검 필요'], ['cleaning', '세척 필요'], ['repair', '파손·수리 필요'], ['lost', '실물 분실']], 'inspection')
      + reasonSelect(['실물 점검 중 이상 확인', '반납 물품 오염', '고객 파손 신고', '고객 분실 신고', '수거 물품 부족 확인']) + '</div><p class="pos-label">보관 위치는 유지됩니다. 분실은 정상 반납으로 처리하지 않으며, 발견 시 별도로 확인합니다.</p>',
      'management.asset', () => ({ assetIds: [id], condition: O.read('fulfillment-condition'), reason: readReason() }));
  });
  S.action('pos-found-asset', id => request('분실품 실물을 매장에서 확인했나요?', '<div class="pos-info"><strong>' + e(id) + '</strong><p>발견한 실물을 매장 점검 대기로 기록합니다. 정상 재고 복귀는 점검 후 처리합니다.</p></div>'
    + reasonSelect(['고객이 발견하여 매장에 반납함', '차량에서 발견하여 매장에 내림', '매장에서 실물을 찾음']), 'management.found', () => ({ assetId: id, condition: 'inspection', reason: readReason() }), null, '실물 발견·매장 확인'));
  function exchangeOf(id = state.exchangeId) {
    const exchange = D.snapshot.exchanges.find(exchange => exchange.id === id);
    if (!exchange) throw new Error('교환 내역을 찾지 못했습니다. 문제 해결에서 다시 선택해 주세요.'); return exchange;
  }
  const exchangeKinds = sku => sku === 'ski' ? [['ski', '스키'], ['ski-boots', '스키부츠'], ['poles', '폴대']] : [['board', '보드'], ['board-boots', '보드부츠']];
  function exchangeStart(lineId) {
    const order = currentOrder(), line = order.lines.find(line => line.id === lineId);
    const assets = lineAssets(order, line).filter(asset => asset.location.kind === 'customer' && asset.condition !== 'lost' && !asset.exchangeReservationId);
    if (!assets.length) { error('현재 고객이 보유한 교환 가능 장비를 먼저 확인해 주세요.'); return; }
    state.exchange = { orderId: order.id, lineId, assets, revision: D.snapshot.revision };
    P.modal('교환할 실물·규격 확인', '<div class="pos-form-grid">'
      + O.select('현재 고객 장비', 'exchange-base', assets.map(asset => [asset.id, (asset.size || '규격 미기록') + ' · ' + asset.id]), assets[0].id)
      + O.select('교환 품목', 'exchange-kind', exchangeKinds(line.sku), line.sku)
      + O.input('현재 규격', 'exchange-old-size', assets[0].size || '', 'text', 'maxlength="24"') + O.input('새 규격', 'exchange-new-size', '', 'text', 'maxlength="24"')
      + O.select('교환 사유', 'exchange-reason', [['size', '사이즈 변경'], ['damage', '파손 교체']], 'size')
      + O.select('교환 방법', 'exchange-method', [['shop', '매장에서 교환'], ['vehicle', '차량으로 교환']], 'shop') + '</div><p class="pos-label">부츠·폴대는 현재 대여 세트에 포함된 실물을 확인한 뒤 선택하세요.</p>' + errorBox(),
      button('취소', 'close') + button('교환 내용 확인', 'pos-exchange-request-review', '', 'primary'));
  }
  S.action('pos-exchange-start', exchangeStart);
  S.action('pos-exchange-request-review', () => {
    try {
      const draft = state.exchange; ensureFresh(draft);
      const order = currentOrder(draft.orderId), line = order.lines.find(line => line.id === draft.lineId), baseId = O.read('exchange-base'), asset = draft.assets.find(asset => asset.id === baseId);
      if (!asset) throw new Error('교환할 기존 실물을 선택해 주세요.');
      const kind = O.read('exchange-kind'), oldSize = O.read('exchange-old-size').trim(), newSize = O.read('exchange-new-size').trim();
      if (!oldSize || !newSize) throw new Error('현재 규격과 새 규격을 확인해 주세요.');
      const vehicleId = line.returnPlan.vehicleId || vehicleOptions()[0]?.[0] || 'shop-direct';
      const payload = { id: D.id('exchange'), orderId: order.id, customerId: order.id, customerName: order.customer.name, kind, baseAssetIds: [baseId], reason: O.read('exchange-reason'), oldSize, newSize, memo: '', method: O.read('exchange-method'),
        visit: { method: 'direct', date: D.today, time: '18:00', place: '매장', vehicleId },
        returnPlan: { ...line.returnPlan, time: line.returnPlan.time || '18:00', vehicleId }, ...(kind !== line.sku ? { confirmExistingComponent: true } : {}) };
      draft.payload = payload;
      const after = result => { state.exchangeId = result.exchangeId; S.go('order-exchange', { id: order.id }); };
      if (payload.method === 'vehicle') {
        request('교환 방문 약속', '<div class="pos-info"><strong>' + e(oldSize + ' → ' + newSize) + '</strong><p>새 장비 전달과 기존 장비 수거를 각각 기록합니다.</p></div><div class="pos-form-grid">'
          + O.input('방문일', 'exchange-date', D.today, 'date') + O.input('방문 시각', 'exchange-time', '18:00', 'time')
          + O.input('방문 장소', 'exchange-place', line.returnPlan.method === 'vehicle' ? line.returnPlan.place : S.operations.store().place)
          + O.select('담당 차량', 'exchange-vehicle', [['', '차량 선택'], ...vehicleOptions()], line.returnPlan.vehicleId || '') + '</div>', 'exchange.request',
          () => ({ ...payload, visit: { method: 'vehicle', date: O.read('exchange-date'), time: O.read('exchange-time'), place: O.read('exchange-place'), vehicleId: O.read('exchange-vehicle') } }), after, '교환 방문 요청 생성');
      } else request('매장 교환 요청 확인', '<div class="pos-confirm-summary"><strong>' + e(label(line)) + ' · 1개</strong><span>규격 ' + e(oldSize + ' → ' + newSize) + '</span><span>새 장비 준비 → 지급 · 기존 장비 받음</span></div>', 'exchange.request', payload, after, '매장 교환 요청 생성');
    } catch (reason) { error(reason); }
  });
  function exchangeRow(unit, index) {
    const exchange = exchangeOf(), oldAsset = D.snapshot.assets.find(asset => asset.id === unit.oldAssetId), newAsset = D.snapshot.assets.find(asset => asset.id === unit.newAssetId);
    let nextNew;
    if (!unit.newAssetId) nextNew = button('새 장비 준비', 'pos-exchange-prepare', String(index));
    else if (unit.deliveredAt) nextNew = '<span class="pos-label">새 장비 지급 완료</span>';
    else nextNew = button(exchange.method === 'vehicle' && newAsset.location.kind === 'shop' ? '교환품 차량 적재' : '교환품 지급', 'pos-exchange-new', String(index));
    const nextOld = unit.receivedAt ? '<span class="pos-label">기존 장비 입고 완료</span>' : button(oldAsset.location.kind === 'vehicle' ? '기존품 매장 입고' : exchange.method === 'vehicle' ? '기존품 차량 수거' : '기존품 직접 받음', 'pos-exchange-old', String(index));
    return P.row('교환 ' + (index + 1) + ' · ' + exchange.oldSize + ' → ' + exchange.newSize,
      '기존 ' + locationName(oldAsset.location) + ' · 새 장비 ' + (newAsset ? locationName(newAsset.location) : '준비 전'), nextNew + nextOld);
  }
  function exchangePage() {
    const order = currentOrder(S.state.params.id), exchange = exchangeOf();
    const canCancel = exchange.units.every(unit => !unit.deliveredAt && !unit.collectedAt && !unit.receivedAt && (!unit.newAssetId || D.snapshot.assets.find(asset => asset.id === unit.newAssetId).location.kind === 'shop'));
    return P.page('장비 교환 이어 처리', order.customer.name + ' · ' + exchange.id + ' · ' + (exchange.method === 'vehicle' ? vehicleName(exchange.visit.vehicleId) + ' 방문' : '매장 교환'),
      '<div class="pos-info">새 물품 지급과 기존 물품 회수·입고를 각각 확인하세요. 교환 완료 후 새 장비의 일반 반납이 이어집니다.</div>'
      + P.pager(exchange.units, 'exchange-units-' + exchange.id, exchangeRow, innerHeight < 700 ? 2 : 4) + errorBox(),
      '<div class="so-actions">' + O.go('문제 해결로', 'order-problems', order.id) + button('교환 이동 기록', 'pos-exchange-history', exchange.id) + '</div>'
      + (exchange.status === 'completed' ? O.go('고객 상세·새 장비 반납', 'order-detail', order.id, 'primary') : canCancel ? button('이 교환 요청 취소', 'pos-exchange-cancel', exchange.id) : '<span>이동 기록에서 원래 처리를 정정할 수 있습니다.</span>'));
  }
  S.action('pos-exchange-open', id => { const exchange = exchangeOf(id); state.exchangeId = id; S.go('order-exchange', { id: exchange.orderId }); });
  S.action('pos-exchange-history', id => { const exchange = exchangeOf(id); state.problemTab = 'history'; state.historyAssetIds = exchange.units.flatMap(unit => [unit.oldAssetId, unit.newAssetId]).filter(Boolean); S.go('order-problems', { id: exchange.orderId }); });
  S.action('pos-exchange-prepare', index => {
    const exchange = exchangeOf(), candidates = D.snapshot.assets.filter(asset => asset.sku === exchange.sku && asset.location.kind === 'shop' && asset.condition === 'ready' && !asset.componentBaseId && !asset.orderPreparation && !asset.exchangeReservationId && (!asset.size || asset.size === exchange.newSize)
      && I.allocatable({ ...D.snapshot, movements: D.history.movements }, asset, { kind: 'deliver', to: { kind: 'customer', id: exchange.orderId } }));
    if (!candidates.length) { error('규격이 맞는 정상 매장 재고가 없습니다. 재고·정비에서 준비 상태를 확인하세요.'); return; }
    request('새 교환 장비를 준비할까요?', '<div class="pos-info"><strong>새 규격 ' + e(exchange.newSize) + '</strong><p>실제 물품 관리번호를 확인해 주세요.</p></div>'
      + O.select('준비한 실물', 'exchange-new-asset', candidates.map(asset => [asset.id, (asset.size || '규격 확인 필요') + ' · ' + asset.id]), candidates[0].id), 'exchange.prepare',
      () => ({ id: exchange.id, assetIds: [O.read('exchange-new-asset')] }), null, '교환 실물 준비 확인');
  });
  function exchangeMove(index, old) {
    const exchange = exchangeOf(), unit = exchange.units[Number(index)], asset = D.snapshot.assets.find(asset => asset.id === (old ? unit.oldAssetId : unit.newAssetId));
    if (!asset) { error('먼저 새 교환 장비를 준비해 주세요.'); return; }
    const shop = { kind: 'shop', id: D.snapshot.shopId };
    const kind = old ? asset.location.kind === 'vehicle' ? 'receive' : exchange.method === 'vehicle' ? 'collect' : 'directReturn' : exchange.method === 'vehicle' && asset.location.kind === 'shop' ? 'load' : 'deliver';
    const to = ['directReturn', 'receive'].includes(kind) ? shop : ['load', 'collect'].includes(kind) ? { kind: 'vehicle', id: exchange.visit.vehicleId } : { kind: 'customer', id: exchange.customerId };
    const payload = { kind, from: asset.location, to, assetIds: [asset.id], ...(kind !== 'receive' ? { exchangeId: exchange.id } : {}),
      ...(exchange.method === 'vehicle' && ['deliver', 'collect', 'load'].includes(kind) ? { taskId: exchange.id + (old ? '-old' : '-new') } : {}) };
    request((movementNames[kind] || '물품 이동') + ' 확인', '<div class="pos-confirm-summary"><strong>' + e(asset.id) + ' · ' + e(asset.size || (old ? exchange.oldSize : exchange.newSize)) + '</strong><span>' + e(locationName(asset.location) + ' → ' + locationName(to)) + '</span></div>',
      'stock.move', payload, null, '실물 확인·' + movementNames[kind]);
  }
  S.action('pos-exchange-new', index => exchangeMove(index, false));
  S.action('pos-exchange-old', index => exchangeMove(index, true));
  S.action('pos-exchange-cancel', id => request('아직 이동하지 않은 교환을 취소할까요?', '<p>기존 장비와 새 준비 장비의 교환 배정을 해제하고 원래 반납 약속을 복원합니다.</p>'
    + reasonSelect(['교환 요청 취소', '규격을 잘못 선택함', '다른 고객의 교환을 잘못 접수함']), 'exchange.cancel', () => ({ id, reason: readReason() }),
    () => { state.problemTab = 'equipment'; S.go('order-problems', { id: exchangeOf(id).orderId }); }, '교환 요청 취소'));
  S.action('pos-prepare-line', id => {
    const order = currentOrder(), line = order.lines.find(line => line.id === id), stock = candidates(order, line).filter(asset => !asset.orderPreparation);
    if (!stock.length || !unassignedQuantity(order, line)) { P.modal('준비할 물품을 먼저 확보하세요', '<p>정상 매장 재고와 기존 준비·배달 배정을 확인하세요. 부족한 장비는 거래처에서 확보할 수 있습니다.</p>', button('닫기', 'close') + '<button class="so-button pos-button primary" data-go="partners">거래처 장비 확보</button>'); return; }
    request('실제 물품과 규격 준비', '<div class="pos-info"><strong>' + e(label(line)) + '</strong><p>준비할 실물과 실제 규격을 확인하세요. 다른 일행이 가져갈 수 없도록 배정합니다.</p></div><div class="pos-form-grid">'
      + O.select('준비할 실물', 'prepare-asset', stock.map(asset => [asset.id, (asset.size || '규격 미기록') + ' · ' + asset.id]), stock[0].id)
      + O.input('실제 규격', 'prepare-size', stock[0].size || '', 'text', 'maxlength="24" placeholder="예: 160 / 260 / L / 공용"') + '</div>', 'ops.prepare',
      () => ({ orderId: order.id, lineItems: [{ lineId: line.id, assets: [{ assetId: O.read('prepare-asset'), size: O.read('prepare-size') }] }] }),
      () => { state.operation = createOperation('issue', order.id); S.render(); S.toast('실제 물품·규격을 이 품목에 준비했습니다.'); }, '물품·규격 준비 확인');
  });
  S.action('pos-prepare-cancel', id => {
    const order = currentOrder(), assets = D.snapshot.assets.filter(asset => asset.orderPreparation?.orderId === order.id && asset.orderPreparation.preparationId === id);
    request('이 준비 물품의 배정을 해제할까요?', '<div class="pos-info"><strong>미지급 준비 ' + assets.length + '개</strong><p>매장에 남은 준비 물품만 해제합니다. 차량에 실은 물품은 배달 취소·매장 내리기를 먼저 처리하세요.</p></div>'
      + reasonSelect(['규격을 다시 준비함', '일행 미도착', '접수 취소 전 준비 해제']), 'ops.prepareCancel', () => ({ orderId: order.id, preparationId: id, reason: readReason() }), null, '미지급 준비 해제');
  });
  S.action('pos-ticket-issue', id => {
    const order = currentOrder(), line = order.lines.find(line => line.id === id), allocated = D.snapshot.allocations.filter(a => a.reservationId === order.id && a.status === 'active' && !a.fulfilledAt && (line.reservationBindings || []).some(binding => binding.lineId === a.lineId)).length;
    const left = line.unissuedQuantity - allocated;
    if (left <= 0) { error('이 품목은 이미 발권·배정했습니다. 지급할 수량을 선택하세요.'); return; }
    request('실제로 발권한 리프트권 기록', '<div class="pos-form-grid">'
      + O.select('실제 발권 권종', 'ticket-sku', D.snapshot.catalog.filter(sku => sku.kind === 'liftTicket' && !sku.requiresTypeConfirmation).map(sku => [sku.id, sku.label]), line.sku)
      + O.input('실제 발권 수량', 'ticket-quantity', left, 'number', 'min="1" max="' + left + '"')
      + O.input('권의 유효 시작', 'ticket-from', line.start + 'T09:00', 'datetime-local') + O.input('권의 유효 종료', 'ticket-to', line.start + 'T18:00', 'datetime-local')
      + O.input('발권처 관리번호', 'ticket-vendor', '', 'text', 'maxlength="100" placeholder="실제 발권처"')
      + O.select('반환 후 재사용 조건', 'ticket-transfer', [['false', '재사용 불가'], ['true', '유효시간 안에 양도 가능']], 'false') + '</div><p class="pos-label">실제 발권을 마친 권의 조건만 기록합니다. 판매 접수만으로 발권 완료되지 않습니다.</p>', 'ops.ticketIssue',
      () => { const sku = O.read('ticket-sku'); return { orderId: order.id, lineId: line.id, quantity: Number(O.read('ticket-quantity')), sku,
        ticket: { validFrom: O.read('ticket-from') + ':00+09:00', validTo: O.read('ticket-to') + ':00+09:00', acceptedTypes: [sku], transferable: O.read('ticket-transfer') === 'true', vendorId: O.read('ticket-vendor') } }; },
      () => { state.operation = createOperation('issue', order.id); S.render(); S.toast('실제 발권·배정을 기록했습니다. 고객에게 지급할 권을 선택하세요.'); }, '실제 발권·배정 기록');
  });
  S.root.addEventListener('change', event => {
    const name = event.target.dataset.posInput;
    if (name === 'prepare-asset' || name === 'exchange-base') {
      const size = D.snapshot.assets.find(asset => asset.id === event.target.value)?.size || '';
      const input = S.$('[data-pos-input="' + (name === 'prepare-asset' ? 'prepare-size' : 'exchange-old-size') + '"]');
      if (input) input.value = size;
    }
    if (name === 'fulfillment-condition') {
      const reasons = { inspection: '실물 점검 중 이상 확인', cleaning: '반납 물품 오염', repair: '고객 파손 신고', lost: '고객 분실 신고' };
      const input = S.$('[data-pos-input="fulfillment-reason"]'); if (input) input.value = reasons[event.target.value];
    }
  });
  S.action('pos-issue', id => open('issue', id));
  S.action('pos-return-all', id => open('return', id, true));
  S.action('pos-return-some', id => open('return', id));
  S.action('pos-receive', id => open('receive', id, true));
  S.action('pos-fulfillment-confirm', confirm);
  S.action('pos-summary-page', delta => { state.operation.summaryPage = (state.operation.summaryPage || 0) + Number(delta); showSummary(state.operation); });
  S.action('pos-fulfillment-partial', () => { const op = state.operation; op.modal = false; op.all = false; S.go('order-fulfillment', { id: op.orderId }); });
  S.action('pos-fulfillment-step', (id, target) => { const row = state.operation.rows.find(row => row.lineId === id); row.count = Math.max(0, Math.min(limit(row), row.count + Number(target.dataset.delta))); S.render(); });
  S.action('pos-fulfillment-max', id => { const row = state.operation.rows.find(row => row.lineId === id); row.count = limit(row); S.render(); });
  S.action('pos-fulfillment-clear', () => { state.operation.rows.forEach(row => { row.count = 0; }); S.render(); });
  S.action('pos-fulfillment-refresh', async () => { try { const op = state.operation; await D.refresh(); open(op.kind, op.orderId, op.modal); } catch (reason) { error(reason); } });
  S.register('order-fulfillment', { title: '지급·반납 처리', parent: 'returns', pos: true, render: fulfillment });
  S.register('order-issue', { title: '준비·지급 처리', parent: 'preparation', pos: true, render: fulfillment });
  S.register('order-changes', { title: '기간·수거 변경', parent: 'rentals', pos: true, render: changes });
  S.register('order-problems', { title: '문제 해결', parent: 'rentals', pos: true, render: problems });
  S.register('order-assets', { title: '실물 문제 확인', parent: 'returns', pos: true, render: assetsPage });
  S.register('order-exchange', { title: '장비 교환', parent: 'rentals', pos: true, render: exchangePage });
  S.posFulfillment = { state, open, candidates, ensureFresh, error, errorBox, get vehicleNames() { return vehicleOptions(); }, vehicleName };
})();
