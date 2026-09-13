(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, U = S.posOrders, e = S.esc, b = P.button;
  const active = task => ['waiting', 'in_progress'].includes(task.status), names = { delivery: '배달', collection: '수거', refund: '발권처 환불' };
  let date = null, vehicle = '', taskDraft = null;
  const vehicles = () => D.snapshot.management?.settings.vehicles.length ? D.snapshot.management.settings.vehicles.map(v => [v.id, v.name]) : [...new Set(D.snapshot.tasks.map(t => t.vehicleId))].map(id => [id, id === 'demo-van-1' ? '1호 차량' : id === 'demo-van-2' ? '2호 차량' : id]);
  const driver = () => D.snapshot.actor.role === 'driver';
  function render() {
    date ||= D.today;
    const tasks = D.snapshot.tasks.filter(t => active(t) && t.date === date && (!vehicle || t.vehicleId === vehicle)).sort((a, b) => a.time.localeCompare(b.time));
    const body = '<div class="pos-form-grid">' + U.input('업무 날짜', 'dispatchDate', date, 'date', 'data-change="pos-dispatch-date"') + (driver() ? '<div class="pos-info">담당 차량 ' + e(D.snapshot.actor.vehicleId) + '</div>' : '<label class="so-field">담당 차량<select data-change="pos-dispatch-vehicle">' + [['', '전체 차량'], ...vehicles()].map(([id, label]) => '<option value="' + e(id) + '"' + (vehicle === id ? ' selected' : '') + '>' + e(label) + '</option>').join('') + '</select></label>') + '</div>' + P.pager(tasks, 'dispatch-tasks', task => P.row(task.time + ' · ' + (task.customer?.name || task.title) + ' · ' + names[task.kind], task.place + ' · ' + (vehicles().find(v => v[0] === task.vehicleId)?.[1] || task.vehicleId) + ' · 남은 물품 ' + (task.remainingAssetIds.length + task.unassignedQuantity) + '개', b('업무 처리', 'pos-task', task.id, driver() ? 'primary' : '')), innerHeight < 700 ? 2 : 4);
    return P.page('차량 운행', '배달·수거·입고를 담당 차량별로 처리합니다. 실제 이동한 수량만 기록하세요.', body, b('보관 물품 보기', 'pos-vehicle-stock') + '<div class="so-actions">' + b('최신 업무 확인', 'pos-refresh') + (!driver() ? b('배달할 팀 찾기', 'pos-dispatch-find', '', 'primary') : '') + '</div>');
  }
  S.change('pos-dispatch-date', value => { date = value; S.render(); });
  S.change('pos-dispatch-vehicle', value => { vehicle = value; S.render(); });
  function taskPage() {
    const task = D.snapshot.tasks.find(t => t.id === taskDraft?.id);
    if (!task) return P.page('업무를 다시 선택해 주세요', '', '<div class="so-actions">' + U.go('차량 업무', 'dispatch') + (!driver() ? b('리프트권 회수·재사용', 'pos-ticket-stock') : '') + '</div>');
    const physical = task.physicalAssets || [];
    const groups = D.snapshot.catalog.flatMap(product => {
      const ids = task.remainingAssetIds.filter(id => physical.some(a => a.id === id && a.sku === product.id));
      return ids.length ? [{ product, ids }] : [];
    });
    const line = group => {
      const quantity = taskDraft.counts[group.product.id] || 0;
      const step = (n, text) => '<button class="so-button pos-button" type="button" data-action="pos-task-step" data-id="' + e(group.product.id) + '" data-delta="' + n + '" aria-label="' + e(group.product.label + ' ' + text) + '">' + text + '</button>';
      return P.row(group.product.label + ' · 남음 ' + group.ids.length + group.product.unit, physical.filter(a => group.ids.includes(a.id)).map(a => a.location.kind === 'vehicle' ? '차량 보관' : a.location.kind === 'shop' ? '매장 보관' : '고객 보유').filter((x, i, rows) => rows.indexOf(x) === i).join(' · '), '<div class="pos-quantity">' + step(-1, '−') + '<output>' + quantity + '</output>' + step(1, '+') + '</div>');
    };
    const body = '<div class="pos-customer-strip"><strong>' + e(task.customer?.name || task.title) + '</strong><span>' + e(task.date + ' ' + task.time + ' · ' + task.place) + '</span></div>' + P.pager(groups, 'task-assets', line, innerHeight < 700 ? 2 : 4) + (task.unassignedQuantity ? '<p class="pos-label">미배정 ' + task.unassignedQuantity + '개 · 매장에서 준비·발권이 필요합니다.</p>' : '') + U.errorBox();
    const physicalButton = task.kind === 'delivery' ? b('실제 전달 확정', 'pos-task-complete', '', 'primary') : task.kind === 'collection' ? b('실제 수거 확정', 'pos-task-complete', '', 'primary') : b('발권처 환불 확인', 'pos-vendor-refund', task.id, 'primary');
    return P.page(names[task.kind] + ' 업무', '고객과 실제 물품을 확인한 뒤 처리하세요.', body, '<div class="so-actions">' + U.go('업무 목록', 'dispatch') + b('못 받음·고객 부재', 'pos-task-visit', task.id) + '</div><div class="so-actions">' + (!driver() && task.kind === 'delivery' ? b('매장 수령으로 변경', 'pos-task-cancel', task.id) : '') + physicalButton + '</div>');
  }
  function openTask(id) {
    const task = D.snapshot.tasks.find(t => t.id === id); taskDraft = { id, revision: D.snapshot.revision, counts: {} };
    for (const a of task.physicalAssets || []) if (task.remainingAssetIds.includes(a.id)) taskDraft.counts[a.sku] = (taskDraft.counts[a.sku] || 0) + 1;
    S.go('driver-task', { id });
  }
  S.action('pos-task', openTask); S.posDispatch = { openTask };
  S.action('pos-task-step', (sku, button) => { const task = D.snapshot.tasks.find(t => t.id === taskDraft.id), max = task.remainingAssetIds.filter(id => task.physicalAssets.some(a => a.id === id && a.sku === sku)).length; taskDraft.counts[sku] = Math.max(0, Math.min(max, (taskDraft.counts[sku] || 0) + Number(button.dataset.delta))); S.render(); });
  S.action('pos-task-complete', async () => {
    try {
      const task = D.snapshot.tasks.find(t => t.id === taskDraft.id);
      if (taskDraft.revision !== D.snapshot.revision) throw new Error('업무가 변경되었습니다. 최신 업무에서 수량을 다시 확인하세요.');
      const ids = Object.entries(taskDraft.counts).flatMap(([sku, count]) => task.physicalAssets.filter(a => a.sku === sku && task.remainingAssetIds.includes(a.id)).slice(0, count).map(a => a.id));
      if (!ids.length) throw new Error('처리한 수량이 0개입니다. 고객 부재·못 받음에서 다음 약속을 남겨 주세요.');
      await D.execute('ops.taskMove', { taskId: task.id, assetIds: ids });
      S.go('dispatch'); S.toast('실제 처리 수량을 기록했습니다. 남은 업무는 계속 표시합니다.');
    } catch (err) { U.error(err); }
  });
  S.action('pos-task-visit', id => {
    const task = D.snapshot.tasks.find(t => t.id === id);
    P.modal('못 받음·방문 결과', '<div class="pos-info">' + e(task.customer?.name || task.title) + ' · 물품 수량은 이동하지 않습니다.</div><div class="pos-form-grid">' + U.select('방문 결과', 'visitResult', [['absent', '고객 부재'], ['location_changed', '장소 변경'], ['none', '물품을 받지 못함']], 'absent') + U.input('다음 방문일', 'visitDate', task.date, 'date') + U.input('다음 시간', 'visitTime', task.time, 'time') + U.input('다음 장소', 'visitPlace', task.place) + '</div>' + U.errorBox(), b('취소', 'close') + b('방문 결과·다음 약속 저장', 'pos-task-visit-save', id, 'primary'));
  });
  S.action('pos-task-visit-save', async id => { try { await D.execute('ops.visit', { taskId: id, result: U.read('visitResult'), nextDate: U.read('visitDate'), nextTime: U.read('visitTime'), place: U.read('visitPlace') }); S.close(); S.go('dispatch'); } catch (err) { U.error(err); } });
  S.action('pos-task-cancel', id => P.modal('매장 수령으로 변경', '<div class="pos-info">담당 차량에 남은 미전달 물품을 실제로 매장에 내렸는지 확인하세요. 이미 전달한 물품은 그대로 유지됩니다.</div>' + U.errorBox(), b('취소', 'close') + b('실제 내림 확인·배달 해제', 'pos-task-cancel-save', id, 'primary')));
  S.action('pos-task-cancel-save', async id => { try { await D.execute('ops.deliveryCancel', { taskId: id, reason: '고객 매장 수령으로 변경', unload: true }); S.close(); S.go('dispatch'); } catch (err) { U.error(err); } });
  S.action('pos-dispatch-find', () => S.go('preparation'));
  S.action('pos-dispatch-order', id => S.posFulfillment.open('dispatch', id));
  S.action('pos-vehicle-stock', () => S.go('vehicle'));
  function vehicleStock() {
    const assets = driver() ? D.snapshot.vehicle?.assets || [] : D.snapshot.assets.filter(a => a.location.kind === 'vehicle' && (!vehicle || a.location.id === vehicle));
    const orders = (D.snapshot.orders || []).filter(o => o.totals.vehicleQuantity > 0);
    return P.page('차량 보관 물품', '고객에게 수거한 물품의 매장 입고는 실제 내린 뒤 확인합니다.', driver() ? '<div class="pos-info">' + e(D.snapshot.actor.vehicleId) + ' · 실제 차량 보관 ' + assets.length + '개</div>' + P.pager(D.snapshot.vehicle.totals.filter(t => t.current), 'driver-stock', t => P.row(t.label + ' ' + t.current + t.unit, '매장 적재 ' + t.fromShop + ' · 고객 회수 ' + t.fromCustomer + ' · 환불 대기 ' + t.refundPending + ' · 전달 가능 ' + t.availableToDeliver), U.pageSize()) : '<div class="pos-info">차량 보관 ' + assets.length + '개 · 회수 후 입고 대기 ' + orders.length + '팀</div>' + P.pager(orders, 'vehicle-return', o => P.row(o.customer.name, '매장 입고 대기 ' + o.totals.vehicleQuantity + '개', b('실제 입고 확인', 'pos-receive', o.id)), U.pageSize()), '<div class="so-actions">' + U.go('차량 업무', 'dispatch') + (!driver() ? b('리프트권 회수·재사용', 'pos-ticket-stock') : '') + '</div>');
  }
  S.action('pos-vendor-refund', id => { const task = D.snapshot.tasks.find(t => t.id === id); P.modal('발권처 환불 기록', '<div class="pos-info">실제로 발권처에 반환하고 확정한 금액만 기록합니다.</div>' + U.input('확정 환불 금액 (원)', 'vendorAmount', '', 'number', 'min="0" inputmode="numeric"') + U.errorBox(), b('취소', 'close') + b('발권처 반환·환불 확정', 'pos-vendor-refund-save', task.refundId, 'primary')); });
  S.action('pos-vendor-refund-save', async id => { try { const row = D.snapshot.refunds.find(r => r.id === id); if (taskDraft.revision !== D.snapshot.revision) throw new Error('업무가 변경되었습니다. 최신 업무에서 수량을 다시 확인하세요.'); if (U.read('vendorAmount') === '') throw new Error('발권처에서 확정한 금액을 입력하세요.'); await D.execute('refund.complete', { id, assetIds: Object.entries(taskDraft.counts).flatMap(([sku, count]) => D.snapshot.tasks.find(t => t.id === taskDraft.id).physicalAssets.filter(a => a.sku === sku && row.assetIds.includes(a.id) && !row.completedAssetIds.includes(a.id) && !row.cancelledAssetIds.includes(a.id)).slice(0, count).map(a => a.id)), amountWon: Number(U.read('vendorAmount')) }); S.close(); S.go('dispatch'); } catch (err) { U.error(err); } });
  S.register('dispatch', { title: '차량 운행', pos: true, render });
  S.register('vehicle', { title: '차량 보관', parent: 'dispatch', pos: true, render: vehicleStock });
  S.register('driver-task', { title: '배달·수거 처리', parent: 'dispatch', pos: true, render: taskPage });
})();
