(() => {
'use strict';
const S = window.SkiOps, F = S.workflow;
const C = window.SkiNotificationClient;
const keyOf = sku => ({ clothing: 'wear', 'ticket-3h': 'lift3', 'ticket-4h': 'lift4', 'ticket-6h': 'lift6' })[sku] || sku;
const skuOf = key => ({ wear: 'clothing', lift3: 'ticket-3h', lift4: 'ticket-4h', lift6: 'ticket-6h' })[key] || key;
const KIND = {
  collect: { label: '수거', done: '수거 완료', partial: '일부만 받았어요', itemsLabel: '이번에 받을 물품', taken: '이번에 받은 품목', left: '고객에게 남은 품목', note: '차량 수거 후 매장에서 인계 수량을 확인합니다.', ask: '이번 업무의 남은 물품을 모두 받았나요?' },
  deliver: { label: '배달', done: '전달 완료', partial: '일부만 전달했어요', itemsLabel: '이번에 전달할 물품', taken: '이번에 전달한 품목', left: '아직 전달하지 않은 품목', note: '실제로 고객에게 전달한 수량만 기록합니다.', ask: '고객에게 아래 물품을 모두 전달했나요?' },
  liftRefund: { label: '발권처 환불', done: '환불 결과 입력', partial: '일부 환불', itemsLabel: '이번에 환불할 권', taken: '환불한 권', left: '남은 환불권', note: '실제 환불 결과는 수량과 금액을 함께 확인합니다.', ask: '발권처 환불 결과를 확인하세요.' },
  load: { label: '매장 적재', done: '적재 내역', partial: '적재 내역', itemsLabel: '차량에 실은 물품', taken: '실은 물품', left: '남은 품목', note: '실제 적재 이력입니다.' },
  handover: { label: '매장 인계', done: '인계 내역', partial: '인계 내역', itemsLabel: '매장에 내린 물품', taken: '내린 물품', left: '남은 품목', note: '실제 매장 인계 이력입니다.' }
};
KIND.liftDeliver = KIND.deliver; KIND.refund = KIND.liftRefund;
Object.values(KIND).forEach(k => { k.doneLine = k.done; k.doneMsg = k.done + ' · 수량을 반영했습니다.'; });
let data, callbacks = new Map(), revision = 0;
const bell = S.$('#so-notice-bell'), bellParent = bell.parentElement;
function restoreBell() { if (bell.parentElement !== bellParent) bellParent.prepend(bell); }
function projection() {
  const snap = F.snap(), history = F.store.history().movements, view = S.dispatchBoard.snapshot();
  const items = view.items.map(i => ({ ...i, sku: i.key, key: keyOf(i.key), group: i.key === 'clothing' ? 'wear' : i.key === 'helmet' ? 'helmet' : snap.catalog.find(s => s.id === i.key).kind === 'liftTicket' ? 'lift' : 'gear' }));
  const jobs = view.jobs.map(j => {
    const task = snap.tasks.find(t => t.id === j.id), customer = S.workflowCustomer(task?.customerId || j.orderId || j.id.replace('initial-', ''));
    const base = S.data.orders.find(o => o.id === (task?.orderId || task?.customerId));
    const lotLine = task ? F.assets(task.assetIds).filter(a => a.ticket).map(a => {
      const allocation = snap.allocations.find(p => p.assetId === a.id && p.status === 'active' && !p.fulfilledAt);
      return snap.catalog.find(s => s.id === a.sku).label + ' · 유효 ' + S.workflowUI.stamp(a.ticket.validFrom) + '~' + S.workflowUI.stamp(a.ticket.validTo) + (allocation ? ' · 전달 예정 ' + S.workflowCustomer(allocation.reservationId).name : '');
    }).filter((x, i, a) => a.indexOf(x) === i).join(' / ') : '';
    return { ...j, items: Object.fromEntries(Object.entries(j.items).map(([k, v]) => [keyOf(k), v])), phone: customer.phone || base?.phone || '', detail: base?.detail || '', memo: task?.memo || base?.note || '', slotLabel: base?.slot || '', lotLine, needsLoad: task?.kind === 'delivery' && F.remainingQuantity(task) > F.assets(F.remaining(task)).filter(a => a.location.id === F.vehicleId).length, task };
  });
  for (const m of history.filter(m => ['load', 'receive'].includes(m.kind) && m.assetIds.some(id => !m.reversedAssetIds.includes(id)))) {
    const vid = m.kind === 'load' ? m.to.id : m.from.id;
    const vehicleId = view.vehicles.find(v => (v.id === 'v1' ? F.vehicleId : 'demo-van-2') === vid)?.id;
    if (!vehicleId) continue;
    const date = window.SkiWorkflowCommon.day(m.at), dateOffset = Math.round((Date.parse(date) - Date.parse(S.data.today)) / 86400000);
    const counts = {};
    F.assets(m.assetIds.filter(id => !m.reversedAssetIds.includes(id))).forEach(a => { const key = keyOf(a.sku); counts[key] = (counts[key] || 0) + 1; });
    jobs.push({ id: m.id, vehicleId, kind: m.kind === 'load' ? 'load' : 'handover', status: 'done', name: '매장', place: '매장 창고', phone: '', detail: '', memo: '', dateOffset, items: counts, time: new Date(m.at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }) });
  }
  const notices = S.notificationRuntime.driver.sync(0).records.filter(n => n.lifecycle === 'active').map(n => ({ id: n.id, type: n.type === 'sequence' ? 'order' : n.type === 'load' ? 'items' : n.type, text: n.summary + (n.message ? ' · ' + n.message : ''), at: n.createdAt, ack: !!n.acknowledgedAt, jobId: n.taskId || jobs.find(j => j.task?.customerId === n.orderId)?.id }));
  const summary = F.store.vehicle({ vehicleId: F.vehicleId });
  const st = Object.fromEntries(items.map(i => { const t = summary.totals.find(t => t.sku === i.sku); return [i.key, { store: t?.loadedFromShop || 0, guest: t?.collectedFromCustomers || 0 }]; }));
  // Initial vehicle inventory also has a real current location.
  for (const i of items) { const rows = snap.assets.filter(a => a.location.kind === 'vehicle' && a.location.id === F.vehicleId && a.sku === i.sku); st[i.key] = { store: rows.filter(a => a.vehicleOrigin === 'shop').length, guest: rows.filter(a => a.vehicleOrigin !== 'shop').length }; }
  const refund = Object.fromEntries(items.map(i => [i.key, snap.assets.filter(a => a.location.kind === 'vehicle' && a.location.id === F.vehicleId && a.sku === i.sku && a.refundId).length]));
  const collected = Object.fromEntries(items.map(i => [i.key, history.filter(m => m.kind === 'collect' && m.to.id === F.vehicleId).reduce((n, m) => n + F.assets(m.assetIds.filter(id => !m.reversedAssetIds.includes(id))).filter(a => a.sku === i.sku).length, 0)]));
  const liftView = Object.fromEntries(items.filter(i => i.group === 'lift').map(i => [i.key, { deliverable: snap.assets.filter(a => a.sku === i.sku && a.location.id === F.vehicleId && a.ticket && !a.refundId && Date.parse(a.ticket.validTo) >= Date.parse(snap.at)).length }]));
  return { items, jobs, vehicles: view.vehicles, notices, st, refund, collected, liftView, kinds: KIND };
}
const fleet = {
  get ITEMS() { return data.items; }, get VEHICLES() { return data.vehicles; }, KINDS: KIND,
  jobsOf: (vid, offset) => data.jobs.filter(j => j.vehicleId === vid && (j.dateOffset === offset || offset === 0 && j.carryOver && j.kind === 'collect' && (j.remainingCount || j.inCar))),
  isDone: j => j.status === 'done', item: key => data.items.find(i => i.key === key), job: id => data.jobs.find(j => j.id === id), notices: () => data.notices,
  stock: () => ({ st: data.st, refund: data.refund, collected: data.collected }),
  liftView: () => data.liftView,
  split(j, missing) { const taken = [], left = []; for (const i of data.items) { const n = j.items[i.key] || 0, miss = Math.max(0, Math.min(n, missing?.[i.key] || 0)); if (n > miss) taken.push({ key: i.key, name: i.short, qty: n - miss }); if (miss) left.push({ key: i.key, name: i.short, qty: miss }); } return { taken, left }; },
  ackNotice(id) { S.notificationRuntime.driver.execute(C.command('ack', {}, id)); S.notifications.refresh(); },
  lot: () => null
};
const start = S.data.today;
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const label = d => d ? Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)) : '';
const dayName = n => ['오늘', '내일', '모레'][n] || label(addDays(start, n));

