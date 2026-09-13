(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, e = S.esc, won = S.money;
  const state = { query: '', period: 'today', draft: null, step: 0, linePage: 0 }, pageSize = () => innerHeight < 700 ? 3 : 4;
  const labels = { awaiting_exchange: '교환 처리 중', awaiting_issue: '지급 대기', in_use: '이용 중', partial_return: '일부 반납', awaiting_shop: '차량 입고 대기', returned: '반납 완료', cancelled: '취소', needs_review: '물품 확인 필요' };
  const btn = P.button, go = (label, page, id = '', kind = '') => '<button type="button" class="so-button pos-button ' + e(kind) + '" data-go="' + e(page) + '" data-id="' + e(id) + '">' + e(label) + '</button>';
  const input = (label, name, value, type = 'text', attrs = '') => P.field(label, value, type, 'data-pos-input="' + name + '" ' + attrs);
  const select = (label, name, values, value) => '<label class="so-field">' + e(label) + '<select aria-label="' + e(label) + '" data-pos-input="' + name + '"' + (name === 'sku' ? ' data-change="pos-draft-sku"' : name === 'personId' ? ' data-change="pos-draft-person"' : '') + '>' + values.map(([id, text]) => '<option value="' + e(id) + '"' + (String(id) === String(value) ? ' selected' : '') + '>' + e(text) + '</option>').join('') + '</select></label>';
  const errorBox = () => '<p class="pos-error" id="pos-error" role="alert" hidden></p>';
  function error(reason) { const box = S.$('#so-dialog[open] #pos-error') || S.$('#pos-error'); if (box) { box.hidden = false; box.textContent = reason.message || reason; } else S.toast(reason.message || reason); }
  const read = name => (S.$('#so-dialog[open] [data-pos-input="' + name + '"]') || S.$('[data-pos-input="' + name + '"]'))?.value;
  const nextDate = date => window.SkiWorkflowCommon.nextDate(date);
  const sku = id => D.snapshot.catalog.find(s => s.id === id);
  function rows() {
    const q = state.query.replace(/[\s-]/g, '').toLowerCase();
    return D.snapshot.orders.filter(o => [o.id, o.receiptNo, o.customer.name, o.customer.phone, ...o.people.map(p => p.name)].join(' ').replace(/[\s-]/g, '').toLowerCase().includes(q));
  }
  function orderDescription(o) {
    return [o.receiptNo || o.id, labels[o.status], (o.lines.some(l => l.unissuedQuantity && l.pickupPlan.date < D.today) ? '지급일 지남 · ' : '') + '미지급 ' + o.totals.unissuedQuantity, (o.lines.some(l => l.customerQuantity && (l.currentReturnDate || l.returnPlan.date) < D.today) ? '반납 연체 · ' : '') + '고객 보유 ' + o.totals.customerQuantity, o.finance.dueWon ? '잔액 ' + won(o.finance.dueWon) : '정산 완료'].join(' · ');
  }
  function orderList(list, key = 'orders') {
    return P.pager(list, key, o => P.row(o.customer.name + ' · ' + (o.people.length ? o.people.length + '명' : '기존 접수'), orderDescription(o), go('업무 열기', 'order-detail', o.id)), pageSize());
  }
  function search(kind) { return '<div class="pos-search-row"><input aria-label="접수번호·이름·연락처 검색" data-search="pos-orders" value="' + e(state.query) + '" placeholder="접수번호 · 대표자 · 일행 · 연락처" autocomplete="off">' + (['preparation', 'returns'].includes(kind) ? ['today','tomorrow','all'].map(value => btn({today:'오늘·이전',tomorrow:'내일',all:'전체'}[value], 'pos-period', value, state.period === value ? 'primary' : '')).join('') : '') + btn('새 접수', 'pos-new', '', 'primary') + '</div>'; }
  function home() {
    const orders = D.snapshot.orders, count = field => orders.filter(o => o.lines.some(l => l[field] > 0 && (field === 'unissuedQuantity' ? l.pickupPlan.date <= D.today : field === 'customerQuantity' ? (l.currentReturnDate || l.returnPlan.date) <= D.today : true))).length;
    const cards = [['preparation', '준비·지급 대기', count('unissuedQuantity')], ['returns', '오늘 반납·연체', count('customerQuantity')], ['dispatch', '차량 입고 대기', count('vehicleQuantity')], ['closing', '정산 남음', orders.filter(o => o.finance.dueWon || o.finance.depositHeldWon).length]];
    const body = '<div class="pos-task-cards">' + cards.map(([route, title, number]) => '<button type="button" data-go="' + route + '"><span>' + title + '</span><strong>' + number + '팀</strong></button>').join('') + '</div>' + orderList(orders.filter(o => o.finance.dueWon || o.finance.depositHeldWon || o.lines.some(l => l.unissuedQuantity && l.pickupPlan.date <= D.today || l.customerQuantity && (l.currentReturnDate || l.returnPlan.date) <= D.today || l.vehicleQuantity)).slice().sort((a, b) => a.id.localeCompare(b.id)), 'today');
    return P.page('오늘 할 일', D.today + ' · 고객을 열면 다음 업무까지 같은 접수로 이어집니다.', body, '<span>오늘의 실제 업무 기록 기준</span><div class="so-actions">' + btn('기존 팀 찾기', 'pos-find') + btn('새 팀 접수', 'pos-new', '', 'primary') + '</div>');
  }
  function listing(kind) {
    const inPeriod = date => state.query || state.period === 'all' || (state.period === 'tomorrow' ? date === nextDate(D.today) : date <= D.today);
    const filtered = rows().filter(o => kind === 'preparation' ? o.lines.some(l => l.unissuedQuantity && inPeriod(l.pickupPlan.date)) : kind === 'returns' ? o.lines.some(l => l.customerQuantity && inPeriod(l.currentReturnDate || l.returnPlan.date) || l.vehicleQuantity) : kind === 'rentals' ? !o.complete : true);
    const titles = { intake: '1. 접수·예약', preparation: '2. 준비·지급', rentals: '3. 이용 중·변경', returns: '4. 반납·회수' };
    return P.page(titles[kind], kind === 'intake' ? '새 팀은 새 접수 · 늦게 온 일행은 기존 팀에서 추가하세요.' : '팀을 선택하면 품목별 남은 업무와 처리 방법을 확인할 수 있습니다.', search(kind) + orderList(filtered), '<span>이름이 같아도 다른 방문은 별도 접수로 유지합니다.</span>' + (D.pending ? btn('같은 요청 다시 확인', 'pos-retry', '', 'primary') : btn('최신 기록 확인', 'pos-refresh')));
  }
  function lineDescription(o, l) {
    const person = o.people.find(p => p.id === l.personId)?.name || '팀 공용', batch = o.batches.find(b => b.id === l.batchId)?.label || '';
    const extended = (l.customerTerms || []).filter(t => t.end > l.end);
    return person + ' · ' + batch + ' · ' + l.start.slice(5) + (l.end !== l.start ? '~' + l.end.slice(5) : '') + (extended.length ? ' · 남은 ' + extended.length + '개 ' + l.currentEnd.slice(5) + '까지 연장' : '') + ' · ' + (l.cancelledQuantity ? '취소' : '미지급 ' + l.unissuedQuantity + ' / 보유 ' + l.customerQuantity + ' / 차량 ' + l.vehicleQuantity);
  }
  function detail() {
    const o = D.order(); if (!o) return P.page('접수를 찾을 수 없습니다', '목록에서 다시 선택해 주세요.', go('접수 목록', 'intake'));
    const summary = '<div class="pos-customer-strip"><span><b>' + e(o.customer.name) + '</b> · ' + e(o.customer.phone || '연락처 확인 필요') + '</span><span>' + e(o.receiptNo || o.id) + ' · ' + e(labels[o.status]) + '</span><span>청구 ' + won(o.finance.chargedWon) + ' · 남은 잔액 <b>' + won(o.finance.dueWon) + '</b></span></div>';
    const actions = '<div class="pos-shortcuts">' + btn('일행·장비 추가', 'pos-add', o.id) + btn('수납·환불', 'pos-money', o.id) + btn('사전입력·준비표', 'pos-preinput', o.id) + btn('기간·수거 변경', 'pos-change', o.id) + btn('문제 해결·정정', 'pos-problems', o.id) + '</div>';
    const lines = P.pager(o.lines, 'lines-' + o.id, l => P.row((l.label || sku(l.sku)?.label) + ' ' + l.quantity + (l.unit || sku(l.sku)?.unit || '개'), lineDescription(o, l), btn('품목 보기', 'pos-line', l.id)), innerHeight < 700 ? 2 : 4);
    const next = o.exchangeOpenQuantity ? btn('교환 진행 확인', 'pos-problems', o.id, 'primary') : o.totals.customerQuantity ? btn('모두 받음', 'pos-return-all', o.id, 'primary') : o.totals.vehicleQuantity ? btn('차량에서 받은 물품 입고', 'pos-receive', o.id, 'primary') : o.totals.unissuedQuantity ? btn('준비·지급하기', 'pos-issue', o.id, 'primary') : btn('남은 정산 확인', 'pos-money', o.id, 'primary');
    return P.page(o.customer.name + ' 팀', '접수 ' + (o.receiptNo || o.id) + ' · ' + o.batches.length + '개 접수 내역 · ' + (o.source ? '이관 전 수납 내역은 별도 확인이 필요합니다.' : '물품 반납과 금액 정산은 각각 표시합니다.'), summary + actions + lines,
      '<div>' + (o.totals.customerQuantity ? btn('일부만 받음', 'pos-return-some', o.id) : go('목록으로', 'intake')) + '</div><div class="so-actions">' + (o.totals.unissuedQuantity && o.totals.customerQuantity ? btn('남은 장비 지급', 'pos-issue', o.id) : '') + next + '</div>');
  }
  function startDraft(id) {
    const o = id ? D.order(id) : null;
    if (state.draft && state.draft.orderId === (id || null)) { S.go('order-intake'); return; }
    state.draft = { orderId: id || null, customer: o?.customer || { name: '', phone: '' }, people: [], lines: [], start: D.today, end: D.today, personId: o?.people[0]?.id || '', sku: 'ski', unitWon: D.snapshot.management?.settings.rates.find(r => r.sku === 'ski')?.unitWon, step: 0 };
    S.go('order-intake', id ? { id } : {});
  }
  function captureDraft() {
    const d = state.draft;
    for (const key of ['start', 'end']) if (read(key) !== undefined) d[key] = read(key);
    if (!d.orderId) { if (read('name') !== undefined) d.customer.name = read('name'); if (read('phone') !== undefined) d.customer.phone = read('phone'); }
  }
  function draftPeople() { const d = state.draft; return [...(d.orderId ? D.order(d.orderId).people : []), ...d.people]; }
  function intake() {
    const d = state.draft; if (!d) return listing('intake');
    const o = d.orderId ? D.order(d.orderId) : null, name = o?.customer.name || d.customer.name || '새 팀';
    let body;
    if (d.step === 0) body = '<div class="pos-form-grid">' + (o ? '<div class="pos-info"><strong>' + e(o.customer.name) + ' 팀에 추가</strong><p>' + e(o.receiptNo || o.id) + ' · ' + e(o.customer.phone) + '</p></div>' : input('대표자 이름', 'name', d.customer.name, 'text', 'maxlength="60" autocomplete="name"') + input('대표자 연락처', 'phone', d.customer.phone, 'tel', 'autocomplete="tel"')) + input('추가 이용 시작일', 'start', d.start, 'date') + input('추가 이용 종료일', 'end', d.end, 'date') + '</div><div class="so-actions">' + btn('오늘', 'pos-date', 'today') + btn('내일', 'pos-date', 'tomorrow') + (o ? btn('기존 일행과 같은 일정', 'pos-date', 'same') : '') + '</div><div class="pos-info">' + (o ? '기존 가격·지급·반납은 그대로 두고 이번 내역만 추가합니다.' : '대표자 정보는 한 번만 입력합니다. 일행의 실명은 나중에 확인해도 됩니다.') + '</div>' + errorBox();
    else if (d.step === 1) {
      const people = draftPeople();
      body = '<div class="pos-add-layout"><div class="pos-entry-panel"><div class="pos-form-grid">' + select('대상 일행', 'personId', [['', '팀 공용'], ...people.map(p => [p.id, p.name]), ...(people.length > 1 ? [['__all', '전체 일행 · 사람마다 같은 품목']] : []), ['__many', '일행 여러 명 한 번에 추가…']], d.personId) + btn('새 일행 추가', 'pos-person-add') + select('추가할 품목', 'sku', D.snapshot.catalog.filter(s => !s.id.startsWith('legacy-')).map(s => [s.id, s.label]), d.sku || 'ski') + input(d.personId === '__all' ? '일행 한 명당 수량' : '실제 물품 수량', 'quantity', d.quantity || 1, 'number', 'min="1" max="500" inputmode="numeric"') + input('단가 (원)', 'unitWon', d.unitWon ?? '', 'number', 'min="0" inputmode="numeric" placeholder="요금 확인"') + input(d.personId === '__all' ? '일행 한 명당 할인 (원)' : '이번 품목 할인 (원)', 'discountWon', d.discountWon || 0, 'number', 'min="0" inputmode="numeric"') + '</div>' + btn('이번 내역에 담기', 'pos-line-add', '', 'primary') + '</div><div class="pos-draft-lines">' + P.pager(d.lines, 'draft-lines', l => P.row((sku(l.sku)?.label || l.sku) + ' ' + l.quantity + '개', (people.find(p => p.id === l.personId)?.name || '팀 공용') + ' · ' + l.start.slice(5) + '~' + l.end.slice(5), btn('빼기', 'pos-line-remove', l.id)), 2) + '</div></div>' + errorBox();
    } else {
      const total = d.lines.reduce((n, l) => n + amount(l), 0);
      body = '<div class="pos-confirm-summary"><strong>' + e(name) + ' · ' + (d.orderId ? '기존 접수에 추가' : '새 접수') + '</strong><span>새 일행 ' + d.people.length + '명 · ' + d.lines.length + '개 품목 행</span><span>이번 청구액 <b>' + won(total) + '</b></span><span>수령 ' + e(d.pickupPlan ? d.pickupPlan.date + ' · ' + (d.pickupPlan.method === 'delivery' ? '차량 배달' : '매장') : '이용 시작일 매장') + ' / 반납 ' + e(d.returnPlan ? d.returnPlan.date + ' · ' + (d.returnPlan.method === 'vehicle' ? '차량 수거' : '매장 직접') : '이용 종료일 매장 직접') + '</span></div>' + P.pager(d.lines, 'review-lines', l => P.row((sku(l.sku)?.label || l.sku) + ' ' + l.quantity + '개', l.start + '~' + l.end + ' · ' + won(amount(l))), 2);
      // Keep the error inside the body, before the fixed confirmation footer.
      body += errorBox();
    }
    return P.page((o ? '일행·장비 추가' : '새 팀 접수') + ' · ' + (d.step + 1) + '/3', name + ' · ' + d.start + '~' + d.end + ' · ' + ['대상과 이용일', '일행·품목 선택', '이번 내역 확인'][d.step], body,
      '<div class="so-actions">' + btn(d.step ? '이전' : '초안 닫기', 'pos-draft-back') + (d.step === 2 ? btn('수령·반납 일정', 'pos-draft-plan', 'pickup') : '') + '</div><div class="so-actions">' + (d.step < 2 ? btn('다음', 'pos-draft-next', '', 'primary') : btn(o ? '추가하고 준비하기' : '접수하고 준비하기', 'pos-draft-save', '', 'primary')) + '</div>');
  }
  const amount = l => l.quantity * l.price.unitWon * (sku(l.sku)?.kind === 'liftTicket' ? 1 : (Date.parse(l.end) - Date.parse(l.start)) / 86400000 + 1) - (l.price.discountWon || 0);
  S.search('pos-orders', value => { state.query = value; P.setPage('orders', 0, { render: false }); const cursor = S.$('[data-search="pos-orders"]')?.selectionStart; S.render(); const el = S.$('[data-search="pos-orders"]'); el?.focus(); if (el && cursor != null) el.setSelectionRange(cursor, cursor); });
  S.action('pos-period', value => { state.period = value; P.setPage('orders', 0, { render: false }); S.render(); });
  S.action('pos-find', () => S.go('intake'));
  S.action('pos-new', () => startDraft()); S.action('pos-add', startDraft);
  S.action('pos-draft-next', () => { captureDraft(); const d = state.draft; try { if (!d.step) { if (!d.orderId) window.SkiWorkflowCommon.customer(d.customer); window.SkiWorkflowCommon.date(d.start); window.SkiWorkflowCommon.date(d.end); if (d.end < d.start) throw new Error('종료일을 시작일 이후로 선택해 주세요.'); } else if (!d.lines.length) throw new Error('품목을 하나 이상 담아 주세요.'); d.step++; S.render(); } catch (err) { error(err); } });
  S.action('pos-draft-back', () => { captureDraft(); if (state.draft.step) { state.draft.step--; S.render(); } else S.go(state.draft.orderId ? 'order-detail' : 'intake', state.draft.orderId ? { id: state.draft.orderId } : {}); });
  S.action('pos-date', kind => { captureDraft(); const d = state.draft, existing = d.orderId ? D.order(d.orderId).lines.filter(l => !l.cancelledQuantity).at(-1) : null; d.start = kind === 'same' && existing ? (existing.start < D.today ? D.today : existing.start) : kind === 'tomorrow' ? nextDate(D.today) : D.today; d.end = kind === 'same' && existing && existing.end >= d.start ? existing.end : d.start; S.render(); });
  S.change('pos-draft-person', value => { const d = state.draft; d.sku = read('sku'); d.unitWon = read('unitWon') === '' ? undefined : Number(read('unitWon')); d.quantity = Number(read('quantity')) || 1; d.discountWon = Number(read('discountWon')) || 0; if (value !== '__many') { d.personId = value; S.render(); return; } P.modal('일행 인원 추가', '<p class="pos-info">실명 없이 일행 번호로 등록합니다. 사람별 규격은 사전입력으로 받을 수 있습니다.</p><div class="so-actions">' + [2,3,5,10,30].map(n => btn(n + '명', 'pos-people-add', String(n))).join('') + '</div>' + errorBox(), btn('취소', 'close')); });
  S.action('pos-people-add', value => { const d = state.draft, n = Number(value); try { if (draftPeople().length + n > 100) throw new Error('한 접수에는 최대 100명까지 등록할 수 있습니다.'); const start = draftPeople().length; for (let i = 0; i < n; i++) d.people.push({ id: D.id('person'), name: '일행 ' + (start + i + 1) }); d.personId = '__all'; S.close(); S.render(); } catch (err) { error(err); } });
  S.action('pos-person-add', () => { const d = state.draft, id = D.id('person'); d.people.push({ id, name: '일행 ' + (draftPeople().length + 1) }); d.personId = id; S.render(); });
  S.change('pos-draft-sku', value => { const d = state.draft; d.sku = value; d.personId = read('personId') || ''; d.quantity = Number(read('quantity')) || 1; d.discountWon = Number(read('discountWon')) || 0; d.unitWon = D.snapshot.management?.settings.rates.find(r => r.sku === value)?.unitWon; S.render(); });
  S.action('pos-line-add', () => {
    try {
      const d = state.draft, product = sku(read('sku')), quantity = Number(read('quantity')), unitWon = Number(read('unitWon')), discountWon = Number(read('discountWon'));
      if (!read('unitWon')) throw new Error('요금표의 단가를 확인해 주세요. 무료인 경우 0원을 입력하세요.');
      window.SkiWorkflowCommon.integer(quantity, 1, 500); window.SkiWorkflowCommon.integer(unitWon, 0, Number.MAX_SAFE_INTEGER); window.SkiWorkflowCommon.integer(discountWon, 0, Number.MAX_SAFE_INTEGER);
      const line = { id: D.id('line'), sku: product.id, personId: read('personId') || null, quantity, start: d.start, end: product.kind === 'liftTicket' ? d.start : d.end, price: { unitWon, discountWon } };
      if (amount(line) < 0 || !Number.isSafeInteger(amount(line))) throw new Error('수량·기간·금액과 할인을 확인해 주세요.');
      const targets = line.personId === '__all' ? draftPeople().map(p => p.id) : [line.personId]; if (!targets.length || line.personId === '__many') throw new Error('대상 일행을 선택해 주세요.'); for (const personId of targets) d.lines.push({ ...line, id: D.id('line'), personId }); d.personId = line.personId || ''; d.sku = line.sku; d.unitWon = unitWon; d.quantity = 1; S.render();
    } catch (err) { error(err); }
  });
  let planEdit = null;
  function planModal(kind) {
    const d = state.draft;
    planEdit = { kind, value: structuredClone(d[kind + 'Plan'] || { method: kind === 'pickup' ? 'shop' : 'direct', date: kind === 'pickup' ? d.start : d.end, time: kind === 'pickup' ? '09:00' : (D.snapshot.management?.settings.returnTimes[0]?.time || '16:30'), place: '매장' }) };
    drawPlan();
  }
  function capturePlan() { const v = planEdit.value; for (const [key, name] of [['date','planDate'],['time','planTime'],['place','planPlace'],['vehicleId','planVehicle']]) if (read(name) !== undefined) v[key] = read(name); }
  function drawPlan() {
    const v = planEdit.value, pickup = planEdit.kind === 'pickup', vehicle = ['delivery','vehicle'].includes(v.method), settings = D.snapshot.management?.settings;
    const method = select('방법', 'planMethod', pickup ? [['shop','매장 수령'],['delivery','차량 배달']] : [['direct','매장 직접반납'],['vehicle','차량 수거']], v.method).replace('data-pos-input="planMethod"', 'data-pos-input="planMethod" data-change="pos-plan-method"');
    const body = '<div class="pos-info">이번에 담은 품목의 ' + (pickup ? '수령' : '반납') + ' 일정만 적용합니다. 기존 대여는 유지됩니다.</div><div class="pos-form-grid">' + method + input('예정일', 'planDate', v.date, 'date') + input('예정 시간', 'planTime', v.time, 'time') + (vehicle ? select('담당 차량', 'planVehicle', (settings?.vehicles || []).map(row => [row.id,row.name]), v.vehicleId) + input('약속 장소', 'planPlace', v.place === '매장' ? settings?.places?.[0] || '' : v.place) : '<div class="pos-info">매장에서 확인합니다.</div>') + '</div>' + errorBox();
    P.modal(pickup ? '수령 일정' : '반납 일정', body, btn('취소', 'close') + btn(pickup ? '반납 일정도 확인' : '수령 일정 확인', 'pos-plan-switch', pickup ? 'return' : 'pickup') + btn('이번 일정 적용', 'pos-plan-save', '', 'primary'));
  }
  function applyPlan() { capturePlan(); const v = planEdit.value, pickup = planEdit.kind === 'pickup'; window.SkiWorkflowCommon.date(v.date); window.SkiWorkflowCommon.time(v.time); const dates = state.draft.lines.map(l => pickup ? l.start : l.end).sort(); if (pickup ? v.date > dates[0] : v.date < dates.at(-1)) throw new Error(pickup ? '이용 시작일 이전으로 수령일을 선택하세요.' : '이용 종료일 이후로 반납일을 선택하세요.'); if (['delivery','vehicle'].includes(v.method)) { window.SkiWorkflowCommon.id(v.vehicleId); window.SkiWorkflowCommon.string(v.place); } else { delete v.vehicleId; v.place = '매장'; } state.draft[planEdit.kind + 'Plan'] = structuredClone(v); }
  S.action('pos-draft-plan', planModal);
  S.change('pos-plan-method', value => { capturePlan(); planEdit.value.method = value; drawPlan(); });
  S.action('pos-plan-switch', kind => { try { applyPlan(); planModal(kind); } catch (err) { error(err); } });
  S.action('pos-plan-save', () => { try { applyPlan(); S.close(); S.render(); } catch (err) { error(err); } });
  S.action('pos-line-remove', id => { state.draft.lines = state.draft.lines.filter(l => l.id !== id); S.render(); });
  S.action('pos-draft-save', async () => {
    const d = state.draft; if (!d) return;
    try { const batch = { id: D.id('batch'), label: d.orderId ? '추가 접수 · ' + d.start : '첫 접수', lines: d.lines.map(l => ({ ...l, ...(d.pickupPlan ? { pickupPlan: d.pickupPlan } : {}), ...(d.returnPlan ? { returnPlan: d.returnPlan } : {}) })) };
      const result = await D.execute(d.orderId ? 'order.add' : 'order.create', { ...(d.orderId ? { orderId: d.orderId } : { id: D.id('R'), customer: d.customer }), people: d.people, batch });
      state.draft = null; S.go('order-detail', { id: result.orderId }); S.toast('같은 접수에 저장했습니다. 준비·지급을 이어서 진행하세요.');
    } catch (err) { error(err); }
  });
  S.action('pos-line', id => {
    const o = D.order(), l = o.lines.find(l => l.id === id);
    P.modal((l.label || sku(l.sku)?.label) + ' · 품목 내역', '<div class="pos-confirm-summary"><strong>' + e(lineDescription(o, l)) + '</strong><span>지급 예정 ' + l.quantity + ' · 실제 지급 ' + l.issuedQuantity + ' · 매장 확인 ' + l.shopQuantity + '</span><span>수령 ' + e(l.pickupPlan.date) + ' ' + e(l.pickupPlan.method === 'shop' ? '매장' : l.pickupPlan.place) + '</span><span>반납 ' + e(l.returnPlan.date) + ' ' + e(l.returnPlan.method === 'direct' ? '매장 직접' : l.returnPlan.place) + '</span><span>' + (l.price.source ? '기존 접수 전체금액에 포함 · 행별 요금 확인 필요' : '단가 ' + won(l.price.unitWon) + ' · 확정 청구 ' + won(l.price.amountWon)) + '</span></div>', btn('닫기', 'close') + (l.unissuedQuantity ? btn('이 추가분 취소', 'pos-cancel-line', l.id) : ''));
  });
  S.action('pos-cancel-line', async id => { try { await D.execute('order.cancel', { orderId: D.order().id, lineIds: [id], reason: '미도착·미지급 추가분 취소' }); S.close(); S.render(); S.toast('선택한 미지급 품목만 취소했습니다.'); } catch (err) { error(err); } });
  S.posOrders = { state, labels, rows, orderList, lineDescription, error, errorBox, input, select, read, go, pageSize };
  S.register('home', { title: '오늘 할 일', pos: true, render: home });
  for (const page of ['intake', 'preparation', 'rentals', 'returns']) S.register(page, { title: { intake: '접수·예약', preparation: '준비·지급', rentals: '이용 중·변경', returns: '반납·회수' }[page], pos: true, legacy: false, render: () => listing(page) });
  S.register('order-detail', { title: '통합접수', parent: 'rentals', pos: true, render: detail });
  S.register('order-intake', { title: '접수·추가', parent: 'intake', pos: true, legacy: false, render: intake });
})();
