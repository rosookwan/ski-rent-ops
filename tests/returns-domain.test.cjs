const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/returns/domain.js');
const ctx = { shopId: 'shop-1', actor: { id: 'staff-1', role: 'store' }, at: '2026-09-07T08:00:00.000Z' };
const sample = () => ({ customer: { id: 'customer-1', name: '가상 고객' }, rental: { startDate: '2026-09-07', endDate: '2026-09-08', amountWon: 120000 }, vehicleId: 'van-1', items: [
  { id: 'ski', label: '스키', category: 'equipment', plannedQuantity: 2, usage: [{ date: '2026-09-07', quantity: 2 }, { date: '2026-09-08', quantity: 2 }] },
  { id: 'clothes', label: '의류', category: 'clothing', plannedQuantity: 2 },
  { id: 'ticket', label: '리프트권', category: 'liftTicket', plannedQuantity: 2 }
] });
let sequence = 0;
function run(order, type, payload, overrides = {}, context = ctx) {
  return R.execute(order, { type, payload, orderId: order?.id ?? 'order-1', expectedVersion: order?.version ?? 0, requestId: 'request-' + (++sequence), ...overrides }, context);
}
function create(input = sample()) { return run(null, 'create', input).order; }
function issued(input = sample()) {
  const order = create(input);
  return run(order, 'issue', { items: order.items.map(item => ({ itemId: item.id, quantity: item.plannedQuantity, returnQuantity: item.plannedReturnQuantity })) }).order;
}
const errorCode = code => error => error.code === code;

test('actual issue quantities are independent of daily usage; clothes and tickets default to direct return', () => {
  const order = issued();
  assert.equal(order.items[0].issuedQuantity, 2);
  assert.equal(order.items[0].usage.reduce((sum, use) => sum + use.quantity, 0), 4);
  assert.deepEqual(order.items.map(item => item.returnPlan.method), ['vehicle', 'direct', 'direct']);
  assert.deepEqual(order.items.map(item => item.returnPlan.date), ['2026-09-08', '2026-09-08', '2026-09-08']);
  assert.equal(R.summarize(order).totals.customerQuantity, 6);
  assert.equal(order.items[2].recoveryValueWon, 1000);
});
test('ticket-only orders enter return management without equipment', () => {
  const input = sample(); input.items = [input.items[2]];
  const before = create(input);
  assert.equal(R.summarize(before).status, 'awaiting_issue');
  const order = issued(input);
  assert.equal(R.summarize(order).status, 'in_use');
  assert.equal(order.items[0].returnTarget, 2);
});
test('explicit nonrecoverable tickets and recoverable tickets stay separate', () => {
  const input = sample(); input.items = [{ ...input.items[2], plannedQuantity: 4, plannedReturnQuantity: 3 }];
  const order = issued(input);
  assert.equal(order.items[0].issuedQuantity, 4);
  assert.equal(order.items[0].returnTarget, 3);
});
test('invalid issue is atomic and cannot exceed planned stock or issue fractional counts', () => {
  const order = create(); const before = JSON.stringify(order);
  for (const quantity of [-1, 0, 1.5, 3, '2']) assert.throws(() => run(order, 'issue', { items: [{ itemId: 'ski', quantity }] }));
  assert.throws(() => run(order, 'issue', { items: [{ itemId: 'ski', quantity: 1 }, { itemId: 'missing', quantity: 1 }] }), errorCode('ITEM_NOT_FOUND'));
  assert.equal(JSON.stringify(order), before);
});
test('request replay is idempotent; changed payload and stale versions are rejected', () => {
  const order = create();
  const command = { type: 'issue', payload: { items: [{ itemId: 'ski', quantity: 1 }] }, orderId: order.id, expectedVersion: order.version, requestId: 'replay-1' };
  const first = R.execute(order, command, ctx);
  const second = R.execute(first.order, command, ctx);
  assert.equal(second.duplicate, true);
  assert.equal(second.order.version, first.order.version);
  assert.throws(() => R.execute(first.order, { ...command, payload: { items: [{ itemId: 'ski', quantity: 2 }] } }, ctx), errorCode('IDEMPOTENCY_CONFLICT'));
  assert.throws(() => run(first.order, 'issue', command.payload, { expectedVersion: 1 }), errorCode('VERSION_CONFLICT'));
});
test('shop boundary, issue permission, invalid dates and duplicate lines are enforced', () => {
  const order = create();
  assert.throws(() => run(order, 'issue', { items: [{ itemId: 'ski', quantity: 1 }] }, {}, { ...ctx, shopId: 'shop-2' }), errorCode('NOT_FOUND'));
  assert.throws(() => run(order, 'issue', { items: [{ itemId: 'ski', quantity: 1 }] }, {}, { ...ctx, actor: { id: 'driver-1', role: 'driver', vehicleId: 'van-1' } }), errorCode('FORBIDDEN'));
  const input = sample(); input.rental.endDate = '2026-02-30';
  assert.throws(() => create(input), errorCode('INVALID_INPUT'));
  assert.throws(() => create({ ...sample(), items: [sample().items[0], sample().items[0]] }), errorCode('INVALID_INPUT'));
});

module.exports = { R, ctx, sample, run, create, issued, errorCode };
