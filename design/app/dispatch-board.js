(() => {
'use strict';
const S = window.SkiOps, W = S.workflowUI, F = S.workflow;
const dateAt = offset => new Date(Date.parse(S.data.today + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
const offsetOf = date => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(S.data.today + 'T00:00:00Z')) / 86400000);
const localTime = at => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(at));
const vehicleId = id => id === 'v1' ? F.vehicleId : id === 'v2' ? 'demo-van-2' : id;
const KINDS = { deliver: { label: '배달', doneLine: '배달 완료' }, collect: { label: '수거', doneLine: '수거 완료' }, liftDeliver: { label: '리프트권 전달', doneLine: '전달 완료' }, liftRefund: { label: '발권처 환불', doneLine: '환불 완료' }, refund: { label: '환불 회수', doneLine: '회수 완료' } };
const PURPOSE = { deliver: '고객 전달', spare: '차량 예비분', refund: '환불할 권' };
const done = job => job.status === 'done';
let projection, board, callbacks = new Map();
function snapshot() {
  const state = F.snap(), history = F.store.history().movements;
  const items = state.catalog.map(s => ({ key: s.id, name: s.label, short: s.label, unit: s.unit }));
  const counts = ids => Object.fromEntries(items.map(i => [i.key, state.assets.filter(a => ids.includes(a.id) && a.sku === i.key).length]).filter(([, n]) => n));
  const drivers = S.operations.drivers();
  const vehicles = ['v1', 'v2'].map((id, i) => ({ id, name: (i + 1) + '호 차량', driver: drivers.find(p => p.vehicleId === vehicleId(id))?.name || '기사님 미등록' }));
  const jobs = [];
  for (const v of vehicles) {
    const vid = vehicleId(v.id), dates = new Set([S.data.today, S.data.day(1), dateAt(board?.state.dateOffset || 0), ...state.tasks.filter(t => t.vehicleId === vid).map(t => t.date)]);
    for (const date of dates) {
      const list = F.store.board({ vehicleId: vid, date });
      for (const task of [...list.completed.filter(t => t.status === 'completed'), ...list.inProgress, ...list.pending]) {
        const remaining = F.remaining(task), assets = F.assets(task.assetIds), waiting = F.assets(remaining);
        const pickup = task.kind === 'delivery' && waiting.some(a => a.ticket && a.location.kind === 'customer' && a.location.id !== task.customerId);
        const kind = task.kind === 'collection' ? 'collect' : task.kind === 'refund' ? 'liftRefund' : pickup ? 'liftDeliver' : 'deliver';
        const unassigned = (task.plannedItems || []).reduce((n, i) => n + i.quantity - i.assetIds.length, 0);
        const loaded = task.kind === 'delivery' && assets.length && (task.status === 'completed' || !unassigned && waiting.length && waiting.every(a => a.location.kind === 'vehicle' && a.location.id === vid));
        const loading = history.filter(m => m.kind === 'load' && m.to.id === vid && assets.some(a => m.assetIds.includes(a.id) && !m.reversedAssetIds.includes(a.id))).at(-1);
        const customer = S.workflowCustomer(task.customerId);
        const name = task.customerId && customer.name !== task.customerId ? customer.name : task.title;
        const assetHistory = a => history.filter(m => m.assetIds.includes(a.id) && !m.reversedAssetIds.includes(a.id));
        // A later reload belongs to a new trip, not to this old collection.
        const inCar = task.kind === 'collection' ? assets.filter(a => {
          const latest = assetHistory(a).at(-1);
          return a.location.kind === 'vehicle' && a.location.id === vid && latest?.kind === 'collect' && latest.taskId === task.id;
        }).length : 0;
        const received = task.kind === 'collection' ? assets.filter(a => {
          const moves = assetHistory(a), collected = moves.find(m => m.kind === 'collect' && m.taskId === task.id);
          return (task.fulfilledElsewhereAssetIds || []).includes(a.id) || collected && moves.some(m => m.kind === 'receive' && m.revision > collected.revision);
        }).length : 0;
        const quantities = counts(task.status === 'completed' ? task.assetIds : remaining);
        for (const item of task.plannedItems || []) if (item.quantity > item.assetIds.length) quantities[item.sku] = (quantities[item.sku] || 0) + item.quantity - item.assetIds.length;
        const needsIssue = (task.plannedItems || []).some(i => i.quantity > i.assetIds.length && state.catalog.find(s => s.id === i.sku)?.kind === 'liftTicket');
        jobs.push({ id: task.id, vehicleId: v.id, kind, time: task.time, place: task.place, name, items: quantities, dateOffset: offsetOf(date), orderId: task.orderId, needsIssue, canLoad: waiting.some(a => a.location.kind === 'shop'),
          status: task.status === 'completed' ? 'done' : task.status === 'in_progress' ? 'moving' : remaining.length < task.assetIds.length ? 'partial' : 'waiting',
          loadedAt: loaded ? localTime(loading?.at || task.createdAt) : null, inCar, received, remainingCount: remaining.length + unassigned,
          returnState: task.kind === 'collection' ? '미수거 ' + remaining.length + ' · 차에 ' + inCar + ' · 매장 인계 ' + received : null,
          carryOver: date < S.data.today, locked: task.status !== 'waiting' || date < S.data.today, taskId: task.id });
      }
    }
    // Imported returns already held by a vehicle have no pending collection
    // task. Project their physical custody once, without inventing a movement.
    for (const order of F.orders.values()) {
      const initial = order.bindings.flatMap(b => b.initialVehicleAssetIds || []);
      const held = F.assets(initial).filter(a => a.location.kind === 'vehicle' && a.location.id === vid && a.vehicleOrigin === 'opening');
      if (!held.length || jobs.some(j => j.vehicleId === v.id && state.tasks.find(t => t.id === j.id)?.customerId === order.id && j.kind === 'collect')) continue;
      const base = S.data.orders.find(o => o.id === order.id);
      jobs.unshift({ id: 'initial-' + order.id, vehicleId: v.id, kind: 'collect', time: base?.time || '16:30', place: base?.place || '매장 인계 대기', name: order.customer.name, items: counts(held.map(a => a.id)), dateOffset: 0, status: 'done', inCar: held.length, returnState: '✓ 차에 있음', locked: true });
    }
  }
  const grouped = new Map();
  for (const a of state.assets.filter(a => a.ticket && a.location.kind === 'vehicle')) {
    const key = [a.lotId, a.location.id, a.purpose, a.refundId || ''].join('|');
    if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(a);
  }
  const lifts = [...grouped.values()].map(rows => {
    const a = rows[0], allocation = state.allocations.find(p => rows.some(a => a.id === p.assetId) && p.status === 'active' && !p.fulfilledAt);
    return { id: a.id, vehicleId: vehicles.find(v => vehicleId(v.id) === a.location.id)?.id || a.location.id, key: a.sku, qty: rows.length,
      purpose: a.purpose === 'delivery' ? 'deliver' : a.purpose, customer: allocation ? S.workflowCustomer(allocation.reservationId).name : null, assetIds: rows.map(a => a.id), refundId: a.refundId };
  });
  return { items, vehicles, jobs, lifts, kinds: KINDS, purposes: PURPOSE, revision: state.revision };
}
function currentRevision() { if (F.snap().revision !== board.revision) throw new Error('물품이나 업무가 변경됐습니다. 최신 화면을 확인한 뒤 다시 처리해 주세요.'); }
const fleet = {
  get ITEMS() { return projection.items; }, get VEHICLES() { return projection.vehicles; }, KINDS, PURPOSE,
  item: key => projection.items.find(i => i.key === key), isDone: done,
  jobsOf: (vid, offset) => projection.jobs.filter(j => j.vehicleId === vid && (j.dateOffset === offset || offset === 0 && j.carryOver && j.kind === 'collect' && (j.remainingCount || j.inCar))).sort((a, b) => Number(!!b.carryOver) - Number(!!a.carryOver)),
  lifts: vid => projection.lifts.filter(l => l.vehicleId === vid),
  moveJob(vid, id, action) {
    currentRevision();
    const result = F.run('dispatch.reorder', { vehicleId: vehicleId(vid), date: dateAt(board.state.dateOffset), taskId: id, action });
    const change = result.changes.find(c => c.taskId === id);
    return change && { name: projection.jobs.find(j => j.id === id)?.name, from: change.fromRank, to: change.toRank };
  },
  restoreTime(vid, offset) {
    currentRevision();
    if (!F.store.board({ vehicleId: vehicleId(vid), date: dateAt(offset) }).manualOrder) return 0;
    return F.run('dispatch.reorder', { vehicleId: vehicleId(vid), date: dateAt(offset), action: 'restore' }).taskIds.length;
  },
  notice(vid, type, message, id) { if (type === 'priority') { currentRevision(); F.run('task.priority', { id, message }); } },
  loadJob(id) {
    currentRevision();
    const task = F.snap().tasks.find(t => t.id === id);
    if (!task || task.kind !== 'delivery' || task.vehicleId !== vehicleId(board.state.vehicle) || !['waiting', 'in_progress'].includes(task.status)) throw new Error('현재 차량의 배달 업무를 확인해 주세요.');
    if (task.plannedItems) { F.loadDelivery(task.id); return; }
    const assets = F.assets(F.remaining(task)), to = { kind: 'vehicle', id: task.vehicleId };
    if (assets.some(a => !(a.location.kind === 'shop' && a.location.id === F.shopId) && !(a.location.kind === 'vehicle' && a.location.id === task.vehicleId))) throw new Error('고객에게서 수거하거나 담당 차량을 확인해야 하는 물품이 있습니다.');
    const ids = assets.filter(a => a.location.kind === 'shop').map(a => a.id);
    if (!ids.length) throw new Error('새로 실을 매장 물품이 없습니다.');
    F.run('stock.move', { kind: 'load', from: F.shop, to, assetIds: ids, purpose: 'delivery' });
  },
  setLiftPurpose(id, purpose) {
    currentRevision(); const group = projection.lifts.find(l => l.id === id);
    if (!group || group.vehicleId !== board.state.vehicle) throw new Error('현재 차량의 리프트권을 다시 확인해 주세요.');
    if (group.purpose === purpose) return;
    if (purpose === 'refund') { openRefund(group); return false; }
    const payload = { assetIds: group.assetIds, vehicleId: vehicleId(group.vehicleId), purpose: purpose === 'deliver' ? 'delivery' : 'spare' };
    if (group.refundId) F.atomic(commit => { commit('refund.cancel', { id: group.refundId, assetIds: group.assetIds, reason: '차량 리프트권 용도 변경' }); if (payload.purpose !== 'spare') commit('stock.purpose', payload); });
    else F.run('stock.purpose', payload);
  }
};
function openRefund(group) {
  const revision = F.snap().revision;
  S.close(); S.render();
  W.openPicker('리프트권 환불 배정', F.assets(group.assetIds), ids => {
    if (F.snap().revision !== revision) throw new Error('물품이 변경됐습니다. 창을 다시 열어 주세요.');
    F.run('refund.plan', { id: window.SkiWorkflowClient.randomId('refund-'), assetIds: ids, vehicleId: vehicleId(group.vehicleId), vendorId: F.assets(ids)[0].ticket.vendorId,
      date: W.read('dispatch-refund-date'), time: W.read('dispatch-refund-time'), place: W.read('dispatch-refund-place') }); W.changed('환불할 권으로 배정했습니다. 수량과 보관 위치는 그대로입니다.');
  }, '<div class="wf-form-grid">' + S.field('환불 날짜', dateAt(board.state.dateOffset), 'date', 'id="dispatch-refund-date"') + S.field('방문 시간', '16:00', 'time', 'id="dispatch-refund-time"') + S.field('방문 장소', '리조트 매표소', 'text', 'id="dispatch-refund-place"') + '</div>');
}
function openTransfer(kind) {
  currentRevision();
  const state = F.snap(), revision = state.revision, id = vehicleId(board.state.vehicle), van = { kind: 'vehicle', id };
  const loading = kind === 'load', from = loading ? F.shop : van, to = loading ? van : F.shop;
  const rows = state.assets.filter(a => a.location.kind === from.kind && a.location.id === from.id && (!loading ||
    (!a.refundId || state.refunds.find(r => r.id === a.refundId)?.vehicleId === id) &&
    !state.tasks.some(t => t.kind === 'delivery' && ['waiting', 'in_progress'].includes(t.status) && t.vehicleId !== id && F.remaining(t).includes(a.id))));
  const vehicle = projection.vehicles.find(v => vehicleId(v.id) === id).name;
  S.close(); S.render();
  W.openPicker(vehicle + (loading ? ' · 추가로 싣기' : ' · 매장에 내리기'), rows, ids => {
    if (F.snap().revision !== revision) throw new Error('물품이 변경됐습니다. 창을 다시 열어 주세요.');
    if (loading) {
      const delivery = a => state.allocations.some(p => p.assetId === a.id && p.status === 'active' && !p.fulfilledAt) || state.tasks.some(t => t.kind === 'delivery' && ['waiting', 'in_progress'].includes(t.status) && F.remaining(t).includes(a.id));
      F.atomic(commit => { for (const purpose of ['delivery', 'spare']) {
        const chosen = rows.filter(a => ids.includes(a.id) && (delivery(a) ? 'delivery' : a.purpose === 'delivery' ? 'delivery' : 'spare') === purpose).map(a => a.id);
        if (chosen.length) commit('stock.move', { kind, from, to, assetIds: chosen, purpose });
      } });
    } else F.run('stock.move', { kind, from, to, assetIds: ids });
    W.changed(ids.length + '개 ' + (loading ? '적재했습니다. 기존 적재품과 남은 업무는 유지됩니다.' : '매장에 내렸습니다. 미수거 수량은 다음 방문에 이어서 받을 수 있습니다.'));
  }, '<p class="wf-hint">' + (loading ? '이번에 실은 물품만 선택하세요. 리프트권만 추가로 실어도 됩니다.' : '이번에 매장에 내린 물품만 선택하세요. 차에 남기는 물품은 선택하지 마세요.') + '</p>');
}
function openCollection(id) {
  currentRevision();
  const task = F.snap().tasks.find(t => t.id === id), revision = F.snap().revision;
  if (!task || task.kind !== 'collection' || task.vehicleId !== vehicleId(board.state.vehicle) || !['waiting', 'in_progress'].includes(task.status)) throw new Error('현재 차량의 남은 수거 업무를 확인해 주세요.');
  const remaining = F.remaining(task), from = { kind: 'customer', id: task.customerId }, to = { kind: 'vehicle', id: task.vehicleId };
  const rows = F.assets(remaining).filter(a => a.location.kind === 'customer' && a.location.id === task.customerId);
  const name = projection.jobs.find(j => j.id === id).name;
  S.close(); S.render();
  W.openPicker(name + ' 팀 · 이번에 수거한 수량', rows, ids => {
    if (F.snap().revision !== revision) throw new Error('수거 내역이 변경됐습니다. 창을 다시 열어 주세요.');
    F.atomic(commit => {
      commit('stock.move', { kind: 'collect', from, to, taskId: task.id, assetIds: ids });
      if (remaining.every(id => ids.includes(id))) commit('task.status', { id: task.id, status: 'completed' });
    });
    W.changed(ids.length + '개 수거했습니다. ' + (remaining.length > ids.length ? '남은 ' + (remaining.length - ids.length) + '개는 다음 방문에 이어서 받으세요.' : '매장에 내리면 인계 수량에 반영됩니다.'));
  }, '<p class="wf-hint">이번에 차에 실은 수량만 선택하세요. 차가 꽉 차면 매장에 내린 뒤 나머지를 이어서 받을 수 있습니다.</p>');
}
const RETURN_KINDS = ['collect', 'refund'];
const KIND_COLOR = { collect: '#EF3408', deliver: '#0074D9', refund: '#414141', liftDeliver: '#0074D9', liftRefund: '#414141' };

class DispatchBoard {
  props = {};
  state = { vehicle: 'v1', dateOffset: 0, loaded: {}, selected: null, tab: 'load', dialog: null, railOpen: false, notice: '', width: 1366 };

  say(t) { clearTimeout(this._t); this.setState({ notice: t }); this._t = setTimeout(() => this.setState({ notice: '' }), 4000); }
  moveTo(id, dir) {
    const F = fleet;
    const r = F.moveJob(this.state.vehicle, id, dir);
    if (!r) return;
    F.notice(this.state.vehicle, 'order', '매장에서 ' + r.name + ' 팀을 ' + r.from + '번째 → ' + r.to + '번째로 변경', id);
    this.say(r.name + ' 팀 ' + r.from + '번째 → ' + r.to + '번째. 약속 시간은 그대로입니다.');
  }

  renderVals() {
    const F = fleet;
    if (!F) return {};
    const s = this.state;
    const vid = s.vehicle;
    const narrow = !!this.props.forceNarrow || s.width < 1200;
    const open = s.railOpen;
    const navBase = 'display:flex;align-items:center;min-height:48px;border:0;border-radius:var(--mk-radius-xl,14px);transition:background 180ms cubic-bezier(.2,0,.2,1);'
      + (open ? 'gap:11px;padding:10px 13px;font-size:16px;' : 'gap:0;padding:10px;font-size:0;justify-content:center;');
    const seg = on => 'display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;font-size:17px;font-weight:700;border:0;border-radius:var(--mk-radius-lg,12px);white-space:nowrap;'
      + (on ? 'background:#1A1A1A;color:#fff;' : 'background:transparent;color:#5D5D5D;');
    const panel = 'min-width:0;min-height:0;flex-direction:column;background:#fff;border-radius:var(--mk-radius-2xl,16px);box-shadow:inset 0 0 0 1px var(--mk-neutral-100,#E7E7E7);overflow:hidden;';
    const tab = on => 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:64px;border:0;border-radius:var(--mk-radius-lg,12px);line-height:1.2;'
      + (on ? 'background:var(--mk-orange-100,#FFE6D4);color:var(--mk-orange-600,#EF3408);' : 'background:#fff;color:#5D5D5D;box-shadow:inset 0 0 0 1px var(--mk-neutral-200,#D1D1D1);');

    const all = F.jobsOf(vid, s.dateOffset);
    const vehicle = F.VEHICLES.filter(v => v.id === vid)[0] || {};
    const itemsLine = j => F.ITEMS.filter(i => j.items[i.key]).map(i => i.short + ' ' + j.items[i.key]).join(' · ');
    const loadJob = all.filter(j => j.kind === 'load')[0];
    const handover = all.filter(j => j.kind === 'handover')[0];
    const visits = all.filter(j => j.kind !== 'load' && j.kind !== 'handover' && !j.loadOnly);
    const loadedAt = j => j.loadedAt || null;

    const loadTeams = all.filter(j => !F.isDone(j) && (j.kind === 'deliver' || j.kind === 'liftDeliver'));
    const loadedN = loadTeams.filter(j => j.kind === 'deliver' && loadedAt(j)).length;
    const loadTotal = loadTeams.filter(j => j.kind === 'deliver').length;
    const returnTeams = visits.filter(j => RETURN_KINDS.indexOf(j.kind) >= 0);
    const inCar = returnTeams.filter(j => F.isDone(j)).length;
    const remaining = visits.filter(j => !F.isDone(j)).length;
    const lifts = F.lifts(vid).filter(l => l.purpose === 'spare');
    const spareByKey = lifts.reduce((m, l) => { m[l.key] = (m[l.key] || 0) + l.qty; return m; }, {});
    const spareText = lifts.length ? '예비로 실은 것 · ' + F.ITEMS.filter(i => spareByKey[i.key]).map(i => i.short + ' ' + spareByKey[i.key] + '매').join(' · ') : '팀 말고 예비로 실은 권 없음';
    const sel = s.selected && visits.filter(j => j.id === s.selected)[0];
    const dlg = s.dialog;
    const allLifts = F.lifts(vid);
    const smallBtn = on => 'display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 11px;font-size:16px;font-weight:700;border:0;border-radius:var(--mk-radius-md,8px);white-space:nowrap;'
      + (on ? 'color:#fff;background:var(--mk-orange-500,#FE4E10);' : 'color:#5D5D5D;background:#fff;box-shadow:inset 0 0 0 1px var(--mk-neutral-200,#D1D1D1);');

    return {
      railOpen: open,
      toggleRail: () => this.setState(st => ({ railOpen: !st.railOpen })),
      railStyle: 'flex-shrink:0;box-sizing:border-box;background:#fff;box-shadow:inset -1px 0 0 var(--mk-neutral-100,#E7E7E7);display:flex;flex-direction:column;overflow-y:auto;'
        + (open ? 'width:214px;padding:16px 14px 14px;gap:18px;' : 'width:72px;padding:14px 12px;gap:14px;'),
      brandRowStyle: 'display:flex;align-items:center;gap:11px;flex-shrink:0;' + (open ? 'padding:0 6px;' : 'justify-content:center;'),
      brandTextStyle: open ? 'min-width:0' : 'display:none',
      captionStyle: open ? 'font-size:14px;font-weight:500;color:var(--mk-neutral-500,#6D6D6D);padding:0 0 6px 14px' : 'display:none',
      footStyle: open ? 'margin-top:auto;background:var(--mk-neutral-50-alt,#FAFAFA);border-radius:var(--mk-radius-lg,12px);box-shadow:inset 0 0 0 1px var(--mk-neutral-100,#E7E7E7);padding:12px 13px' : 'display:none',
      navStyle: navBase + 'color:var(--mk-neutral-600,#5D5D5D);background:transparent;font-weight:500;',
      navActiveStyle: navBase + 'color:#fff;background:var(--mk-orange-500,#FE4E10);font-weight:700;',

      driverLine: '· ' + (vehicle.name || '') + ' · ' + (vehicle.driver || ''),
      dateBtns: [[0, '오늘'], [1, '내일']].map(([n, label]) => ({ label, pressed: s.dateOffset === n, style: seg(s.dateOffset === n), onClick: () => this.setState({ dateOffset: n, selected: null }) })),
      vehicles: F.VEHICLES.map(v => {
        const on = vid === v.id;
        const pending = F.jobsOf(v.id, s.dateOffset).filter(j => !F.isDone(j) && j.kind !== 'load' && j.kind !== 'handover' && !j.loadOnly).length;
        return {
          name: v.name, sub: '남은 ' + pending, pressed: on,
          style: 'display:flex;align-items:center;gap:8px;min-height:52px;padding:0 18px;font-size:18px;font-weight:700;border:0;border-radius:var(--mk-radius-xl,14px);white-space:nowrap;'
            + (on ? 'background:#1A1A1A;color:#fff;' : 'background:#fff;color:#5D5D5D;box-shadow:inset 0 0 0 1px var(--mk-neutral-200,#D1D1D1);'),
          subStyle: 'font-size:15px;font-weight:600;padding:2px 8px;border-radius:var(--mk-radius-xs,4px);font-variant-numeric:tabular-nums;' + (on ? 'background:rgba(255,255,255,.2);color:#fff;' : 'background:var(--mk-neutral-100,#E7E7E7);color:#5D5D5D;'),
          onClick: () => this.setState({ vehicle: v.id, selected: null })
        };
      }),

      tabRowStyle: narrow ? 'flex-shrink:0;display:grid;grid-template-columns:1fr 1fr;gap:8px' : 'display:none',
      tabLoadOn: s.tab === 'load', tabReturnOn: s.tab === 'return',
      tabLoadStyle: tab(s.tab === 'load'), tabReturnStyle: tab(s.tab === 'return'),
      showLoad: () => this.setState({ tab: 'load' }), showReturn: () => this.setState({ tab: 'return' }),
      boardStyle: 'flex:1;min-height:0;display:grid;gap:12px;grid-template-columns:' + (narrow ? 'minmax(0,1fr) minmax(300px,34%)' : 'minmax(300px,26%) minmax(0,1fr) minmax(280px,24%)'),
      loadPanelStyle: panel + (narrow ? (s.tab === 'load' ? 'display:flex;order:2;' : 'display:none;') : 'display:flex;'),
      returnPanelStyle: panel + (narrow ? (s.tab === 'return' ? 'display:flex;order:2;' : 'display:none;') : 'display:flex;'),

      loadCount: loadTotal ? '배달 ' + loadTotal + '팀 중 ' + loadedN + '팀 실림' : '실을 배달 팀 없음',
      noLoad: loadTeams.length === 0,
      loadTeams: loadTeams.map(j => {
        const at = j.kind === 'deliver' ? loadedAt(j) : null;
        const fromCollect = j.kind === 'liftDeliver';
        const pending = !at && !fromCollect;
        return {
          id: j.id, name: j.name + ' 팀',
          line: j.time + ' ' + j.place + ' · ' + itemsLine(j) + (j.needsIssue ? ' · 발권 전 수량 있음' : '') + (fromCollect ? ' · 수거한 권으로 전달, 실을 것 없음' : ''),
          loadLabel: j.needsIssue && !j.canLoad ? '발권·준비' : '실었어요',
          style: 'display:flex;align-items:center;gap:12px;box-sizing:border-box;padding:12px 14px;border-radius:var(--mk-radius-lg,12px);'
            + (pending ? 'background:#fff;box-shadow:inset 0 0 0 3px var(--mk-orange-500,#FE4E10);' : at ? 'background:var(--mk-green-50,#F0FDF4);' : 'background:var(--mk-neutral-50,#F8F8F8);'),
          btnStyle: pending ? 'display:flex;align-items:center;justify-content:center;flex-shrink:0;min-height:56px;padding:0 16px;font-size:17px;font-weight:700;color:#fff;background:var(--mk-orange-500,#FE4E10);border:0;border-radius:var(--mk-radius-md,8px);white-space:nowrap;transition:background 180ms cubic-bezier(.2,0,.2,1);' : 'display:none',
          doneStyle: pending ? 'display:none' : 'flex-shrink:0;text-align:right;font-size:15px;font-weight:700;line-height:1.3;white-space:nowrap;color:' + (at ? 'var(--mk-green-700,#15803D)' : '#6D6D6D'),
          done: at ? '✓ 실림 ' + at : '수거 후',
          onLoad: () => { if (j.needsIssue && !j.canLoad) { W.openOrderTickets(j.orderId); return; } F.loadJob(j.id); this.say(j.name + ' 팀 물품을 차에 실었습니다. 차량 화면에 표시됩니다.'); }
        };
      }),
      spareLine: spareText,

      visitCount: visits.length ? '남은 방문 ' + remaining + '곳 · 전체 ' + visits.length + '곳' : '방문 없음',
      noVisits: visits.length === 0,
      visits: visits.map((j, i) => {
        const done = F.isDone(j);
        const isSel = s.selected === j.id;
        const K = F.KINDS[j.kind];
        const remIdx = visits.filter(x => !F.isDone(x)).indexOf(j);
        const at = j.kind === 'deliver' ? loadedAt(j) : null;
        return {
          id: j.id, num: done ? '✓' : String(remIdx + 1),
          numStyle: 'display:grid;place-items:center;flex-shrink:0;width:44px;height:44px;border-radius:10px;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;'
            + (done ? 'background:#BBF7D0;color:var(--mk-green-700,#15803D);' : remIdx === 0 ? 'background:var(--mk-orange-500,#FE4E10);color:#fff;' : 'background:var(--mk-orange-100,#FFE6D4);color:var(--mk-orange-600,#EF3408);'),
          time: j.time, id: j.id, name: j.name + ' 팀',
          kind: K.label, kindStyle: 'font-weight:700;margin-right:6px;color:' + (KIND_COLOR[j.kind] || '#414141'),
          line: j.place + ' · ' + itemsLine(j) + (j.kind === 'deliver' ? (at ? ' · ✓ 실림' : ' · 아직 안 실음') : ''),
          state: done ? K.doneLine : j.status === 'moving' ? '이동 중' : j.status === 'partial' ? '일부만 처리' : (j.kind === 'deliver' && !at ? '안 실음' : ''),
          stateStyle: 'flex-shrink:0;font-size:15px;font-weight:700;white-space:nowrap;color:' + (done ? 'var(--mk-green-700,#15803D)' : j.status === 'moving' ? '#0074D9' : '#EF3408'),
          selected: isSel,
          style: 'display:flex;align-items:center;gap:12px;box-sizing:border-box;padding:12px 14px;border-radius:var(--mk-radius-lg,12px);cursor:pointer;'
            + (done ? 'background:var(--mk-green-50,#F0FDF4);' : 'background:#fff;box-shadow:inset 0 0 0 ' + (isSel ? '3px var(--mk-orange-500,#FE4E10)' : '1px var(--mk-neutral-100,#E7E7E7)') + ';'),
          onPick: () => this.setState({ selected: isSel ? null : j.id }),
          moveWrapStyle: done ? 'display:none' : 'display:flex;gap:6px;flex-shrink:0',
          upOff: i <= 0 || F.isDone(visits[i - 1]), downOff: i >= visits.length - 1,
          onUp: e => { e.stopPropagation(); this.moveTo(j.id, 'up'); },
          onDown: e => { e.stopPropagation(); this.moveTo(j.id, 'down'); }
        };
      }),
      notifyOff: !sel || F.isDone(sel),
      notifyLabel: sel ? sel.name + ' 팀 기사님께 알리기' : '팀을 누른 뒤 기사님께 알리기',
      notifyDriver: () => {
        if (!sel) return;
        F.notice(vid, 'priority', sel.name + ' 고객 우선 확인 요청 · ' + sel.time + ' ' + sel.place, sel.id);
        this.say(sel.name + ' 팀 확인 요청을 차량 화면에 보냈습니다.');
      },
      restoreOrder: () => {
        const n = F.restoreTime(vid, s.dateOffset);
        F.notice(vid, 'order', '매장에서 방문 순서를 시간순으로 복원(' + n + '건)', null);
        this.say('방문 순서를 시간순으로 되돌렸습니다.');
      },

      returnCount: returnTeams.length ? returnTeams.length + '팀 중 ' + inCar + '팀 차에 있음' : '수거 팀 없음',
      noReturn: returnTeams.length === 0,
      returnTeams: returnTeams.map(j => {
        const done = F.isDone(j);
        return {
          id: j.id, name: j.name + ' 팀',
          state: done ? '✓ 차에 있음' : j.time + ' ' + (j.kind === 'refund' ? '환불 예정' : '수거 예정'),
          stateStyle: 'font-size:15px;font-weight:' + (done ? '700;color:var(--mk-green-700,#15803D)' : '500;color:#6D6D6D'),
          line: itemsLine(j),
          style: 'box-sizing:border-box;padding:12px 14px;border-radius:var(--mk-radius-lg,12px);background:' + (done ? 'var(--mk-green-50,#F0FDF4)' : 'var(--mk-neutral-50,#F8F8F8)')
        };
      }),
      handoverLine: handover ? handover.time + ' 매장에 내린 뒤' : '매장에 내린 뒤',

      openPurposeEdit: () => this.setState({ dialog: 'purpose' }),
      dialogOpen: !!dlg,
      dialogTitle: '차에 있는 리프트권 용도 바꾸기',
      dialogLead: '용도만 바뀝니다. 수량은 다시 더하지 않습니다.',
      dialogNote: '화면 체험용 예시입니다. 실제 발권·환불 처리는 실행되지 않습니다.',
      liftRows: allLifts.map(l => ({
        id: l.id, name: F.item(l.key).name, qty: l.qty + '매', who: l.customer ? l.customer + ' 팀 몫' : '고객 미지정',
        options: Object.keys(F.PURPOSE).map(p => ({
          label: F.PURPOSE[p], pressed: l.purpose === p, style: smallBtn(l.purpose === p),
          onClick: () => { if (F.setLiftPurpose(l.id, p, l.customer) !== false) this.say('용도만 변경했습니다. 수량은 그대로입니다.'); }
        }))
      })),
      noLifts: allLifts.length === 0,
      closeDialog: () => this.setState({ dialog: null }),

      resetData: () => { F.reset(); this.setState({ loaded: {}, selected: null }); this.say('샘플 데이터를 처음 상태로 되돌렸습니다.'); },
      notice: s.notice,
      goHome: () => this.say('오늘 현황 화면으로 이동합니다.'),
      goIntake: () => this.say('새 대여 접수 화면으로 이동합니다.'),
      goRentals: () => this.say('렌탈·반납 현황 화면으로 이동합니다.'),
      goPartners: () => this.say('거래처 장부 화면으로 이동합니다.'),
      goClosing: () => this.say('하루 마감 화면으로 이동합니다.'),
      goPreparation: () => this.say('사전 입력·준비 화면으로 이동합니다.'),
      goCustomers: () => this.say('고객관리 화면으로 이동합니다.'),
      goInventory: () => this.say('재고·정비 화면으로 이동합니다.'),
      goSettings: () => this.say('매장 설정 화면으로 이동합니다.'),
      goGuide: () => this.say('QR 이용 안내 화면으로 이동합니다.'),
      goVehicle: () => this.say('차량 태블릿 화면으로 이동합니다. 06 차량 배달·수거 화면에서 결과를 볼 수 있습니다.'),
      doLogout: () => this.say('로그인 화면으로 이동합니다.')
    };
  }
}

board = new DispatchBoard();
board.setState = function(update) {
  const next = typeof update === 'function' ? update(this.state) : update;
  Object.assign(this.state, next); if ('dialog' in next) this.error = '';
  if (S.state.page === 'dispatch') redraw();
};
function redraw() {
  const scrolls = [...S.root.querySelectorAll('.so-dispatch-board [aria-label="방문 순서"],.so-dispatch-board [data-dispatch-scroll],.so-dispatch-overlay>div')].map(el => [el.getAttribute('aria-label'), el.scrollTop]);
  const active = document.activeElement, focusKey = active?.getAttribute('data-dispatch-click');
  S.render();
  [...S.root.querySelectorAll('.so-dispatch-board [aria-label="방문 순서"],.so-dispatch-board [data-dispatch-scroll],.so-dispatch-overlay>div')].forEach((el, i) => { el.scrollTop = scrolls[i]?.[1] || 0; });
  if (focusKey) [...S.root.querySelectorAll('[data-dispatch-click]')].find(el => el.getAttribute('data-dispatch-click') === focusKey)?.focus({ preventScroll: true });
}
function render() {
  projection = snapshot(); board.revision = projection.revision; board.state.width = innerWidth;
  const values = board.renderVals(), jobs = fleet.jobsOf(board.state.vehicle, board.state.dateOffset), visits = jobs.filter(j => j.kind !== 'load' && j.kind !== 'handover' && !j.loadOnly);
  // Completed collection is not proof that the vehicle still holds the items.
  const returns = jobs.filter(j => RETURN_KINDS.includes(j.kind));
  const inCar = returns.filter(j => j.inCar > 0).length;
  values.returnCount = returns.length ? returns.length + '팀 중 ' + inCar + '팀 차에 있음' : '수거 팀 없음';
  values.loadMore = () => openTransfer('load');
  values.receiveMore = () => openTransfer('receive');
  values.returnTeams.forEach((row, i) => {
    const job = returns[i];
    if (job.returnState) row.state = job.returnState;
    if (job.carryOver) row.line = dateAt(job.dateOffset).slice(5).replace('-', '/') + ' 예정 · ' + row.line;
    row.canCollect = job.kind === 'collect' && job.remainingCount > 0;
    row.onCollect = () => openCollection(job.taskId);
  });
  values.visits.forEach((row, i) => {
    const job = visits[i], movable = visits.filter(j => !j.locked), index = movable.indexOf(job);
    row.upOff = job.locked || index <= 0; row.downOff = job.locked || index >= movable.length - 1;
  });
  values.dialogError = board.error || '';
  callbacks = new Map(); let number = 0;
  return window.SkiDispatchView(values, (fn, name) => { const id = name + ':' + number++; callbacks.set(id, fn); return id; }, S.esc);
}
let modalShown = false;
function mount() {
  const dialog = S.$('.so-dispatch-overlay');
  for (const el of S.root.querySelectorAll('.so-sidebar,.so-topbar,.so-dispatch-board')) el.inert = !!dialog;
  if (dialog && !modalShown) dialog.querySelector('button')?.focus({ preventScroll: true });
  if (!dialog && modalShown) S.$('[data-dispatch-click^="openPurposeEdit:"]')?.focus({ preventScroll: true });
  modalShown = !!dialog;
}
S.root.addEventListener('click', event => {
  const target = event.target.closest('[data-dispatch-click]');
  if (!target || target.disabled || S.state.page !== 'dispatch') return;
  const handler = callbacks.get(target.dataset.dispatchClick);
  if (handler) try { handler(event); } catch (error) { board.error = error.message; if (board.state.dialog) redraw(); else { redraw(); S.toast(error.message); } }
});
S.root.addEventListener('keydown', event => {
  if (S.state.page !== 'dispatch') return;
  const dialog = S.$('.so-dispatch-overlay');
  if (!dialog && event.target.matches('[data-visit-id]') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.target.click(); }
  if (!dialog) return;
  if (event.key === 'Escape') { event.preventDefault(); board.setState({ dialog: null }); }
  if (event.key === 'Tab') {
    const buttons = [...dialog.querySelectorAll('button:not(:disabled),input,select')];
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
  }
});
S.root.addEventListener('ski:close-dialogs', () => { clearTimeout(board._t); board.state.dialog = null; board.state.notice = ''; board.error = ''; modalShown = false; for (const el of S.root.querySelectorAll('.so-sidebar,.so-topbar,.so-dispatch-board')) el.inert = false; });
window.addEventListener('resize', () => { if (S.state.page === 'dispatch') redraw(); });
function management(completed = false) {
  const context = { vehicleId: vehicleId(board.state.vehicle), date: dateAt(board.state.dateOffset) }, list = F.store.board(context);
  const rows = completed ? list.completed : [...list.inProgress, ...list.pending];
  S.close(); S.render();
  W.modal('배달·수거 업무 관리', '<div class="wf-actions">' + S.field('조회 날짜', context.date, 'date', 'data-change="dispatch-date"') + S.button(completed ? '남은 업무 보기' : '완료 내역 보기', 'dispatch-history', completed ? 'pending' : 'completed') + '</div>' + (rows.length ? rows.map(t => W.row(S.esc(t.title), S.esc(t.time + ' · ' + t.place) + ' · ' + W.textItems(F.remaining(t)), completed ? S.status(t.status === 'cancelled' ? '취소' : '완료', 'green') :
    (t.status === 'waiting' ? S.button('맨 위', 'dispatch-top', t.id) : '') + (t.vehicleId === F.vehicleId ? S.button('업무 보기', 'dispatch-task', t.id) : '') + (t.kind !== 'refund' && !t.formId ? S.button('업무 취소', 'wf-task-cancel', t.id) : ''))).join('') : W.empty('해당 날짜의 업무가 없습니다.')), S.button('닫기', 'close'));
}
S.action('dispatch-manage', () => management());
S.action('dispatch-history', value => management(value === 'completed'));
S.change('dispatch-date', value => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return; board.state.dateOffset = offsetOf(value); board.state.selected = null; management(); });
S.action('dispatch-top', W.safe(id => { fleet.moveJob(board.state.vehicle, id, 'top'); S.close(); S.render(); S.toast('선택한 업무를 맨 위로 옮겼습니다.'); }));
S.action('dispatch-task', id => W.openTask(id));
S.register('dispatch', { title: '배달·수거', render, mount, headerTools: () => '<div class="dispatch-tools">' + S.button('업무 관리', 'dispatch-manage') + S.link(board.state.vehicle === 'v1' ? '차량 적재·인계' : '1호 차량 적재·인계', 'vehicle-stock') + '</div>' });
S.dispatchBoard = Object.freeze({ snapshot, context: () => ({ vehicleId: vehicleId(board.state.vehicle), date: dateAt(board.state.dateOffset), selected: board.state.selected }), selectTask(id) { const t = F.snap().tasks.find(t => t.id === id); if (!t) return; board.setState({ vehicle: t.vehicleId === F.vehicleId ? 'v1' : 'v2', dateOffset: offsetOf(t.date), selected: id }); } });
})();