const FILTERS = [['all', '전체'], ['collect', '수거'], ['deliver', '전달'], ['refund', '환불'], ['store', '매장']];
const GROUP = { collect: ['collect'], deliver: ['deliver', 'liftDeliver'], refund: ['refund', 'liftRefund'], store: ['load', 'handover'] };
const matchFilter = (j, f) => f === 'all' || (GROUP[f] || [f]).indexOf(j.kind) >= 0;
const DIRECT = ['wear', 'lift3', 'lift4', 'lift6'];
const NTAG = { order: '순서 변경', priority: '우선 확인', items: '물품 추가' };

class VehicleBoard {
  props = { showStoreRequests: true };
  state = { vehicle: 'v1', view: 'jobs', filter: 'all', dateOffset: 0, selected: 'R-021', dialog: null, draft: null, notice: '' };

  say(t) { clearTimeout(this._t); this.setState({ notice: t }); this._t = setTimeout(() => this.setState({ notice: '' }), 4000); }
  setMissing(key, value, max) {
    this.setState(s => {
      const missing = { ...(s.draft ? s.draft.missing : {}) };
      const v = Math.max(0, Math.min(max, value));
      if (v === 0) delete missing[key]; else missing[key] = v;
      return { draft: { ...(s.draft || {}), missing } };
    });
  }

