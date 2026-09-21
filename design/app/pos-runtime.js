(() => {
  'use strict';
  const S = window.SkiOps, C = window.SkiWorkflowClient;
  let noticeClient = window.SkiNotificationClient.createLocalClient(S.notificationRuntime.store);
  let watcher = null, updateAvailable = false, connected = false;
  let client = C.createLocalClient(S.workflow.store, S.sharedRepository), current = null, history = { movements: [], events: [] }, pending = null, busy = false;
  async function refresh() {
    const next = await client.snapshot();
    const nextHistory = next.actor?.role === 'driver' ? { movements: [], events: [] } : await client.history();
    current = next; history = nextHistory; S.posNotifications?.refresh(); updateAvailable = false;
    return current;
  }
  async function execute(type, payload, options = {}) {
    if (busy) throw new Error('앞선 처리를 확인하고 있습니다. 잠시 기다려 주세요.');
    if (pending && !options.retry) throw new Error('앞선 처리 결과를 먼저 확인해 주세요. 같은 요청 다시 확인을 눌러 주세요.');
    const command = options.retry ? pending : C.newCommand(type, current, payload);
    if (!command) throw new Error('확인할 요청이 없습니다.');
    busy = true;
    try {
      if (client.persistPending) { await client.persistPending(command); pending = command; }
      const result = await client.execute(command); await client.clearPending?.(); pending = null;
      await refresh(); return result;
    } catch (error) {
      if (['CONNECTION_ERROR', 'INVALID_RESPONSE'].includes(error.code)) pending = command; else if (error.code !== 'PENDING_STORAGE_ERROR') { await client.clearPending?.(); pending = null; }
      throw error;
    } finally { busy = false; const tools = S.$('#so-page-tools'); if (tools) { tools.querySelector('[data-action="pos-retry"]')?.remove(); if (pending) tools.insertAdjacentHTML('beforeend', '<button type="button" class="pos-search-entry" data-action="pos-retry">앞선 처리 다시 확인</button>'); } }
  }
  S.posData = {
    get snapshot() { return current; }, get history() { return history; }, get pending() { return pending; }, get busy() { return busy; },
    get notices() { return noticeClient; }, get updateAvailable() { return updateAvailable; }, get connected() { return connected; }, get mode() { return client?.mode || 'disconnected'; }, refresh, execute,
    async connect(next, notices) { if (pending || busy) throw new Error('진행 중인 처리를 먼저 확인해 주세요.'); const previous = client; client = next; try { await refresh(); pending = await client.restorePending?.() || null; noticeClient = notices || noticeClient; watcher?.stop(); connected = true; watcher = client.watch({ onChange(data) { if (data.notifications?.revision !== current.notifications?.revision) { current.notifications = data.notifications; S.posNotifications?.refresh(); } if (data.revision !== current.revision) { updateAvailable = true; S.$('.so-demo-label').textContent = '새 기록 있음 · 갱신 필요'; } }, onStatus(status) { connected = status.connected; if (!connected) S.$('.so-demo-label').textContent = '연결 확인 필요'; } }); } catch (error) { client = previous; throw error; } },
    disconnect() { watcher?.stop(); connected = false; client = null; noticeClient = null; current = null; history = { movements: [], events: [] }; },
    order(id = S.state.params.id) { return current?.orders?.find(o => o.id === id); },
    id(prefix = 'pos') { return C.randomId(prefix + '-').slice(0, 48); },
    get today() { return current?.at ? window.SkiWorkflowCommon.day(current.at) : S.data.today; }
  };
  S.workflowsReady = S.workflowsReady.then(async () => {
    const ids = S.returns.initialOrders.map(o => o.id);
    if (ids.length) S.workflow.run('legacy.migrate', { orderIds: ids });
    if (!window.SkiPosOperating && !S.workflow.snap().management.settingsVersion) {
      for (const [id, label, kind, unit] of [['visor','바이저 헬멧','helmet','개'],['goggles','고글','equipment','개'],['pads','보호대','equipment','개']]) if (!S.workflow.snap().catalog.some(s => s.id === id)) S.workflow.run('catalog.add', { id, label, kind, unit });
      S.workflow.run('management.settings', { patch: {
        rates: [['ski',20000],['board',20000],['clothing',10000],['visor',10000],['helmet',5000],['goggles',5000],['pads',5000],['ticket-3h',35000],['ticket-4h',45000],['ticket-6h',55000]].map(([sku,unitWon]) => ({sku,unitWon})),
        areas: [{id:'area-manseon',name:'만선',places:['만선 티롤 앞','만선 광장']},{id:'area-seolcheon',name:'설천',places:['설천 주차장']},{id:'area-etc',name:'기타',places:[]}],
        discounts: [{id:'d-ski',kind:'perUnit',sku:'ski',amountWon:5000},{id:'d-board',kind:'perUnit',sku:'board',amountWon:5000},{id:'d-clothing',kind:'perUnit',sku:'clothing',amountWon:3000},{id:'d-p10',kind:'percent',percent:10},{id:'d-p20',kind:'percent',percent:20},{id:'d-p30',kind:'percent',percent:30},{id:'d-a5',kind:'amount',amountWon:5000},{id:'d-a10',kind:'amount',amountWon:10000},{id:'d-l20',kind:'liftPercent',percent:20},{id:'d-l25',kind:'liftPercent',percent:25},{id:'d-l27',kind:'liftPercent',percent:27}],
        vehicles: [{id:'demo-van-1',name:'1호 차량'},{id:'demo-van-2',name:'2호 차량'}],
        returnTimes: [{id:'morning',label:'오전타임 후',time:'12:00',dayOffset:0},{id:'afternoon',label:'오후타임 후',time:'16:30',dayOffset:0},{id:'night',label:'야간타임 후',time:'22:00',dayOffset:0},{id:'next-morning',label:'익일 오전',time:'09:00',dayOffset:1}], staff: [], nightCutoff: null, store: { name: '우리 스키샵', phone: '033-000-0000', address: '', link: '' }
      } });
    }
    await refresh();
  });
  // Demo (Pages) only: the login screen's 매장 POS / 차량 화면 buttons swap the local client
  // between the seeded store actor and the seeded driver actor (demo-van-1), so the driver
  // tablet screens can be previewed without an API server. The operating build never runs this.
  if (!window.SkiPosOperating) {
    const storeClient = client, F = S.workflow;
    let driverClient = null;
    async function enter(role, target) {
      if (pending || busy) { S.toast('처리 결과를 먼저 확인한 뒤 화면을 바꿔 주세요.'); return; }
      const next = role === 'driver' ? (driverClient ||= C.createLocalClient(F.driver, S.sharedRepository)) : storeClient;
      if (next !== client) { client = next; noticeClient = S.notificationRuntime?.client?.(role) || noticeClient; await refresh(); }
      S.state.authenticated = true; S.state.afterLogin = null;
      const label = S.$('.so-demo-label'); if (label) label.textContent = role === 'driver' ? '체험 · 기사 화면 · ' + (F.vehicleId === 'demo-van-1' ? '1호 차량' : F.vehicleId) : '체험 · 오늘 09시 기준';
      S.go(target.page, target.params || {}, true, target.workspace || 'pos');
    }
    S.action('login-shop', () => { const target = S.state.afterLogin; enter('store', { page: target?.page || 'home', params: target?.params, workspace: target?.workspace }).catch(error => S.toast(error.message)); });
    S.action('login-vehicle', () => enter('driver', { page: 'dispatch' }).catch(error => S.toast(error.message)));
  }
  S.action('pos-refresh', async () => {
    try { await refresh(); S.render(); S.toast('최신 기록을 불러왔습니다. 입력 중인 내용은 유지됩니다.'); }
    catch (error) { S.toast(error.message); }
  });
  S.action('pos-retry', async () => {
    try { const original = pending, result = await execute(null, null, { retry: true }); S.close(); const draft = S.posOrders?.state.draft; if (draft && ['order.create', 'order.add'].includes(original.type) && draft.lines.length && draft.lines.every(line => original.payload.batch.lines.some(saved => saved.id === line.id))) S.posOrders.state.draft = null; if (result.orderId && current.orders?.some(order => order.id === result.orderId)) S.go('order-detail', { id: result.orderId }); else S.render(); S.toast('앞선 요청의 처리 결과를 확인했습니다.'); }
    catch (error) { S.toast(error.message); }
  });
})();
