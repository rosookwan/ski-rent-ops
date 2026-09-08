(() => {
  'use strict';
  const S = window.SkiOps, api = S.returns;
  const { head, panel, button, link, status, icon, esc, date, money, field, select } = S;
  const cache = new Map(api.initialOrders.map(order => [order.id, order]));
  const labels = { awaiting_issue: ['지급 전', 'grey'], in_use: ['이용 중', 'blue'], partial_return: ['일부 반납', 'orange'], awaiting_shop: ['매장 확인 대기', 'purple'], returned: ['반납 완료', 'green'], no_return_required: ['회수 대상 없음', 'grey'] };
  const movementLabels = { assignVehicle: '담당 차량 변경', create: '접수', issue: '실제 지급', collect: '차량 수거', receiveDirect: '매장 직접반납', confirmVehicle: '차량 인계 확인', planReturn: '반납 일정 변경', correctReturn: '반납 수량 정정', undoReturn: '반납 기록 취소' };
  const filters = [['all', '전체'], ['direct', '직접반납'], ['liftUnreturned', '리프트권 미반납'], ['overdue', '기한 경과'], ['awaitingShop', '매장 확인 대기']];
  const listCache = new Map(), vehicleLog = new Map();
  let listLoading = '', generation = 0, operation = null, busy = false, lastDriver = null, nextOrder = 100;
  const current = id => cache.get(id || S.state.params.id);
  const dayOf = at => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  const timeOf = at => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at));
  const badge = order => status(...labels[order.status]);
  const quantity = (n, item) => n + (item.unit || '개');
  const method = item => item.returnPlan.method === 'direct' ? '매장 직접' : '차량 수거';
  const count = (order, key) => order.items.reduce((sum, item) => sum + item[key], 0);
  const planText = item => date(item.returnPlan.date) + ' · ' + method(item);
  const itemText = (items, key) => items.filter(item => item[key] > 0).map(item => esc(item.label) + ' <b>' + quantity(item[key], item) + '</b>').join(' · ') || '없음';
  const onDate = () => S.state.filters.returnDate || 'all';
  const listKey = () => onDate() + ':' + (S.state.tabs.returns || 'all');
  const searchRows = rows => {
    const q = (S.state.filters.returnQuery || '').replace(/[\s-]/g, '').toLowerCase();
    return rows.filter(order => !q || [order.id, order.customer.name, order.customer.phone || ''].some(v => v.replace(/[\s-]/g, '').toLowerCase().includes(q)));
  };
  function syncBase(order) {
    const base = S.data.orders.find(row => row.id === order.id);
    if (!base) return;
    const equipment = order.items.filter(item => item.category !== 'liftTicket');
    base.issued = equipment.reduce((n, item) => n + item.issuedQuantity, 0);
    base.returned = equipment.reduce((n, item) => n + item.shopQuantity, 0);
    base.collected = equipment.reduce((n, item) => n + item.vehicleQuantity, 0);
    base.items = equipment.map(item => [item.label, item.plannedQuantity, item.shopQuantity]);
    const names = { awaiting_issue: base.items.length ? '수령 예정' : '리프트권 전달 대기', in_use: '대여 중', partial_return: '일부 반납', awaiting_shop: '매장 확인 대기', returned: '반납 완료', no_return_required: '반납 완료' };
    base.status = names[order.status]; base.color = labels[order.status][1];
  }
  function remember(order) { cache.set(order.id, order); syncBase(order); }
  async function refresh() {
    const snapshot = await api.store.sync(0);
    for (const order of snapshot.orders) if (S.data.orders.some(base => base.id === order.id)) remember(order);
    generation++; listCache.clear(); listLoading = '';
  }
  function listRows(rows) {
    return searchRows(rows).map(order => '<tr><td><strong>' + esc(order.customer.name) + '</strong><small>' + esc(order.customer.phone || '') + ' · ' + esc(order.id) + '</small></td><td>' + badge(order) + '</td><td>' + itemText(order.items, 'customerQuantity') + (order.totals.unissuedQuantity ? '<small>지급 전 ' + order.totals.unissuedQuantity + '개 별도</small>' : '') + '</td><td>' + itemText(order.items, 'vehicleQuantity') + '</td><td>' + [...new Set(order.items.filter(item => item.customerQuantity || item.unissuedQuantity).map(item => planText(item)))].join('<br>') + '</td><td>' + link('반납 확인', 'return-detail', order.id, 'small') + '</td></tr>').join('') || '<tr><td colspan="6"><p class="so-empty">조건에 맞는 반납 내역이 없습니다.</p></td></tr>';
  }
  async function loadLists() {
    if (listCache.has(listKey()) || listLoading === onDate()) return;
    const selectedDate = onDate(), version = generation;
    listLoading = selectedDate;
    try {
      const results = await Promise.all(filters.map(async ([filter]) => [filter, await api.store.list({ filter, ...(selectedDate === 'all' ? {} : { onDate: selectedDate }) })]));
      if (version !== generation) return;
      for (const [filter, rows] of results) {
        let visible = rows.filter(order => cache.has(order.id));
        if (filter === 'all') {
          const included = new Set(visible.map(order => order.id));
          visible = visible.concat([...cache.values()].filter(order => !included.has(order.id) && (order.complete || order.status === 'awaiting_issue') && (selectedDate === 'all' || order.items.some(item => item.returnPlan.date === selectedDate))));
        }
        listCache.set(selectedDate + ':' + filter, visible);
      }
      if (S.state.page === 'returns' && selectedDate === onDate()) S.render();
    } catch (error) { S.toast(error.message); }
    finally { if (listLoading === selectedDate) listLoading = ''; }
  }
  function renderList() {
    const rows = listCache.get(listKey());
    return head('반납 확인', '고객에게 남은 물품과 차량 인수분을 나눠 확인하세요.', link(icon('plus') + '새 대여 접수', 'intake', '', 'primary')) +
      '<div class="so-filter-panel">' + S.tabs(filters.map(([id, label]) => [id, label + '<span class="so-tab-count">' + (listCache.get(onDate() + ':' + id)?.length ?? '–') + '</span>']), 'all') +
      '<div class="so-toolbar"><label class="so-field so-search">고객 찾기<input type="search" data-search="returns" placeholder="이름, 연락처 또는 접수번호" value="' + esc(S.state.filters.returnQuery || '') + '"></label>' + select('반납 예정일', [['all', '전체 날짜'], [S.data.today, '오늘'], [S.data.day(1), '내일']], onDate(), 'data-change="return-date"') + button(icon('rotate-ccw') + '초기화', 'return-reset', '', 'quiet') + '</div></div>' +
      panel('반납 목록', '<div class="so-table-wrap"><table class="so-responsive-table so-return-table"><thead><tr><th>고객 / 접수번호</th><th>상태</th><th>고객에게 남은 물품</th><th>차량 보관 · 확인 대기</th><th>예정일 · 방법</th><th></th></tr></thead><tbody id="so-return-rows">' + (rows ? listRows(rows) : '<tr><td colspan="6"><p class="so-empty">반납 내역을 불러오고 있어요.</p></td></tr>') + '</tbody></table></div>', '<span class="so-muted">현재 보유 수량 기준</span>');
  }
  function summary(order) {
    return '<div class="so-panel-pad so-stack">' + badge(order) + '<div class="so-return-summary"><div><span>고객에게 남음</span><strong>' + count(order, 'customerQuantity') + '</strong></div><div><span>차량 보관</span><strong>' + count(order, 'vehicleQuantity') + '</strong></div><div><span>매장 확인</span><strong>' + count(order, 'shopQuantity') + '</strong></div></div>' +
      '<p class="so-muted">지급 전 ' + count(order, 'unissuedQuantity') + '개는 미반납 수량에 포함하지 않습니다.</p><div class="so-return-buttons">' +
      (count(order, 'unissuedQuantity') ? button('실제 지급 확인', 'return-issue', order.id, 'primary') : '') +
      button('매장 직접반납', 'return-direct', order.id, 'primary') + button('차량 인계 확인', 'return-confirm', order.id, 'soft') + button('반납 수량 정정', 'return-correct', order.id) + '</div><p class="so-note">차량 수거 후에는 매장이 수량을 확인해야 반납이 완료됩니다.</p></div>';
  }
  function renderDetail() {
    const order = current();
    if (!order) return head('반납 확인') + '<p class="so-empty">접수를 찾을 수 없습니다.</p>' + link('목록으로', 'returns');
    return head(esc(order.customer.name) + ' · 반납 확인', esc(order.id) + ' · ' + esc(order.customer.phone || ''), link(icon('arrow-left') + '목록으로', 'returns'), '반납 상세') +
      '<div class="so-main-detail so-return-detail"><div class="so-stack">' + panel('품목별 반납 현황', '<div class="so-table-wrap"><table class="so-responsive-table so-return-items"><thead><tr><th>품목 / 지급</th><th>고객 보유</th><th>차량 보관</th><th>매장 확인</th><th>반납 예정</th><th></th></tr></thead><tbody>' + order.items.map(item => '<tr><td><strong>' + esc(item.label) + '</strong><small>지급 ' + quantity(item.issuedQuantity, item) + (item.unissuedQuantity ? ' · 지급 전 ' + quantity(item.unissuedQuantity, item) : '') + '</small></td><td><strong class="' + (item.customerQuantity ? 'so-payable' : 'so-zero') + '">' + quantity(item.customerQuantity, item) + '</strong></td><td>' + quantity(item.vehicleQuantity, item) + '</td><td>' + quantity(item.shopQuantity, item) + '</td><td>' + planText(item) + '<small>' + esc(item.returnPlan.slot || item.returnPlan.time || item.returnPlan.place || '') + '</small></td><td>' + (item.customerQuantity || item.unissuedQuantity ? button('일정 변경', 'return-plan', order.id + '|' + item.id, 'small') : status('확인 완료', 'green')) + '</td></tr>').join('') + '</tbody></table></div>') +
      panel('처리·변경 이력', '<div id="so-return-history" class="so-panel-pad"><p class="so-muted">이력을 불러오고 있어요.</p></div>') + '</div>' + panel('반납 요약', summary(order)) + '</div>';
  }
  async function mountDetail() {
    const order = current(); if (!order) return;
    for (const [action, enabled] of [['return-direct', count(order, 'customerQuantity') > 0], ['return-confirm', order.pendingConfirmations.length > 0], ['return-correct', order.recentMovements.length > 0]]) {
      const b = S.$('#so-page [data-action="' + action + '"]'); if (b) b.disabled = !enabled;
    }
    const events = await api.store.history(order.id);
    if (S.state.page !== 'return-detail' || S.state.params.id !== order.id) return;
    S.$('#so-return-history').innerHTML = '<ul class="so-timeline">' + events.slice().reverse().map(event => {
      const items = event.adjustment ? event.adjustment.after.map(after => ({ itemId: after.itemId, quantity: (event.adjustment.before.find(before => before.itemId === after.itemId)?.quantity ?? 0) + ' → ' + after.quantity })) : event.payload.items || [];
      const movement = order.recentMovements.find(m => m.id === event.requestId);
      return '<li><time>' + date(dayOf(event.at)) + '<br>' + timeOf(event.at) + '</time><div><strong>' + movementLabels[event.type] + '</strong><p>' + items.filter(item => 'quantity' in item).map(item => esc(order.items.find(i => i.id === item.itemId)?.label || '') + ' ' + item.quantity).join(' · ') + '</p><small>' + (event.actor.role === 'driver' ? '1호 차량' : '매장') + '</small></div>' + (movement ? button('정정', 'return-correct', order.id + '|' + movement.id, 'quiet small') : '') + '</li>';
    }).join('') + '</ul>';
  }
  const errorMessage = message => { const el = S.$('#so-return-error'); if (el) { el.textContent = message; el.hidden = false; } else S.toast(message); };
  function inputRows(op) {
    return '<div class="so-return-picker">' + op.rows.map((row, index) => '<div class="so-return-pick ' + (op.partial && row.value ? 'is-missing' : '') + '">' +
      (op.partial ? '<button type="button" data-action="return-missing" data-id="' + index + '"><span>' + esc(row.label) + ' · ' + row.limit + row.unit + '</span><span>' + (row.value ? '일부 미수거' : '모두 받음') + '</span></button>' : '<strong>' + esc(row.label) + '</strong>') +
      '<div class="so-return-stepper"><span>' + (op.partial ? '못 받은 수량' : '이번 확인 수량') + '</span><button type="button" data-action="return-step" data-id="' + index + ':-1" aria-label="' + esc(row.label) + ' 수량 줄이기" ' + (!row.value ? 'disabled' : '') + '>−</button><input aria-label="' + esc(row.label) + (op.partial ? ' 못 받은 수량' : ' 확인 수량') + '" data-return-input="' + index + '" type="number" min="0" max="' + row.limit + '" step="1" value="' + row.value + '" ' + (op.partial ? 'readonly' : '') + '><button type="button" data-action="return-step" data-id="' + index + ':1" aria-label="' + esc(row.label) + ' 수량 늘리기" ' + (row.value >= row.limit ? 'disabled' : '') + '>+</button></div><small>최대 ' + row.limit + row.unit + '</small></div>').join('') + '</div>';
  }
  function showOperation() {
    const op = operation, order = op.order;
    let body = '<p><strong>' + esc(order.customer.name) + '</strong> · ' + esc(order.id) + '</p>';
    if (op.kind === 'planReturn') {
      const item = order.items.find(item => item.id === op.itemId), plan = item.returnPlan;
      body += '<h3>' + esc(item.label) + '</h3><div class="so-form-grid">' + field('반납 예정일', plan.date, 'date', 'data-return-plan="date"') + select('반납 방법', [['direct', '매장 직접'], ['vehicle', '차량 수거']], plan.method, 'data-return-plan="method"') + field('반납 시간', plan.time || '', 'time', 'data-return-plan="time"') + field('장소', plan.place || '', 'text', 'data-return-plan="place"') + '</div><p class="so-note">이 품목의 예정만 바뀝니다. 이용 기간과 요금은 그대로입니다.</p>';
    } else if (op.kind === 'undoReturn') {
      body += '<p>선택한 ' + movementLabels[op.movement.type] + ' 기록을 취소할까요?</p><p class="so-note">' + (op.movement.type === 'confirmVehicle' ? '매장 확인 수량을 차량 보관으로 되돌립니다.' : '이 기록에서 받은 수량을 고객 보유로 되돌립니다. 변경한 반납 예정은 유지합니다.') + '</p>';
    } else {
      if (op.kind === 'confirmVehicle' && op.collections.length > 1) body += select('차량 인수 기록', op.collections.map(id => [id, date(dayOf(order.recentMovements.find(m => m.id === id).at)) + ' ' + timeOf(order.recentMovements.find(m => m.id === id).at) + ' 수거']), op.collectionId, 'data-change="return-collection"');
      if (op.kind === 'correctReturn') {
        body += select('정정할 기록', order.recentMovements.map(m => [m.id, date(dayOf(m.at)) + ' ' + timeOf(m.at) + ' · ' + movementLabels[m.type]]), op.movement.id, 'data-change="return-movement"') + '<p class="so-note">차감할 수량이 아니라, 이 기록에서 실제로 받은 <b>새 총수량</b>을 입력하세요.</p>';
      }
      if (op.kind === 'collect') body += '<p class="so-muted">' + (op.partial ? '못 받은 품목을 누르고 수량을 맞춰 주세요. 남은 의류·리프트권은 같은 예정일의 매장 직접반납으로 바뀝니다.' : '이번 방문의 물품만 수거합니다. 다른 날짜의 물품은 포함하지 않습니다.') + '</p>';
      body += inputRows(op);
      if (op.kind === 'collect') body += '<div id="so-return-totals" class="so-return-totals"></div>';
      if (op.kind === 'receiveDirect') body += '<p class="so-muted">지금 매장으로 가져온 수량만 입력하세요. 차량 인수분은 ‘차량 인계 확인’에서 처리합니다.</p>';
    }
    body += '<p id="so-return-error" class="so-guest-error" role="alert" hidden></p><div class="so-dialog-actions">' + button('취소', 'close') + (op.kind === 'correctReturn' ? button('이 기록 취소', 'return-undo-open', order.id + '|' + op.movement.id, 'quiet') : '') + button(op.kind === 'collect' ? '수거 내역 저장' : op.kind === 'planReturn' ? '예정 변경' : op.kind === 'undoReturn' ? '기록 취소' : '확인한 수량 저장', 'return-apply', '', 'primary') + '</div><p class="so-preview-note">이 브라우저에서만 반영되며 새로고침하면 초기화됩니다.</p>';
    S.modal(op.title, body); updateTotals();
  }
  function updateTotals() {
    if (operation?.kind !== 'collect') return;
    const received = operation.rows.reduce((n, row) => n + (operation.partial ? row.limit - row.value : row.value), 0);
    const total = operation.rows.reduce((n, row) => n + row.limit, 0);
    const el = S.$('#so-return-totals'); if (el) el.innerHTML = '<span>이번에 받음 ' + received + '개</span><span>고객에게 남음 ' + (total - received) + '개</span>';
  }
  async function openOperation(kind, value, extra = {}) {
    if (busy) return;
    const [orderId, detailId] = value.split('|');
    try {
      const order = await api.store.get(orderId); remember(order);
      const op = { kind, order, rows: [], command: null, ...extra };
      operation = op;
      let items = [];
      if (kind === 'planReturn') { op.itemId = detailId; op.title = '품목별 반납 예정 변경'; }
      if (kind === 'receiveDirect' || kind === 'issue') {
        const key = kind === 'issue' ? 'unissuedQuantity' : 'customerQuantity';
        op.title = kind === 'issue' ? '실제 지급 수량 확인' : '매장 직접반납 · 추가 반납';
        items = order.items.filter(item => item[key] > 0).map(item => ({ item, limit: item[key], value: kind === 'issue' ? item[key] : 0 }));
      }
      if (kind === 'confirmVehicle') {
        op.title = '차량 인계 · 매장 확인'; op.collections = [...new Set(order.pendingConfirmations.map(row => row.collectionId))];
        op.collectionId = detailId || op.collections[0];
        items = order.pendingConfirmations.filter(row => row.collectionId === op.collectionId).map(row => ({ item: order.items.find(item => item.id === row.itemId), limit: row.quantity, value: row.quantity }));
      }
      if (kind === 'correctReturn' || kind === 'undoReturn') {
        op.movement = order.recentMovements.find(m => m.id === detailId) || order.recentMovements.at(-1);
        if (!op.movement) { S.toast('정정할 반납 기록이 없습니다.'); return; }
        op.title = kind === 'undoReturn' ? '반납 기록 되돌리기' : '반납 수량 정정';
        items = op.movement.items.map(row => ({ item: order.items.find(item => item.id === row.itemId), limit: order.items.find(item => item.id === row.itemId).returnTarget, value: row.quantity }));
      }
      if (kind === 'collect') {
        op.title = op.partial ? '일부 반납 · 못 받은 품목' : '전체 수거 확인';
        items = op.job.targets.map(row => ({ item: order.items.find(item => item.id === row.itemId), limit: row.quantity, value: op.partial ? 0 : row.quantity }));
      }
      op.rows = items.map(({ item, limit, value }) => ({ id: item.id, label: item.label, unit: item.unit, limit, value }));
      if (!op.rows.length && !['planReturn', 'undoReturn'].includes(kind)) { S.toast('지금 확인할 수량이 없습니다.'); return; }
      showOperation();
    } catch (error) { S.toast(error.message); }
  }
  function readInputs() {
    for (const input of S.root.querySelectorAll('[data-return-input]')) {
      const row = operation.rows[Number(input.dataset.returnInput)], value = Number(input.value);
      if (!input.value.trim() || !Number.isSafeInteger(value) || value < 0 || value > row.limit) throw new Error(row.label + ' 수량은 0~' + row.limit + ' 사이의 정수로 입력해 주세요.');
      row.value = value;
    }
  }
  function payload(op) {
    if (op.kind === 'undoReturn') return { movementId: op.movement.id };
    if (op.kind === 'planReturn') {
      const read = key => S.$('[data-return-plan="' + key + '"]').value;
      const previous = op.order.items.find(item => item.id === op.itemId).returnPlan;
      const time = read('time') || null;
      return { items: [{ itemId: op.itemId, returnPlan: { date: read('date'), method: read('method'), time, slot: time === previous.time ? previous.slot : null, place: read('method') === 'direct' ? '매장' : read('place') || '장소 확인 필요' } }] };
    }
    readInputs();
    if (op.kind === 'collect') return api.prepareVehicleReturn(op.order, op.job.targets, op.rows.map(row => ({ itemId: row.id, quantity: op.partial ? row.value : row.limit - row.value })));
    const items = op.rows.filter(row => op.kind === 'correctReturn' || row.value > 0).map(row => ({ itemId: row.id, quantity: row.value }));
    if (!items.length) throw new Error('이번에 확인한 수량을 한 개 이상 입력해 주세요.');
    return { items, ...(op.kind === 'confirmVehicle' ? { collectionId: op.collectionId } : {}), ...(op.kind === 'correctReturn' ? { movementId: op.movement.id } : {}) };
  }
  async function applyOperation() {
    if (busy || !operation) return;
    const op = operation;
    try {
      if (!op.command) op.command = api.newCommand(op.kind, op.order, payload(op));
      busy = true;
      S.root.querySelectorAll('#so-dialog button').forEach(b => { b.disabled = true; });
      const client = op.kind === 'collect' || op.driver ? api.driver : api.store;
      const result = await client.execute(op.command);
      if (op.kind === 'collect') {
        lastDriver = { orderId: op.order.id, movementId: result.requestId };
        vehicleLog.set(op.job.id, { ...op.job, movementId: result.requestId, status: 'collected', urgent: false, ack: true, items: result.order.items.filter(item => op.job.targets.some(row => row.itemId === item.id)).map(item => [item.label, op.command.payload.items.find(row => row.itemId === item.id)?.quantity || 0]) });
      }
      if (op.kind === 'undoReturn') {
        for (const [id, job] of vehicleLog) if (job.orderId === op.order.id) vehicleLog.delete(id);
        if (op.driver) lastDriver = null;
      }
      await refresh(); S.close(); operation = null; S.render();
      S.toast('반영했습니다. 새로고침하면 샘플 데이터로 돌아갑니다.');
    } catch (error) {
      // Keep the same request id after uncertain errors; stale versions require a new review.
      if (error.code === 'VERSION_CONFLICT') {
        await refresh(); S.close(); operation = null; S.render(); S.toast('내역이 바뀌었습니다. 최신 수량을 확인하고 다시 처리해 주세요.');
      } else { op.command = error.code && error.code !== 'CONNECTION_ERROR' ? null : op.command; errorMessage(error.message); }
    } finally {
      busy = false;
      S.root.querySelectorAll('#so-dialog button').forEach(b => { b.disabled = false; });
      if (operation) for (const b of S.root.querySelectorAll('[data-action=return-step]')) { const [index, delta] = b.dataset.id.split(':').map(Number), row = operation.rows[index]; b.disabled = delta < 0 ? row.value <= 0 : row.value >= row.limit; }
      if (operation) { const apply = S.$('[data-action="return-apply"]'); if (apply) apply.disabled = false; }
    }
  }
  function displayItems(items, key) {
    const rows = new Map();
    for (const item of items) { const label = item.category === 'liftTicket' ? '리프트권' : item.label; rows.set(label, (rows.get(label) || 0) + item[key]); }
    return [...rows];
  }
  function vehicleJobs() {
    const result = [];
    for (const order of cache.values()) {
      const base = S.data.orders.find(row => row.id === order.id); if (!base) continue;
      if (base.pickupMethod === 'delivery') {
        result.push({ id: order.id + ':delivery', orderId: order.id, type: 'delivery', name: base.name, phone: base.phone, time: base.pickupTime, place: base.deliveryPlace, detail: '주차장 입구 · 고객과 통화 후 만남', items: displayItems(order.items, 'plannedQuantity'), status: 'waiting', dateOffset: Math.round((Date.parse(base.pickup) - Date.parse(S.data.today)) / 86400000) });
      }
      const groups = new Map();
      for (const item of order.items.filter(item => item.customerQuantity > 0 && item.returnPlan.method === 'vehicle')) {
        const plan = item.returnPlan, key = [order.id, plan.date, plan.time || '16:30', plan.place || base.place].join(':');
        if (!groups.has(key)) groups.set(key, { id: key, orderId: order.id, type: 'return', name: base.name, phone: base.phone, time: plan.time || '16:30', returnDate: plan.date, returnPreset: plan.slot && plan.slot !== '직접 시간' ? 'preset' : 'manual', returnLabel: plan.slot, place: plan.place || base.place, detail: base.note, items: [], targets: [], status: 'waiting', urgent: !!S.notifications?.pendingForOrder(order.id), ack: false, dateOffset: Math.round((Date.parse(plan.date) - Date.parse(S.data.today)) / 86400000) });
        const job = groups.get(key); const label = item.category === 'liftTicket' ? '리프트권' : item.label, displayed = job.items.find(row => row[0] === label); if (displayed) displayed[1] += item.customerQuantity; else job.items.push([label, item.customerQuantity]); job.targets.push({ itemId: item.id, quantity: item.customerQuantity });
      }
      result.push(...groups.values());
    }
    for (const [id, job] of vehicleLog) if (!result.some(row => row.id === id)) { const order = current(job.orderId); result.push({ ...job, status: order.complete ? 'returned' : 'collected', storeConfirmed: !order.pendingConfirmations.some(row => row.collectionId === job.movementId), remainingText: order.items.filter(item => item.customerQuantity > 0).map(item => item.label + ' ' + quantity(item.customerQuantity, item)).join(' · ') }); }
    return result;
  }
  function dispatchJobs() {
    const result = vehicleJobs().filter(job => job.dateOffset === 0 && job.status !== 'collected' && job.status !== 'returned').map(job => ({ ...job, slot: job.returnLabel || '직접 시간', statusText: job.type === 'delivery' ? '배달 대기' : '수거 대기', color: job.type === 'delivery' ? 'blue' : 'orange' }));
    for (const order of cache.values()) {
      const direct = order.items.filter(item => item.customerQuantity > 0 && item.returnPlan.method === 'direct' && item.returnPlan.date === S.data.today);
      if (direct.length) result.push({ id: order.id + ':direct', orderId: order.id, type: 'direct', time: direct[0].returnPlan.time || '시간 확인', slot: direct[0].returnPlan.slot || '매장 방문', place: '스키샵', name: order.customer.name, items: direct.map(item => [item.label, item.customerQuantity]), statusText: '매장 직접', color: 'grey' });
      if (order.pendingConfirmations.length) result.push({ id: order.id + ':pending', orderId: order.id, type: 'return', time: timeOf(order.pendingConfirmations[0].collectedAt), slot: '차량 수거 완료', place: '1호 차량 → 매장', name: order.customer.name, items: order.items.filter(item => item.vehicleQuantity > 0).map(item => [item.label, item.vehicleQuantity]), statusText: '매장 확인 대기', color: 'purple' });
    }
    return result.sort((a, b) => a.time.localeCompare(b.time));
  }
  function closingTickets() {
    const orders = [...cache.values()].filter(order => order.items.some(item => item.category === 'liftTicket'));
    let confirmed = 0, confirmedValue = 0, outstanding = 0, inVehicle = 0;
    for (const order of orders) {
      const tickets = order.items.filter(item => item.category === 'liftTicket');
      outstanding += tickets.reduce((n, item) => n + item.returnTarget - item.shopQuantity, 0);
      inVehicle += tickets.reduce((n, item) => n + item.vehicleQuantity, 0);
      for (const movement of order.recentMovements.filter(m => m.type !== 'collect' && dayOf(m.at) === S.data.today)) for (const row of movement.items) {
        const item = tickets.find(item => item.id === row.itemId); if (item) { confirmed += row.quantity; confirmedValue += row.quantity * item.recoveryValueWon; }
      }
    }
    return panel('리프트권 회수', '<div class="so-lift-summary">' + [['오늘 매장 확인', confirmed + '매'], ['현재 미반납', outstanding + '매'], ['회수 기준 금액', money(confirmedValue)]].map(([label, value]) => '<div><span>' + label + '</span><strong>' + value + '</strong></div>').join('') + '</div><p class="so-lift-note">매장 확인분 기준 · 차량 보관 ' + inVehicle + '매는 미반납에 포함 · 고객 환불이나 현금 수입이 아닙니다.</p><div class="so-table-wrap"><table class="so-responsive-table"><thead><tr><th>고객 / 접수</th><th>리프트권</th><th>실제 지급</th><th>매장 확인</th><th>미반납</th><th></th></tr></thead><tbody>' + orders.flatMap(order => order.items.filter(item => item.category === 'liftTicket').map(item => '<tr><td><strong>' + esc(order.customer.name) + '</strong><small>' + order.id + '</small></td><td>' + esc(item.label) + '<small>' + date(item.returnPlan.date) + ' 반납</small></td><td>' + item.issuedQuantity + '매</td><td>' + item.shopQuantity + '매</td><td>' + (item.returnTarget - item.shopQuantity) + '매</td><td>' + link('반납 확인', 'return-detail', order.id, 'small') + '</td></tr>')).join('') + '</tbody></table></div><p class="so-section-footer">정정·취소는 원래 확인일의 회수 수량과 기준 금액에 반영합니다.</p>');
  }
  async function saveIntake() {
    if (busy) return;
    const draft = window.SkiIntake?.draft(); if (!draft) return;
    if (draft.error) { S.toast(draft.error); return; }
    const orderId = 'R-' + nextOrder++;
    try {
      busy = true;
      const result = await api.store.execute(api.newCommand('create', { id: orderId, version: 0 }, draft.payload));
      S.data.orders.unshift({ ...draft.base, id: orderId }); remember(result.order); window.SkiOps.workflow?.importOrder(result.order);
      generation++; listCache.clear(); window.SkiIntake.saved(orderId);
      S.modal('접수 내용을 저장했어요', '<p>' + esc(draft.base.name) + ' · ' + orderId + '</p><p class="so-note">실제 물품을 전달할 때 지급 수량을 확인해 주세요. 지급 전 물품은 미반납으로 계산하지 않습니다.</p>' + (draft.earlyReturn ? '<p>마지막 수거 예정과 다른 수량이 있습니다. 지급한 수량 전체를 반납 대상으로 기록했으며, 먼저 돌려받는 물품은 반납 확인에서 따로 처리해 주세요.</p>' : '') + '<div class="so-dialog-actions">' + button('계속 보기', 'close') + link('지급·반납 확인', 'return-detail', orderId, 'primary') + '</div><p class="so-preview-note">이 브라우저의 체험 데이터입니다. 실제 저장·결제·발권을 실행하지 않습니다.</p>');
    } catch (error) { S.toast(error.message); } finally { busy = false; }
  }
  for (const [action, kind] of [['return-direct', 'receiveDirect'], ['return-issue', 'issue'], ['return-confirm', 'confirmVehicle'], ['return-plan', 'planReturn'], ['return-correct', 'correctReturn'], ['return-undo-open', 'undoReturn']]) S.action(action, value => openOperation(kind, value));
  S.action('return-apply', applyOperation);
  S.action('return-step', value => {
    if (busy) return;
    try { readInputs(); } catch (error) { errorMessage(error.message); return; }
    const [index, delta] = value.split(':').map(Number), row = operation.rows[index]; row.value = Math.max(0, Math.min(row.limit, row.value + delta)); operation.command = null; showOperation();
  });
  S.action('return-missing', index => { if (busy) return; const row = operation.rows[Number(index)]; row.value = row.value ? 0 : row.limit; operation.command = null; showOperation(); });
  S.change('return-collection', id => openOperation('confirmVehicle', operation.order.id + '|' + id));
  S.change('return-movement', id => openOperation('correctReturn', operation.order.id + '|' + id));
  S.action('return-driver-undo', () => { if (lastDriver) openOperation('undoReturn', lastDriver.orderId + '|' + lastDriver.movementId, { driver: true }); });
  S.search('returns', q => { S.state.filters.returnQuery = q; S.$('#so-return-rows').innerHTML = listRows(listCache.get(listKey()) || []); S.icons(); });
  S.change('return-date', value => { S.state.filters.returnDate = value; S.render(); });
  S.action('return-reset', () => { S.state.filters.returnDate = 'all'; S.state.filters.returnQuery = ''; S.state.tabs.returns = 'all'; S.render(); });
  S.action('rental-return', id => openOperation('receiveDirect', id));
  S.action('rental-schedule', id => S.go('return-detail', { id }));
  S.returnUI = { current, refresh, saveIntake, vehicleJobs, dispatchJobs, closingTickets,
    collect: (job, partial) => openOperation('collect', job.orderId, { job, partial }),
    ackJob: id => { const job = vehicleJobs().find(row => row.id === id); if (job) S.notifications?.acknowledgeOrder(job.orderId); },
    undoButton: () => lastDriver ? button('최근 수거 취소', 'return-driver-undo', '', 'small') : '',
    balances: id => { const order = current(id); return order ? itemText(order.items, 'customerQuantity') : ''; }
  };
  for (const order of cache.values()) syncBase(order);
  S.register('returns', { title: '반납 확인', render: renderList, mount: loadLists });
  S.register('return-detail', { title: '반납 상세', parent: 'returns', render: renderDetail, mount: mountDetail });
})();
