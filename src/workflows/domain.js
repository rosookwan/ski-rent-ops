(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./common.js'), require('./reservations.js'), require('./inventory.js'), require('./dispatch.js'), require('./intake.js'), require('./documents.js'), require('./exchanges.js'), require('./early-returns.js'));
  else root.SkiWorkflows = factory(root.SkiWorkflowCommon, root.SkiWorkflowReservations, root.SkiWorkflowInventory, root.SkiWorkflowDispatch, root.SkiWorkflowIntake, root.SkiWorkflowDocuments, root.SkiWorkflowExchanges, root.SkiWorkflowEarlyReturns);
})(globalThis, function (C, B, I, D, F, P, E, R) {
  'use strict';
  const catalog = () => [
    { id: 'ski', label: '스키', kind: 'equipment', unit: '대' }, { id: 'board', label: '보드', kind: 'equipment', unit: '대' },
    { id: 'clothing', label: '의류', kind: 'clothing', unit: '벌' }, { id: 'helmet', label: '헬멧', kind: 'helmet', unit: '개' },
    ...[3, 4, 6].map(hours => ({ id: 'ticket-' + hours + 'h', label: hours + '시간권', kind: 'liftTicket', unit: '매', hours }))
  ];
  const fresh = shopId => ({ schemaVersion: 1, shopId: C.id(shopId), revision: 0, catalog: catalog(), assets: [], reservations: [], allocations: [], movements: [], corrections: [], exchanges: [], earlyReturns: [], refunds: [], tasks: [], sequences: [], forms: [], printJobs: [], deliveries: [], stockReferences: [], events: [], requests: {} });
  function execute(previous, command, trustedContext) {
    C.context(trustedContext, true); const context = { ...C.copy(trustedContext), at: C.instant(trustedContext.at) };
    C.keys(command, ['type', 'requestId', 'expectedVersion', 'payload']); C.id(command.requestId); C.string(command.type, 50); C.integer(command.expectedVersion, 0, Number.MAX_SAFE_INTEGER);
    C.keys(command.payload, Object.keys(command.payload || {}));
    const state = C.copy(previous || fresh(context.shopId));
    if (state.schemaVersion !== 1 || state.shopId !== context.shopId) C.fail('FORBIDDEN', '매장 정보를 확인해 주세요.');
    if (context.actor.role === 'customer' && command.type !== 'intake.submit') C.fail('FORBIDDEN', '고객 입력폼에서만 사용할 수 있습니다.');
    const requestKey = context.actor.role + ':' + context.actor.id + ':' + command.requestId;
    const fingerprint = C.canonical({ command, actor: context.actor, formId: context.formId || null });
    const cached = state.requests[requestKey];
    if (cached) {
      if (cached.fingerprint !== fingerprint) C.fail('IDEMPOTENCY_CONFLICT', '같은 요청번호로 다른 내용을 처리할 수 없습니다.');
      return { state, duplicate: true, result: C.copy(cached.result), event: C.copy(state.events.find(e => e.version === cached.result.appliedVersion)) };
    }
    const version = context.actor.role === 'customer' ? (C.find(state.forms, context.formId).submissions.at(-1)?.version || 0) : state.revision;
    if (command.expectedVersion !== version) C.fail('VERSION_CONFLICT', '다른 기기에서 변경했습니다. 최신 내용을 확인해 주세요.');
    const type = command.type, p = command.payload;
    let result;
    if (type === 'stock.move') E.beforeMove(state, p);
    if (type.startsWith('earlyReturn.')) result = R.handle(state, type, p, context);
    else if (type.startsWith('exchange.')) result = E.handle(state, type, p, context);
    else if (type.startsWith('reservation.') || ['ticket.allocate', 'ticket.release'].includes(type)) result = B.handle(state, type, p, context);
    else if (type.startsWith('stock.') || type.startsWith('refund.') || type.startsWith('movement.') || type === 'ticket.issue') result = I.handle(state, type, p, context);
    else if (type.startsWith('task.') || type.startsWith('dispatch.')) result = D.handle(state, type, p, context);
    else if (type.startsWith('intake.') || type.startsWith('delivery.')) result = F.handle(state, type, p, context);
    else if (type.startsWith('print.')) result = P.handle(state, type, p, context);
    else if (type === 'catalog.add') {
      C.store(context); C.keys(p, ['id', 'label', 'kind', 'unit', 'hours']);
      if (state.catalog.some(s => s.id === p.id)) C.fail('ALREADY_EXISTS', '이미 등록한 품목입니다.');
      const sku = { id: C.id(p.id), label: C.string(p.label, 60), kind: C.oneOf(p.kind, ['equipment', 'clothing', 'helmet', 'liftTicket']), unit: C.string(p.unit, 8) };
      if (sku.kind === 'liftTicket') sku.hours = C.integer(p.hours, 1, 24);
      state.catalog.push(sku); result = { sku: sku.id };
    } else C.fail('INVALID_INPUT', '지원하지 않는 업무입니다.');
    if (type === 'stock.move') E.afterMove(state, result, context);
    state.revision++;
    const event = { version: state.revision, requestId: command.requestId, type, at: context.at, actor: C.copy(context.actor), payload: C.copy(p), result: C.copy(result) };
    state.events.push(event);
    const response = { ...result, requestId: command.requestId, appliedVersion: state.revision };
    state.requests[requestKey] = { fingerprint, result: C.copy(response) };
    return { state, event, duplicate: false, result: response };
  }
  return { fresh, execute, catalog, reservations: B, inventory: I, dispatch: D, intake: F, documents: P, exchanges: E, earlyReturns: R };
});
