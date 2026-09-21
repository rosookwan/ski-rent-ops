(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, U = S.posOrders, e = S.esc, b = P.button;
  const active = task => ['waiting', 'in_progress'].includes(task.status), names = { delivery: '배달', collection: '수거', refund: '발권처 환불' }, tones = { delivery: 'blue', collection: 'orange', refund: 'purple' };
  let period = 'today', date = '', vehicle = '', query = '', taskDraft = null;
  const nextDate = value => window.SkiWorkflowCommon.nextDate(value);
  const vehicles = () => D.snapshot.management?.settings.vehicles.length ? D.snapshot.management.settings.vehicles.map(v => [v.id, v.name]) : [...new Set(D.snapshot.tasks.map(t => t.vehicleId))].map(id => [id, id === 'demo-van-1' ? '1호 차량' : id === 'demo-van-2' ? '2호 차량' : id]);
  const vehicleName = id => vehicles().find(v => v[0] === id)?.[1] || id;
  const driver = () => D.snapshot.actor.role === 'driver';
  const inPeriod = day => date ? day === date : period === 'all' ? true : period === 'tomorrow' ? day === nextDate(D.today) : day <= D.today;
  const product = id => D.snapshot.catalog.find(row => row.id === id);
  function taskItems(task) {
    const physical = task.physicalAssets || [], groups = new Map();
    for (const id of task.remainingAssetIds) { const asset = physical.find(a => a.id === id); if (!asset) continue; const key = asset.sku; const row = groups.get(key) || { count: 0, where: new Set() }; row.count++; row.where.add(asset.location.kind); groups.set(key, row); }
    const where = kinds => [...kinds].map(kind => ({ vehicle: '차량 보관', shop: '매장 보관', customer: '고객 보유' }[kind] || kind)).join(' · ');
    return [...groups].map(([sku, row]) => [(product(sku)?.label || sku) + ' ' + row.count + (product(sku)?.unit || '개'), where(row.where), row.where.has('customer') ? 'orange' : row.where.has('vehicle') ? 'purple' : 'grey']);
  }
  function taskCard(task) {
    const late = task.date < D.today, remaining = task.remainingAssetIds.length + task.unassignedQuantity;
    // Counter view (v4 fixed card): time · team / place · vehicle / items + where they are / what is left + 업무 처리.
    const items = taskItems(task), where = items.find(item => item[2] === 'orange') || items.find(item => item[2] === 'purple') || items[0];
    return P.orderCard({ tone: late ? 'red' : '', badge: late ? ['지연 · ' + names[task.kind], 'red'] : [names[task.kind], tones[task.kind]], name: task.time + ' · ' + (task.customer?.name ? task.customer.name + ' 팀' : task.title), phone: task.customer?.phone || '',
      metaParts: [task.place, vehicleName(task.vehicleId), task.date !== D.today ? task.date.slice(5).replace('-', '/') : ''], itemParts: items.map(item => item[0]), state: where ? [where[1], where[2]] : null,
      money: ['남은 물품 ' + remaining + '개' + (task.unassignedQuantity ? ' · 미배정 ' + task.unassignedQuantity + '개' : ''), task.unassignedQuantity ? 'orange' : 'grey'],
      actions: b('업무 처리', 'pos-task', task.id, driver() ? 'primary' : '') });
  }
  // Driver tablet (1024×520~600): compact paged rows instead of cards; the store board keeps cards.
  // Phones (width under 600px, docs/41): three-line 88px rows; the number of rows follows the screen height (4 at 360×640).
  const phone = () => innerWidth < 600;
  const driverRows = () => phone() ? Math.max(1, Math.floor((innerHeight - 264) / 92)) : innerHeight < 560 ? 3 : innerHeight < 700 ? 4 : innerHeight < 740 ? 5 : 6;
  function phoneRow(task) {
    const late = task.date < D.today, day = task.date.slice(5).replace('-', '/'), items = taskItems(task).map(([text]) => text), attr = list => e(JSON.stringify(list.filter(Boolean)));
    return '<article class="pos-row is-phone"><div class="pos-row-copy"><strong data-fit="words">' + e(task.time + ' · ' + (task.customer?.name ? task.customer.name + ' 팀' : task.title)) + '</strong>'
      + '<p>' + P.badge(late ? '지연 ' + day : names[task.kind], late ? 'red' : tones[task.kind]) + '<span data-fit="parts" data-parts="' + attr([task.place, late ? names[task.kind] : task.date !== D.today ? day : '']) + '">' + e(task.place) + '</span></p>'
      + '<p data-fit="items" data-parts="' + attr(items.length ? items : ['남은 물품 ' + (task.remainingAssetIds.length + task.unassignedQuantity) + '개']) + '">' + e(items.join(' · ')) + '</p></div><div class="pos-row-actions">' + b('업무 처리', 'pos-task', task.id, 'primary') + '</div></article>';
  }
  function taskRow(task) {
    const late = task.date < D.today, remaining = task.remainingAssetIds.length + task.unassignedQuantity, day = task.date.slice(5).replace('-', '/');
    const title = task.time + ' · ' + (task.customer?.name ? task.customer.name + ' 팀' : task.title) + ' · ' + names[task.kind] + (late ? ' · 지연 ' + day : task.date !== D.today ? ' · ' + day : '');
    const items = taskItems(task).map(([text]) => text).join(' · ');
    return P.row(title, task.place + ' · 남은 물품 ' + remaining + '개' + (items ? ' · ' + items : '') + (task.unassignedQuantity ? ' · 미배정 ' + task.unassignedQuantity + '개' : ''), b('업무 처리', 'pos-task', task.id, 'primary'));
  }
  function render() {
    const all = D.snapshot.tasks.filter(active), q = query.replace(/[\s-]/g, '').toLowerCase();
    const tasks = all.filter(t => inPeriod(t.date) && (!vehicle || t.vehicleId === vehicle) && ((t.customer?.name || '') + (t.customer?.phone || '') + t.place + (t.title || '')).replace(/[\s-]/g, '').toLowerCase().includes(q)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const deliveries = tasks.filter(t => t.kind === 'delivery').length, collections = tasks.filter(t => t.kind === 'collection').length, late = tasks.filter(t => t.date < D.today).length;
    const inVehicle = D.snapshot.assets ? D.snapshot.assets.filter(a => a.location.kind === 'vehicle' && (!vehicle || a.location.id === vehicle)).length : (D.snapshot.vehicle?.assets || []).length;
    const counts = { today: all.filter(t => t.date <= D.today && (!vehicle || t.vehicleId === vehicle)).length, tomorrow: all.filter(t => t.date === nextDate(D.today) && (!vehicle || t.vehicleId === vehicle)).length, all: all.filter(t => !vehicle || t.vehicleId === vehicle).length };
    const periodChips = P.group(P.chip('오늘·이전', 'pos-dispatch-period', 'today', !date && period === 'today', counts.today) + P.chip('내일', 'pos-dispatch-period', 'tomorrow', !date && period === 'tomorrow', counts.tomorrow) + P.chip('전체', 'pos-dispatch-period', 'all', !date && period === 'all', counts.all) + P.chip(date ? date.slice(5).replace('-', '/') : '달력', 'pos-dispatch-pick-date', '', !!date, null, 'is-date'));
    const summary = (driver() ? vehicleName(D.snapshot.actor.vehicleId) + ' · ' : '') + '운행 ' + tasks.length + '건 · 배달 ' + deliveries + '건 · 수거 ' + collections + '건 · 지연 ' + late + '건 · 차량 보관 ' + inVehicle + '개';
    const options = { wait: late ? '지연 ' + late + '건' : tasks.length ? '남은 ' + tasks.length + '건' : '없음', sums: [['배달', deliveries + '건', deliveries ? 'blue' : ''], ['수거', collections + '건', collections ? 'orange' : ''], ['차량 보관', inVehicle + '개', inVehicle ? 'purple' : '']] };
    const refresh = D.pending ? b('같은 요청 다시 확인', 'pos-retry', '', 'soft') : b('최신 업무 확인', 'pos-refresh');
    if (driver()) return P.page('차량 운행', '', P.pager(tasks, 'dispatch-tasks', phone() ? phoneRow : taskRow, driverRows()), '<span>' + e(summary) + '</span><div class="so-actions">' + b('보관 물품 보기', 'pos-vehicle-stock') + refresh + '</div>', { ...options, toolbar: P.toolbarLabel('운행일') + periodChips + P.toolbarLabel(vehicleName(D.snapshot.actor.vehicleId)) });
    const groups = vehicles().map(([id, name]) => ({ title: name, sub: tasks.filter(t => t.vehicleId === id).length + '건', cards: tasks.filter(t => t.vehicleId === id).map(taskCard) })).concat([{ title: '차량 미지정', sub: '', cards: tasks.filter(t => !vehicles().some(([id]) => id === t.vehicleId)).map(taskCard) }]);
    const toolbar = P.search('pos-dispatch-search', query, '이름 · 장소 · 연락처 뒷자리') + P.toolbarLabel('운행일') + periodChips
      + P.group(P.chip('전체 차량', 'pos-dispatch-vehicle', '', !vehicle, null, 'is-sort') + vehicles().map(([id, name]) => P.chip(name, 'pos-dispatch-vehicle', id, vehicle === id, null, 'is-sort')).join(''));
    return P.page('차량 운행', '', P.cards(groups, { fixed: true, signature: [period, date, vehicle, query].join('|'), empty: query ? '검색 결과 없음' : '운행 업무 없음', emptyNote: '이 조건의 배달·수거 없음', emptyAction: period !== 'all' || vehicle || date ? b('전체 보기', 'pos-dispatch-period', 'all', 'primary') : '' }),
      '<span>' + e(summary) + '</span><div class="so-actions">' + b('보관 물품 보기', 'pos-vehicle-stock') + refresh + b('배달할 팀 찾기', 'pos-dispatch-find', '', 'primary') + '</div>', { ...options, toolbar });
  }
  S.search('pos-dispatch-search', value => { query = value; const cursor = S.$('[data-search="pos-dispatch-search"]')?.selectionStart; S.render(); const el = S.$('[data-search="pos-dispatch-search"]'); el?.focus(); if (el && cursor != null) el.setSelectionRange(cursor, cursor); });
  S.action('pos-dispatch-period', value => { period = value; date = ''; S.render(); });
  S.action('pos-dispatch-vehicle', value => { vehicle = value; S.render(); });
  S.action('pos-dispatch-pick-date', () => P.calendar({ title: '운행일 선택', selected: date, today: D.today, action: 'pos-dispatch-date-save', unit: '건', clear: date ? ['전체 날짜 보기', 'pos-dispatch-date-clear'] : null, count: day => D.snapshot.tasks.filter(t => t.date === day && ['waiting', 'in_progress'].includes(t.status)).length }));
  S.action('pos-dispatch-date-save', value => { try { const picked = value || U.read('dispatchDate'); window.SkiWorkflowCommon.date(picked); date = picked; S.close(); S.render(); } catch (err) { U.error(err); } });
  S.action('pos-dispatch-date-clear', () => { date = ''; S.close(); S.render(); });
  S.change('pos-dispatch-date', value => { date = value; S.render(); });
  S.change('pos-dispatch-vehicle', value => { vehicle = value; S.render(); });
  function taskPage() {
    const task = D.snapshot.tasks.find(t => t.id === taskDraft?.id);
    if (!task) return P.page('업무 선택', '', '<div class="pos-empty"><strong>업무 없음</strong><span>차량 운행 목록에서 다시 선택</span></div>', '<div class="so-actions">' + U.go('차량 업무', 'dispatch') + (!driver() ? b('리프트권 회수·재사용', 'pos-ticket-stock') : '') + '</div>');
    const driverTask = driver() && ['delivery', 'collection'].includes(task.kind);
    const physical = task.physicalAssets || [];
    const groups = D.snapshot.catalog.flatMap(product => {
      const ids = task.remainingAssetIds.filter(id => physical.some(a => a.id === id && a.sku === product.id));
      return ids.length ? [{ product, ids }] : [];
    });
    const line = group => {
      const quantity = taskDraft.counts[group.product.id] || 0;
      const step = (n, text) => '<button class="so-button pos-button" type="button" data-action="pos-task-step" data-id="' + e(group.product.id) + '" data-delta="' + n + '" aria-label="' + e(group.product.label + ' ' + text) + '">' + text + '</button>';
      const location = physical.filter(a => group.ids.includes(a.id)).map(a => a.location.kind === 'vehicle' ? '차량 보관' : a.location.kind === 'shop' ? '매장 보관' : '고객 보유').filter((x, i, rows) => rows.indexOf(x) === i).join(' · ');
      return P.row(group.product.label + ' · 남음 ' + group.ids.length + (driverTask ? '' : group.product.unit), location, '<div class="pos-quantity">' + step(-1, '−') + '<output aria-label="선택 수량">' + quantity + '</output>' + step(1, '+') + '</div>', driverTask ? { phone: { title: group.product.label, description: '남음 ' + group.ids.length + ' · ' + location } } : {});
    };
    const phone = (task.customer?.phone || '').replace(/[^0-9+]/g, '');
    if (driverTask) {
      const remaining = task.remainingAssetIds.length + task.unassignedQuantity, selected = Object.values(taskDraft.counts).reduce((n, count) => n + count, 0);
      const message = b('출발 문자', 'pos-task-message', task.id, 'pos-task-message', { icon: 'message-square-text' });
      const call = phone ? '<a class="so-button pos-button pos-task-call" href="tel:' + e(phone) + '">' + S.icon('phone') + '전화</a>' : '<button type="button" class="so-button pos-button pos-task-call" disabled>' + S.icon('phone') + '전화</button>';
      const rowLimit = innerWidth < 600 ? Math.max(1, Math.min(4, Math.floor((innerHeight - 472) / 80))) : innerHeight < 700 ? 2 : 4;
      const pageSize = task.unassignedQuantity || taskDraft.error ? Math.max(1, rowLimit - 1) : rowLimit;
      const body = '<div class="pos-task-customer"><div class="pos-task-name"><strong>' + e(task.customer?.name ? task.customer.name + ' 팀' : task.title) + '</strong>' + P.badge(names[task.kind] + ' ' + remaining + '개', 'blue') + '</div>'
        + '<span class="pos-task-appointment">' + e(S.date(task.date) + ' ' + task.time + ' · ' + task.place) + '</span><span class="pos-task-phone">' + e(task.customer?.phone || '연락처 없음') + '</span>'
        + '<div class="pos-task-contact">' + call + message + '</div></div>' + P.pager(groups, 'task-assets', line, pageSize)
        + (task.unassignedQuantity ? '<p class="pos-label">미배정 ' + task.unassignedQuantity + '개 · 매장에서 준비·발권 필요</p>' : '')
        + (taskDraft.error ? '<p class="pos-error" id="pos-error" role="alert">' + e(taskDraft.error) + '</p>' : U.errorBox());
      const primary = b((task.kind === 'delivery' ? '실제 전달 확정 ' : '실제 수거 확정 ') + selected + '개', 'pos-task-complete', '', 'primary');
      return P.page('배달·수거 처리', '', body, '<div class="so-actions"><button type="button" class="so-button pos-button pos-task-list" data-go="dispatch">' + S.icon('list') + '업무 목록</button>' + message
        + b('못 받음·고객 부재', 'pos-task-visit', task.id, 'pos-task-visit', { icon: 'user-round' }) + '</div><div class="so-actions">' + primary + '</div>',
      { layout: 'driver-task', title: '배달·수거 처리', phoneTitle: names[task.kind] + ' 처리', phoneBack: 'dispatch', wait: names[task.kind] + ' ' + remaining + '개', waitLabel: '' });
    }
    const body = '<div class="pos-customer-strip"><strong>' + e(task.customer?.name ? task.customer.name + ' 팀' : task.title) + '</strong><span>' + e(task.date + ' ' + task.time + ' · ' + task.place) + '</span>' + (task.customer?.phone ? '<span>' + e(task.customer.phone) + '</span>' : '') + '</div>' + P.pager(groups, 'task-assets', line, innerHeight < 700 ? 2 : 4) + (task.unassignedQuantity ? '<p class="pos-label">미배정 ' + task.unassignedQuantity + '개 · 매장에서 준비·발권 필요</p>' : '') + U.errorBox();
    const physicalButton = task.kind === 'delivery' ? b('실제 전달 확정', 'pos-task-complete', '', 'primary') : task.kind === 'collection' ? b('실제 수거 확정', 'pos-task-complete', '', 'primary') : b('발권처 환불 확인', 'pos-vendor-refund', task.id, 'primary');
    return P.page(names[task.kind] + ' 업무', '', body, '<div class="so-actions">' + U.go('업무 목록', 'dispatch') + (phone ? '<a class="so-button pos-button" href="tel:' + e(phone) + '">' + S.icon('phone') + '전화</a>' : '') + b('못 받음·고객 부재', 'pos-task-visit', task.id) + '</div><div class="so-actions">' + (!driver() && task.kind === 'delivery' ? b('매장 수령으로 변경', 'pos-task-cancel', task.id) : '') + physicalButton + '</div>',
      { wait: names[task.kind] + ' ' + (task.remainingAssetIds.length + task.unassignedQuantity) + '개', sums: [['약속', task.time], ['장소', task.place]] });
  }
  function openTask(id) {
    const task = D.snapshot.tasks.find(t => t.id === id); taskDraft = { id, revision: D.snapshot.revision, counts: {} };
    for (const a of task.physicalAssets || []) if (task.remainingAssetIds.includes(a.id)) taskDraft.counts[a.sku] = (taskDraft.counts[a.sku] || 0) + 1;
    S.go('driver-task', { id });
  }
  let taskResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(taskResizeTimer);
    taskResizeTimer = setTimeout(() => { if (S.state.page === 'driver-task' && S.root.dataset.posLayout === 'driver-task') S.render(); }, 120);
  });
  S.action('pos-task', openTask); S.posDispatch = { openTask };
  S.action('pos-task-message', id => {
    const task = D.snapshot.tasks.find(t => t.id === id);
    if (!task || !active(task) || !['delivery', 'collection'].includes(task.kind)) { S.toast('남은 배달·수거 업무를 다시 확인해 주세요.'); return; }
    const kind = names[task.kind], shop = D.snapshot.management?.settings?.store?.name || S.operations.store().name;
    const instruction = task.kind === 'collection' ? '장비와 함께 기다려 주세요.' : '물품을 받을 준비를 해 주세요.';
    const message = '[' + shop + '] ' + kind + ' 차량이 출발했습니다. 10분 이내 도착 예정이니 ' + task.place + '에서 ' + instruction;
    // The existing departure-SMS contract is a preview until a store sender/provider is connected (docs/04, docs/28).
    // Opening it never sends a message, changes a task, or records a fabricated delivery result.
    P.modal('출발 문자', '<p class="pos-task-message-copy">' + e(message) + '</p><p class="pos-info">문자 발송이 아직 연결되지 않았습니다. 안내 문구만 확인하며 고객에게 문자는 보내지 않습니다.</p>', b('닫기', 'close'), (task.customer?.name || task.title) + ' · ' + (task.customer?.phone || '연락처 없음'));
  });
  S.action('pos-task-step', (sku, button) => { const task = D.snapshot.tasks.find(t => t.id === taskDraft.id), max = task.remainingAssetIds.filter(id => task.physicalAssets.some(a => a.sku === sku && a.id === id)).length; taskDraft.counts[sku] = Math.max(0, Math.min(max, (taskDraft.counts[sku] || 0) + Number(button.dataset.delta))); taskDraft.error = ''; S.render(); });
  S.action('pos-task-complete', async () => {
    try {
      const task = D.snapshot.tasks.find(t => t.id === taskDraft.id);
      if (taskDraft.revision !== D.snapshot.revision) throw new Error('업무가 변경되었습니다. 최신 업무에서 수량을 다시 확인하세요.');
      const ids = Object.entries(taskDraft.counts).flatMap(([sku, count]) => task.physicalAssets.filter(a => a.sku === sku && task.remainingAssetIds.includes(a.id)).slice(0, count).map(a => a.id));
      if (!ids.length) throw new Error('처리한 수량이 0개입니다. 고객 부재·못 받음에서 다음 약속을 남겨 주세요.');
      await D.execute('ops.taskMove', { taskId: task.id, assetIds: ids });
      S.go('dispatch'); S.toast('실제 처리 수량 기록 완료 · 남은 업무 유지');
    } catch (err) { if (driver()) { taskDraft.error = err.message; S.render(); } else U.error(err); }
  });
  S.action('pos-task-visit', id => {
    const task = D.snapshot.tasks.find(t => t.id === id);
    P.modal('못 받음·방문 결과', '<div class="pos-info">' + e(task.customer?.name || task.title) + ' · 물품 수량 이동 없음</div><div class="pos-form-grid">' + U.select('방문 결과', 'visitResult', [['absent', '고객 부재'], ['location_changed', '장소 변경'], ['none', '물품을 받지 못함']], 'absent') + U.input('다음 방문일', 'visitDate', task.date, 'date') + U.input('다음 시간', 'visitTime', task.time, 'time') + U.input('다음 장소', 'visitPlace', task.place) + '</div>' + U.errorBox(), b('취소', 'close') + b('방문 결과·다음 약속 저장', 'pos-task-visit-save', id, 'primary'));
  });
  S.action('pos-task-visit-save', async id => { try { await D.execute('ops.visit', { taskId: id, result: U.read('visitResult'), nextDate: U.read('visitDate'), nextTime: U.read('visitTime'), place: U.read('visitPlace') }); S.close(); S.go('dispatch'); } catch (err) { U.error(err); } });
  S.action('pos-task-cancel', id => P.modal('매장 수령으로 변경', '<div class="pos-info">담당 차량에 남은 미전달 물품을 실제로 매장에 내렸는지 확인 · 이미 전달한 물품은 유지</div>' + U.errorBox(), b('취소', 'close') + b('실제 내림 확인·배달 해제', 'pos-task-cancel-save', id, 'primary')));
  S.action('pos-task-cancel-save', async id => { try { await D.execute('ops.deliveryCancel', { taskId: id, reason: '고객 매장 수령으로 변경', unload: true }); S.close(); S.go('dispatch'); } catch (err) { U.error(err); } });
  S.action('pos-dispatch-find', () => S.go('preparation'));
  S.action('pos-dispatch-order', id => S.posFulfillment.open('dispatch', id));
  S.action('pos-vehicle-stock', () => S.go('vehicle'));
  function vehicleStock() {
    const assets = driver() ? D.snapshot.vehicle?.assets || [] : D.snapshot.assets.filter(a => a.location.kind === 'vehicle' && (!vehicle || a.location.id === vehicle));
    const orders = (D.snapshot.orders || []).filter(o => o.totals.vehicleQuantity > 0);
    const body = driver()
      ? P.pager(D.snapshot.vehicle.totals.filter(t => t.current), 'vehicle-stock', t => P.row(t.label + ' ' + t.current + t.unit + ' · 차량 보관', '매장 적재 ' + t.fromShop + ' · 고객 회수 ' + t.fromCustomer + ' · 환불 대기 ' + t.refundPending + ' · 전달 가능 ' + t.availableToDeliver), driverRows())
      : P.cards([{ title: '매장 입고 대기', sub: orders.length + '팀 · 차량 보관 ' + assets.length + '개', cards: orders.map(o => P.orderCard({ id: o.id, tone: 'orange', badge: ['차량 보관 중', 'purple'], name: o.customer.name + ' 팀', phone: o.customer.phone || '', metaParts: ['매장 입고 대기 ' + o.totals.vehicleQuantity + '개', o.receiptNo || o.id], itemParts: U.items(o).map(item => item[0]), state: ['차량 보관', 'purple'], money: [o.finance.dueWon ? '미수 ' + S.money(o.finance.dueWon) : '수납 완료', o.finance.dueWon ? 'red' : 'green'], actions: b('차량 입고 확인 ' + o.totals.vehicleQuantity + '개', 'pos-receive', o.id, 'primary'), go: { page: 'order-detail', id: o.id } })) }], { fixed: true, signature: 'vehicle-stock', empty: '매장 입고 대기 없음', emptyNote: '차량 보관 ' + assets.length + '개' });
    return P.page('차량 보관 물품', '', body, '<span>' + e('차량 보관 ' + assets.length + '개 · 입고 대기 ' + orders.length + '팀') + '</span><div class="so-actions">' + U.go('차량 업무', 'dispatch') + (!driver() ? b('리프트권 회수·재사용', 'pos-ticket-stock') : '') + '</div>', { wait: orders.length ? '입고 ' + orders.length + '팀' : '없음', sums: [['차량 보관', assets.length + '개', assets.length ? 'purple' : '']] });
  }
  S.action('pos-vendor-refund', id => { const task = D.snapshot.tasks.find(t => t.id === id); P.modal('발권처 환불 기록', '<div class="pos-info">실제로 발권처에 반환하고 확정한 금액만 기록</div>' + U.input('확정 환불 금액 (원)', 'vendorAmount', '', 'number', 'min="0" inputmode="numeric"') + U.errorBox(), b('취소', 'close') + b('발권처 반환·환불 확정', 'pos-vendor-refund-save', task.refundId, 'primary')); });
  S.action('pos-vendor-refund-save', async id => { try { const row = D.snapshot.refunds.find(r => r.id === id); if (taskDraft.revision !== D.snapshot.revision) throw new Error('업무가 변경되었습니다. 최신 업무에서 수량을 다시 확인하세요.'); if (U.read('vendorAmount') === '') throw new Error('발권처에서 확정한 금액을 입력하세요.'); await D.execute('refund.complete', { id, assetIds: Object.entries(taskDraft.counts).flatMap(([sku, count]) => D.snapshot.tasks.find(t => t.id === taskDraft.id).physicalAssets.filter(a => a.sku === sku && row.assetIds.includes(a.id) && !row.completedAssetIds.includes(a.id) && !row.cancelledAssetIds.includes(a.id)).slice(0, count).map(a => a.id)), amountWon: Number(U.read('vendorAmount')) }); S.close(); S.go('dispatch'); } catch (err) { U.error(err); } });
  S.register('dispatch', { title: '차량 운행', pos: true, render });
  S.register('vehicle', { title: '차량 보관', parent: 'dispatch', pos: true, render: vehicleStock });
  S.register('driver-task', { title: '배달·수거 처리', parent: 'dispatch', pos: true, render: taskPage });
})();
