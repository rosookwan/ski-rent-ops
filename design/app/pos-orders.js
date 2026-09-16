(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, e = S.esc, won = S.money, T = P.terms;
  const state = { query: '', period: 'today', date: '', sort: 'time', draft: null, step: 0, linePage: 0, detailTab: 'items' }, pageSize = () => innerHeight < 700 ? 3 : 4;
  const labels = T.status;
  const btn = P.button, go = (label, page, id = '', kind = '') => '<button type="button" class="so-button pos-button ' + e(kind) + '" data-go="' + e(page) + '" data-id="' + e(id) + '">' + e(label) + '</button>';
  const input = (label, name, value, type = 'text', attrs = '') => P.field(label, value, type, 'data-pos-input="' + name + '" ' + attrs);
  const select = (label, name, values, value) => '<label class="so-field">' + e(label) + '<select aria-label="' + e(label) + '" data-pos-input="' + name + '"' + (name === 'sku' ? ' data-change="pos-draft-sku"' : name === 'personId' ? ' data-change="pos-draft-person"' : '') + '>' + values.map(([id, text]) => '<option value="' + e(id) + '"' + (String(id) === String(value) ? ' selected' : '') + '>' + e(text) + '</option>').join('') + '</select></label>';
  const errorBox = () => '<p class="pos-error" id="pos-error" role="alert" hidden></p>';
  function error(reason) { const box = S.$('#so-dialog[open] #pos-error') || S.$('#pos-error'); if (box) { box.hidden = false; box.textContent = reason.message || reason; } else S.toast(reason.message || reason); }
  const read = name => (S.$('#so-dialog[open] [data-pos-input="' + name + '"]') || S.$('[data-pos-input="' + name + '"]'))?.value;
  const nextDate = date => window.SkiWorkflowCommon.nextDate(date);
  const sku = id => D.snapshot.catalog.find(s => s.id === id);
  const short = date => date ? Number(date.slice(5, 7)) + '/' + Number(date.slice(8, 10)) : '';
  const active = l => !l.cancelledQuantity || l.cancelledQuantity < l.quantity;
  const activeLines = o => o.lines.filter(active);
  const unitOf = l => l.unit || sku(l.sku)?.unit || '개';
  const labelOf = l => l.label || sku(l.sku)?.label || l.sku;
  const isTicket = l => l.category === 'liftTicket' || sku(l.sku)?.kind === 'liftTicket';
  const itemText = l => labelOf(l) + ' ' + l.quantity + unitOf(l);
  const returnDateOf = l => l.currentReturnDate || l.returnPlan?.date || l.end;
  function lineState(l) {
    if (l.cancelledQuantity >= l.quantity) return ['취소', 'grey', true];
    if (l.customerQuantity > 0) return [l.returnPlan?.method === 'vehicle' ? '차량 수거 예정' : '대여 중', l.returnPlan?.method === 'vehicle' ? 'purple' : 'blue', false];
    if (l.vehicleQuantity > 0) return ['차량 보관', 'purple', false];
    if (l.unissuedQuantity > 0 && l.issuedQuantity > 0) return ['일부 지급', 'orange', false];
    if (l.unissuedQuantity > 0) return [isTicket(l) && !(l.reservationBindings || []).length ? '발권 예정' : '지급 전', 'red', false];
    if (l.issuedQuantity > 0) return ['반납 완료', 'green', true];
    return ['지급 완료', 'green', false];
  }
  const items = o => activeLines(o).map(l => { const [text, tone, done] = lineState(l); return [itemText(l), text, tone, done]; });
  const pickupLines = o => activeLines(o).filter(l => l.unissuedQuantity > 0).length ? activeLines(o).filter(l => l.unissuedQuantity > 0) : activeLines(o);
  const pickupDate = o => pickupLines(o).map(l => l.pickupPlan?.date || l.start).sort()[0] || o.lines[0]?.start || D.today;
  const pickupTime = o => { const date = pickupDate(o); return pickupLines(o).filter(l => (l.pickupPlan?.date || l.start) === date).map(l => l.pickupPlan?.time || '').filter(Boolean).sort()[0] || ''; };
  const returnLines = o => activeLines(o).filter(l => l.customerQuantity > 0).length ? activeLines(o).filter(l => l.customerQuantity > 0) : activeLines(o);
  const returnDate = o => returnLines(o).map(returnDateOf).sort()[0] || D.today;
  const returnTime = o => { const date = returnDate(o); return returnLines(o).filter(l => returnDateOf(l) === date).map(l => l.returnPlan?.time || '').filter(Boolean).sort()[0] || ''; };
  const placeOf = o => { const l = pickupLines(o)[0]; return !l ? '매장' : l.pickupPlan?.method === 'delivery' ? (l.pickupPlan.place || '차량 배달') : '매장 수령'; };
  const returnPlace = o => { const l = returnLines(o)[0]; return !l ? '' : l.returnPlan?.method === 'vehicle' ? (l.returnPlan.place || '차량 수거') : '매장 직접'; };
  const useRange = o => { const starts = activeLines(o).map(l => l.start).sort(), ends = activeLines(o).map(l => l.currentEnd || l.end).sort(); return starts.length ? short(starts[0]) + (ends.at(-1) !== starts[0] ? '~' + short(ends.at(-1)) : '') : ''; };
  const sizePending = o => o.people.filter(p => !p.preinput && activeLines(o).some(l => l.personId === p.id && !isTicket(l) && l.unissuedQuantity > 0)).length;
  const liftOnly = o => activeLines(o).length > 0 && activeLines(o).every(isTicket);
  const ticketsToIssue = o => activeLines(o).filter(isTicket).reduce((n, l) => n + Math.max(0, l.unissuedQuantity - D.snapshot.allocations.filter(a => a.reservationId === o.id && a.status === 'active' && !a.fulfilledAt && (l.reservationBindings || []).some(b => b.lineId === a.lineId)).length), 0);
  const setsOf = lines => lines.reduce((n, l) => n + (unitOf(l) === '세트' ? l.quantity : 0), 0);
  const countText = lines => { const totals = {}; lines.forEach(([l, n]) => { totals[unitOf(l)] = (totals[unitOf(l)] || 0) + n; }); return Object.entries(totals).filter(([, n]) => n > 0).map(([u, n]) => n + u).join(' · ') || '0'; };
  const unissuedText = o => countText(activeLines(o).map(l => [l, l.unissuedQuantity]));
  const customerText = o => countText(activeLines(o).map(l => [l, l.customerQuantity]));
  const vehicleText = o => countText(activeLines(o).map(l => [l, l.vehicleQuantity]));
  function rows() {
    const q = state.query.replace(/[\s-]/g, '').toLowerCase();
    return D.snapshot.orders.filter(o => [o.id, o.receiptNo, o.customer.name, o.customer.phone, ...o.people.map(p => p.name)].join(' ').replace(/[\s-]/g, '').toLowerCase().includes(q));
  }
  function orderDescription(o) {
    return [o.receiptNo || o.id, labels[o.status], (o.lines.some(l => l.unissuedQuantity && l.pickupPlan.date < D.today) ? '지급일 지남 · ' : '') + '미지급 ' + o.totals.unissuedQuantity, (o.lines.some(l => l.customerQuantity && (l.currentReturnDate || l.returnPlan.date) < D.today) ? '반납 연체 · ' : '') + '고객 보유 ' + o.totals.customerQuantity, o.finance.dueWon ? '미수 ' + won(o.finance.dueWon) : '수납 완료'].join(' · ');
  }
  function orderList(list, key = 'orders') {
    return P.pager(list, key, o => P.row(o.customer.name + ' · ' + (o.people.length ? o.people.length + '명' : '기존 접수'), orderDescription(o), go('접수 상세', 'order-detail', o.id)), pageSize());
  }
  const inPeriod = date => state.date ? date === state.date : state.query ? true : state.period === 'all' ? true : state.period === 'tomorrow' ? date === nextDate(D.today) : date <= D.today;
  const slotTitle = (date, time, kind) => {
    const prefix = date === D.today ? '' : date === nextDate(D.today) ? '내일 ' : short(date) + ' ';
    if (kind === 'return') { const preset = (D.snapshot.management?.settings.returnTimes || []).find(t => t.time === time); return prefix + (time ? (preset ? preset.label + ' ' : '') + time + ' 반납' : '반납 시간 미정'); }
    if (!time) return prefix + '수령 시간 미정';
    return prefix + (time < '09:00' ? '오전 09:00 이전 수령' : time < '12:00' ? '09:00~12:00 수령' : time < '17:00' ? '12:00~17:00 수령' : '17:00 이후 수령');
  };
  function grouped(list, kind) {
    const dateOf = kind === 'return' ? returnDate : pickupDate, timeOf = kind === 'return' ? returnTime : pickupTime;
    if (state.sort === 'receipt') return [{ title: '접수 순서', sub: list.length + '팀', orders: list.slice().sort((a, b) => (a.receiptNo || a.id).localeCompare(b.receiptNo || b.id)) }];
    const groups = [];
    list.slice().sort((a, b) => (dateOf(a) + timeOf(a)).localeCompare(dateOf(b) + timeOf(b))).forEach(o => {
      const title = slotTitle(dateOf(o), timeOf(o), kind);
      let g = groups.find(x => x.title === title); if (!g) { g = { title, orders: [] }; groups.push(g); } g.orders.push(o);
    });
    groups.forEach(g => { g.sub = g.orders.length + '팀'; });
    return groups;
  }
  function badgeOf(o, kind) {
    const pending = sizePending(o);
    if (o.exchangeOpenQuantity) return ['교환 대기', 'orange'];
    if (kind === 'returns') {
      if (o.totals.customerQuantity && o.totals.shopQuantity) return ['일부만 받음', 'orange'];
      if (o.totals.customerQuantity) return [activeLines(o).some(l => l.customerQuantity && returnDateOf(l) < D.today) ? '반납 지연' : '대여 중', activeLines(o).some(l => l.customerQuantity && returnDateOf(l) < D.today) ? 'red' : 'orange'];
      if (o.totals.vehicleQuantity) return ['차량 보관 중', 'purple'];
      return ['반납 완료', 'green'];
    }
    if (kind === 'rentals') return o.totals.customerQuantity ? ['이용 중', 'blue'] : o.totals.vehicleQuantity ? ['차량 보관 중', 'purple'] : ['반납 완료', 'green'];
    if (liftOnly(o) && o.totals.unissuedQuantity) return ['리프트권만', 'grey'];
    if (pending) return ['사이즈 미입력 ' + pending + '명', 'orange'];
    if (!o.totals.unissuedQuantity) return o.totals.customerQuantity || o.totals.vehicleQuantity ? ['지급 완료', 'green'] : ['반납 완료', 'green'];
    if (o.totals.issuedQuantity) return ['일부 지급', 'orange'];
    if (kind === 'intake') return o.people.length >= 10 ? ['단체', 'purple'] : ['예약 확정', 'green'];
    return ['지급 전', 'red'];
  }
  function cardOf(o, kind) {
    const [badgeText, tone] = badgeOf(o, kind), pending = sizePending(o), due = o.finance.dueWon, deposit = o.finance.depositHeldWon;
    const dueNow = activeLines(o).some(l => l.unissuedQuantity && (l.pickupPlan?.date || l.start) <= D.today);
    const meta = (o.receiptNo || o.id) + ' · ' + useRange(o) + ' 이용 · ' + (kind === 'returns' || kind === 'rentals' ? short(returnDate(o)) + ' ' + (returnTime(o) || '') + ' 반납 · ' + returnPlace(o) : short(pickupDate(o)) + ' ' + (pickupTime(o) || '') + ' 수령 · ' + placeOf(o));
    const money = [];
    if (kind === 'intake') money.push(['예약 금액 ' + won(o.finance.chargedWon), 'ink']);
    if (due) money.push(['미수 ' + won(due), 'red']);
    if (deposit) money.push(['보증금 ' + won(deposit), 'blue']);
    if (!due && kind !== 'intake' && o.finance.chargedWon) money.push(['수납 완료', 'green']);
    let action;
    if (kind === 'returns') action = o.totals.customerQuantity ? btn('모두 받음', 'pos-return-all', o.id, 'soft') : o.totals.vehicleQuantity ? btn('차량 입고 확인 ' + vehicleText(o), 'pos-receive', o.id, 'soft') : btn('반납 완료', 'pos-noop', o.id, 'done');
    else if (kind === 'rentals') action = o.exchangeOpenQuantity ? btn('교환 진행 확인', 'pos-problems', o.id, 'soft') : btn('기간·수거 변경', 'pos-change', o.id);
    else if (kind === 'preparation') action = pending ? btn('사이즈 요청 ' + pending + '명', 'pos-preinput', o.id, 'soft') : o.totals.unissuedQuantity && dueNow ? btn((liftOnly(o) ? '발권 ' : '지급 ') + unissuedText(o), 'pos-issue', o.id, 'soft') : o.totals.unissuedQuantity ? go('접수 상세', 'order-detail', o.id) : due ? btn('수납 ' + won(due), 'pos-money', o.id, 'soft') : btn('지급 완료', 'pos-noop', o.id, 'done');
    else action = o.totals.unissuedQuantity && dueNow ? btn((liftOnly(o) ? '발권 ' : '지급 ') + unissuedText(o), 'pos-issue', o.id, 'soft') : go('접수 상세', 'order-detail', o.id);
    return P.card({ id: o.id, tone: ['red', 'orange', 'green'].includes(tone) ? tone : '', badge: [badgeText, tone], name: o.customer.name + ' 팀', phone: o.customer.phone || '', meta, items: items(o), money, actions: action, go: { page: 'order-detail', id: o.id } });
  }
  function toolbar(kind) {
    const dateKind = ['returns', 'rentals'].includes(kind) ? 'return' : 'pickup';
    const all = rows(), dateOf = dateKind === 'return' ? returnDate : pickupDate;
    const counts = { today: all.filter(o => keep(o, kind) && dateOf(o) <= D.today).length, tomorrow: all.filter(o => keep(o, kind) && dateOf(o) === nextDate(D.today)).length, all: all.filter(o => keep(o, kind)).length };
    const labelsOf = dateKind === 'return' ? { today: '오늘·이전', tomorrow: '내일', all: '전체' } : { today: '오늘', tomorrow: '내일', all: '전체' };
    return P.search('pos-orders', state.query, '이름 · 연락처 뒷자리 · 접수번호') + P.toolbarLabel(dateKind === 'return' ? '반납일' : '수령일')
      + P.group(['today', 'tomorrow', 'all'].map(value => P.chip(labelsOf[value], 'pos-period', value, !state.date && state.period === value, counts[value])).join('')
        + P.chip(state.date ? short(state.date) : '달력', 'pos-pick-date', '', !!state.date, null, 'is-date'))
      + P.group(P.chip('시간 묶음', 'pos-sort', 'time', state.sort === 'time', null, 'is-sort') + P.chip('접수 순서', 'pos-sort', 'receipt', state.sort === 'receipt', null, 'is-sort'));
  }
  const keep = (o, kind) => kind === 'preparation' ? o.totals.unissuedQuantity > 0 || o.finance.dueWon > 0 && !o.totals.customerQuantity && !o.totals.vehicleQuantity && activeLines(o).some(l => (l.pickupPlan?.date || l.start) === D.today)
    : kind === 'returns' ? o.totals.customerQuantity > 0 || o.totals.vehicleQuantity > 0
    : kind === 'rentals' ? o.totals.customerQuantity > 0 || o.exchangeOpenQuantity > 0
    : true;
  function listing(kind) {
    const dateKind = ['returns', 'rentals'].includes(kind) ? 'return' : 'pickup', dateOf = dateKind === 'return' ? returnDate : pickupDate;
    const filtered = rows().filter(o => keep(o, kind) && inPeriod(dateOf(o)));
    const titles = { intake: '1 접수·예약', preparation: '2 준비·지급', rentals: '3 이용 중·변경', returns: '4 반납·회수' };
    const sets = setsOf(filtered.flatMap(activeLines)), pendingPeople = filtered.reduce((n, o) => n + sizePending(o), 0), total = filtered.reduce((n, o) => n + o.finance.chargedWon, 0);
    const due = filtered.reduce((n, o) => n + o.finance.dueWon, 0), dueTeams = filtered.filter(o => o.finance.dueWon > 0).length;
    const unissued = filtered.reduce((n, o) => n + o.totals.unissuedQuantity, 0), held = filtered.reduce((n, o) => n + o.totals.customerQuantity, 0), inVehicle = filtered.reduce((n, o) => n + o.totals.vehicleQuantity, 0);
    const exchanges = filtered.filter(o => o.exchangeOpenQuantity).length;
    const options = { toolbar: toolbar(kind) };
    let foot;
    if (kind === 'intake') { options.wait = pendingPeople ? '사이즈 ' + pendingPeople + '명' : '없음'; options.sums = [['예약 수량', sets + '세트'], ['사이즈 미입력', pendingPeople + '명', pendingPeople ? 'orange' : ''], ['예약 금액', won(total)]]; foot = '수령 ' + filtered.length + '팀 · 예약 ' + sets + '세트 · 사이즈 미입력 ' + pendingPeople + '명 · 예약 금액 ' + won(total); }
    else if (kind === 'preparation') { options.wait = unissued ? '지급 ' + unissued + '개' : dueTeams ? '수납 ' + dueTeams + '팀' : '없음'; options.sums = [['미지급', unissued + '개', unissued ? 'red' : ''], ['미수 팀', dueTeams + '팀', dueTeams ? 'red' : ''], ['미수 금액', won(due), due ? 'red' : '']]; foot = '수령 ' + filtered.length + '팀 · 미지급 ' + unissued + '개 · 미수 ' + won(due) + '(' + dueTeams + '팀) · 사이즈 미입력 ' + pendingPeople + '명'; }
    else if (kind === 'rentals') { options.wait = exchanges ? '요청 ' + exchanges + '팀' : '없음'; options.sums = [['고객 보유', held + '개', held ? 'orange' : ''], ['교환 대기', exchanges + '건', exchanges ? 'orange' : ''], ['미수', won(due), due ? 'red' : '']]; foot = '반납 ' + filtered.length + '팀 · 고객 보유 ' + held + '개 · 교환 대기 ' + exchanges + '건 · 미수 ' + won(due); }
    else { options.wait = held ? '반납 ' + held + '개' : inVehicle ? '입고 ' + inVehicle + '개' : '없음'; options.sums = [['미반납', held + '개', held ? 'red' : ''], ['차량 보관', inVehicle + '개', inVehicle ? 'purple' : ''], ['미수', won(due), due ? 'red' : '']]; foot = '반납 ' + filtered.length + '팀 · 미반납 ' + held + '개 · 차량 보관 ' + inVehicle + '개 · 미수 ' + won(due); }
    const groups = grouped(filtered, dateKind).map(g => ({ title: g.title, sub: g.sub, cards: g.orders.map(o => cardOf(o, kind)) }));
    const emptyTitle = { intake: '예약 없음', preparation: '준비할 팀 없음', rentals: '이용 중인 팀 없음', returns: '반납할 팀 없음' }[kind];
    const body = P.cards(groups, { empty: state.query ? '검색 결과 없음' : emptyTitle, emptyNote: state.query ? '"' + state.query + '"' : '', emptyAction: state.query || state.period !== 'all' || state.date ? btn('전체 보기', 'pos-period', 'all', 'primary') : '' });
    return P.page(titles[kind], '', body, '<span>' + e(foot) + '</span><div class="so-actions">' + (D.pending ? btn('같은 요청 다시 확인', 'pos-retry', '', 'soft') : btn('최신 기록 확인', 'pos-refresh')) + btn('새 접수', 'pos-new', '', 'primary') + '</div>', options);
  }
  function home() {
    const orders = D.snapshot.orders, today = D.today, tomorrow = nextDate(today);
    const dueIssue = orders.filter(o => activeLines(o).some(l => l.unissuedQuantity && (l.pickupPlan?.date || l.start) <= today));
    const pickupToday = orders.filter(o => o.totals.unissuedQuantity && pickupDate(o) === today);
    const sizeTeams = orders.filter(o => o.totals.unissuedQuantity && sizePending(o) > 0);
    const held = orders.filter(o => o.totals.customerQuantity), overdue = orders.filter(o => activeLines(o).some(l => l.customerQuantity && returnDateOf(l) < today));
    const returnToday = orders.filter(o => activeLines(o).some(l => l.customerQuantity && returnDateOf(l) <= today));
    const vehicleQty = orders.reduce((n, o) => n + o.totals.vehicleQuantity, 0), heldQty = returnToday.reduce((n, o) => n + activeLines(o).filter(l => returnDateOf(l) <= today).reduce((m, l) => m + l.customerQuantity, 0), 0);
    const exchanges = orders.filter(o => o.exchangeOpenQuantity), dueTeams = orders.filter(o => o.finance.dueWon > 0), dueWon = dueTeams.reduce((n, o) => n + o.finance.dueWon, 0);
    const ticketNeed = orders.reduce((n, o) => n + ticketsToIssue(o), 0), ticketTeams = orders.filter(o => ticketsToIssue(o) > 0);
    const tasks = D.snapshot.tasks.filter(t => ['waiting', 'in_progress'].includes(t.status)), tasksToday = tasks.filter(t => t.date <= today), lateTasks = tasks.filter(t => t.date < today);
    const assets = D.snapshot.management?.assets || D.snapshot.assets || [], repair = assets.filter(a => !['ready', 'lost'].includes(a.condition)), lost = assets.filter(a => a.condition === 'lost');
    const closed = D.snapshot.closings.some(c => c.date === today && !c.reopenings.length);
    const unissuedToday = dueIssue.reduce((n, o) => n + activeLines(o).filter(l => (l.pickupPlan?.date || l.start) <= today).reduce((m, l) => m + l.unissuedQuantity, 0), 0);
    const names = list => list.slice(0, 2).map(o => o.customer.name + ' 팀').join(' · ');
    const step = (name, route, badge, figure, when, lines) => P.card({ tone: ['red', 'orange', 'green'].includes(badge[1]) ? badge[1] : '', badge, name, figures: [figure, { label: '기한', value: when, when: true }], lines, actions: '<button type="button" class="so-button pos-button soft" data-go="' + route + '">열기</button>' });
    const cards = [
      step('1 접수·예약', 'intake', sizeTeams.length ? ['사이즈 미입력 ' + sizeTeams.length + '팀', 'orange'] : ['접수 ' + pickupToday.length + '팀', 'grey'], { label: '오늘 수령', value: pickupToday.length + '팀' }, '오늘 안', [[names(sizeTeams) ? names(sizeTeams) + ' 사이즈 미입력' : '사이즈 입력 완료', sizeTeams.length ? 'red' : 'green'], [names(pickupToday) || '수령 예정 없음', '']]),
      step('2 준비·지급', 'preparation', dueTeams.length && dueIssue.length ? ['미수 ' + dueTeams.length + '팀', 'red'] : dueIssue.length ? ['지급 전 ' + dueIssue.length + '팀', 'red'] : ['지급 완료', 'green'], { label: '미지급', value: unissuedToday + '개', tone: unissuedToday ? 'red' : '' }, pickupTime(dueIssue[0] || { lines: [], people: [] }) || '오늘 안', [[names(dueIssue) ? names(dueIssue) + ' 지급 전' : '지급할 팀 없음', dueIssue.length ? 'red' : ''], [sizeTeams.length ? '현장 측정 ' + sizeTeams.reduce((n, o) => n + sizePending(o), 0) + '명' : '사이즈 모두 입력', sizeTeams.length ? 'orange' : '']]),
      step('3 이용·변경', 'rentals', exchanges.length ? ['요청 ' + exchanges.length + '건', 'orange'] : ['이용 중 ' + held.length + '팀', 'blue'], { label: '요청', value: exchanges.length + '건', tone: exchanges.length ? 'orange' : '' }, exchanges.length ? '지금' : '없음', [[names(exchanges) ? names(exchanges) + ' 교환 대기' : '변경 요청 없음', exchanges.length ? 'orange' : ''], ['이용 중 ' + held.length + '팀', '']]),
      step('4 반납·회수', 'returns', overdue.length ? ['반납 지연 ' + overdue.length + '팀', 'red'] : heldQty ? ['미반납 있음', 'red'] : vehicleQty ? ['차량 보관 ' + vehicleQty + '개', 'purple'] : ['반납 완료', 'green'], { label: '미반납', value: heldQty + '개', tone: heldQty ? 'red' : '' }, returnTime(returnToday[0] || { lines: [], people: [] }) || '오늘 안', [[names(overdue) ? names(overdue) + ' 반납 지연' : names(returnToday) ? names(returnToday) + ' 반납 예정' : '오늘 반납 없음', overdue.length ? 'red' : ''], ['차량 보관 ' + vehicleQty + '개', vehicleQty ? 'purple' : '']]),
      step('5 정산·마감', 'closing', dueTeams.length ? ['미수 ' + dueTeams.length + '팀', 'red'] : closed ? ['마감 완료', 'green'] : ['마감 전', 'grey'], { label: '정산 대기', value: dueTeams.length + '건', tone: dueTeams.length ? 'red' : '' }, '오늘 밤', [['미수 ' + won(dueWon), dueWon ? 'red' : ''], [closed ? '오늘 마감 확정됨' : '마감 전', '']]),
      step('리프트권', 'tickets', ticketNeed ? ['발권 필요', 'red'] : ['발권 완료', 'green'], { label: '발권 필요', value: ticketNeed + '매', tone: ticketNeed ? 'red' : '' }, ticketTeams.length ? pickupTime(ticketTeams[0]) || '오늘 안' : '없음', [[names(ticketTeams) ? names(ticketTeams) + ' 발권 전' : '발권할 권 없음', ticketNeed ? 'red' : ''], ['보관 권 ' + D.snapshot.assets.filter(a => a.ticket && ['shop', 'vehicle'].includes(a.location.kind)).length + '매', 'purple']]),
      step('차량 운행', 'dispatch', lateTasks.length ? ['지연 ' + lateTasks.length + '건', 'red'] : tasksToday.length ? ['남은 ' + tasksToday.length + '건', 'purple'] : ['업무 없음', 'grey'], { label: '남은 업무', value: tasksToday.length + '건', tone: tasksToday.length ? 'purple' : '' }, tasksToday[0]?.time || '없음', [[lateTasks.length ? (lateTasks[0].customer?.name || lateTasks[0].title) + ' ' + lateTasks[0].date.slice(5) + ' 지연' : tasksToday[0] ? tasksToday[0].time + ' ' + (tasksToday[0].customer?.name || tasksToday[0].title) + ' ' + ({ delivery: '배달', collection: '수거', refund: '발권처 환불' }[tasksToday[0].kind] || '') : '오늘 차량 업무 없음', lateTasks.length ? 'red' : 'purple'], ['차량 보관 ' + vehicleQty + '개', '']]),
      step('재고·정비', 'inventory', lost.length ? ['분실 ' + lost.length + '점', 'red'] : repair.length ? ['정비 ' + repair.length + '점', 'orange'] : ['정비 없음', 'green'], { label: '정비', value: repair.length + '점', tone: repair.length ? 'orange' : '' }, '오늘 안', [['세척·점검·수리 ' + repair.length + '점', repair.length ? 'orange' : ''], ['분실 ' + lost.length + '점', lost.length ? 'red' : '']]),
      step('마감 이력', 'closing-history', closed ? ['마감 완료', 'green'] : ['마감 대기 1일', 'red'], { label: '마감 대기', value: (closed ? 0 : 1) + '일', tone: closed ? '' : 'red' }, '오늘 밤', [[closed ? today + ' 마감 확정' : today + ' 마감 전', closed ? 'green' : 'red'], ['마감 기록 ' + D.snapshot.closings.length + '일', '']])
    ];
    const urgent = overdue[0] ? ['반납 확인 · ' + overdue[0].customer.name + ' 팀', overdue[0].id, '반납 지연 ' + short(returnDate(overdue[0]))]
      : dueIssue[0] ? ['지급 · ' + dueIssue[0].customer.name + ' 팀', dueIssue[0].id, (pickupTime(dueIssue[0]) || '오늘') + ' 수령 · ' + placeOf(dueIssue[0])]
      : ticketTeams[0] ? ['발권 · ' + ticketTeams[0].customer.name + ' 팀', ticketTeams[0].id, '리프트권 ' + ticketsToIssue(ticketTeams[0]) + '매']
      : returnToday[0] ? ['반납 · ' + returnToday[0].customer.name + ' 팀', returnToday[0].id, (returnTime(returnToday[0]) || '오늘') + ' 반납 · ' + (returnPlace(returnToday[0]) || '매장 직접')]
      : dueTeams[0] ? ['수납 · ' + dueTeams[0].customer.name + ' 팀', dueTeams[0].id, '미수 ' + won(dueTeams[0].finance.dueWon)]
      : held[0] ? ['이용 중 · ' + held[0].customer.name + ' 팀', held[0].id, short(returnDate(held[0])) + ' 반납 예정']
      : pickupToday[0] ? ['수령 · ' + pickupToday[0].customer.name + ' 팀', pickupToday[0].id, (pickupTime(pickupToday[0]) || '오늘') + ' 수령'] : null;
    const now = '<div class="pos-now"><strong>지금 처리</strong>' + (urgent ? '<button type="button" class="so-button pos-button primary" data-go="order-detail" data-id="' + e(urgent[1]) + '" style="min-height:48px;font-size:16px">' + e(urgent[0]) + '</button><span>' + e(urgent[2]) + '</span>' : '<span>처리할 급한 업무 없음</span>') + '<span style="flex:1"></span>' + (D.pending ? btn('같은 요청 다시 확인', 'pos-retry', '', 'soft') : btn('최신 기록 확인', 'pos-refresh')) + '</div>';
    const waiting = [sizeTeams.length, dueIssue.length, exchanges.length, heldQty, dueTeams.length, ticketNeed, tasksToday.length, repair.length, closed ? 0 : 1].filter(Boolean).length;
    return P.page('오늘 할 일', '', now + P.cards([{ cards }], { steps: true }),
      '<span>' + e('미지급 ' + unissuedToday + '개 · 미반납 ' + heldQty + '개 · 발권 ' + ticketNeed + '매 · 미수 ' + won(dueWon) + ' · 차량 업무 ' + tasksToday.length + '건') + '</span><div class="so-actions">' + btn('새 접수', 'pos-new', '', 'soft') + '<button type="button" class="so-button pos-button primary" data-go="closing">마감</button></div>',
      { wait: waiting + '가지', sums: [['오늘 지급 예정', unissuedToday + '개'], ['오늘 반납 예정', returnToday.length + '팀'], ['미수 합계', won(dueWon), dueWon ? 'red' : '']] });
  }
  function lineDescription(o, l) {
    const person = o.people.find(p => p.id === l.personId)?.name || '팀 공용', batch = o.batches.find(b => b.id === l.batchId)?.label || '';
    const extended = (l.customerTerms || []).filter(t => t.end > l.end);
    return person + ' · ' + batch + ' · ' + l.start.slice(5) + (l.end !== l.start ? '~' + l.end.slice(5) : '') + (extended.length ? ' · 남은 ' + extended.length + '개 ' + l.currentEnd.slice(5) + '까지 연장' : '') + ' · ' + (l.cancelledQuantity ? '취소' : '미지급 ' + l.unissuedQuantity + ' / 보유 ' + l.customerQuantity + ' / 차량 ' + l.vehicleQuantity);
  }
  const movementNames = { load: '차량 적재', deliver: '고객 지급', collect: '차량 수거', receive: '매장 입고', directReturn: '직접 반납', opening: '이관 보관 확인', stock: '재고 입고', ticketIssue: '발권', refund: '발권처 환불', found: '발견 확인' };
  function detail() {
    const o = D.order(); if (!o) return P.page('접수 상세', '', '<div class="pos-empty"><strong>접수 없음</strong><span>목록에서 다시 선택</span>' + go('접수 목록', 'intake', '', 'primary') + '</div>', '', { wait: '없음' });
    const f = o.finance, [badgeText, tone] = badgeOf(o, o.totals.customerQuantity || o.totals.vehicleQuantity ? 'returns' : 'preparation');
    const lines = activeLines(o), phone = (o.customer.phone || '').replace(/[^0-9+]/g, '');
    const info = [['연락처', o.customer.phone || '미입력'], ['접수번호', o.receiptNo || o.id], ['이용', useRange(o) + ' · ' + o.people.length + '명'], ['수령', short(pickupDate(o)) + ' ' + (pickupTime(o) || '') + ' · ' + placeOf(o)], ['반납', short(returnDate(o)) + ' ' + (returnTime(o) || '') + ' · ' + (returnPlace(o) || '매장 직접')]];
    const side = '<aside class="pos-detail-side"><div class="pos-detail-name"><strong>' + e(o.customer.name) + ' 팀</strong>' + P.badge(badgeText, tone) + '</div>'
      + '<dl class="pos-detail-info">' + info.map(([k, v]) => '<div><dt>' + e(k) + '</dt><dd>' + e(v) + '</dd></div>').join('') + '</dl>'
      + '<div class="pos-detail-actions pos-shortcuts">' + btn('일행·장비 추가', 'pos-add', o.id) + btn('사이즈 요청' + (sizePending(o) ? ' ' + sizePending(o) + '명' : ''), 'pos-preinput', o.id) + btn('기간·수거 변경', 'pos-change', o.id) + btn('수납·환불', 'pos-money', o.id) + btn('문제 해결·정정', 'pos-problems', o.id) + (phone ? '<a class="so-button pos-button" href="tel:' + e(phone) + '">' + S.icon('phone') + '전화</a>' : '<button type="button" class="so-button pos-button" disabled>전화 · 연락처 없음</button>') + '</div></aside>';
    const tabs = [['items', '품목', lines.length], ['money', '수납·환불', null], ['history', '이력', null]];
    const tabBar = '<div class="pos-toolbar-group">' + tabs.map(([id, label, count]) => P.chip(label, 'pos-detail-tab', id, state.detailTab === id, count)).join('') + '</div>'
      + '<span class="pos-toolbar-spacer"></span>' + [['청구', won(f.chargedWon), ''], ['수납', won(f.netPaidWon || 0), 'green'], ['미수', won(f.dueWon), f.dueWon ? 'red' : '']].map(([label, value, tone]) => '<span class="pos-sum"><span>' + e(label) + '</span><strong' + (tone ? ' style="color:var(--tone-' + tone + ')"' : '') + '>' + e(value) + '</strong></span>').join('');
    let content;
    if (state.detailTab === 'money') {
      const rowsHtml = [['청구 금액', won(f.chargedWon), ''], ['수납', won(f.netPaidWon || 0), 'green'], ['고객 환불', won(f.refundWon || 0), ''], ['보증금 보관', won(f.depositHeldWon || 0), 'blue'], ['초과 수납', won(f.creditWon || 0), ''], ['미수', won(f.dueWon), f.dueWon ? 'red' : 'green']]
        .map(([k, v, t]) => '<div class="pos-info-line" data-tone="' + t + '"><strong>' + e(k) + '</strong><b>' + e(v) + '</b></div>').join('');
      content = '<div class="pos-cards" data-pos-scroll><div class="pos-info-lines">' + rowsHtml + '</div><div class="so-actions">' + btn('수납 ' + won(f.dueWon), 'pos-money', o.id, 'soft') + btn('금액 조정', 'pos-adjust', o.id) + '</div></div>';
    } else if (state.detailTab === 'history') {
      const list = (D.history.movements || []).filter(m => m.orderId === o.id || m.from?.kind === 'customer' && m.from.id === o.id || m.to?.kind === 'customer' && m.to.id === o.id).slice().sort((a, b) => b.revision - a.revision);
      const loc = l => !l ? '기록' : l.kind === 'vehicle' ? (S.posFulfillment?.vehicleName(l.id) || l.id) : { customer: '고객', shop: '매장', vendor: '발권처' }[l.kind] || l.kind;
      content = '<div class="pos-cards" data-pos-scroll>' + (list.length ? '<div class="pos-info-lines">' + list.map(m => '<div class="pos-info-line"><strong>' + e((movementNames[m.kind] || '물품 기록') + ' · ' + m.assetIds.filter(id => !(m.reversedAssetIds || []).includes(id)).length + '개') + '</strong><span>' + e(new Date(Date.parse(m.at) + 9 * 3600000).toISOString().slice(5, 16).replace('T', ' ') + ' · ' + loc(m.from) + ' → ' + loc(m.to)) + '</span></div>').join('') + '</div>' : '<div class="pos-empty"><strong>이동 기록 없음</strong></div>') + '<div class="so-actions">' + btn('문제 해결·정정', 'pos-problems', o.id) + '</div></div>';
    } else {
      const cards = lines.map(l => {
        const [text, t] = lineState(l), person = o.people.find(p => p.id === l.personId)?.name || '팀 공용', batch = o.batches.find(b => b.id === l.batchId)?.label || '';
        return P.card({ tone: '', badge: [text, t], name: itemText(l), meta: person + ' · ' + batch + ' · ' + short(l.start) + (l.end !== l.start ? '~' + short(l.currentEnd || l.end) : '') + (l.pickupPlan?.method === 'delivery' ? ' · 차량 배달' : ''),
          figures: [{ label: '실제 지급', value: l.issuedQuantity + unitOf(l), tone: l.issuedQuantity ? '' : 'grey' }, { label: '예정', value: l.quantity + unitOf(l), when: true }],
          lines: [['고객 보유 ' + l.customerQuantity + ' · 차량 보관 ' + l.vehicleQuantity + ' · 매장 확인 ' + l.shopQuantity, l.customerQuantity ? 'orange' : l.vehicleQuantity ? 'purple' : 'green'], [l.price?.source ? '기존 접수 금액 포함' : '단가 ' + won(l.price.unitWon) + ' · 청구 ' + won(l.price.amountWon), '']],
          actions: btn('품목 보기', 'pos-line', l.id) });
      });
      content = P.cards([{ cards }]);
    }
    const next = o.exchangeOpenQuantity ? btn('교환 진행 확인', 'pos-problems', o.id, 'primary') : o.totals.customerQuantity ? btn('모두 받음', 'pos-return-all', o.id, 'primary') : o.totals.vehicleQuantity ? btn('차량에서 받은 물품 입고', 'pos-receive', o.id, 'primary') : o.totals.unissuedQuantity ? btn('준비·지급하기', 'pos-issue', o.id, 'primary') : btn('남은 정산 확인', 'pos-money', o.id, 'primary');
    return P.page('접수 상세', '', '<div class="pos-detail">' + side + '<div class="pos-detail-main">' + content + '</div></div>',
      '<div>' + (o.totals.customerQuantity ? btn('일부만 받음', 'pos-return-some', o.id) : go('목록으로', 'intake')) + '</div><div class="so-actions">' + (o.totals.unissuedQuantity && o.totals.customerQuantity ? btn('남은 장비 지급', 'pos-issue', o.id) : '') + next + '</div>',
      { toolbar: '<button type="button" class="so-button pos-button" data-action="back">' + S.icon('chevron-left') + '목록</button>' + tabBar + '<span style="flex:1"></span>' + (o.source ? P.toolbarLabel('이관 접수 · 수납 내역 별도 확인') : '') + P.toolbarLabel(o.batches.length + '개 접수 내역'),
        wait: o.totals.unissuedQuantity ? '지급 ' + unissuedText(o) : o.totals.customerQuantity ? '반납 ' + customerText(o) : o.totals.vehicleQuantity ? '입고 ' + vehicleText(o) : f.dueWon ? '수납 ' + won(f.dueWon) : '없음',
        sums: [['고객 보유', o.totals.customerQuantity + '개', o.totals.customerQuantity ? 'orange' : ''], ['차량 보관', o.totals.vehicleQuantity + '개', o.totals.vehicleQuantity ? 'purple' : ''], ['미수', won(f.dueWon), f.dueWon ? 'red' : '']] });
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
    if (d.step === 0) body = '<div class="pos-form-grid">' + (o ? '<div class="pos-info"><strong>' + e(o.customer.name) + ' 팀에 추가</strong><p>' + e(o.receiptNo || o.id) + ' · ' + e(o.customer.phone) + '</p></div>' : input('대표자 이름', 'name', d.customer.name, 'text', 'maxlength="60" autocomplete="name"') + input('대표자 연락처', 'phone', d.customer.phone, 'tel', 'autocomplete="tel"')) + input('이용 시작일', 'start', d.start, 'date') + input('이용 종료일', 'end', d.end, 'date') + '</div><div class="so-actions">' + btn('오늘', 'pos-date', 'today') + btn('내일', 'pos-date', 'tomorrow') + (o ? btn('기존 일행과 같은 일정', 'pos-date', 'same') : '') + '</div><div class="pos-info">' + (o ? '기존 가격·지급·반납 유지 · 이번 내역만 추가' : '대표자 정보는 한 번만 입력 · 일행 실명은 선택') + '</div>' + errorBox();
    else if (d.step === 1) {
      const people = draftPeople();
      body = '<div class="pos-add-layout"><div class="pos-entry-panel"><div class="pos-form-grid">' + select('대상 일행', 'personId', [['', '팀 공용'], ...people.map(p => [p.id, p.name]), ...(people.length > 1 ? [['__all', '전체 일행 · 사람마다 같은 품목']] : []), ['__many', '일행 여러 명 한 번에 추가…']], d.personId) + btn('새 일행 추가', 'pos-person-add') + select('추가할 품목', 'sku', D.snapshot.catalog.filter(s => !s.id.startsWith('legacy-')).map(s => [s.id, s.label]), d.sku || 'ski') + input(d.personId === '__all' ? '일행 한 명당 수량' : '실제 물품 수량', 'quantity', d.quantity || 1, 'number', 'min="1" max="500" inputmode="numeric"') + input('단가 (원)', 'unitWon', d.unitWon ?? '', 'number', 'min="0" inputmode="numeric" placeholder="요금 확인"') + input(d.personId === '__all' ? '일행 한 명당 할인 (원)' : '이번 품목 할인 (원)', 'discountWon', d.discountWon || 0, 'number', 'min="0" inputmode="numeric"') + '</div>' + btn('이번 내역에 담기', 'pos-line-add', '', 'primary') + '</div><div class="pos-draft-lines">' + P.pager(d.lines, 'draft-lines', l => P.row((sku(l.sku)?.label || l.sku) + ' ' + l.quantity + (sku(l.sku)?.unit || '개'), (people.find(p => p.id === l.personId)?.name || '팀 공용') + ' · ' + l.start.slice(5) + '~' + l.end.slice(5), btn('빼기', 'pos-line-remove', l.id)), 2) + '</div></div>' + errorBox();
    } else {
      const total = d.lines.reduce((n, l) => n + amount(l), 0);
      body = '<div class="pos-confirm-summary"><strong>' + e(name) + ' · ' + (d.orderId ? '기존 접수에 추가' : '새 접수') + '</strong><span>새 일행 ' + d.people.length + '명 · ' + d.lines.length + '개 품목 행</span><span>이번 청구액 <b>' + won(total) + '</b></span><span>수령 ' + e(d.pickupPlan ? d.pickupPlan.date + ' · ' + (d.pickupPlan.method === 'delivery' ? '차량 배달' : '매장') : '이용 시작일 매장') + ' / 반납 ' + e(d.returnPlan ? d.returnPlan.date + ' · ' + (d.returnPlan.method === 'vehicle' ? '차량 수거' : '매장 직접') : '이용 종료일 매장 직접') + '</span></div>' + P.pager(d.lines, 'review-lines', l => P.row((sku(l.sku)?.label || l.sku) + ' ' + l.quantity + (sku(l.sku)?.unit || '개'), l.start + '~' + l.end + ' · ' + won(amount(l))), 2);
      body += errorBox();
    }
    const steps = [['고객', d.orderId ? '기존 팀' : (d.customer.name || '미입력')], ['품목', d.lines.length ? d.lines.length + '행' : '미선택'], ['일정·장소', d.start.slice(5) + (d.end !== d.start ? '~' + d.end.slice(5) : '')]];
    const toolbar = '<button type="button" class="so-button pos-button" data-action="pos-draft-back">' + S.icon('chevron-left') + (d.step ? '이전' : '닫기') + '</button>'
      + '<div class="pos-toolbar-group">' + steps.map(([label, value], i) => P.chip((i + 1) + ' ' + label + ' · ' + value, 'pos-draft-step', String(i), d.step === i)).join('') + '</div><span style="flex:1"></span>' + P.toolbarLabel(name + (o ? ' · 일행·장비 추가' : ' · 새 접수'));
    return P.page(o ? '일행·장비 추가' : '새 접수', '', body,
      '<span>' + e(['대표자·이용일', '일행·품목', '이번 내역 확인'][d.step] + ' · ' + (d.step + 1) + '/3') + '</span><div class="so-actions">' + (d.step === 2 ? btn('수령·반납 일정', 'pos-draft-plan', 'pickup') : '') + (d.step < 2 ? btn('다음', 'pos-draft-next', '', 'primary') : btn(o ? '추가 확정' : '접수 확정', 'pos-draft-save', '', 'primary')) + '</div>',
      { toolbar, wait: (d.step + 1) + '/3', sums: [['이번 청구', won(d.lines.reduce((n, l) => n + amount(l), 0))]] });
  }
  const amount = l => l.quantity * l.price.unitWon * (sku(l.sku)?.kind === 'liftTicket' ? 1 : (Date.parse(l.end) - Date.parse(l.start)) / 86400000 + 1) - (l.price.discountWon || 0);
  S.search('pos-orders', value => { state.query = value; P.setPage('orders', 0, { render: false }); const cursor = S.$('[data-search="pos-orders"]')?.selectionStart; S.render(); const el = S.$('[data-search="pos-orders"]'); el?.focus(); if (el && cursor != null) el.setSelectionRange(cursor, cursor); });
  S.action('pos-period', value => { state.period = value; state.date = ''; P.setPage('orders', 0, { render: false }); S.render(); });
  S.action('pos-sort', value => { state.sort = value; S.render(); });
  S.action('pos-pick-date', () => P.modal('날짜로 보기', '<div class="pos-form-grid">' + input('날짜', 'listDate', state.date || D.today, 'date') + '</div>' + errorBox(), btn('해제', 'pos-pick-date-clear') + btn('취소', 'close') + btn('이 날짜만 보기', 'pos-pick-date-save', '', 'primary')));
  S.action('pos-pick-date-save', () => { try { const value = read('listDate'); window.SkiWorkflowCommon.date(value); state.date = value; S.close(); S.render(); } catch (err) { error(err); } });
  S.action('pos-pick-date-clear', () => { state.date = ''; S.close(); S.render(); });
  S.action('pos-detail-tab', tab => { state.detailTab = tab; S.render(); });
  S.action('pos-noop', () => {});
  S.action('pos-find', () => S.go('intake'));
  S.action('pos-new', () => startDraft()); S.action('pos-add', startDraft);
  S.action('pos-draft-step', value => { captureDraft(); const target = Number(value); if (target <= state.draft.step) { state.draft.step = target; S.render(); } else S.toast('다음 버튼으로 진행'); });
  S.action('pos-draft-next', () => { captureDraft(); const d = state.draft; try { if (!d.step) { if (!d.orderId) window.SkiWorkflowCommon.customer(d.customer); window.SkiWorkflowCommon.date(d.start); window.SkiWorkflowCommon.date(d.end); if (d.end < d.start) throw new Error('종료일을 시작일 이후로 선택해 주세요.'); } else if (!d.lines.length) throw new Error('품목을 하나 이상 담아 주세요.'); d.step++; S.render(); } catch (err) { error(err); } });
  S.action('pos-draft-back', () => { captureDraft(); if (state.draft.step) { state.draft.step--; S.render(); } else S.go(state.draft.orderId ? 'order-detail' : 'intake', state.draft.orderId ? { id: state.draft.orderId } : {}); });
  S.action('pos-date', kind => { captureDraft(); const d = state.draft, existing = d.orderId ? D.order(d.orderId).lines.filter(l => !l.cancelledQuantity).at(-1) : null; d.start = kind === 'same' && existing ? (existing.start < D.today ? D.today : existing.start) : kind === 'tomorrow' ? nextDate(D.today) : D.today; d.end = kind === 'same' && existing && existing.end >= d.start ? existing.end : d.start; S.render(); });
  S.change('pos-draft-person', value => { const d = state.draft; d.sku = read('sku'); d.unitWon = read('unitWon') === '' ? undefined : Number(read('unitWon')); d.quantity = Number(read('quantity')) || 1; d.discountWon = Number(read('discountWon')) || 0; if (value !== '__many') { d.personId = value; S.render(); return; } P.modal('일행 인원 추가', '<p class="pos-info">실명 없이 일행 번호로 등록 · 사람별 규격은 사전입력으로 수집</p><div class="so-actions">' + [2,3,5,10,30].map(n => btn(n + '명', 'pos-people-add', String(n))).join('') + '</div>' + errorBox(), btn('취소', 'close')); });
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
    const body = '<div class="pos-info">이번에 담은 품목의 ' + (pickup ? '수령' : '반납') + ' 일정만 적용 · 기존 대여 유지</div><div class="pos-form-grid">' + method + input('예정일', 'planDate', v.date, 'date') + input('예정 시간', 'planTime', v.time, 'time') + (vehicle ? select('담당 차량', 'planVehicle', (settings?.vehicles || []).map(row => [row.id,row.name]), v.vehicleId) + input('약속 장소', 'planPlace', v.place === '매장' ? settings?.places?.[0] || '' : v.place) : '<div class="pos-info">매장에서 확인</div>') + '</div>' + errorBox();
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
      state.draft = null; state.detailTab = 'items'; S.go('order-detail', { id: result.orderId }); S.toast('같은 접수에 저장 완료 · 준비·지급으로 이어서 진행');
    } catch (err) { error(err); }
  });
  S.action('pos-line', id => {
    const o = D.order(), l = o.lines.find(l => l.id === id);
    P.modal(labelOf(l) + ' · 품목 내역', '<div class="pos-confirm-summary"><strong>' + e(lineDescription(o, l)) + '</strong><span>지급 예정 ' + l.quantity + ' · 실제 지급 ' + l.issuedQuantity + ' · 매장 확인 ' + l.shopQuantity + '</span><span>수령 ' + e(l.pickupPlan.date) + ' ' + e(l.pickupPlan.method === 'shop' ? '매장' : l.pickupPlan.place) + '</span><span>반납 ' + e(l.returnPlan.date) + ' ' + e(l.returnPlan.method === 'direct' ? '매장 직접' : l.returnPlan.place) + '</span><span>' + (l.price.source ? '기존 접수 전체금액에 포함 · 행별 요금 확인 필요' : '단가 ' + won(l.price.unitWon) + ' · 확정 청구 ' + won(l.price.amountWon)) + '</span></div>', btn('닫기', 'close') + (l.unissuedQuantity ? btn('이 추가분 취소', 'pos-cancel-line', l.id) : ''));
  });
  S.action('pos-cancel-line', async id => { try { await D.execute('order.cancel', { orderId: D.order().id, lineIds: [id], reason: '미도착·미지급 추가분 취소' }); S.close(); S.render(); S.toast('선택한 미지급 품목 취소 완료'); } catch (err) { error(err); } });
  S.posOrders = { state, labels, rows, orderList, lineDescription, lineState, itemText, items, badgeOf, cardOf, pickupDate, pickupTime, returnDate, returnTime, activeLines, sizePending, ticketsToIssue, error, errorBox, input, select, read, go, pageSize, short };
  S.register('home', { title: '오늘 할 일', pos: true, render: home });
  for (const page of ['intake', 'preparation', 'rentals', 'returns']) S.register(page, { title: { intake: '1 접수·예약', preparation: '2 준비·지급', rentals: '3 이용 중·변경', returns: '4 반납·회수' }[page], pos: true, legacy: false, render: () => listing(page) });
  S.register('order-detail', { title: '접수 상세', parent: 'rentals', pos: true, render: detail });
  S.register('order-intake', { title: '새 접수', parent: 'intake', pos: true, legacy: false, render: intake });
})();
