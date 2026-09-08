const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { fixture, ctx, driverCtx } = require('./workflows-fixtures.cjs');
const NotificationService = require('../src/notifications/service.js');
const NotificationClient = require('../src/notifications/client.js');
const Notifications = require('../src/notifications/domain.js');

// Exercise the shipped UI controller and real workflow/notification services.
// Only DOM elements, the clock and the audio output device are test doubles.
function harness() {
  const f = fixture(), listeners = new Map(), timers = new Map(), voices = [];
  let now = Date.parse(f.clock()), nextTimer = 1;
  const element = () => ({
    dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, open: false,
    addEventListener() {}, setAttribute() {}, append() {}, insertBefore() {}, focus() {},
    querySelector: () => element(), querySelectorAll: () => [],
    showModal() { this.open = true; }, close() { this.open = false; }
  });
  const root = element();
  root.addEventListener = (kind, fn) => { if (!listeners.has(kind)) listeners.set(kind, []); listeners.get(kind).push(fn); };
  const topbar = element();
  const services = { store: NotificationService.createService(f.repository, ctx, f.clock), driver: NotificationService.createService(f.repository, driverCtx, f.clock) };
  const S = {
    root, state: { page: 'vehicle', authenticated: true }, data: { orders: [] },
    esc: String, icon: name => '<svg data-icon="' + name + '"></svg>', icons() {}, action() {},
    $: selector => selector.startsWith('.so-topbar-right') ? topbar : null,
    notificationRuntime: { ...services, subscribe: fn => f.repository.subscribe(fn) }
  };
  class AudioContext {
    constructor() { this.state = 'suspended'; this.destination = {}; }
    get currentTime() { return now / 1000; }
    async resume() { this.state = 'running'; }
    createOscillator() {
      const voice = { frequency: {}, stopped: false, connect() {}, disconnect() {}, start(at) { this.startAt = at; }, stop(at) { if (at === undefined) this.stopped = true; else this.stopAt = at; } };
      voices.push(voice); return voice;
    }
    createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
  }
  const document = { hidden: false, activeElement: null, createElement: element, addEventListener() {} };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(fs.readFileSync('design/app/notifications.js', 'utf8'), {
    window: { SkiOps: S, SkiNotificationClient: NotificationClient, AudioContext },
    document, Date: Clock, Intl, queueMicrotask, setTimeout, clearTimeout,
    setInterval: fn => { const id = nextTimer++; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id)
  });
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const click = async notice => {
    const button = { dataset: { notice }, disabled: false }, target = { closest: () => button };
    for (const listener of listeners.get('click') || []) listener({ target });
    await flush();
  };
  const advance = async ms => {
    now += ms;
    for (const voice of voices) if (!voice.ended && (voice.stopped || voice.stopAt <= now / 1000)) { voice.ended = true; voice.onended?.(); }
    for (const tick of timers.values()) tick();
    await flush();
  };
  const ack = async id => { services.driver.execute(NotificationClient.command('ack', {}, id)); await flush(); };
  const pending = () => services.driver.sync().records.filter(n => n.lifecycle === 'active' && !n.acknowledgedAt);
  const activeVoices = () => voices.filter(v => !v.stopped && !v.ended);
  S.notifications.refresh();
  return { f, S, services, voices, click, advance, ack, pending, activeVoices, flush };
}

test('vehicle sound shortcut retains the four-second chime and stops it when switched off', async () => {
  const h = harness();
  assert.match(h.S.notifications.soundControl(), /알림 소리 켜기/);
  assert.equal(h.voices.length, 0, 'opening the screen never starts sound without a click');
  await h.click('sound-toggle');
  assert.equal(h.S.notifications.soundInfo().ready, true);
  assert.equal(h.voices.length, 18, 'three pairs with three partials each');
  const first = Math.min(...h.voices.map(v => v.startAt)), last = Math.max(...h.voices.map(v => v.stopAt));
  assert.ok(last - first > 4 && last - first < 4.1);
  assert.ok(h.voices.every(v => v.frequency.value > 0));
  await h.click('sound-toggle');
  assert.equal(h.S.notifications.soundInfo().ready, false);
  assert.equal(h.activeVoices().length, 0);
});

test('new workflow priority requests ring, repeat and stop immediately after acknowledgement despite informational unread rows', async () => {
  const h = harness(); h.f.task('pickup', 'collection', 'customer-1'); await h.flush();
  for (const n of h.pending()) await h.ack(n.id);
  await h.click('sound-toggle'); await h.advance(4600);
  const played = h.S.notifications.soundInfo().playedCount;
  h.f.call('task.priority', { id: 'pickup', message: '먼저 확인해 주세요.' }); await h.flush();
  assert.equal(h.S.notifications.soundInfo().playedCount, played + 1);
  await h.advance(31000);
  assert.equal(h.S.notifications.soundInfo().playedCount, played + 2);
  h.f.repository.transactNotifications(ctx.shopId, state => {
    Notifications.emit(state, { orderId: 'pickup', requestId: 'info', at: h.f.clock() }, 'vehicle:van-1', 'handover', '인계 기록', '확인용 기록', { attentionRequired: false });
    return {};
  });
  await h.flush();
  await h.ack(h.pending().find(n => n.type === 'priority').id);
  assert.equal(h.pending().length, 1, 'the informational row remains unread');
  assert.equal(h.activeVoices().length, 0, 'acknowledging the last attention request cancels scheduled notes immediately');
  const stopped = h.S.notifications.soundInfo().playedCount;
  await h.advance(31000); assert.equal(h.S.notifications.soundInfo().playedCount, stopped);
});

test('sequence acknowledgement preserves the priority request and the vehicle sound preference', async () => {
  const h = harness(); h.f.task('first', 'collection', 'a'); h.f.task('second', 'collection', 'b', [], '10:00'); await h.flush();
  for (const n of h.pending()) await h.ack(n.id);
  await h.click('sound-toggle'); await h.advance(4600);
  h.f.call('task.priority', { id: 'first', message: '먼저 확인' });
  h.f.call('dispatch.reorder', { vehicleId: 'van-1', date: '2026-09-09', taskId: 'second', action: 'top' }); await h.flush();
  await h.ack(h.pending().find(n => n.type === 'sequence').id);
  assert.equal(h.pending().find(n => n.type === 'priority').acknowledgedAt, null);
  assert.ok(h.activeVoices().length > 0);
  h.S.state.page = 'home'; h.S.notifications.refresh(); assert.equal(h.S.notifications.soundInfo().ready, false);
  h.S.state.page = 'vehicle'; h.S.notifications.refresh(); assert.equal(h.S.notifications.soundInfo().ready, true);
  await h.ack(h.pending().find(n => n.type === 'priority').id);
  assert.equal(h.activeVoices().length, 0);
});