  renderVals() {
    const F = fleet;
    if (!F) return {};
    const s = this.state;
    const vid = s.vehicle;
    const all = F.jobsOf(vid, s.dateOffset);
    const list = all.filter(j => matchFilter(j, s.filter));
    const selected = list.find(j => j.id === s.selected) || list.find(j => !F.isDone(j)) || list[0];
    const K = selected ? F.KINDS[selected.kind] : F.KINDS.collect;
    const { st, collected, refund } = F.stock(vid, s.dateOffset);
    const q = k => st[k].store + st[k].guest;
    const sum = pick => F.ITEMS.reduce((n, i) => n + pick(i.key), 0);
    const notices = F.notices(vid);
    const openNotices = notices.filter(n => !n.ack);
    const view = F.liftView(vid);
    const kinds = ['lift3', 'lift4', 'lift6'];
    const L = selected && selected.lotId ? F.lot(selected.lotId) : null;
    const inHand = L ? Math.max(0, L.qty - (L.pendingIn || 0) - (L.refundedQty || 0)) : 0;
    const notInHand = !!(L && selected.kind === 'liftDeliver' && (!L.holder || L.holder.type !== 'vehicle' || (L.pendingIn || 0) > 0));

    const chip = 'display:flex;align-items:center;gap:6px;box-sizing:border-box;min-height:48px;padding:0 14px;font-size:18px;font-weight:700;letter-spacing:-0.02em;border:0;border-radius:14px;white-space:nowrap;transition:background 180ms cubic-bezier(.2,0,.2,1);';
    const dateBtn = 'display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:48px;padding:0 16px;font-size:18px;font-weight:700;letter-spacing:-0.02em;border:0;border-radius:12px;white-space:nowrap;';
    const badge = 'display:inline-block;font-size:16px;font-weight:700;padding:6px 12px;border-radius:8px;white-space:nowrap;';
    const BADGE = {
      collect: badge + 'background:rgba(255,145,66,.2);color:#B45309;',
      deliver: badge + 'background:rgba(70,189,240,.2);color:#0C6E96;',
      refund: badge + 'background:#EFEFEF;color:#414141;',
      load: badge + 'background:#EFEFEF;color:#414141;',
      handover: badge + 'background:#EFEFEF;color:#414141;',
      liftDeliver: badge + 'background:rgba(70,189,240,.2);color:#0C6E96;',
      liftRefund: badge + 'background:#EFEFEF;color:#414141;'
    };
    const card = 'width:100%;box-sizing:border-box;padding:12px 14px;background:#fff;border:0;border-radius:16px;color:var(--ink-900,#24252C);box-shadow:0 4px 32px rgba(0,0,0,.04);transition:background 180ms cubic-bezier(.2,0,.2,1);';
    const tile = basis => 'flex:1 1 ' + basis + 'px;min-width:0;box-sizing:border-box;padding:min(6px,.9vh) 13px;background:var(--purple-25,#F4F0FF);border-radius:15px;';
    const tag = 'font-size:15px;font-weight:700;padding:5px 10px;border-radius:8px;white-space:nowrap;';
    const ntag = t => tag + (t === 'priority' ? 'background:rgba(255,145,66,.25);color:#8A4A08;' : t === 'order' ? 'background:var(--purple-75,#EDE8FF);color:#4A25BC;' : 'background:#E8F6FE;color:#0C6E96;');
    const leftTag = (kind, key) => kind === 'collect'
      ? (DIRECT.includes(key) ? { t: '직접반납 예정', s: tag + 'background:rgba(70,189,240,.2);color:#0C6E96;' } : { t: '매장 확인 전', s: tag + 'background:var(--purple-75,#EDE8FF);color:#4A25BC;' })
      : { t: '다음 업무에서 처리', s: tag + 'background:#EFEFEF;color:#414141;' };
    const okBtn = 'display:flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;min-height:48px;padding:0 14px;font-size:17px;font-weight:700;border:0;border-radius:12px;';

    const groupSummary = j => {
      const g = kind => F.ITEMS.reduce((n, i) => n + (i.group === kind ? (j.items[i.key] || 0) : 0), 0);
      return [['장비', g('gear')], ['의류', g('wear')], ['헬멧', g('helmet')], ['리프트권', g('lift')]]
        .filter(([, n]) => n > 0).map(([l, n]) => l + ' ' + n).join(' · ');
    };
    const statusOf = j => {
      if (j.status === 'partial') return '일부만 처리 · ' + F.KINDS[j.kind].doneLine;
      if (j.status === 'done') return F.KINDS[j.kind].doneLine;
      if (j.status === 'moving') return '처리 중';
      return j.slotLabel ? j.slotLabel + ' 예정' : '대기';
    };
    const pick = id => this.setState({ selected: id, view: 'jobs' });
    const STORE_TITLE = { load: '매장 창고에서 차에 싣기', handover: '차에서 매장에 내리기' };
    const STORE_NOTE = {
      load: '고객 방문이 아닙니다. 매장 창고에서 아래 물품을 차에 실은 다음 "차량에 실었어요"를 누르세요. 오늘 배달할 물품이 여기에 다 들어 있어요.',
      handover: '고객 방문이 아닙니다. 오늘 고객에게서 수거한 물품을 매장 창고에 내린 다음 "매장에 내렸어요"를 누르세요. 장비 반납 확인은 매장 직원이 합니다.'
    };

    const dialogFor = kind => {
      if (kind === 'calendar') return { title: '날짜 선택', lead: '업무 날짜를 골라 주세요', dates: true, note: '샘플 날짜입니다. 실제 예약 서버와 연결되지 않습니다.' };
      if (kind === 'inbox') return { title: '알림함', lead: '매장에서 보낸 알림 ' + notices.length + '건 · 안 읽음 ' + openNotices.length + '건', inbox: true, note: '배너와 알림함은 같은 읽음 상태를 씁니다. 확인해도 물품 수량은 바뀌지 않습니다.', close: true };
      if (!selected) return null;
      if (kind === 'phone') return { title: '연락처', lead: selected.name + (selected.kind === 'load' || selected.kind === 'handover' ? '' : ' 고객님'), phone: true, note: '전화 버튼의 시안입니다. 실제 통화는 시작되지 않습니다.', close: true };
      if (kind === 'sms') return {
        title: '출발 문자 확인', lead: selected.name + ' · ' + selected.phone,
        message: '[우리 스키샵] 차량이 출발하였습니다. 5분 내로 도착하니 ' + (selected.kind === 'collect' ? '반납 장소에서 장비와 함께 ' : '약속 장소에서 ') + '대기해 주시기 바랍니다.',
        primary: selected.sms ? '출발 안내 완료' : '출발 안내 보내기', primaryOff: !!selected.sms,
        confirm: () => { F.updateJob(selected.id, { sms: true, status: 'moving' }); this.setState({ dialog: null }); this.say('출발 안내 완료로 표시했습니다. 실제 문자는 발송되지 않습니다.'); },
        note: '샘플 시안이며 실제 문자는 발송되지 않습니다.'
      };
      if (kind === 'partial') {
        const missing = s.draft?.missing || {};
        return {
          title: K.partial, lead: selected.name + ' · ' + selected.place, partial: true,
          primary: '이 내용으로 ' + K.done, primaryOff: Object.keys(missing).length === 0,
          confirm: () => {
            F.updateJob(selected.id, { status: 'partial', missing: { ...missing } });
            this.setState({ dialog: null, draft: null });
            this.say('일부만 처리한 내용을 기록했습니다. 차량 보관 수량에도 반영됐습니다.');
          },
          note: K.note
        };
      }
      return {
        title: K.label + ' 수량 확인', lead: selected.name + ' · ' + selected.place, items: true, ask: K.ask, primary: K.done,
        confirm: () => { F.updateJob(selected.id, { status: 'done', missing: null }); this.setState({ dialog: null }); this.say(K.done + ' · 차량 보관 수량과 매장 화면에 반영됐습니다.'); },
        note: K.note
      };
    };
    const d = s.dialog ? dialogFor(s.dialog) : null;
    const result = selected ? F.split(selected, selected.missing) : { taken: [], left: [] };
    const draft = selected ? F.split(selected, s.draft ? s.draft.missing : {}) : { taken: [], left: [] };

    return {
      eyebrow: label(addDays(start, Number(s.dateOffset))) + ' · ' + dayName(Number(s.dateOffset)) + ' · ' + (F.VEHICLES.find(v => v.id === vid) || {}).name,
      filters: FILTERS.map(([id, l]) => ({
        label: l,
        count: all.filter(j => matchFilter(j, id) && !F.isDone(j)).length,
        pressed: s.filter === id,
        style: chip + (s.filter === id ? 'background:#fff;color:#4A25BC;' : 'background:#4A25BC;color:#fff;'),
        countStyle: 'font-size:16px;font-weight:700;padding:2px 8px;border-radius:8px;font-variant-numeric:tabular-nums;' + (s.filter === id ? 'background:var(--purple-75,#EDE8FF);color:#4A25BC;' : 'background:rgba(255,255,255,.22);color:#fff;'),
        onClick: () => this.setState({ filter: id })
      })),
      dateButtons: [0, 1].map(n => ({
        label: n === 0 ? '오늘' : '내일', pressed: Number(s.dateOffset) === n,
        style: dateBtn + (Number(s.dateOffset) === n ? 'background:#fff;color:#4A25BC;' : 'background:transparent;color:#fff;'),
        onClick: () => this.setState({ dateOffset: n })
      })).concat([{
        label: '달력', pressed: Number(s.dateOffset) > 1,
        style: dateBtn + (Number(s.dateOffset) > 1 ? 'background:#fff;color:#4A25BC;' : 'background:transparent;color:#fff;'),
        onClick: () => this.setState({ dialog: 'calendar' })
      }]),
      calendarDays: [0, 1, 2, 3, 4, 5].map(n => ({
        label: label(addDays(start, n)) + ' · ' + dayName(n),
        pressed: Number(s.dateOffset) === n,
        style: 'display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:68px;padding:12px;font-size:19px;font-weight:700;border:0;border-radius:14px;'
          + (Number(s.dateOffset) === n ? 'background:var(--purple-800,#5F33E1);color:#fff;' : 'background:var(--purple-25,#F4F0FF);color:#4A25BC;'),
        onClick: () => this.setState({ dateOffset: n, dialog: null })
      })),

      openInbox: () => this.setState({ dialog: 'inbox' }),
      inboxCount: openNotices.length,
      inboxStyle: 'display:flex;align-items:center;gap:6px;flex-shrink:0;box-sizing:border-box;min-height:48px;padding:0 14px;font-size:18px;font-weight:700;border:0;border-radius:14px;white-space:nowrap;'
        + (openNotices.length ? 'background:#FF9142;color:#fff;' : 'background:#4A25BC;color:#fff;'),
      inboxCountStyle: 'font-size:16px;font-weight:700;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.24);color:#fff;font-variant-numeric:tabular-nums;',
      inboxRows: notices.map(n => ({
        text: n.text, at: n.at, ack: n.ack, tag: NTAG[n.type] || '알림', tagStyle: ntag(n.type),
        wrapStyle: 'display:flex;align-items:center;gap:8px;box-sizing:border-box;padding:10px 10px 10px 14px;border-radius:14px;'
          + (n.ack ? 'background:#F5F5F5;color:#6D6D6D;' : 'background:var(--purple-25,#F4F0FF);'),
        btnLabel: n.ack ? '읽음' : '확인했어요',
        btnStyle: okBtn + (n.ack ? 'background:#EFEFEF;color:#6D6D6D;' : 'background:#B45309;color:#fff;'),
        onAck: () => { F.ackNotice(n.id); }
      })),
      inboxEmpty: notices.length === 0,

      showRequests: this.props.showStoreRequests !== false && openNotices.length > 0,
      requestCount: openNotices.length + '건',
      hasMoreRequests: openNotices.length > 2,
      moreRequests: (openNotices.length - 2) + '건',
      requests: openNotices.slice(0, 2).map(n => ({
        text: n.text, tag: NTAG[n.type] || '알림', tagStyle: ntag(n.type),
        openStyle: n.jobId
          ? 'display:flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;min-height:48px;padding:0 14px;font-size:17px;font-weight:700;color:#4A25BC;background:var(--purple-50,#EEE9FF);border:0;border-radius:12px;'
          : 'display:none',
        onOpen: () => { const j = n.jobId && F.job(n.jobId); if (j) this.setState({ view: 'jobs', filter: 'all', dateOffset: j.dateOffset, selected: j.id }); },
        onAck: () => { F.ackNotice(n.id); this.say('확인 상태가 매장 화면과 알림함에도 반영됐습니다.'); }
      })),

      sourceLine: '매장 적재분 ' + sum(k => st[k].store) + ' · 고객 수거분 ' + sum(k => st[k].guest) + '(인계 전) · 환불 대기 ' + sum(k => refund[k] || 0) + '매 · 고객 전달 가능 ' + kinds.reduce((n, k) => n + view[k].deliverable, 0) + '매',
      viewBtnLabel: s.view === 'storage' ? '업무 화면으로' : '보관 내역 자세히',
      viewBtnStyle: 'margin-left:auto;display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:48px;padding:0 16px;font-size:18px;font-weight:700;color:#4A25BC;background:var(--purple-50,#EEE9FF);border:0;border-radius:14px;transition:background 180ms cubic-bezier(.2,0,.2,1);',
      toggleView: () => this.setState({ view: s.view === 'storage' ? 'jobs' : 'storage' }),
      stockTiles: [
        { label: '장비', value: (q('ski') + q('board')) + '대', sub: '스키 ' + q('ski') + ' · 보드 ' + q('board'), style: tile(150) },
        { label: '의류', value: q('wear') + '벌', sub: '', style: tile(112) },
        { label: '헬멧', value: q('helmet') + '개', sub: '', style: tile(112) },
        { label: '리프트권', value: (q('lift3') + q('lift4') + q('lift6')) + '매', sub: '3시간 ' + q('lift3') + ' · 4시간 ' + q('lift4') + ' · 6시간 ' + q('lift6'), style: tile(240) }
      ],

      isStorageView: s.view === 'storage',
      isJobView: s.view !== 'storage',
      stockRows: F.ITEMS.map(i => ({
        name: i.name, unit: i.unit, total: st[i.key].store + st[i.key].guest,
        sub: '매장 적재 ' + st[i.key].store + ' · 고객 수거 ' + st[i.key].guest + ' · 환불 예정 ' + (refund[i.key] || 0) + ' · 회수 누적 ' + (collected[i.key] || 0)
      })),

      listCaption: '업무 ' + list.length + '건 · 남은 ' + list.filter(j => !F.isDone(j)).length + '건 · 방문 순서대로',
      jobs: list.map(j => {
        const isSel = selected && j.id === selected.id;
        const req = openNotices.some(n => n.jobId === j.id);
        const idx = all.findIndex(x => x.id === j.id);
        return {
          order: (idx + 1) + '번째',
          orderStyle: 'display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:3px 9px;font-size:15px;font-weight:700;border-radius:8px;white-space:nowrap;background:var(--purple-75,#EDE8FF);color:#4A25BC;',
          type: F.KINDS[j.kind].label, badgeStyle: BADGE[j.kind], time: j.time,
          title: STORE_TITLE[j.kind] ? STORE_TITLE[j.kind] : j.name + ' 고객 · ' + j.place,
          itemLine: groupSummary(j),
          statusLine: req ? '매장 확인 요청 있음' : statusOf(j),
          selected: isSel,
          cardStyle: card + 'border-left:5px solid ' + (req ? '#FF9142' : isSel ? 'var(--purple-800,#5F33E1)' : '#DBD0EF') + ';'
            + (req ? 'background:#FFF7ED;' : isSel ? 'background:var(--purple-75,#EDE8FF);' : '')
            + (isSel ? 'box-shadow:inset 0 0 0 2px var(--purple-800,#5F33E1), 0 4px 32px rgba(0,0,0,.04);' : ''),
          onPick: () => pick(j.id)
        };
      }),

      type: selected ? K.label : '', badgeStyle: selected ? BADGE[selected.kind] : badge,
      timeLine: selected ? (selected.slotLabel ? selected.time + ' · ' + selected.slotLabel : selected.time + ' 예정') : '',
      place: selected ? selected.place : '표시할 업무가 없습니다',
      detail: selected ? selected.detail : '날짜나 업무 구분을 바꿔 보세요',
      customer: selected ? (STORE_TITLE[selected.kind] ? '매장 직원' : selected.name + ' 고객') : '',
      hasStoreNote: !!(selected && STORE_NOTE[selected.kind] && !F.isDone(selected)),
      storeNote: selected ? STORE_NOTE[selected.kind] || '' : '',
      phoneHead: selected ? selected.phone.slice(0, selected.phone.lastIndexOf('-') + 1) : '',
      phoneTail: selected ? selected.phone.slice(selected.phone.lastIndexOf('-') + 1) : '',
      itemsLabel: selected ? K.itemsLabel : '',
      items: selected ? F.split(selected, null).taken.map(t => ({ name: t.name, qty: t.qty })) : [],
      hasMemo: !!(selected && selected.memo), memo: selected ? selected.memo : '',
      hasLot: !!L,
      lotLine: L ? [
        F.item(L.key).short + ' ' + L.qty + '매',
        '현재 ' + (L.holder ? (L.holder.type === 'vehicle' ? '차량 보관' : L.holder.type === 'store' ? '매장 보관함' : L.holder.type === 'office' ? '발권처' : L.holder.name + ' 고객 보유') : '확인 필요'),
        L.next ? '다음 ' + L.next.name + ' · ' + L.next.place + ' ' + L.next.time : ((L.refundQty || 0) > (L.refundedQty || 0) ? '발권처 환불 대기 ' + ((L.refundQty || 0) - (L.refundedQty || 0)) + '매 · ' + (L.refundOffice || '') : '다음 예정 없음'),
        (() => { const T = F.liftTime(L); return T.used
          ? '남은 ' + F.spanText(T.remainMin) + ' · ' + (T.startFrom || '') + '~' + T.validUntil + ' 사용 가능 (정설시간 16:30~18:30 제외) · 사용한 권은 환불 불가'
          : '미사용권 · ' + F.spanText(T.totalMin) + ' 그대로'; })()
      ].join(' · ') : '',
      hasGuard: notInHand,
      guardNote: notInHand
        ? '아직 회수하지 않은 리프트권이 있어 전달 완료로 처리할 수 없어요. 회수 후 처리하거나 받은 만큼만 "' + K.partial + '"로 기록하세요.'
        : '',
      smsSent: !!(selected && selected.sms && !F.isDone(selected)),

      isDone: !!(selected && F.isDone(selected)),
      doneMessage: selected ? (selected.status === 'partial' ? '일부만 ' + K.done + ' · ' + K.doneLine : K.doneMsg) : '',
      resultSummary: result.taken.length ? K.taken + ' ' + result.taken.map(t => t.name + ' ' + t.qty).join(' · ') : '처리한 품목 없음',
      hasLeft: result.left.length > 0,
      leftLabel: K.left,
      resultLeft: result.left.map(l => { const g = leftTag(selected.kind, l.key); return { name: l.name, qty: l.qty, tag: g.t, tagStyle: g.s }; }),
      doneNote: selected ? K.note : '',
      undoJob: () => { F.updateJob(selected.id, { status: 'waiting', missing: null }); this.say('되돌렸습니다. 처리 전 수량으로 돌아갔습니다.'); },

      showActions: !!(selected && !F.isDone(selected)),
      smsLabel: selected && selected.sms ? '문자 확인' : '출발 문자',
      smsBtnStyle: selected && (selected.kind === 'load' || selected.kind === 'handover')
        ? 'display:none'
        : 'display:flex;align-items:center;justify-content:center;gap:8px;min-height:72px;padding:10px;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:var(--ink-900,#24252C);background:var(--purple-50,#EEE9FF);border:0;border-radius:14px;transition:background 180ms cubic-bezier(.2,0,.2,1);',
      partialLabel: K.partial, completeLabel: K.done, completeOff: notInHand,
      openPhone: () => this.setState({ dialog: 'phone' }),
      openSms: () => this.setState({ dialog: 'sms' }),
      openComplete: () => this.setState({ dialog: 'complete' }),
      openPartial: () => this.setState({ dialog: 'partial', draft: { id: selected.id, missing: {} } }),

      partialGuide: selected ? K.miss + ' 품목을 눌러 주세요. 누르면 이번 대상 전량이 ' + K.miss + ' 수량으로 표시돼요.' : '',
      partialEmpty: selected ? K.miss + ' 품목을 선택하세요' : '',
      takenLabel: K.taken,
      partialRows: selected ? F.split(selected, null).taken.map(t => {
        const miss = Number((s.draft?.missing?.[t.key]) || 0);
        const on = miss > 0;
        return {
          name: F.item(t.key).name, missing: miss, on,
          stateLabel: (on ? K.miss + ' 수량 ' + miss + ' · ' : '모두 처리 · ') + '이번 대상 ' + t.qty,
          stateStyle: 'display:block;margin-top:3px;font-size:16px;font-weight:600;' + (on ? 'color:#B45309;' : 'color:var(--ink-500,#6E6A7C);'),
          wrapStyle: 'display:flex;align-items:center;gap:8px;box-sizing:border-box;border-radius:14px;'
            + (on ? 'background:rgba(255,145,66,.15);box-shadow:inset 0 0 0 2px #FF9142;' : 'background:var(--purple-25,#F4F0FF);'),
          boxStyle: 'display:grid;place-items:center;width:34px;height:34px;flex-shrink:0;border-radius:10px;' + (on ? 'background:#B45309;color:#fff;' : 'background:#fff;color:transparent;'),
          decLabel: F.item(t.key).name + ' 수량 줄이기', incLabel: F.item(t.key).name + ' 수량 늘리기',
          decOff: miss <= 1, incOff: miss >= t.qty,
          onToggle: () => this.setMissing(t.key, on ? 0 : t.qty, t.qty),
          onDec: () => this.setMissing(t.key, miss - 1, t.qty),
          onInc: () => this.setMissing(t.key, miss + 1, t.qty)
        };
      }) : [],
      draftTaken: draft.taken, draftNoTaken: draft.taken.length === 0,
      draftLeft: draft.left.map(l => { const g = leftTag(selected.kind, l.key); return { name: l.name, qty: l.qty, tag: g.t, tagStyle: g.s }; }),
      draftNoLeft: draft.left.length === 0,

      dialogOpen: !!d,
      dialogTitle: d ? d.title : '', dialogLead: d ? d.lead : '',
      dialogHasPhone: !!(d && d.phone), dialogHasMessage: !!(d && d.message), dialogMessage: d && d.message ? d.message : '',
      dialogHasDates: !!(d && d.dates), dialogHasInbox: !!(d && d.inbox),
      dialogHasItems: !!(d && d.items), dialogAsk: d && d.ask ? d.ask : '',
      dialogIsPartial: !!(d && d.partial),
      dialogHasPrimary: !!(d && d.primary), dialogPrimary: d && d.primary ? d.primary : '',
      dialogPrimaryOff: !!(d && d.primaryOff), dialogConfirm: d && d.confirm ? d.confirm : () => {},
      dialogNote: d ? d.note : '', dialogHasClose: !!(d && d.close),
      closeDialog: () => this.setState({ dialog: null, draft: null }),
      notice: s.notice
    };
  }
}
const board = new VehicleBoard();
const renderSource = board.renderVals.bind(board);
const selectedJob = () => { const jobs = fleet.jobsOf(board.state.vehicle, board.state.dateOffset).filter(j => matchFilter(j, board.state.filter)); return jobs.find(j => j.id === board.state.selected) || jobs.find(j => !fleet.isDone(j)) || jobs[0]; };
const dateOffset = date => Math.round((Date.parse(date) - Date.parse(S.data.today)) / 86400000);
board.setState = function (update) {
  const next = typeof update === 'function' ? update(this.state) : update;
  if (next.dialog && !this.state.dialog) { this.dialogRevision = F.snap().revision; this.dialogJobId = selectedJob()?.id; }
  this.state = { ...this.state, ...next }; this.error = ''; redraw();
};
board.setReceived = function (key, value, max) { this.setState(s => ({ draft: { ...s.draft, received: { ...s.draft?.received, [key]: Math.max(0, Math.min(max, value)) } } })); };
function applyMove(partial) {
  const j = selectedJob(), task = j?.task;
  if (F.snap().revision !== board.dialogRevision || j?.id !== board.dialogJobId) throw new Error('수량이나 업무가 변경됐습니다. 창을 닫고 최신 내용을 확인해 주세요.');
  if (!task || !['collection', 'delivery'].includes(task.kind) || task.vehicleId !== F.vehicleId || !['waiting', 'in_progress'].includes(task.status)) throw new Error('현재 차량의 전달·수거 업무를 확인해 주세요.');
  const kind = task.kind === 'collection' ? 'collect' : 'deliver';
  const remaining = F.remaining(task), from = kind === 'collect' ? { kind: 'customer', id: task.customerId } : F.van;
  const to = kind === 'collect' ? F.van : { kind: 'customer', id: task.customerId };
  const counts = partial ? board.state.draft?.received || {} : j.items;
  const ids = [];
  for (const [key, count] of Object.entries(counts)) {
    if (!Number.isSafeInteger(count) || count < 0 || count > (j.items[key] || 0)) throw new Error('처리 수량을 확인해 주세요.');
    const chosen = F.assets(remaining).filter(a => a.sku === skuOf(key) && a.location.kind === from.kind && a.location.id === from.id).slice(0, count);
    if (chosen.length !== count) throw new Error('실제 차량 적재·발권·고객 보유 수량을 먼저 확인해 주세요.');
    ids.push(...chosen.map(a => a.id));
  }
  if (!ids.length) throw new Error('실제로 처리한 품목을 선택해 주세요.');
  // The entire update is validated before committing, including planned but
  // unallocated quantities. UI and driver API share the same inventory rules.
  F.atomic(commit => {
    commit('stock.move', { kind, assetIds: ids, from, to, taskId: task.id });
    if (F.remainingQuantity(task) === ids.length) commit('task.status', { id: task.id, status: 'completed' });
  }, 'driver');
  S.workflowUI.syncBase(); board.setState({ dialog: null, draft: null }); board.say(KIND[j.kind].done + ' · 실제 처리한 ' + ids.length + '개를 반영했습니다.');
}
function redraw() {
  const root = S.$('.so-vehicle-board'), nodes = root ? [...root.querySelectorAll('*')] : [];
  const scrolls = nodes.map((el, i) => ({ i, y: el.scrollTop })).filter(x => x.y);
  const active = document.activeElement?.getAttribute('data-vehicle-click');
  S.render();
  const next = [...S.root.querySelectorAll('.so-vehicle-board *')]; scrolls.forEach(s => { if (next[s.i]) next[s.i].scrollTop = s.y; });
  if (active) [...S.root.querySelectorAll('[data-vehicle-click]')].find(el => el.getAttribute('data-vehicle-click') === active)?.focus({ preventScroll: true });
}
function render() {
  restoreBell(); data = projection(); revision = F.snap().revision;
  const v = renderSource(), j = selectedJob(), task = j?.task;
  v.openStore = () => S.go('home'); v.openInbox = () => S.notifications.open();
  v.jobs.forEach((row, i) => { row.id = fleet.jobsOf(board.state.vehicle, board.state.dateOffset).filter(j => matchFilter(j, board.state.filter))[i].id; });
  v.openPartial = () => task?.kind === 'refund' ? S.workflowUI.openRefund(task.refundId) : board.setState({ dialog: 'partial', draft: { id: j.id, received: {} } });
  v.openComplete = () => task?.kind === 'refund' ? S.workflowUI.openRefund(task.refundId) : board.setState({ dialog: 'complete' });
  v.selectedDate = addDays(start, board.state.dateOffset);
  v.chooseDate = event => { const date = event.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(date)) board.setState({ dateOffset: dateOffset(date), dialog: null, selected: null }); };
  v.calendarDays = [...new Set([0, 1, 2, 3, 4, 5, ...data.jobs.map(j => j.dateOffset)])].sort((a, b) => a - b).map(n => ({ ...v.calendarDays[0], label: label(addDays(start, n)) + ' · ' + dayName(n), pressed: n === board.state.dateOffset, onClick: () => board.setState({ dateOffset: n, dialog: null }) }));
  v.partialGuide = task?.kind === 'delivery' ? '실제로 전달한 품목을 체크하고 전달한 수량을 맞춰 주세요.' : '받은 품목을 체크하고 실제 받은 수량을 맞춰 주세요.';
  v.partialEmpty = '아직 받은 품목이 없습니다.';
  v.dialogError = board.error || '';
  const draft = board.state.draft?.received || {}, isDelivery = task?.kind === 'delivery';
  v.partialRows = (v.partialRows || []).map((row, i) => {
    const item = fleet.split(j, null).taken[i], count = draft[item.key] || 0, on = count > 0;
    return { ...row, received: count, on, toggleLabel: item.name + (isDelivery ? ' 전달함' : ' 받음'),
      stateLabel: (on ? (isDelivery ? '전달 수량 ' : '받은 수량 ') + count + ' · ' : '미선택 · ') + '이번 대상 ' + item.qty,
      stateStyle: 'display:block;margin-top:3px;font-size:16px;font-weight:600;' + (on ? 'color:#B45309;' : 'color:var(--ink-500,#6E6A7C);'),
      wrapStyle: 'display:flex;align-items:center;gap:8px;box-sizing:border-box;border-radius:14px;' + (on ? 'background:rgba(255,145,66,.15);box-shadow:inset 0 0 0 2px #FF9142;' : 'background:var(--purple-25,#F4F0FF);'),
      boxStyle: 'display:grid;place-items:center;width:34px;height:34px;flex-shrink:0;border-radius:10px;' + (on ? 'background:#B45309;color:#fff;' : 'background:#fff;color:transparent;'),
      decOff: count <= 0, incOff: count >= item.qty, onToggle: () => board.setReceived(item.key, on ? 0 : item.qty, item.qty), onDec: () => board.setReceived(item.key, count - 1, item.qty), onInc: () => board.setReceived(item.key, count + 1, item.qty) };
  });
  v.draftTaken = v.partialRows.filter(r => r.received).map(r => ({ name: r.name, qty: r.received })); v.draftNoTaken = !v.draftTaken.length;
  v.draftLeft = j ? fleet.split(j, Object.fromEntries(Object.keys(j.items).map(k => [k, j.items[k] - (draft[k] || 0)]))).left.map(r => ({ name: r.name, qty: r.qty, tag: '기존 일정 유지', tagStyle: 'font-size:15px;font-weight:700;padding:5px 10px;border-radius:8px;background:#EDE8FF;color:#4A25BC;' })) : [];
  v.draftNoLeft = !v.draftLeft.length;
  if (board.state.dialog === 'partial') { v.dialogPrimaryOff = !v.draftTaken.length; v.dialogPrimary = '선택 수량 저장'; v.dialogConfirm = () => applyMove(true); }
  if (board.state.dialog === 'complete') v.dialogConfirm = () => applyMove(false);
  if (board.state.dialog === 'sms') { v.dialogPrimary = '발송 연결 준비 중'; v.dialogPrimaryOff = true; v.dialogNote = '문자 내용을 확인하는 화면입니다. 실제 문자 발송은 연결되지 않았습니다.'; }
  v.undoJob = () => board.say('매장의 차량 적재·인계 → 처리 기록에서 수량 정정을 요청해 주세요.');
  if (j?.kind === 'load' || j?.kind === 'handover') v.undoJob = () => board.say('매장 적재·인계 정정은 매장에서 확인해 주세요.');
  // A ticket lot is shown from its actual validity and customer allocation;
  // never inherit the reference's illustrative resort refund policy.
  v.hasLot = !!j?.lotLine; v.lotLine = j?.lotLine || '';
  v.hasGuard = task?.kind === 'delivery' && (F.remainingQuantity(task) > F.assets(F.remaining(task)).filter(a => a.location.id === F.vehicleId).length);
  v.guardNote = v.hasGuard ? '발권·적재 또는 앞 고객 수거가 필요한 물품이 있습니다. 실제 차량에 있는 수량만 전달할 수 있습니다.' : '';
  v.completeOff = !!v.hasGuard;
  callbacks = new Map(); let n = 0;
  return window.SkiVehicleView(v, (fn, name) => { const id = name + ':' + n++; callbacks.set(id, fn); return id; }, S.esc);
}
let wasDialog = false;
function mount() {
  S.$('[data-vehicle-bell]')?.append(bell);
  const dialog = S.$('.so-vehicle-overlay');
  for (const el of S.root.querySelectorAll('.so-vehicle-board>header,.so-vehicle-board>section,.so-vehicle-board>div:not(.so-vehicle-overlay)')) el.inert = !!dialog;
  if (dialog && !wasDialog) dialog.querySelector('button')?.focus({ preventScroll: true });
  wasDialog = !!dialog;
}
S.root.addEventListener('click', event => {
  const target = event.target.closest('[data-vehicle-click]'); if (!target || target.disabled || S.state.page !== 'vehicle') return;
  try { callbacks.get(target.dataset.vehicleClick)?.(event); } catch (e) { board.error = e.message; if (board.state.dialog) redraw(); else S.toast(e.message); }
});
S.root.addEventListener('change', event => { if (event.target.dataset.vehicleChange) callbacks.get(event.target.dataset.vehicleChange)?.(event); });
S.root.addEventListener('keydown', event => {
  const dialog = S.$('.so-vehicle-overlay'); if (!dialog || S.state.page !== 'vehicle') return;
  if (event.key === 'Escape') { event.preventDefault(); board.setState({ dialog: null, draft: null }); }
  if (event.key === 'Tab') { const controls = [...dialog.querySelectorAll('button:not(:disabled),input,a[href]')]; if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); } else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); } }
});
S.root.addEventListener('ski:close-dialogs', () => { restoreBell(); board.state.dialog = null; board.state.draft = null; board.error = ''; wasDialog = false; });
S.register('vehicle', { title: '차량 배달·수거', render, mount });
S.vehicleBoard = { snapshot: () => JSON.parse(JSON.stringify(data)), selectTask(id) { const t = F.snap().tasks.find(t => t.id === id); if (t && t.vehicleId === F.vehicleId) board.setState({ selected: id, dateOffset: dateOffset(t.date), view: 'jobs', filter: 'all' }); } };
})();
