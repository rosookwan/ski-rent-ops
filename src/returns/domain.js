(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkiReturns = api;
})(globalThis, function () {
  'use strict';

  class ReturnError extends Error {
    constructor(code, message) { super(message); this.name = 'ReturnError'; this.code = code; }
  }
  const fail = (code, message) => { throw new ReturnError(code, message); };
  const copy = value => JSON.parse(JSON.stringify(value));
  function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT', `${name}: 객체가 필요합니다.`);
    return value;
  }
  function text(value, name, max = 120) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID_INPUT', `${name}: 올바른 문자열이 필요합니다.`);
    return value.trim();
  }
  function id(value, name = 'id') {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(value)) fail('INVALID_INPUT', `${name}: 올바른 식별자가 필요합니다.`);
    return value;
  }
  function quantity(value, name, minimum = 0) {
    if (!Number.isSafeInteger(value) || value < minimum || value > 1000000) fail('INVALID_INPUT', `${name}: ${minimum} 이상의 정수가 필요합니다.`);
    return value;
  }
  function date(value, name = 'date') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('INVALID_INPUT', `${name}: 올바른 날짜가 필요합니다.`);
    return value;
  }
  function oneOf(value, options, name) {
    if (!options.includes(value)) fail('INVALID_INPUT', `${name}: 지원하지 않는 값입니다.`);
    return value;
  }
  function keys(value, allowed, name) {
    object(value, name);
    if (Object.keys(value).some(key => !allowed.includes(key))) fail('INVALID_INPUT', `${name}: 지원하지 않는 필드가 있습니다.`);
  }
  function list(value, name) {
    if (!Array.isArray(value) || !value.length || value.length > 200) fail('INVALID_INPUT', `${name}: 1~200개 항목이 필요합니다.`);
    return value;
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  function plan(value, fallback) {
    value = value || {};
    keys(value, ['method', 'date', 'time', 'slot', 'place'], 'returnPlan');
    const next = { ...fallback, ...value };
    oneOf(next.method, ['direct', 'vehicle'], '반납 방법');
    date(next.date);
    if (next.time != null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next.time)) fail('INVALID_INPUT', '반납 시간: HH:mm 형식이 필요합니다.');
    return { method: next.method, date: next.date, time: next.time ?? null, slot: next.slot == null ? null : text(next.slot, '반납 타임', 40), place: next.place == null ? null : text(next.place, '반납 장소') };
  }
  function line(order, itemId) {
    const found = order.items.find(item => item.id === itemId);
    if (!found) fail('ITEM_NOT_FOUND', '접수에 없는 품목입니다.');
    return found;
  }
  function itemRows(order, rows, allowed, zero = false) {
    const seen = new Set();
    return list(rows, 'items').map(row => {
      keys(row, allowed, 'items');
      id(row.itemId, 'itemId');
      if (seen.has(row.itemId)) fail('INVALID_INPUT', '같은 품목이 중복되었습니다.');
      seen.add(row.itemId);
      line(order, row.itemId);
      quantity(row.quantity, '수량', zero ? 0 : 1);
      return copy(row);
    });
  }
  function createOrder(input, shopId, orderId) {
    keys(input, ['customer', 'rental', 'vehicleId', 'returnPlan', 'items'], 'order');
    keys(input.customer, ['id', 'name', 'phone'], 'customer');
    keys(input.rental, ['startDate', 'endDate', 'amountWon'], 'rental');
    const rental = { startDate: date(input.rental.startDate), endDate: date(input.rental.endDate), amountWon: input.rental.amountWon ?? 0 };
    if (rental.startDate > rental.endDate || !Number.isSafeInteger(rental.amountWon) || rental.amountWon < 0) fail('INVALID_INPUT', '이용 기간 또는 금액을 확인해 주세요.');
    const defaultPlan = plan(input.returnPlan, { method: 'vehicle', date: rental.endDate });
    const seen = new Set();
    const items = list(input.items, 'items').map(raw => {
      keys(raw, ['id', 'label', 'category', 'unit', 'plannedQuantity', 'plannedReturnQuantity', 'usage', 'returnPlan', 'recoveryValueWon'], 'item');
      id(raw.id, 'item.id');
      if (seen.has(raw.id)) fail('INVALID_INPUT', '품목 ID가 중복되었습니다.');
      seen.add(raw.id);
      const category = oneOf(raw.category, ['equipment', 'clothing', 'liftTicket'], 'category');
      const plannedQuantity = quantity(raw.plannedQuantity, '실제 지급 예정 수량', 1);
      const plannedReturnQuantity = quantity(raw.plannedReturnQuantity ?? plannedQuantity, '회수 예정 수량');
      if (plannedReturnQuantity > plannedQuantity || (category !== 'liftTicket' && plannedReturnQuantity !== plannedQuantity)) fail('INVALID_INPUT', '회수 예정 수량을 확인해 주세요.');
      const usage = (raw.usage ?? []).map(use => {
        keys(use, ['date', 'quantity'], 'usage');
        return { date: date(use.date), quantity: quantity(use.quantity, '이용 수량') };
      });
      const recoveryValueWon = category === 'liftTicket' ? quantity(raw.recoveryValueWon ?? 1000, '회수 기준 단가') : 0;
      return { id: raw.id, label: text(raw.label, '품목 이름'), category, unit: text(raw.unit ?? (category === 'liftTicket' ? '매' : '개'), '단위', 12), plannedQuantity, plannedReturnQuantity, issuedQuantity: 0, returnTarget: 0, vehicleQuantity: 0, shopQuantity: 0, usage, recoveryValueWon,
        returnPlan: plan(raw.returnPlan, { ...defaultPlan, ...(category === 'equipment' ? {} : { method: 'direct', place: '매장' }) }) };
    });
    return { schemaVersion: 1, id: orderId, shopId, version: 0, customer: { id: id(input.customer.id, 'customer.id'), name: text(input.customer.name, '고객 이름'), phone: input.customer.phone == null ? null : text(input.customer.phone, '연락처', 40) }, rental, vehicleId: input.vehicleId == null ? null : id(input.vehicleId, 'vehicleId'), items, events: [] };
  }
  function summarize(order) {
    const items = order.items.map(item => ({ ...copy(item), customerQuantity: item.returnTarget - item.vehicleQuantity - item.shopQuantity, unissuedQuantity: item.plannedQuantity - item.issuedQuantity }));
    const totals = items.reduce((sum, item) => {
      for (const key of ['issuedQuantity', 'returnTarget', 'vehicleQuantity', 'shopQuantity', 'customerQuantity', 'unissuedQuantity']) sum[key] += item[key];
      return sum;
    }, { issuedQuantity: 0, returnTarget: 0, vehicleQuantity: 0, shopQuantity: 0, customerQuantity: 0, unissuedQuantity: 0 });
    const complete = totals.unissuedQuantity === 0 && totals.customerQuantity === 0 && totals.vehicleQuantity === 0;
    const status = complete ? (totals.returnTarget ? 'returned' : 'no_return_required') : !totals.issuedQuantity ? 'awaiting_issue' : !totals.customerQuantity && !totals.unissuedQuantity ? 'awaiting_shop' : totals.shopQuantity + totals.vehicleQuantity > 0 ? 'partial_return' : 'in_use';
    return { id: order.id, shopId: order.shopId, version: order.version, customer: copy(order.customer), vehicleId: order.vehicleId, status, complete, items, totals };
  }
  function execute(current, command, context) {
    keys(command, ['type', 'orderId', 'requestId', 'expectedVersion', 'payload'], 'command');
    const orderId = id(command.orderId, 'orderId');
    const requestId = id(command.requestId, 'requestId');
    quantity(command.expectedVersion, 'expectedVersion');
    object(command.payload, 'payload');
    const shopId = id(context.shopId, 'shopId');
    const actor = { id: id(context.actor.id, 'actor.id'), role: oneOf(context.actor.role, ['store', 'driver'], 'actor.role'), vehicleId: context.actor.vehicleId == null ? null : id(context.actor.vehicleId, 'actor.vehicleId') };
    if (current && (current.shopId !== shopId || current.id !== orderId)) fail('NOT_FOUND', '접수를 찾을 수 없습니다.');
    if (actor.role === 'driver' && (!current || !actor.vehicleId || current.vehicleId !== actor.vehicleId || !['collect'].includes(command.type))) fail('FORBIDDEN', '이 작업을 처리할 권한이 없습니다.');
    const fingerprint = canonical({ command, actor });
    const previous = current?.events.find(event => event.requestId === requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', '같은 요청 ID로 다른 작업을 처리할 수 없습니다.');
      return { order: copy(current), event: copy(previous), duplicate: true };
    }
    if ((current?.version ?? 0) !== command.expectedVersion) fail('VERSION_CONFLICT', '다른 곳에서 변경했습니다. 최신 내역을 확인해 주세요.');
    const at = context.at ?? new Date().toISOString();
    if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) fail('INVALID_INPUT', '처리 시각이 올바르지 않습니다.');
    let order;
    if (command.type === 'create') {
      if (current) fail('ALREADY_EXISTS', '이미 존재하는 접수입니다.');
      order = createOrder(command.payload, shopId, orderId);
    } else {
      if (!current) fail('NOT_FOUND', '접수를 찾을 수 없습니다.');
      order = copy(current);
      if (command.type === 'issue') {
        keys(command.payload, ['items'], 'issue');
        for (const row of itemRows(order, command.payload.items, ['itemId', 'quantity', 'returnQuantity'])) {
          const item = line(order, row.itemId);
          const returnQuantity = quantity(row.returnQuantity ?? row.quantity, '실제 회수 대상 수량');
          if (returnQuantity > row.quantity || (item.category !== 'liftTicket' && returnQuantity !== row.quantity) || item.issuedQuantity + row.quantity > item.plannedQuantity || item.returnTarget + returnQuantity > item.plannedReturnQuantity || item.plannedReturnQuantity - item.returnTarget - returnQuantity > item.plannedQuantity - item.issuedQuantity - row.quantity) fail('QUANTITY_EXCEEDED', '지급 수량 또는 회수 대상 수량을 확인해 주세요.');
          item.issuedQuantity += row.quantity;
          item.returnTarget += returnQuantity;
        }
      } else fail('INVALID_INPUT', '지원하지 않는 작업입니다.');
    }
    order.version += 1;
    const event = { requestId, type: command.type, version: order.version, at, actor, payload: copy(command.payload), fingerprint };
    order.events.push(event);
    return { order, event: copy(event), duplicate: false };
  }

  return { ReturnError, execute, summarize, canonical };
});
