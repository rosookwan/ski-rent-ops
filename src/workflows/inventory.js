(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./common.js'), require('./reservations.js'));
  else root.SkiWorkflowInventory = factory(root.SkiWorkflowCommon, root.SkiWorkflowReservations);
})(globalThis, function (C, B) {
  'use strict';
  const same = (a, b) => a.kind === b.kind && a.id === b.id;
  function location(value, shopId) {
    C.keys(value, ['kind', 'id']); C.oneOf(value.kind, ['shop', 'vehicle', 'customer', 'vendor']); C.id(value.id);
    if (value.kind === 'shop' && value.id !== shopId) C.fail('FORBIDDEN', '다른 매장으로 이동할 수 없습니다.');
    return C.copy(value);
  }
  function ticket(state, value, sku) {
    C.keys(value, ['validFrom', 'validTo', 'acceptedTypes', 'transferable', 'vendorId']);
    const validFrom = C.instant(value.validFrom), validTo = C.instant(value.validTo);
    if (validTo <= validFrom || typeof value.transferable !== 'boolean') C.fail('INVALID_INPUT', '권의 실제 유효 조건을 확인해 주세요.');
    const acceptedTypes = C.ids(value.acceptedTypes);
    if (acceptedTypes.some(id => C.find(state.catalog, id).kind !== 'liftTicket') || !acceptedTypes.includes(sku.id)) C.fail('INVALID_INPUT', '사용 가능한 권종을 확인해 주세요.');
    return { validFrom, validTo, acceptedTypes, transferable: value.transferable, vendorId: C.id(value.vendorId) };
  }
  function capture(state, assets) {
    const assetIds = assets.map(a => a.id);
    return { assets: C.copy(assets), allocations: C.copy(state.allocations.filter(a => assetIds.includes(a.assetId))) };
  }
  function record(state, context, kind, assets, from, to, before, extra = {}) {
    const movement = { id: 'movement-' + (state.revision + 1) + '-' + (state.movements.length + 1), revision: state.revision + 1, at: context.at,
      actor: C.copy(context.actor), kind, assetIds: assets.map(a => a.id), reversedAssetIds: [], from: C.copy(from), to: C.copy(to), before, ...extra };
    assets.forEach(a => { a.lastRevision = state.revision + 1; }); state.movements.push(movement);
    return movement;
  }
  function deliveryAllocation(state, asset, customerId, at) {
    if (!asset.ticket) return null;
    if (asset.refundId || asset.location.kind === 'vendor' || Date.parse(asset.ticket.validTo) < Date.parse(at)) C.fail('TICKET_UNAVAILABLE', '환불 대상이거나 유효기간이 지난 권입니다.');
    const rows = state.allocations.filter(a => a.assetId === asset.id && a.status === 'active' && !a.fulfilledAt)
      .sort((a, b) => B.windowOf(B.lineOf(state, a.reservationId, a.lineId).line).from - B.windowOf(B.lineOf(state, b.reservationId, b.lineId).line).from);
    const allocation = rows[0];
    if (!allocation || allocation.reservationId !== customerId) C.fail('TICKET_UNAVAILABLE', '먼저 전달할 고객에게 권을 배정해 주세요.');
    if (B.windowOf(B.lineOf(state, allocation.reservationId, allocation.lineId).line).to < Date.parse(at)) C.fail('TICKET_UNAVAILABLE', '예약 이용시간이 지났습니다.');
    return allocation;
  }
  function move(state, p, context) {
    C.keys(p, ['kind', 'assetIds', 'from', 'to', 'purpose', 'taskId']);
    const kind = C.oneOf(p.kind, ['load', 'deliver', 'collect', 'receive', 'directReturn']);
    const from = location(p.from, state.shopId), to = location(p.to, state.shopId);
    const routes = { load: ['shop:vehicle'], deliver: ['shop:customer', 'vehicle:customer'], collect: ['customer:vehicle'], receive: ['vehicle:shop'], directReturn: ['customer:shop'] };
    if (!routes[kind].includes(from.kind + ':' + to.kind)) C.fail('INVALID_INPUT', '물품 이동 경로를 확인해 주세요.');
    if (['load', 'receive', 'directReturn'].includes(kind) || from.kind === 'shop') C.store(context);
    if (from.kind === 'vehicle') C.vehicle(context, from.id);
    if (to.kind === 'vehicle') C.vehicle(context, to.id);
    let task;
    if (p.taskId) {
      task = C.find(state.tasks, p.taskId, '업무'); C.vehicle(context, task.vehicleId);
      if (!['waiting', 'in_progress'].includes(task.status)) C.fail('NO_CHANGE', '종료된 업무입니다.');
      const expectedKind = kind === 'deliver' ? 'delivery' : kind === 'collect' ? 'collection' : null;
      if (!expectedKind || task.kind !== expectedKind || task.customerId !== (kind === 'deliver' ? to.id : from.id) || task.vehicleId !== (kind === 'deliver' ? from.id : to.id)) C.fail('INVALID_INPUT', '업무의 고객·차량·이동 종류가 맞지 않습니다.');
    }
    if (context.actor.role === 'driver' && !task) C.fail('FORBIDDEN', '배정된 전달·수거 업무에서 처리해 주세요.');
    const assets = C.ids(p.assetIds).map(id => C.find(state.assets, id, '물품'));
    if (task?.assetIds.length && assets.some(a => !task.assetIds.includes(a.id))) C.fail('FORBIDDEN', '배정된 물품을 확인해 주세요.');
    if (assets.some(a => !same(a.location, from))) C.fail('QUANTITY_EXCEEDED', '출발 위치에 해당 물품이 없습니다. 최신 수량을 확인해 주세요.');
    const purpose = p.purpose == null ? null : C.oneOf(p.purpose, ['spare', 'delivery']);
    if (purpose && kind !== 'load') C.fail('INVALID_INPUT', '적재할 때만 용도를 함께 지정할 수 있습니다.');
    const before = capture(state, assets);
    for (const asset of assets) {
      if (kind === 'load' && asset.refundId && C.find(state.refunds, asset.refundId).vehicleId !== to.id) C.fail('FORBIDDEN', '환불 담당 차량에 실어 주세요.');
      if (kind === 'deliver') {
        if (asset.refundId) C.fail('TICKET_UNAVAILABLE', '환불 대상으로 지정한 권입니다.');
        const allocation = deliveryAllocation(state, asset, to.id, context.at);
        if (allocation) allocation.fulfilledAt = context.at;
      }
      if (kind === 'collect' || kind === 'directReturn') {
        state.allocations.filter(a => a.assetId === asset.id && a.reservationId === from.id && a.fulfilledAt && !a.returnedAt).forEach(a => { a.returnedAt = context.at; });
      }
      asset.location = C.copy(to);
      asset.vehicleOrigin = to.kind === 'vehicle' ? from.kind : null;
      if (!asset.refundId) asset.purpose = purpose || (kind === 'deliver' ? 'delivery' : 'spare');
    }
    if (kind === 'deliver' && task?.formId) {
      const form = C.find(state.forms, task.formId), dispatch = form.dispatches.find(d => d.taskId === task.id);
      for (const person of dispatch.people) if (!form.issues.some(i => i.personId === person.personId) && person.assetIds.every(id => same(C.find(state.assets, id).location, to))) form.issues.push({ ...C.copy(person), at: context.at, taskId: task.id });
    }
    if (kind === 'directReturn') for (const scheduled of state.tasks.filter(t => t.kind === 'collection' && t.customerId === from.id && ['waiting', 'in_progress'].includes(t.status))) {
      scheduled.fulfilledElsewhereAssetIds = [...new Set([...(scheduled.fulfilledElsewhereAssetIds || []), ...assets.filter(a => scheduled.assetIds.includes(a.id)).map(a => a.id)])];
      if (scheduled.assetIds.every(id => scheduled.fulfilledElsewhereAssetIds.includes(id) || state.movements.some(m => m.taskId === scheduled.id && m.assetIds.includes(id) && !m.reversedAssetIds.includes(id)))) scheduled.status = 'completed';
    }
    return { movementId: record(state, context, kind, assets, from, to, before, { taskId: task?.id || null }).id, assetIds: assets.map(a => a.id) };
  }
  function stock(state, type, p, context) {
    C.store(context);
    C.keys(p, ['sku', 'quantity', 'ticket', 'location', 'reservationId', 'lineId', 'sourceReference']);
    const sku = C.find(state.catalog, p.sku), count = C.integer(p.quantity, 1, 500);
    if (type === 'ticket.issue' && sku.kind !== 'liftTicket') C.fail('INVALID_INPUT', '발권할 권종을 선택해 주세요.');
    if (type === 'stock.receive' && sku.kind === 'liftTicket') C.fail('INVALID_INPUT', '신규 발권 또는 보유권 등록으로 처리해 주세요.');
    const to = type === 'stock.opening' ? location(p.location || { kind: 'shop', id: state.shopId }, state.shopId) : { kind: 'shop', id: state.shopId };
    if (to.kind === 'vendor') C.fail('INVALID_INPUT', '현재 보관 중인 물품만 등록할 수 있습니다.');
    if (type !== 'stock.opening' && p.location) C.fail('INVALID_INPUT', '입고·신규 발권은 매장 입고 후 적재해 주세요.');
    const conditions = sku.kind === 'liftTicket' ? ticket(state, p.ticket, sku) : null;
    if (sku.kind !== 'liftTicket' && p.ticket) C.fail('INVALID_INPUT', '장비에 리프트권 조건을 지정할 수 없습니다.');
    const reference = p.sourceReference ? C.string(p.sourceReference, 160) : null;
    if (reference && state.stockReferences.includes(reference)) C.fail('ALREADY_EXISTS', '이미 등록한 입고·이관 내역입니다.');
    if (reference) state.stockReferences.push(reference);
    const assets = Array.from({ length: count }, (_, i) => ({ id: 'asset-' + (state.revision + 1) + '-' + (i + 1), lotId: 'lot-' + (state.revision + 1), sku: sku.id, location: C.copy(to), ticket: conditions ? C.copy(conditions) : null,
      purpose: 'spare', refundId: null, vehicleOrigin: to.kind === 'vehicle' ? 'opening' : null, acquiredAt: context.at,
      issuedAt: type === 'ticket.issue' ? context.at : null, lastRevision: state.revision + 1 }));
    state.assets.push(...assets);
    const movement = record(state, context, type, assets, null, to, { assets: [], allocations: [] }, { sourceReference: reference });
    if (p.reservationId || p.lineId) {
      if (type !== 'ticket.issue') C.fail('INVALID_INPUT', '보유권은 등록 후 예약에 배정해 주세요.');
      B.allocate(state, { reservationId: p.reservationId, lineId: p.lineId, assetIds: assets.map(a => a.id) }, context);
    }
    return { movementId: movement.id, assetIds: assets.map(a => a.id) };
  }
  function undo(state, type, p, context) {
    C.store(context); C.keys(p, type === 'movement.correct' ? ['movementId', 'keepAssetIds', 'reason'] : ['movementId', 'assetIds', 'reason']);
    const movement = C.find(state.movements, p.movementId, '이동 기록'), reason = C.string(p.reason, 300);
    if (!['load', 'deliver', 'collect', 'receive', 'directReturn'].includes(movement.kind) || movement.intakeId || state.forms.some(f => (f.dispatches || []).some(d => d.people.some(p => p.assetIds.some(id => movement.assetIds.includes(id)))))) C.fail('DEPENDENT_MOVEMENT', '입력폼에 배정·지급한 물품은 일반 이동 정정으로 취소할 수 없습니다.');
    const effective = movement.assetIds.filter(id => !movement.reversedAssetIds.includes(id));
    let selected;
    if (type === 'movement.correct') {
      C.list(p.keepAssetIds, 500, true); const keep = p.keepAssetIds.length ? C.ids(p.keepAssetIds) : [];
      if (keep.some(id => !effective.includes(id))) C.fail('INVALID_INPUT', '유지할 물품을 확인해 주세요.');
      selected = effective.filter(id => !keep.includes(id));
    } else selected = p.assetIds ? C.ids(p.assetIds) : effective;
    if (!selected.length || selected.some(id => !effective.includes(id))) C.fail('NO_CHANGE', '정정할 물품이 없습니다.');
    for (const assetId of selected) {
      const asset = C.find(state.assets, assetId);
      if (asset.lastRevision !== movement.revision) C.fail('DEPENDENT_MOVEMENT', '이후 이동·배정 기록이 있어 먼저 그 기록을 확인해야 합니다.');
      const before = C.find(movement.before.assets, assetId);
      Object.assign(asset, C.copy(before), { lastRevision: state.revision + 1 });
      state.allocations = state.allocations.filter(a => a.assetId !== assetId).concat(C.copy(movement.before.allocations.filter(a => a.assetId === assetId)));
    }
    movement.reversedAssetIds.push(...selected);
    if (movement.kind === 'directReturn') for (const task of state.tasks.filter(t => t.kind === 'collection' && t.customerId === movement.from.id && t.status !== 'cancelled')) {
      if (!(task.fulfilledElsewhereAssetIds || []).some(id => selected.includes(id))) continue;
      task.fulfilledElsewhereAssetIds = task.fulfilledElsewhereAssetIds.filter(id => !selected.includes(id));
      if (task.status === 'completed') task.status = 'in_progress';
    }
    if (movement.taskId) {
      const task = C.find(state.tasks, movement.taskId);
      if (task.status === 'completed') task.status = 'in_progress';
    }
    state.corrections.push({ id: 'correction-' + (state.revision + 1), movementId: movement.id, assetIds: selected, reason, at: context.at, actor: C.copy(context.actor) });
    return { movementId: movement.id, correctedAssetIds: selected };
  }
  function refund(state, type, p, context) {
    if (type === 'refund.plan') {
      C.store(context); C.keys(p, ['id', 'assetIds', 'vehicleId', 'vendorId', 'date', 'time', 'place']);
      const refundId = C.id(p.id), assets = C.ids(p.assetIds).map(id => C.find(state.assets, id));
      if (state.refunds.some(r => r.id === refundId)) C.fail('ALREADY_EXISTS', '이미 등록한 환불 업무입니다.');
      const vehicleId = C.id(p.vehicleId), vendorId = C.id(p.vendorId);
      for (const asset of assets) {
        if (!asset.ticket || asset.ticket.vendorId !== vendorId || asset.refundId || !['shop', 'vehicle'].includes(asset.location.kind) || (asset.location.kind === 'vehicle' && asset.location.id !== vehicleId)) C.fail('TICKET_UNAVAILABLE', '환불할 권의 보관 위치와 발권처를 확인해 주세요.');
        asset.refundId = refundId; asset.purpose = 'refund'; asset.lastRevision = state.revision + 1;
      }
      const taskId = 'refund-task-' + (state.revision + 1);
      state.refunds.push({ id: refundId, vehicleId, vendorId, assetIds: assets.map(a => a.id), completedAssetIds: [], cancelledAssetIds: [], attempts: [], taskId, createdAt: context.at });
      state.tasks.push({ id: taskId, kind: 'refund', vehicleId, customerId: null, orderId: null, reservationId: null, title: '리프트권 ' + assets.length + '매 환불',
        date: C.date(p.date), time: C.time(p.time), place: C.string(p.place, 160), assetIds: assets.map(a => a.id), status: 'waiting', refundId, createdAt: context.at });
      return { refundId, taskId, assetIds: assets.map(a => a.id) };
    }
    if (type === 'refund.cancel') {
      C.store(context); C.keys(p, ['id', 'assetIds', 'reason']); const r = C.find(state.refunds, p.id); C.string(p.reason, 300);
      const selected = C.ids(p.assetIds);
      for (const id of selected) {
        if (!r.assetIds.includes(id) || r.completedAssetIds.includes(id) || r.cancelledAssetIds.includes(id)) C.fail('NO_CHANGE', '취소 가능한 환불 예정분을 선택해 주세요.');
        const a = C.find(state.assets, id); a.refundId = null; a.purpose = 'spare'; a.lastRevision = state.revision + 1;
      }
      r.cancelledAssetIds.push(...selected);
      if (r.cancelledAssetIds.length + r.completedAssetIds.length === r.assetIds.length) C.find(state.tasks, r.taskId).status = r.completedAssetIds.length ? 'completed' : 'cancelled';
      return { refundId: r.id, cancelledAssetIds: selected };
    }
    C.keys(p, ['id', 'assetIds', 'amountWon', 'note']); const r = C.find(state.refunds, p.id); C.vehicle(context, r.vehicleId);
    if (r.completedAssetIds.length + r.cancelledAssetIds.length === r.assetIds.length) C.fail('NO_CHANGE', '종료된 환불 업무입니다.');
    C.list(p.assetIds, 500, true); const selected = p.assetIds.length ? C.ids(p.assetIds) : [];
    const amountWon = C.integer(p.amountWon, 0, 100000000);
    if (!selected.length && amountWon !== 0) C.fail('INVALID_INPUT', '환불 완료한 권 없이 금액만 기록할 수 없습니다.');
    const assets = selected.map(id => C.find(state.assets, id));
    for (const a of assets) if (!r.assetIds.includes(a.id) || r.completedAssetIds.includes(a.id) || r.cancelledAssetIds.includes(a.id) || a.refundId !== r.id || !same(a.location, { kind: 'vehicle', id: r.vehicleId })) C.fail('TICKET_UNAVAILABLE', '차량에 있는 환불 대기권만 처리할 수 있습니다.');
    const before = capture(state, assets);
    for (const a of assets) { a.location = { kind: 'vendor', id: r.vendorId }; a.vehicleOrigin = null; a.purpose = 'refunded'; a.refundId = null; }
    r.completedAssetIds.push(...selected);
    r.attempts.push({ at: context.at, actor: C.copy(context.actor), assetIds: selected, amountWon, note: C.string(p.note, 300, !selected.length ? false : true) });
    if (r.completedAssetIds.length + r.cancelledAssetIds.length === r.assetIds.length) C.find(state.tasks, r.taskId).status = 'completed';
    const movement = record(state, context, 'refund', assets, { kind: 'vehicle', id: r.vehicleId }, { kind: 'vendor', id: r.vendorId }, before, { refundId: r.id, amountWon });
    return { refundId: r.id, movementId: movement.id, completed: selected.length, remaining: r.assetIds.length - r.completedAssetIds.length - r.cancelledAssetIds.length, amountWon };
  }
  function handle(state, type, p, context) {
    if (type === 'stock.purpose') {
      C.store(context); C.keys(p, ['assetIds', 'vehicleId', 'purpose']);
      const vehicleId = C.id(p.vehicleId), purpose = C.oneOf(p.purpose, ['spare', 'delivery']);
      const assets = C.ids(p.assetIds).map(id => C.find(state.assets, id, '물품'));
      if (assets.some(a => !a.ticket || !same(a.location, { kind: 'vehicle', id: vehicleId }))) C.fail('INVALID_INPUT', '이 차량에 있는 리프트권만 용도를 바꿀 수 있습니다.');
      if (assets.some(a => a.refundId)) C.fail('NO_CHANGE', '환불 예정을 먼저 취소해 주세요.');
      if (purpose === 'spare' && state.allocations.some(a => assets.some(item => item.id === a.assetId) && a.status === 'active' && !a.fulfilledAt)) C.fail('NO_CHANGE', '전달 예약이 배정된 권은 배정을 해제한 뒤 예비분으로 바꿔 주세요.');
      if (assets.every(a => a.purpose === purpose)) C.fail('NO_CHANGE', '이미 선택한 용도입니다.');
      assets.forEach(a => { a.purpose = purpose; a.lastRevision = state.revision + 1; });
      return { assetIds: assets.map(a => a.id), vehicleId, purpose };
    }
    if (type === 'stock.move') return move(state, p, context);
    if (['stock.receive', 'stock.opening', 'ticket.issue'].includes(type)) return stock(state, type, p, context);
    if (['movement.undo', 'movement.correct'].includes(type)) return undo(state, type, p, context);
    if (['refund.plan', 'refund.cancel', 'refund.complete'].includes(type)) return refund(state, type, p, context);
    C.fail('INVALID_INPUT', '지원하지 않는 물품 작업입니다.');
  }
  function vehicleSummary(state, vehicleId, date, at) {
    C.id(vehicleId); C.date(date);
    const assets = state.assets.filter(a => same(a.location, { kind: 'vehicle', id: vehicleId }));
    const totals = state.catalog.map(sku => {
      const rows = assets.filter(a => a.sku === sku.id);
      return { sku: sku.id, label: sku.label, kind: sku.kind, unit: sku.unit, current: rows.length,
        fromShop: rows.filter(a => a.vehicleOrigin === 'shop').length, fromCustomer: rows.filter(a => a.vehicleOrigin === 'customer').length,
        opening: rows.filter(a => a.vehicleOrigin === 'opening').length, refundPending: rows.filter(a => a.refundId).length,
        availableToDeliver: rows.filter(a => !a.refundId && (!a.ticket || (at ? Date.parse(a.ticket.validTo) > Date.parse(at) : C.day(a.ticket.validTo) >= date))).length,
        recoveredToday: state.movements.filter(m => m.kind === 'collect' && m.to.id === vehicleId && C.day(m.at) === date)
          .reduce((n, m) => n + m.assetIds.filter(id => !m.reversedAssetIds.includes(id) && C.find(state.assets, id).sku === sku.id).length, 0) };
    });
    return { vehicleId, date, totals, equipmentCount: totals.filter(t => t.kind === 'equipment').reduce((n, t) => n + t.current, 0),
      assets: assets.map(a => ({ ...C.copy(a), nextAssignments: state.allocations.filter(v => v.assetId === a.id && v.status === 'active' && !v.fulfilledAt).map(v => {
        const { reservation, line } = B.lineOf(state, v.reservationId, v.lineId);
        return { allocationId: v.id, reservationId: reservation.id, customer: C.copy(reservation.customer), useDate: line.useDate, startTime: line.startTime || null, endTime: line.endTime || null };
      }) })) };
  }
  function select(state, from, items) {
    location(from, state.shopId); const selected = [];
    for (const item of C.list(items, 50)) {
      C.keys(item, ['sku', 'quantity', 'lotId', 'purpose', 'refundId']); C.find(state.catalog, item.sku); C.integer(item.quantity, 1, 500);
      if (item.lotId) C.id(item.lotId);
      if (item.purpose) C.oneOf(item.purpose, ['spare', 'delivery', 'refund']);
      if (item.refundId) C.id(item.refundId);
      const candidates = state.assets.filter(a => same(a.location, from) && a.sku === item.sku && (!item.lotId || a.lotId === item.lotId) && (!item.purpose || a.purpose === item.purpose) && (!item.refundId || a.refundId === item.refundId) && !selected.includes(a.id));
      if (new Set(candidates.map(a => C.canonical({ ticket: a.ticket, purpose: a.purpose, refundId: a.refundId }))).size > 1) C.fail('AMBIGUOUS_STOCK', '사용 조건이나 용도가 다른 권이 있습니다. 표시된 권 묶음과 용도를 선택해 주세요.');
      if (candidates.length < item.quantity) C.fail('QUANTITY_EXCEEDED', '보관 수량보다 많이 선택했습니다.');
      selected.push(...candidates.slice(0, item.quantity).map(a => a.id));
    }
    return selected;
  }
  function refundSummary(state, refund) {
    const remainingQuantity = refund.assetIds.length - refund.completedAssetIds.length - refund.cancelledAssetIds.length;
    const lastAttemptFailed = !!refund.attempts.length && !refund.attempts.at(-1).assetIds.length;
    return { ...C.copy(refund), plannedQuantity: refund.assetIds.length, completedQuantity: refund.completedAssetIds.length, cancelledQuantity: refund.cancelledAssetIds.length,
      remainingQuantity, onboardQuantity: refund.assetIds.filter(id => { const a = C.find(state.assets, id); return a.refundId === refund.id && same(a.location, { kind: 'vehicle', id: refund.vehicleId }); }).length,
      amountWon: refund.attempts.reduce((n, attempt) => n + attempt.amountWon, 0),
      status: !remainingQuantity ? refund.completedAssetIds.length ? 'completed' : 'cancelled' : lastAttemptFailed ? 'incomplete' : refund.completedAssetIds.length ? 'partial' : 'pending' };
  }
  return { handle, move, location, same, vehicleSummary, select, refundSummary };
});
