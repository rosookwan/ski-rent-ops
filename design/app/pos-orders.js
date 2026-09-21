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
  // One state chip per card: the most urgent line state wins, the rest is on the detail screen (docs/42 M2).
  // On the return-side screens the chip answers "where is it now"; on the intake side "what is still to hand out".
  const stateRanks = { out: ['지급 전', '일부 지급', '발권 예정', '차량 수거 예정', '대여 중', '차량 보관', '지급 완료', '반납 완료', '취소'], back: ['차량 수거 예정', '대여 중', '차량 보관', '지급 전', '일부 지급', '발권 예정', '지급 완료', '반납 완료', '취소'] };
  function cardOf(o, kind) {
    const [badgeText, tone] = badgeOf(o, kind), pending = sizePending(o), due = o.finance.dueWon, deposit = o.finance.depositHeldWon;
    const dueNow = activeLines(o).some(l => l.unissuedQuantity && (l.pickupPlan?.date || l.start) <= D.today);
    const returning = kind === 'returns' || kind === 'rentals';
    // Row 2 in priority order: time, place, use dates, receipt number. Whole parts drop off when the card is narrow.
    const metaParts = returning ? [(short(returnDate(o)) + ' ' + (returnTime(o) || '')).trim() + ' 반납', returnPlace(o), useRange(o) + ' 이용', o.receiptNo || o.id]
      : [(short(pickupDate(o)) + ' ' + (pickupTime(o) || '')).trim() + ' 수령', placeOf(o), useRange(o) + ' 이용', o.receiptNo || o.id];
    const states = activeLines(o).map(l => ({ l, state: lineState(l) })), open = states.filter(x => !x.state[2]);
    const itemParts = (open.length ? open : states).map(x => itemText(x.l));
    const stateRank = stateRanks[returning ? 'back' : 'out'], state = (open.length ? open : states).map(x => x.state).sort((a, b) => stateRank.indexOf(a[0]) - stateRank.indexOf(b[0]))[0];
    const money = due ? ['미수 ' + won(due), 'red'] : kind === 'intake' ? ['예약 금액 ' + won(o.finance.chargedWon), 'ink'] : deposit ? ['보증금 ' + won(deposit), 'blue'] : o.finance.chargedWon ? ['수납 완료', 'green'] : null;
    let action;
    if (kind === 'returns') action = o.totals.customerQuantity ? btn('모두 받음', 'pos-return-all', o.id, 'primary') : o.totals.vehicleQuantity ? btn('차량 입고 확인 ' + vehicleText(o), 'pos-receive', o.id, 'primary') : btn('반납 완료', 'pos-noop', o.id, 'done');
    else if (kind === 'rentals') action = o.exchangeOpenQuantity ? btn('교환 진행 확인', 'pos-problems', o.id, 'primary') : btn('기간·수거 변경', 'pos-change', o.id);
    else if (kind === 'preparation') action = pending ? btn('사이즈 요청 ' + pending + '명', 'pos-preinput', o.id) : o.totals.unissuedQuantity && dueNow ? btn((liftOnly(o) ? '발권 ' : '지급 ') + unissuedText(o), 'pos-issue', o.id, 'primary') : o.totals.unissuedQuantity ? go('접수 상세', 'order-detail', o.id) : due ? btn('수납 ' + won(due), 'pos-money', o.id, 'primary') : btn('지급 완료', 'pos-noop', o.id, 'done');
    else action = o.totals.unissuedQuantity && dueNow ? btn((liftOnly(o) ? '발권 ' : '지급 ') + unissuedText(o), 'pos-issue', o.id, 'primary') : go('접수 상세', 'order-detail', o.id);
    return P.orderCard({ id: o.id, tone: ['red', 'orange', 'green'].includes(tone) ? tone : '', badge: [badgeText, tone], name: o.customer.name + ' 팀', phone: o.customer.phone || '', metaParts, itemParts, state, money, actions: action, go: { page: 'order-detail', id: o.id } });
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
    if (kind === 'intake') { options.wait = pendingPeople ? '사이즈 ' + pendingPeople + '명' : '없음'; options.sums = [['예약 수량', sets + '세트'], ['사이즈 미입력', pendingPeople + '명', pendingPeople ? 'orange' : ''], ['예약 금액', won(total)]]; foot = '수령 ' + filtered.length + '팀 · 예약 금액 ' + won(total) + ' · 예약 ' + sets + '세트 · 사이즈 미입력 ' + pendingPeople + '명'; }
    else if (kind === 'preparation') { options.wait = unissued ? '지급 ' + unissued + '개' : dueTeams ? '수납 ' + dueTeams + '팀' : '없음'; options.sums = [['미지급', unissued + '개', unissued ? 'red' : ''], ['미수 팀', dueTeams + '팀', dueTeams ? 'red' : ''], ['미수 금액', won(due), due ? 'red' : '']]; foot = '수령 ' + filtered.length + '팀 · 미지급 ' + unissued + '개 · 미수 ' + won(due) + '(' + dueTeams + '팀) · 사이즈 미입력 ' + pendingPeople + '명'; }
    else if (kind === 'rentals') { options.wait = exchanges ? '요청 ' + exchanges + '팀' : '없음'; options.sums = [['고객 보유', held + '개', held ? 'orange' : ''], ['교환 대기', exchanges + '건', exchanges ? 'orange' : ''], ['미수', won(due), due ? 'red' : '']]; foot = '반납 ' + filtered.length + '팀 · 고객 보유 ' + held + '개 · 교환 대기 ' + exchanges + '건 · 미수 ' + won(due); }
    else { options.wait = held ? '반납 ' + held + '개' : inVehicle ? '입고 ' + inVehicle + '개' : '없음'; options.sums = [['미반납', held + '개', held ? 'red' : ''], ['차량 보관', inVehicle + '개', inVehicle ? 'purple' : ''], ['미수', won(due), due ? 'red' : '']]; foot = '반납 ' + filtered.length + '팀 · 미반납 ' + held + '개 · 차량 보관 ' + inVehicle + '개 · 미수 ' + won(due); }
    const groups = grouped(filtered, dateKind).map(g => ({ title: g.title, sub: g.sub, cards: g.orders.map(o => cardOf(o, kind)) }));
    const emptyTitle = { intake: '예약 없음', preparation: '준비할 팀 없음', rentals: '이용 중인 팀 없음', returns: '반납할 팀 없음' }[kind];
    const body = P.cards(groups, { fixed: true, signature: [kind, state.query, state.period, state.date, state.sort].join('|'), empty: state.query ? '검색 결과 없음' : emptyTitle, emptyNote: state.query ? '"' + state.query + '"' : '', emptyAction: state.query || state.period !== 'all' || state.date ? btn('전체 보기', 'pos-period', 'all', 'primary') : '' });
    return P.page(titles[kind], '', body, '<span>' + e(foot) + '</span><div class="so-actions">' + (kind === 'preparation' ? btn('사이즈 입력 현황', 'pos-size-status') : '') + (D.pending ? btn('같은 요청 다시 확인', 'pos-retry', '', 'soft') : btn('최신 기록 확인', 'pos-refresh')) + btn('새 접수', 'pos-new', '', 'primary') + '</div>', options);
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
    const closed = D.snapshot.closings.some(c => c.date === today && !c.reopenings.length);
    const unissuedToday = dueIssue.reduce((n, o) => n + activeLines(o).filter(l => (l.pickupPlan?.date || l.start) <= today).reduce((m, l) => m + l.unissuedQuantity, 0), 0);
    // Tile lines come with shorter alternatives so a narrow tile never cuts a name: two teams → first team 외 N팀 → count only.
    const teams = (list, tail) => { const name = o => o.customer.name + ' 팀', rest = n => list.length > n ? ' 외 ' + (list.length - n) + '팀' : ''; return [list.slice(0, 2).map(name).join(' · ') + rest(2) + ' ' + tail, name(list[0]) + rest(1) + ' ' + tail, tail + ' ' + list.length + '팀']; };
    const step = (name, route, badge, figure, when, lines) => P.tile({ tone: ['red', 'orange', 'green'].includes(badge[1]) ? badge[1] : '', badge, name, route, figures: [figure, { label: '기한', value: when, when: true }], lines });
    const tiles = [
      step('1 접수·예약', 'intake', sizeTeams.length ? ['사이즈 미입력 ' + sizeTeams.length + '팀', 'orange'] : ['접수 ' + pickupToday.length + '팀', 'grey'], { label: '오늘 수령', value: pickupToday.length + '팀' }, '오늘 안', [[pickupToday.length ? teams(pickupToday, '수령 예정') : '수령 예정 없음', ''], [sizeTeams.length ? teams(sizeTeams, '사이즈 미입력') : '사이즈 입력 완료', sizeTeams.length ? 'red' : 'green']]),
      step('2 준비·지급', 'preparation', dueTeams.length && dueIssue.length ? ['미수 ' + dueTeams.length + '팀', 'red'] : dueIssue.length ? ['지급 전 ' + dueIssue.length + '팀', 'red'] : ['지급 완료', 'green'], { label: '미지급', value: unissuedToday + '개', tone: unissuedToday ? 'red' : '' }, pickupTime(dueIssue[0] || { lines: [], people: [] }) || '오늘 안', [[dueIssue.length ? teams(dueIssue, '지급 전') : '지급할 팀 없음', dueIssue.length ? 'red' : ''], [sizeTeams.length ? '현장 측정 ' + sizeTeams.reduce((n, o) => n + sizePending(o), 0) + '명' : '사이즈 모두 입력', sizeTeams.length ? 'orange' : '']]),
      step('3 이용·변경', 'rentals', exchanges.length ? ['요청 ' + exchanges.length + '건', 'orange'] : ['이용 중 ' + held.length + '팀', 'blue'], { label: '요청', value: exchanges.length + '건', tone: exchanges.length ? 'orange' : '' }, exchanges.length ? '지금' : '없음', [[exchanges.length ? teams(exchanges, '교환 대기') : '변경 요청 없음', exchanges.length ? 'orange' : ''], ['이용 중 ' + held.length + '팀', '']]),
      step('4 반납·회수', 'returns', overdue.length ? ['반납 지연 ' + overdue.length + '팀', 'red'] : heldQty ? ['미반납 있음', 'red'] : vehicleQty ? ['차량 보관 ' + vehicleQty + '개', 'purple'] : ['반납 완료', 'green'], { label: '미반납', value: heldQty + '개', tone: heldQty ? 'red' : '' }, returnTime(returnToday[0] || { lines: [], people: [] }) || '오늘 안', [[overdue.length ? teams(overdue, '반납 지연') : returnToday.length ? teams(returnToday, '반납 예정') : '오늘 반납 없음', overdue.length ? 'red' : ''], ['차량 보관 ' + vehicleQty + '개', vehicleQty ? 'purple' : '']]),
      step('5 정산·마감', 'closing', dueTeams.length ? ['미수 ' + dueTeams.length + '팀', 'red'] : closed ? ['마감 완료', 'green'] : ['마감 전', 'grey'], { label: '정산 대기', value: dueTeams.length + '건', tone: dueTeams.length ? 'red' : '' }, '오늘 밤', [['미수 ' + won(dueWon), dueWon ? 'red' : ''], [closed ? '오늘 마감 확정됨' : '마감 전', closed ? 'green' : '']]),
      step('리프트권', 'tickets', ticketNeed ? ['발권 필요', 'red'] : ['발권 완료', 'green'], { label: '발권 필요', value: ticketNeed + '매', tone: ticketNeed ? 'red' : '' }, ticketTeams.length ? pickupTime(ticketTeams[0]) || '오늘 안' : '없음', [[ticketTeams.length ? teams(ticketTeams, '발권 전') : '발권할 권 없음', ticketNeed ? 'red' : ''], ['보관 권 ' + D.snapshot.assets.filter(a => a.ticket && ['shop', 'vehicle'].includes(a.location.kind)).length + '매', 'purple']])
    ];
    const urgent = overdue[0] ? ['반납 확인 · ' + overdue[0].customer.name + ' 팀', overdue[0].id, '반납 지연 ' + short(returnDate(overdue[0]))]
      : dueIssue[0] ? ['지급 · ' + dueIssue[0].customer.name + ' 팀', dueIssue[0].id, (pickupTime(dueIssue[0]) || '오늘') + ' 수령 · ' + placeOf(dueIssue[0])]
      : ticketTeams[0] ? ['발권 · ' + ticketTeams[0].customer.name + ' 팀', ticketTeams[0].id, '리프트권 ' + ticketsToIssue(ticketTeams[0]) + '매']
      : returnToday[0] ? ['반납 · ' + returnToday[0].customer.name + ' 팀', returnToday[0].id, (returnTime(returnToday[0]) || '오늘') + ' 반납 · ' + (returnPlace(returnToday[0]) || '매장 직접')]
      : dueTeams[0] ? ['수납 · ' + dueTeams[0].customer.name + ' 팀', dueTeams[0].id, '미수 ' + won(dueTeams[0].finance.dueWon)]
      : held[0] ? ['이용 중 · ' + held[0].customer.name + ' 팀', held[0].id, short(returnDate(held[0])) + ' 반납 예정']
      : pickupToday[0] ? ['수령 · ' + pickupToday[0].customer.name + ' 팀', pickupToday[0].id, (pickupTime(pickupToday[0]) || '오늘') + ' 수령'] : null;
    const now = '<div class="pos-now"><strong>지금 처리</strong>' + (urgent ? '<button type="button" class="so-button pos-button primary" data-go="order-detail" data-id="' + e(urgent[1]) + '">' + e(urgent[0]) + '</button><span data-fit="auto">' + e(urgent[2]) + '</span>' : '<span data-fit="auto">처리할 급한 업무 없음</span>') + (D.pending ? btn('같은 요청 다시 확인', 'pos-retry', '', 'soft') : btn('최신 기록 확인', 'pos-refresh')) + '</div>';
    const waiting = [sizeTeams.length, dueIssue.length, exchanges.length, heldQty, dueTeams.length || !closed, ticketNeed, tasksToday.length].filter(Boolean).length;
    // Six tiles only (steps 1–5 and lift tickets). Vehicle runs sit in the rail and the footer; stock and closing history live under 관리.
    return P.page('오늘 할 일', '', now + '<div class="pos-tiles">' + tiles.join('') + '</div>',
      '<span>' + e('미지급 ' + unissuedToday + '개 · 미반납 ' + heldQty + '개 · 발권 ' + ticketNeed + '매 · 미수 ' + won(dueWon) + ' · 차량 업무 ' + tasksToday.length + '건' + (lateTasks.length ? ' · 차량 지연 ' + lateTasks.length + '건' : '')) + '</span><div class="so-actions"><button type="button" class="so-button pos-button" data-go="dispatch">' + e(lateTasks.length ? '차량 운행 · 지연 ' + lateTasks.length : '차량 운행') + '</button>' + btn('새 접수', 'pos-new') + '<button type="button" class="so-button pos-button primary" data-go="closing">마감</button></div>',
      { wait: waiting + '가지', sums: [['오늘 지급 예정', unissuedToday + '개'], ['오늘 반납 예정', returnToday.length + '팀'], ['미수 합계', won(dueWon), dueWon ? 'red' : '']] });
  }
  function lineDescription(o, l) {
    const person = o.people.find(p => p.id === l.personId)?.name || '팀 공용', batch = o.batches.find(b => b.id === l.batchId)?.label || '';
    const extended = (l.customerTerms || []).filter(t => t.end > l.end);
    return person + ' · ' + batch + ' · ' + l.start.slice(5) + (l.end !== l.start ? '~' + l.end.slice(5) : '') + (extended.length ? ' · 남은 ' + extended.length + '개 ' + l.currentEnd.slice(5) + '까지 연장' : '') + ' · ' + (l.cancelledQuantity ? '취소' : '미지급 ' + l.unissuedQuantity + ' / 보유 ' + l.customerQuantity + ' / 차량 ' + l.vehicleQuantity);
  }
  const movementNames = { load: '차량 적재', deliver: '고객 지급', collect: '차량 수거', receive: '매장 입고', directReturn: '직접 반납', opening: '이관 보관 확인', stock: '재고 입고', ticketIssue: '발권', refund: '발권처 환불', found: '발견 확인' };
  // Item cards on the detail screen: lines of the same product and dates are shown as one card (30 people → one card, not 30).
  const lineGroups = lines => { const map = new Map(); for (const l of lines) { const key = [l.sku, l.start, l.currentEnd || l.end].join('|'); if (!map.has(key)) map.set(key, []); map.get(key).push(l); } return [...map.values()]; };
  const sumOf = (group, key) => group.reduce((n, l) => n + (l[key] || 0), 0);
  function itemCard(o, group) {
    const first = group[0], people = [...new Set(group.map(l => o.people.find(p => p.id === l.personId)?.name).filter(Boolean))];
    const who = !people.length ? '팀 공용' : people.length <= 2 ? people.join(' · ') : people[0] + ' 외 ' + (people.length - 1) + '명';
    const state = group.map(lineState).sort((x, y) => stateRanks.out.indexOf(x[0]) - stateRanks.out.indexOf(y[0]))[0], last = first.currentEnd || first.end;
    const meta = [who, short(first.start) + (last !== first.start ? '~' + short(last) : ''), first.pickupPlan?.method === 'delivery' ? '차량 배달' : ''].filter(Boolean);
    const figure = (label, value, tone = '') => '<span><small>' + e(label) + '</small><b data-tone="' + tone + '">' + value + '</b></span>';
    const target = group.length === 1 ? 'data-action="pos-line" data-id="' + e(first.id) + '"' : 'data-action="pos-line-group" data-id="' + e(group.map(l => l.id).join(',')) + '"';
    return '<button type="button" class="pos-card pos-item-card" ' + target + '><span class="pos-item-copy"><strong>' + e(labelOf(first) + ' ' + sumOf(group, 'quantity') + unitOf(first)) + '</strong>'
      + '<span data-fit="parts" data-parts="' + e(JSON.stringify(meta)) + '">' + e(meta.join(' · ')) + '</span></span>'
      + '<span class="pos-item-figures">' + figure('예정', sumOf(group, 'quantity')) + figure('지급', sumOf(group, 'issuedQuantity')) + figure(sumOf(group, 'vehicleQuantity') && !sumOf(group, 'customerQuantity') ? '차량 보관' : '고객 보유', sumOf(group, 'customerQuantity') || sumOf(group, 'vehicleQuantity'), sumOf(group, 'customerQuantity') ? 'orange' : sumOf(group, 'vehicleQuantity') ? 'purple' : '') + '</span>'
      + '<span class="pos-item-state"><span class="pos-state" data-tone="' + e(state[1] || 'grey') + '">' + e(state[0]) + '</span></span></button>';
  }
  function detail() {
    const o = D.order(); if (!o) return P.page('접수 상세', '', '<div class="pos-empty"><strong>접수 없음</strong><span>목록에서 다시 선택</span>' + go('접수 목록', 'intake', '', 'primary') + '</div>', '', { wait: '없음' });
    const f = o.finance, [badgeText, tone] = badgeOf(o, o.totals.customerQuantity || o.totals.vehicleQuantity ? 'returns' : 'preparation');
    const lines = activeLines(o), phone = (o.customer.phone || '').replace(/[^0-9+]/g, ''), pending = sizePending(o);
    const info = [['연락처', [o.customer.phone || '미입력']], ['접수번호', [o.receiptNo || o.id, o.batches.length > 1 ? o.batches.length + '개 접수 내역' : '']], ['이용', [useRange(o), o.people.length ? o.people.length + '명' : '']], ['수령', [(short(pickupDate(o)) + ' ' + (pickupTime(o) || '')).trim(), placeOf(o)]], ['반납', [(short(returnDate(o)) + ' ' + (returnTime(o) || '')).trim(), returnPlace(o) || '매장 직접']]];
    const side = '<aside class="pos-panel pos-detail-side"><div class="pos-detail-name"><strong data-fit="words">' + e(o.customer.name) + ' 팀</strong><span class="pos-state" data-tone="' + e(tone) + '">' + e(badgeText) + '</span></div>'
      + '<dl class="pos-detail-info">' + info.map(([k, parts]) => '<div><dt>' + e(k) + '</dt><dd data-fit="parts" data-parts="' + e(JSON.stringify(parts.filter(Boolean))) + '">' + e(parts.filter(Boolean).join(' · ')) + '</dd></div>').join('') + '</dl>'
      + '<div class="pos-detail-actions pos-shortcuts">' + btn('일행·장비 추가', 'pos-add', o.id) + btn('사이즈 요청' + (pending ? ' ' + pending + '명' : ''), 'pos-preinput', o.id) + btn('기간·수거 변경', 'pos-change', o.id) + btn('수납·환불', 'pos-money', o.id) + btn('문제 해결·정정', 'pos-problems', o.id) + (phone ? '<a class="so-button pos-button" href="tel:' + e(phone) + '">' + S.icon('phone') + '전화</a>' : '<button type="button" class="so-button pos-button" disabled>연락처 없음</button>') + '</div></aside>';
    const groups = lineGroups(lines), tabs = [['items', '품목', groups.length], ['money', '수납·환불', null], ['history', '이력', null]];
    const tabBar = '<div class="pos-toolbar-group">' + tabs.map(([id, label, count]) => P.chip(label, 'pos-detail-tab', id, state.detailTab === id, count)).join('') + '</div>'
      + '<span class="pos-toolbar-spacer"></span>' + [['청구', won(f.chargedWon), ''], ['수납', won(f.netPaidWon || 0), 'green'], ['미수', won(f.dueWon), f.dueWon ? 'red' : '']].map(([label, value, tone]) => '<span class="pos-sum"><span>' + e(label) + '</span><strong' + (tone ? ' data-tone="' + tone + '"' : '') + '>' + e(value) + '</strong></span>').join('');
    let content;
    if (state.detailTab === 'money') {
      const rowsHtml = [['대여 요금', won(f.chargedWon), ''], ['수납', won(f.netPaidWon || 0), 'green'], ['환불', won(f.refundWon || 0), ''], ['보증금', won(f.depositHeldWon || 0), 'blue'], ['미수', won(f.dueWon), f.dueWon ? 'red' : 'green']]
        .map(([k, v, t]) => '<div class="pos-money-line"><span>' + e(k) + '</span><b data-tone="' + t + '">' + e(v) + '</b></div>').join('');
      content = '<div class="pos-panel pos-money-panel">' + rowsHtml + '<div class="pos-money-foot"><span data-fit="auto">' + e((f.payments?.length ? '수납 기록 ' + f.payments.length + '건' : '수납 기록 없음') + (f.creditWon ? ' · 초과 수납 ' + won(f.creditWon) : '')) + '</span>' + btn('금액 조정', 'pos-adjust', o.id) + (f.depositHeldWon ? btn('보증금 반환', 'pos-deposit-out', o.id) : '') + '</div></div>';
    } else if (state.detailTab === 'history') {
      const list = (D.history.movements || []).filter(m => m.orderId === o.id || m.from?.kind === 'customer' && m.from.id === o.id || m.to?.kind === 'customer' && m.to.id === o.id).slice().sort((a, b) => b.revision - a.revision);
      const loc = l => !l ? '기록' : l.kind === 'vehicle' ? (S.posFulfillment?.vehicleName(l.id) || l.id) : { customer: '고객', shop: '매장', vendor: '발권처' }[l.kind] || l.kind;
      const rowsHtml = list.map(m => '<div class="pos-line-row is-static"><strong>' + e((movementNames[m.kind] || '물품 기록') + ' · ' + m.assetIds.filter(id => !(m.reversedAssetIds || []).includes(id)).length + '개') + '</strong><span class="pos-line-note" data-fit="parts" data-parts="' + e(JSON.stringify([loc(m.from) + ' → ' + loc(m.to)])) + '">' + e(loc(m.from) + ' → ' + loc(m.to)) + '</span><b>' + e(new Date(Date.parse(m.at) + 9 * 3600000).toISOString().slice(5, 16).replace('T', ' ')) + '</b></div>');
      content = '<div class="pos-panel">' + P.cards([{ cards: rowsHtml }], { fixed: true, lines: true, signature: o.id + '|history', empty: '이동 기록 없음' }) + '</div>';
    } else content = P.cards([{ cards: groups.map(group => itemCard(o, group)) }], { fixed: true, cardHeight: 108, cols: 1, signature: o.id + '|items', empty: '품목 없음' }) + '<p class="pos-detail-hint">단가와 청구 내역은 수납·환불 탭에서 확인</p>';
    const next = o.exchangeOpenQuantity ? btn('교환 진행 확인', 'pos-problems', o.id, 'primary') : o.totals.customerQuantity ? btn('모두 받음', 'pos-return-all', o.id, 'primary') : o.totals.vehicleQuantity ? btn('차량에서 받은 물품 입고', 'pos-receive', o.id, 'primary') : o.totals.unissuedQuantity ? btn('준비·지급하기', 'pos-issue', o.id, 'primary') : btn(f.dueWon ? '수납 ' + won(f.dueWon) : '남은 정산 확인', 'pos-money', o.id, 'primary');
    const plain = text => text.replaceAll(' · ', ' ');
    const foot = [o.totals.unissuedQuantity ? '미지급 ' + plain(unissuedText(o)) : '', o.totals.customerQuantity ? '고객 보유 ' + plain(customerText(o)) : '', o.totals.vehicleQuantity ? '차량 보관 ' + plain(vehicleText(o)) : '', f.dueWon ? '미수 ' + won(f.dueWon) : '수납 완료', o.source ? '이관 접수' : ''].filter(Boolean).join(' · ');
    return P.page('접수 상세', '', '<div class="pos-detail">' + side + '<div class="pos-detail-main">' + content + '</div></div>',
      '<span>' + e(foot) + '</span><div class="so-actions">' + (o.totals.customerQuantity ? btn('일부만 받음', 'pos-return-some', o.id) : go('목록으로', 'intake')) + (o.totals.unissuedQuantity && o.totals.customerQuantity ? btn('남은 장비 지급', 'pos-issue', o.id) : '') + next + '</div>',
      { toolbar: '<button type="button" class="so-button pos-button" data-action="back">' + S.icon('chevron-left') + '목록</button>' + tabBar,
        wait: o.totals.unissuedQuantity ? '지급 ' + unissuedText(o) : o.totals.customerQuantity ? '반납 ' + customerText(o) : o.totals.vehicleQuantity ? '입고 ' + vehicleText(o) : f.dueWon ? '수납 ' + won(f.dueWon) : '없음',
        sums: [['고객 보유', o.totals.customerQuantity + '개', o.totals.customerQuantity ? 'orange' : ''], ['차량 보관', o.totals.vehicleQuantity + '개', o.totals.vehicleQuantity ? 'purple' : ''], ['미수', won(f.dueWon), f.dueWon ? 'red' : '']] });
  }
  // ---- New intake (UI v4 · docs/42 M4): 1 고객(대상) → 2 품목 → 3 일정·장소. One draft shares its dates; lines follow them. ----
  const settingsOf = () => D.snapshot.management?.settings || { rates: [], places: [], vehicles: [], returnTimes: [] };
  const rateOf = id => settingsOf().rates.find(r => r.sku === id)?.unitWon;
  const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const dayCount = d => Math.round((Date.parse(d.end) - Date.parse(d.start)) / 86400000) + 1;
  const products = () => D.snapshot.catalog.filter(s => !s.id.startsWith('legacy-'));
  function startDraft(id) {
    const o = id ? D.order(id) : null;
    if (state.draft && state.draft.orderId === (id || null)) { S.go('order-intake'); return; }
    state.draft = { orderId: id || null, customer: o?.customer || { name: '', phone: '' }, people: [], lines: [], start: D.today, end: D.today, personId: '', sku: 'ski', unitWon: rateOf('ski'), step: 0, find: { digits: '', results: null }, gridPage: 0, linePage: 0, returnOffset: 0 };
    if (o?.people.length) addPerson(); // adding to a team that already has people starts with one new companion
    S.go('order-intake', id ? { id } : {});
  }
  function captureDraft() {
    const d = state.draft; if (!d) return;
    if (!d.orderId) { if (read('name') !== undefined) d.customer.name = read('name'); if (read('phone') !== undefined) d.customer.phone = read('phone'); }
  }
  function draftPeople() { const d = state.draft; return [...(d.orderId ? D.order(d.orderId).people : []), ...d.people]; }
  function addPerson() { const d = state.draft, id = D.id('person'); d.people.push({ id, name: '일행 ' + (draftPeople().length + 1) }); d.personId = id; return id; }
  // Dates live on the draft; every line and both plans follow them.
  function syncDates() {
    const d = state.draft, first = settingsOf().returnTimes[0];
    for (const l of d.lines) { l.start = d.start; l.end = sku(l.sku)?.kind === 'liftTicket' ? d.start : d.end; }
    d.pickupPlan = d.pickupPlan || { method: 'shop', date: d.start, time: d.start === D.today ? null : '09:00', place: '매장' };
    d.returnPlan = d.returnPlan || { method: 'direct', date: d.end, time: first?.time || '16:30', place: '매장' };
    if (!d.returnPlan.time) d.returnPlan.time = first?.time || '16:30';
    if (d.pickupPlan.date > d.start || d.pickupPlan.auto !== false) d.pickupPlan.date = d.start;
    if (d.returnPlan.date < d.end || d.returnPlan.auto !== false) d.returnPlan.date = addDays(d.end, d.returnOffset || 0);
  }
  const setDates = (start, days) => { const d = state.draft; d.start = start; d.end = addDays(start, Math.max(1, days) - 1); syncDates(); };
  const planOut = plan => { const { auto, now, ...rest } = plan; if (!['delivery', 'vehicle'].includes(rest.method)) { delete rest.vehicleId; rest.place = '매장'; if (!rest.time) delete rest.time; } return rest; };
  const nowTime = () => { const t = new Date(Date.now() + 9 * 3600000 + 600000 - 1); return String(t.getUTCHours()).padStart(2, '0') + ':' + String(Math.floor(t.getUTCMinutes() / 10) * 10).padStart(2, '0'); };
  const amount = l => l.quantity * l.price.unitWon * (sku(l.sku)?.kind === 'liftTicket' ? 1 : (Date.parse(l.end) - Date.parse(l.start)) / 86400000 + 1) - (l.price.discountWon || 0);
  const draftTotal = () => state.draft.lines.reduce((n, l) => n + amount(l), 0);
  const quantityOf = (id, personId) => state.draft.lines.filter(l => l.sku === id && (personId === undefined || (l.personId || '') === personId)).reduce((n, l) => n + l.quantity, 0);
  const itemsSummary = lines => { const map = new Map(); for (const l of lines) map.set(l.sku, (map.get(l.sku) || 0) + l.quantity); return [...map].map(([id, n]) => (sku(id)?.label || id) + ' ' + n); };
  // Customers already known to the shop (registered contacts and earlier receptions), looked up by the last digits of the phone.
  function findCustomers(digits) {
    const tail = phone => (phone || '').replace(/\D/g, ''), seen = new Map();
    const add = (name, phone, orders) => { const key = name + '|' + tail(phone), row = seen.get(key) || { name, phone, orders: [] }; row.orders.push(...orders); seen.set(key, row); };
    for (const p of D.snapshot.management?.customerProfiles || []) add(p.name, p.phone, p.visits || []);
    for (const o of D.snapshot.orders) add(o.customer.name, o.customer.phone, [o]);
    return [...seen.values()].filter(row => digits && tail(row.phone).endsWith(digits)).map(row => {
      const orders = [...new Map(row.orders.map(o => [o.id, o])).values()], last = orders.flatMap(o => (o.lines || []).map(l => l.start)).sort().at(-1) || '';
      return { name: row.name, phone: row.phone, last, people: Math.max(0, ...orders.map(o => o.people?.length || 0)), visits: orders.length };
    }).sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
  }
  const option = (label, action, id, on, sub = '') => '<button type="button" class="so-button pos-button pos-option' + (sub ? ' is-two' : '') + '" data-action="' + e(action) + '" data-id="' + e(id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + (sub ? '<span>' + e(label) + '</span><b>' + e(sub) + '</b>' : e(label)) + '</button>';
  const panelHead = (title, sub = '', extra = '') => '<div class="pos-panel-head"><strong>' + e(title) + '</strong>' + (sub ? '<span data-fit="auto">' + e(sub) + '</span>' : '<span></span>') + extra + '</div>';
  const miniPager = (action, index, count) => count < 2 ? '' : '<span class="pos-mini-pager"><button type="button" class="so-button pos-button" data-action="' + action + '" data-id="-1" aria-label="이전 쪽"' + (index ? '' : ' disabled') + '>‹</button><span>' + (index + 1) + ' / ' + count + '</span><button type="button" class="so-button pos-button" data-action="' + action + '" data-id="1" aria-label="다음 쪽"' + (index < count - 1 ? '' : ' disabled') + '>›</button></span>';
  function customerStep(d) {
    const digits = d.find.digits, keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => '<button type="button" class="so-button pos-button pos-find-key" data-action="pos-find-key" data-id="' + n + '">' + n + '</button>').join('')
      + '<button type="button" class="so-button pos-button pos-find-key is-word" data-action="pos-find-key" data-id="clear">지우기</button><button type="button" class="so-button pos-button pos-find-key" data-action="pos-find-key" data-id="0">0</button><button type="button" class="so-button pos-button pos-find-key is-word is-dark" data-action="pos-find-key" data-id="find">찾기</button>';
    const left = '<section class="pos-panel pos-find">' + panelHead('고객 찾기', '연락처 끝 4자리') + '<div class="pos-find-display" aria-live="polite" aria-label="입력한 끝자리">' + [0, 1, 2, 3].map(i => '<span>' + e(digits[i] || '·') + '</span>').join('') + '</div><div class="pos-find-keys">' + keys + '</div></section>';
    const results = d.find.results;
    let right;
    if (results?.length) {
      const rows = results.map((c, i) => P.lineRow({ name: c.name, noteParts: [c.phone, c.last ? '최근 ' + short(c.last) : '', c.people ? '일행 ' + c.people + '명' : '', c.visits > 1 ? '방문 ' + c.visits + '회' : ''], label: d.customer.name === c.name && d.customer.phone === c.phone ? '선택됨' : '선택', action: 'pos-find-pick', id: String(i), selected: d.customer.name === c.name && d.customer.phone === c.phone }));
      right = '<section class="pos-panel">' + panelHead('찾은 고객', results.length + '명 · 끝자리 ' + d.find.shown) + P.cards([{ cards: rows }], { fixed: true, lines: true, signature: 'find|' + d.find.shown }) + '<div class="pos-panel-foot"><span data-fit="auto">' + e(results.length > 1 ? '같은 끝자리 ' + results.length + '명 · 이름 확인' : '이름과 연락처 확인') + '</span>' + btn('새 고객 등록', 'pos-find-new') + '</div>' + errorBox() + '</section>';
    } else right = '<section class="pos-panel">' + panelHead('새 고객', results ? '끝자리 ' + d.find.shown + ' 고객 없음' : '처음 오신 고객') + '<div class="pos-form-grid is-single">' + input('대표자 이름', 'name', d.customer.name, 'text', 'maxlength="60" autocomplete="name"') + input('대표자 연락처', 'phone', d.customer.phone, 'tel', 'autocomplete="tel"') + '</div><p class="pos-panel-note">대표자 정보는 한 번만 입력 · 일행 실명은 선택</p>' + errorBox() + '</section>';
    return '<div class="pos-split is-even">' + left + right + '</div>';
  }
  function targetStep(d, o) {
    const [badgeText, tone] = badgeOf(o, o.totals.customerQuantity || o.totals.vehicleQuantity ? 'returns' : 'preparation'), existing = activeLines(o).at(-1), fresh = d.people.length;
    const row = (label, html) => '<div class="pos-option-row"><span>' + e(label) + '</span><div>' + html + '</div></div>';
    const left = '<section class="pos-panel pos-options"><div class="pos-target-head"><strong data-fit="words">' + e(o.customer.name) + ' 팀</strong><span class="pos-state" data-tone="' + e(tone) + '">' + e(badgeText) + '</span><small data-fit="auto">' + e((o.receiptNo || o.id) + ' · ' + (o.customer.phone || '연락처 없음')) + '</small></div>'
      + row('추가 대상', option('새 일행', 'pos-draft-target', 'new', fresh > 0) + option('기존 일행에 추가', 'pos-draft-target', 'existing', !fresh))
      + row('수령일', option('오늘 ' + short(D.today), 'pos-date', 'today', d.start === D.today) + option('내일 ' + short(nextDate(D.today)), 'pos-date', 'tomorrow', d.start === nextDate(D.today)) + (existing ? option('기존 일정과 같게', 'pos-date', 'same', d.same === true) : ''))
      + (fresh ? row('새 일행 수', '<div class="pos-stepper"><button type="button" class="so-button pos-button" data-action="pos-person-remove" aria-label="새 일행 줄이기"' + (fresh > 1 ? '' : ' disabled') + '>−</button><b>' + fresh + '</b><button type="button" class="so-button pos-button" data-action="pos-person-add" aria-label="새 일행 늘리기">+</button><span>명</span></div>' + btn('여러 명', 'pos-people-many')) : row('추가 방식', '<span class="pos-option-note">기존 일행이나 팀 공용으로 품목만 추가</span>')) + errorBox() + '</section>';
    const info = [['일행', o.people.length ? o.people.length + '명' : '팀 공용'], ['대여 품목', itemsSummary(activeLines(o))], ['이용', [useRange(o)]], ['반납', [(short(returnDate(o)) + ' ' + (returnTime(o) || '')).trim(), returnPlace(o) || '매장 직접']]];
    const right = '<section class="pos-panel pos-summary">' + panelHead('현재 접수') + '<dl class="pos-summary-list">' + info.map(([k, v]) => '<div><dt>' + e(k) + '</dt><dd data-fit="' + (k === '대여 품목' ? 'items' : 'parts') + '" data-parts="' + e(JSON.stringify([].concat(v))) + '">' + e([].concat(v).join(' · ')) + '</dd></div>').join('') + '</dl>'
      + '<div class="pos-summary-total"><span>' + (o.finance.dueWon ? '미수' : '수납') + '</span><b data-tone="' + (o.finance.dueWon ? 'red' : 'green') + '">' + e(o.finance.dueWon ? won(o.finance.dueWon) : '완료') + '</b></div><p class="pos-panel-note">기존 기록은 그대로 · 추가분만 따로 계산</p></section>';
    return '<div class="pos-split">' + left + right + '</div>';
  }
  function grid(d, personId) {
    const list = products(), tickets = list.filter(s => s.kind === 'liftTicket'), goods = list.filter(s => s.kind !== 'liftTicket');
    const tiles = goods.map(s => { const n = quantityOf(s.id, personId), rate = rateOf(s.id); return '<button type="button" class="pos-pick" data-action="pos-grid-add" data-id="' + e(s.id) + '" aria-pressed="' + (n ? 'true' : 'false') + '"><strong>' + e(s.label) + '</strong><span>' + e(rate == null ? '요금 확인' : won(rate)) + '</span>' + (n ? '<b>' + n + '</b>' : '') + '</button>'; });
    if (tickets.length) { const n = tickets.reduce((m, s) => m + quantityOf(s.id, personId), 0); tiles.push('<button type="button" class="pos-pick is-ticket" data-action="pos-grid-tickets" aria-pressed="' + (n ? 'true' : 'false') + '"><strong>리프트권</strong><span>권종 선택 ›</span>' + (n ? '<b>' + n + '</b>' : '') + '</button>'); }
    const count = Math.max(1, Math.ceil(tiles.length / 9)), index = Math.min(d.gridPage || 0, count - 1); d.gridPage = index;
    return { html: '<div class="pos-pick-grid">' + tiles.slice(index * 9, index * 9 + 9).join('') + '</div>', pager: miniPager('pos-grid-page', index, count) };
  }
  function itemsStep(d) {
    const people = draftPeople();
    if (!people.length) {
      const g = grid(d, ''), per = 3, count = Math.max(1, Math.ceil(d.lines.length / per)), index = Math.min(d.linePage || 0, count - 1); d.linePage = index;
      const days = dayCount(d), formula = l => won(l.price.unitWon) + ' × ' + l.quantity + (sku(l.sku)?.kind === 'liftTicket' ? '' : ' × ' + days + '일') + (l.price.discountWon ? ' − ' + won(l.price.discountWon) : '');
      const rows = d.lines.slice(index * per, index * per + per).map(l => { const product = sku(l.sku);
        return '<div class="pos-draft-row"><div><strong>' + e(product?.label || l.sku) + '</strong><span data-fit="alts" data-alts="' + e(JSON.stringify([formula(l) + ' = ' + won(amount(l)), formula(l), won(amount(l))])) + '">' + e(formula(l)) + '</span></div><div class="pos-stepper"><button type="button" class="so-button pos-button" data-action="pos-line-step" data-id="' + e(l.id) + ':-1" aria-label="' + e((product?.label || l.sku) + ' 줄이기') + '">−</button><b>' + l.quantity + '</b><button type="button" class="so-button pos-button" data-action="pos-line-step" data-id="' + e(l.id) + ':1" aria-label="' + e((product?.label || l.sku) + ' 늘리기') + '">+</button></div></div>'; }).join('');
      const discount = d.lines.reduce((n, l) => n + (l.price.discountWon || 0), 0);
      return '<div class="pos-split is-items"><section class="pos-panel">' + panelHead('품목 선택', '누르면 1개씩 늘어납니다', g.pager) + g.html + '<div class="pos-panel-foot">' + btn('일행마다 다르게 입력', 'pos-people-many') + btn('직접 입력', 'pos-line-detail') + '</div></section>'
        + '<section class="pos-panel pos-summary">' + panelHead('이번 접수 내역', '', miniPager('pos-draft-line-page', index, count)) + '<div class="pos-draft-rows">' + (rows || '<p class="pos-panel-note">왼쪽에서 품목을 누르세요</p>') + '</div>'
        + '<div class="pos-option-row is-tight"><span>이용 일수</span><div>' + [1, 2, 3].map(n => option(n + '일', 'pos-plan-pick', 'days:' + n, days === n)).join('') + option(days > 3 ? days + '일' : '직접', 'pos-draft-days-open', '', days > 3) + '</div></div>'
        + (discount ? '<div class="pos-summary-line"><span>할인</span><b>' + e(won(discount)) + '</b></div>' : '') + '<div class="pos-summary-total"><span>합계</span><b>' + e(won(draftTotal())) + '</b></div>' + errorBox() + '</section></div>';
    }
    const rowsOf = [{ id: '', name: '팀 공용' }, ...people], current = rowsOf.find(p => p.id === d.personId) || rowsOf[1] || rowsOf[0]; d.personId = current.id;
    const done = people.filter(p => d.lines.some(l => l.personId === p.id)).length, g = grid(d, current.id), at = people.findIndex(p => p.id === current.id), empty = people.filter(p => p.id !== current.id && !d.lines.some(l => l.personId === p.id)).length;
    const list = rowsOf.map((p, i) => { const own = d.lines.filter(l => (l.personId || '') === p.id), on = p.id === current.id; return P.lineRow({ name: (i ? i + ' ' : '') + p.name, noteParts: own.length ? itemsSummary(own) : [p.id ? '미선택' : '함께 쓰는 품목'], label: on ? '선택 중' : own.length ? '입력됨' : '선택', action: 'pos-draft-pick-person', id: p.id || '__team', selected: on }); });
    return '<div class="pos-split is-narrow"><section class="pos-panel">' + panelHead('일행 ' + people.length + '명', '입력 ' + done + '명') + P.cards([{ cards: list }], { fixed: true, lines: true, signature: 'people|' + people.length, focus: rowsOf.indexOf(current) })
      + '<div class="pos-panel-foot">' + btn('일행 추가', 'pos-person-add') + btn('여러 명', 'pos-people-many') + (d.people.length ? btn('빼기', 'pos-person-remove') : '') + '</div></section>'
      + '<section class="pos-panel">' + panelHead((at >= 0 ? (at + 1) + ' ' : '') + current.name, '품목 선택', g.pager) + g.html + '<div class="pos-panel-foot">' + (at > 0 ? btn('앞사람과 같게', 'pos-person-copy', 'prev') : '') + (at >= 0 && empty ? btn('남은 ' + empty + '명 모두 같게', 'pos-person-copy', 'rest') : '') + btn('직접 입력', 'pos-line-detail') + '</div>' + errorBox() + '</section></div>';
  }
  const isLift = l => sku(l.sku)?.kind === 'liftTicket';
  const areaOfPlace = place => settingsOf().areas?.find(area => area.places.includes(place));
  const shortPlace = (place, area) => area && place.startsWith(area.name + ' ') ? place.slice(area.name.length + 1) : place;
  function scheduleStep(d, name) {
    syncDates();
    const settings = settingsOf(), days = dayCount(d), pick = d.pickupPlan, back = d.returnPlan, areas = (settings.areas || []).filter(area => area.places.length || area.id === areaOfPlace(pick.place)?.id);
    const row = (label, html) => '<div class="pos-option-row"><span>' + e(label) + '</span><div>' + html + '</div></div>';
    const times = ['09:00', '12:00', '17:00'], customTime = pick.time && !times.includes(pick.time);
    // Pickup place: the shop plus one button per area; the places themselves are picked in a window, so ten or more places never crowd this row (docs/44).
    const chosen = pick.method === 'delivery' ? areaOfPlace(pick.place) : null, shownAreas = areas.slice(0, areas.length > 3 ? 2 : 3), hiddenChosen = pick.method === 'delivery' && !shownAreas.some(area => area.id === chosen?.id);
    const areaButton = area => area.id === chosen?.id ? option(area.name, 'pos-place-open', area.id, true, shortPlace(pick.place, area)) : option(area.name + ' ›', 'pos-place-open', area.id, false);
    const placeRow = option('매장 수령', 'pos-plan-pick', 'place:', pick.method === 'shop') + shownAreas.map(areaButton).join('') + (areas.length > 3 || hiddenChosen ? (hiddenChosen ? option(chosen?.name || '직접 입력', 'pos-place-open', chosen?.id || '', true, shortPlace(pick.place, chosen)) : option('더 보기 ›', 'pos-place-open', areas[2].id, false)) : '') + (areas.length ? '' : option('장소 입력', 'pos-draft-plan', 'pickup-place', pick.method === 'delivery', pick.method === 'delivery' ? pick.place : ''));
    // Return time: every preset from the store settings; when the row is too narrow the rest moves into a window.
    const presets = settings.returnTimes, room = innerWidth >= 1000 ? 4 : 3, preset = presets.find(t => t.time === back.time && (t.dayOffset || 0) === (d.returnOffset || 0) && back.date === addDays(d.end, t.dayOffset || 0));
    const shownTimes = presets.length <= room ? presets : presets.slice(0, room - 1), returnButton = t => option(t.label, 'pos-plan-pick', 'return:' + t.id, preset?.id === t.id, t.time);
    const returnRow = shownTimes.map(returnButton).join('') + (presets.length > room ? (preset && !shownTimes.includes(preset) ? option(preset.label, 'pos-return-open', '', true, preset.time) : option('더 보기 ›', 'pos-return-open', '', false)) : '') + (preset ? option('직접', 'pos-draft-plan', 'return', false) : option(short(back.date), 'pos-draft-plan', 'return', true, back.time));
    const left = '<section class="pos-panel pos-options">'
      + row('수령일', option('오늘 ' + short(D.today), 'pos-plan-pick', 'day:' + D.today, d.start === D.today) + option('내일 ' + short(nextDate(D.today)), 'pos-plan-pick', 'day:' + nextDate(D.today), d.start === nextDate(D.today)) + option(d.start > nextDate(D.today) || d.start < D.today ? short(d.start) : '달력', 'pos-draft-dates', '', d.start > nextDate(D.today) || d.start < D.today))
      + row('이용 일수', [1, 2, 3].map(n => option(n + '일', 'pos-plan-pick', 'days:' + n, days === n)).join('') + option(days > 3 ? days + '일' : '직접', 'pos-draft-days-open', '', days > 3))
      + row('수령 시간', (d.start === D.today ? option('지금', 'pos-plan-pick', 'time:now', !pick.time || pick.now === true) : '') + times.map(t => option(t, 'pos-plan-pick', 'time:' + t, pick.time === t && !pick.now)).join('') + option(customTime && !pick.now ? pick.time : '직접', 'pos-draft-plan', 'pickup', !!customTime && !pick.now))
      + row('수령 장소', placeRow) + row('반납 시간', returnRow) + '</section>';
    const gearWon = d.lines.filter(l => !isLift(l)).reduce((n, l) => n + amount(l), 0), liftWon = d.lines.filter(isLift).reduce((n, l) => n + amount(l), 0);
    const info = [['대표자', [name, d.customer.phone]], ['대여 품목', itemsSummary(d.lines)], ['이용', [short(d.start) + (d.end !== d.start ? '~' + short(d.end) : ''), days + '일', draftPeople().length ? '일행 ' + draftPeople().length + '명' : '']], ['수령', [(short(pick.date) + ' ' + (pick.time || '')).trim(), pick.method === 'delivery' ? pick.place : '매장 수령']], ['반납', [short(back.date) + ' ' + back.time, back.method === 'vehicle' ? '차량 수거' : '매장 직접']]];
    const right = '<section class="pos-panel pos-summary">' + panelHead(d.orderId ? '추가 요약' : '접수 요약') + '<dl class="pos-summary-list">' + info.map(([k, v]) => '<div><dt>' + e(k) + '</dt><dd data-fit="' + (k === '대여 품목' ? 'items' : 'parts') + '" data-parts="' + e(JSON.stringify(v.filter(Boolean))) + '">' + e(v.filter(Boolean).join(' · ')) + '</dd></div>').join('') + '</dl>'
      + '<div class="pos-summary-split">' + (gearWon && liftWon ? '<div class="pos-summary-line"><span>장비 대여</span><b>' + e(won(gearWon)) + '</b></div><div class="pos-summary-line"><span>리프트권</span><b>' + e(won(liftWon)) + '</b></div>' : '') + '<div class="pos-summary-total"><span>' + (d.orderId ? '이번 청구' : '합계') + '</span><b>' + e(won(draftTotal())) + '</b></div></div>' + errorBox() + '</section>';
    return '<div class="pos-split is-wide">' + left + right + '</div>';
  }
  function intake() {
    const d = state.draft; if (!d) return listing('intake');
    const o = d.orderId ? D.order(d.orderId) : null, name = o?.customer.name || d.customer.name || '새 팀', quantity = d.lines.reduce((n, l) => n + l.quantity, 0), people = draftPeople();
    const body = d.step === 0 ? (o ? targetStep(d, o) : customerStep(d)) : d.step === 1 ? itemsStep(d) : scheduleStep(d, name);
    const stepNames = [[o ? '대상' : '고객', d.step > 0 ? name + ' 팀' : ''], ['품목', quantity ? quantity + '개' : ''], ['일정·장소', '']];
    const toolbar = '<button type="button" class="so-button pos-button" data-action="pos-draft-back">' + S.icon('chevron-left') + (d.step ? '이전' : o ? '접수 상세' : '목록') + '</button>'
      + '<div class="pos-toolbar-group pos-steps">' + stepNames.map(([label, value], i) => '<button type="button" class="pos-chip" data-action="pos-draft-step" data-id="' + i + '" aria-pressed="' + (d.step === i) + '">' + (i < d.step ? S.icon('circle-check') : '') + '<span data-fit="alts" data-alts="' + e(JSON.stringify([(i + 1) + ' ' + label + (value ? ' · ' + value : ''), (i + 1) + ' ' + label])) + '">' + e((i + 1) + ' ' + label + (value ? ' · ' + value : '')) + '</span></button>').join('') + '</div>';
    const next = d.step === 0 ? btn('다음 · 품목', 'pos-draft-next', '', 'primary') : d.step === 1 ? btn('다음 · 일정·장소', 'pos-draft-next', '', 'primary') : btn((o ? '추가 확정' : '접수 확정') + ' · ' + won(draftTotal()), 'pos-draft-save', '', 'primary');
    const at = people.findIndex(p => p.id === d.personId), following = d.step === 1 && people.length > 1 ? people[(at + 1) % people.length] : null;
    const foot = d.step === 0 && !o ? [d.customer.name || '고객을 찾거나 새로 입력', d.customer.phone] : d.step === 1 && people.length ? ['입력 ' + people.filter(p => d.lines.some(l => l.personId === p.id)).length + ' / ' + people.length + '명', '합계 ' + won(draftTotal())] : [name + ' 팀', people.length ? (o ? '새 일행 ' + d.people.length + '명' : '일행 ' + people.length + '명') : '', d.step === 2 ? '품목 ' + quantity + '개' : short(d.start) + ' 수령', d.step === 2 ? '할인과 결제는 다음 창에서' : ''];
    return P.page(o ? '일행·장비 추가' : '새 접수', '', body, '<span>' + e(foot.filter(Boolean).join(' · ')) + '</span><div class="so-actions">' + btn('취소', 'pos-draft-cancel') + (following ? btn('다음 일행 · ' + following.name, 'pos-draft-pick-person', following.id) : '') + next + '</div>',
      { toolbar, title: o ? '일행·장비 추가' : '', wait: (d.step + 1) + ' / 3 단계', waitLabel: '', sums: [['이번 청구', won(draftTotal())]] });
  }
  S.search('pos-orders', value => { state.query = value; P.setPage('orders', 0, { render: false }); const cursor = S.$('[data-search="pos-orders"]')?.selectionStart; S.render(); const el = S.$('[data-search="pos-orders"]'); el?.focus(); if (el && cursor != null) el.setSelectionRange(cursor, cursor); });
  S.action('pos-period', value => { state.period = value; state.date = ''; P.setPage('orders', 0, { render: false }); S.render(); });
  S.action('pos-sort', value => { state.sort = value; S.render(); });
  S.action('pos-pick-date', () => {
    const kind = S.state.page, back = ['returns', 'rentals'].includes(kind), list = rows().filter(o => keep(o, kind));
    P.calendar({ title: '날짜로 보기 · ' + (back ? '반납일' : '수령일'), selected: state.date, today: D.today, action: 'pos-pick-date-save', clear: state.date ? ['전체 날짜 보기', 'pos-pick-date-clear'] : null, count: date => list.filter(o => (back ? returnDate(o) : pickupDate(o)) === date).length });
  });
  S.action('pos-pick-date-save', value => { try { const date = value || read('listDate'); window.SkiWorkflowCommon.date(date); state.date = date; S.close(); S.render(); } catch (err) { error(err); } });
  S.action('pos-pick-date-clear', () => { state.date = ''; S.close(); S.render(); });
  S.action('pos-detail-tab', tab => { state.detailTab = tab; S.render(); });
  S.action('pos-noop', () => {});
  S.action('pos-find', () => S.go('intake'));
  S.action('pos-new', () => startDraft()); S.action('pos-add', startDraft);
  S.action('pos-draft-step', value => { captureDraft(); const target = Number(value); if (target <= state.draft.step) { state.draft.step = target; S.render(); } else S.toast('다음 버튼으로 진행'); });
  S.action('pos-draft-next', () => { captureDraft(); const d = state.draft; try { if (!d.step) { if (!d.orderId) window.SkiWorkflowCommon.customer(d.customer); } else if (!d.lines.length) throw new Error('품목을 하나 이상 담아 주세요.'); d.step++; syncDates(); S.render(); } catch (err) { error(err); } });
  S.action('pos-draft-back', () => { captureDraft(); if (state.draft.step) { state.draft.step--; S.render(); } else S.go(state.draft.orderId ? 'order-detail' : 'intake', state.draft.orderId ? { id: state.draft.orderId } : {}); });
  S.action('pos-draft-cancel', () => { const id = state.draft?.orderId; state.draft = null; S.go(id ? 'order-detail' : 'intake', id ? { id } : {}); });
  S.action('pos-date', kind => {
    captureDraft(); const d = state.draft, existing = d.orderId ? D.order(d.orderId).lines.filter(l => !l.cancelledQuantity).at(-1) : null, same = kind === 'same' && existing;
    d.start = same ? (existing.start < D.today ? D.today : existing.start) : kind === 'tomorrow' ? nextDate(D.today) : D.today; d.end = same && existing.end >= d.start ? existing.end : d.start; d.same = !!same;
    if (same) { d.pickupPlan = { ...structuredClone(existing.pickupPlan), auto: true }; d.returnPlan = { ...structuredClone(existing.returnPlan), auto: true }; d.returnOffset = Math.max(0, Math.round((Date.parse(existing.returnPlan.date) - Date.parse(existing.end)) / 86400000)); } else { delete d.pickupPlan; delete d.returnPlan; d.returnOffset = 0; }
    syncDates(); S.render();
  });
  S.action('pos-draft-target', kind => { const d = state.draft; if (kind === 'new') { if (!d.people.length) addPerson(); } else { const ids = d.people.map(p => p.id); d.people = []; d.lines = d.lines.filter(l => !ids.includes(l.personId)); d.personId = ''; } S.render(); });
  // Customer lookup by the last digits of the phone number.
  S.action('pos-find-key', key => {
    captureDraft(); const d = state.draft, f = d.find;
    if (key === 'clear') { f.digits = ''; f.results = null; }
    else if (key === 'find') { if (f.digits.length < 2) { S.toast('끝자리 숫자를 2자리 이상 눌러 주세요'); return; } f.results = findCustomers(f.digits); f.shown = f.digits; }
    else { f.digits = (f.digits.length >= 4 ? '' : f.digits) + key; if (f.digits.length === 4) { f.results = findCustomers(f.digits); f.shown = f.digits; } }
    S.render();
  });
  S.action('pos-find-pick', index => { const d = state.draft, c = d.find.results?.[Number(index)]; if (!c) return; d.customer = { name: c.name, phone: c.phone }; S.render(); });
  S.action('pos-find-new', () => { const d = state.draft; d.find = { digits: '', results: null }; d.customer = { name: '', phone: '' }; S.render(); S.$('[data-pos-input="name"]')?.focus(); });
  // People: one at a time, or many at once for groups (names stay optional).
  const peopleModal = () => P.modal('일행 인원 추가', '<p class="pos-info">실명 없이 일행 번호로 등록 · 사람별 규격은 사전입력으로 수집</p><div class="so-actions">' + [1, 2, 3, 5, 10, 30].map(n => btn(n + '명', 'pos-people-add', String(n))).join('') + '</div>' + errorBox(), btn('취소', 'close'));
  S.action('pos-people-many', peopleModal);
  S.change('pos-draft-person', value => { const d = state.draft; d.sku = read('sku'); d.unitWon = read('unitWon') === '' ? undefined : Number(read('unitWon')); d.quantity = Number(read('quantity')) || 1; d.discountWon = Number(read('discountWon')) || 0; if (value !== '__many') { d.personId = value; detailModal(); return; } d.detailAfterPeople = true; peopleModal(); });
  S.action('pos-people-add', value => { const d = state.draft, n = Number(value); try { if (draftPeople().length + n > 100) throw new Error('한 접수에는 최대 100명까지 등록할 수 있습니다.'); const first = draftPeople().length; for (let i = 0; i < n; i++) addPerson(); d.personId = d.detailAfterPeople ? '__all' : draftPeople()[first].id; S.close(); S.render(); if (d.detailAfterPeople) { d.detailAfterPeople = false; detailModal(); } } catch (err) { error(err); } });
  S.action('pos-person-add', () => { const open = !!S.$('#so-dialog[open] [data-pos-input="personId"]'); if (open) { const d = state.draft; d.sku = read('sku'); d.unitWon = read('unitWon') === '' ? undefined : Number(read('unitWon')); d.quantity = Number(read('quantity')) || 1; d.discountWon = Number(read('discountWon')) || 0; } addPerson(); S.render(); if (open) detailModal(); });
  S.action('pos-person-remove', () => { const d = state.draft, gone = d.people.pop(); if (gone) { d.lines = d.lines.filter(l => l.personId !== gone.id); if (d.personId === gone.id) d.personId = draftPeople().at(-1)?.id || ''; } S.render(); });
  S.action('pos-draft-pick-person', id => { state.draft.personId = id === '__team' ? '' : id; state.draft.gridPage = 0; S.render(); });
  S.action('pos-person-copy', kind => {
    const d = state.draft, people = draftPeople(), at = people.findIndex(p => p.id === d.personId), copy = (from, to) => { d.lines = d.lines.filter(l => l.personId !== to); for (const l of d.lines.filter(l => l.personId === from)) d.lines.push({ ...structuredClone(l), id: D.id('line'), personId: to }); };
    if (at < 0) return;
    if (kind === 'prev') { if (!d.lines.some(l => l.personId === people[at - 1]?.id)) { S.toast('앞사람이 고른 품목이 없습니다'); return; } copy(people[at - 1].id, people[at].id); }
    else { if (!d.lines.some(l => l.personId === d.personId)) { S.toast('먼저 이 일행의 품목을 골라 주세요'); return; } for (const p of people) if (p.id !== d.personId && !d.lines.some(l => l.personId === p.id)) copy(d.personId, p.id); }
    S.render();
  });
  // Item grid: a tap adds one. For a person the tile is on/off; custom prices, discounts and bigger numbers go through 직접 입력.
  function gridAdd(id, delta) {
    const d = state.draft, product = sku(id), personId = draftPeople().length ? d.personId || null : null, line = d.lines.find(l => l.sku === id && (l.personId || null) === personId && !l.price.discountWon);
    if (line) { line.quantity += personId && delta > 0 ? -line.quantity : delta; if (line.quantity < 1) d.lines = d.lines.filter(l => l !== line); return true; }
    if (delta < 0) return true;
    const unitWon = rateOf(id); if (unitWon == null) { d.sku = id; d.unitWon = undefined; d.quantity = 1; d.discountWon = 0; return false; }
    d.lines.push({ id: D.id('line'), sku: id, personId, quantity: 1, start: d.start, end: product.kind === 'liftTicket' ? d.start : d.end, price: { unitWon, discountWon: 0 } }); return true;
  }
  const ticketModal = () => { const d = state.draft, personId = draftPeople().length ? d.personId || '' : ''; P.modal('리프트권 · 권종 선택', '<div class="pos-draft-rows">' + products().filter(s => s.kind === 'liftTicket').map(s => { const n = quantityOf(s.id, personId), rate = rateOf(s.id); return '<div class="pos-draft-row"><div><strong>' + e(s.label) + '</strong><span>' + e(rate == null ? '요금 확인' : won(rate)) + '</span></div><div class="pos-stepper"><button type="button" class="so-button pos-button" data-action="pos-ticket-step" data-id="' + e(s.id) + ':-1" aria-label="' + e(s.label + ' 줄이기') + '"' + (n ? '' : ' disabled') + '>−</button><b>' + n + '</b><button type="button" class="so-button pos-button" data-action="pos-ticket-step" data-id="' + e(s.id) + ':1" aria-label="' + e(s.label + ' 늘리기') + '">+</button></div></div>'; }).join('') + '</div>' + errorBox(), btn('닫기', 'close', '', 'primary')); };
  S.action('pos-grid-add', id => { if (gridAdd(id, 1)) S.render(); else { S.render(); detailModal(); error('요금표에 단가가 없습니다. 단가를 입력해 주세요.'); } });
  S.action('pos-grid-tickets', ticketModal);
  S.action('pos-ticket-step', value => { const [id, delta] = value.split(':'), d = state.draft, personId = draftPeople().length ? d.personId || null : null, line = d.lines.find(l => l.sku === id && (l.personId || null) === personId); if (line && Number(delta) < 0) { line.quantity--; if (line.quantity < 1) d.lines = d.lines.filter(l => l !== line); } else if (Number(delta) > 0) { if (line) line.quantity++; else if (!gridAdd(id, 1)) { S.render(); detailModal(); return; } } S.render(); ticketModal(); });
  S.action('pos-grid-page', delta => { state.draft.gridPage = Math.max(0, (state.draft.gridPage || 0) + Number(delta)); S.render(); });
  S.action('pos-draft-line-page', delta => { state.draft.linePage = Math.max(0, (state.draft.linePage || 0) + Number(delta)); S.render(); });
  S.action('pos-line-step', value => { const [id, delta] = value.split(':'), d = state.draft, line = d.lines.find(l => l.id === id); if (!line) return; line.quantity += Number(delta); if (line.quantity < 1) d.lines = d.lines.filter(l => l !== line); if (line.quantity > 500) line.quantity = 500; S.render(); });
  // 직접 입력: the full form (target, product, quantity, unit price, discount) for anything the grid cannot express.
  function detailModal() {
    const d = state.draft, people = draftPeople();
    P.modal('품목 직접 입력', '<div class="pos-form-grid">' + select('대상 일행', 'personId', [['', '팀 공용'], ...people.map(p => [p.id, p.name]), ...(people.length > 1 ? [['__all', '전체 일행 · 사람마다 같은 품목']] : []), ['__many', '일행 여러 명 한 번에 추가…']], d.personId) + select('추가할 품목', 'sku', products().map(s => [s.id, s.label]), d.sku || 'ski')
      + input(d.personId === '__all' ? '일행 한 명당 수량' : '실제 물품 수량', 'quantity', d.quantity || 1, 'number', 'min="1" max="500" inputmode="numeric"') + input('단가 (원)', 'unitWon', d.unitWon ?? '', 'number', 'min="0" inputmode="numeric" placeholder="요금 확인"') + input(d.personId === '__all' ? '일행 한 명당 할인 (원)' : '이번 품목 할인 (원)', 'discountWon', d.discountWon || 0, 'number', 'min="0" inputmode="numeric"') + '</div>' + errorBox(), btn('취소', 'close') + btn('새 일행 추가', 'pos-person-add') + btn('이번 내역에 담기', 'pos-line-add', '', 'primary'));
  }
  S.action('pos-line-detail', () => { const d = state.draft; if (d.unitWon === undefined) d.unitWon = rateOf(d.sku || 'ski'); detailModal(); });
  S.change('pos-draft-sku', value => { const d = state.draft; d.sku = value; d.personId = read('personId') || ''; d.quantity = Number(read('quantity')) || 1; d.discountWon = Number(read('discountWon')) || 0; d.unitWon = rateOf(value); detailModal(); });
  S.action('pos-line-add', () => {
    try {
      const d = state.draft, product = sku(read('sku')), quantity = Number(read('quantity')), unitWon = Number(read('unitWon')), discountWon = Number(read('discountWon'));
      if (!read('unitWon')) throw new Error('요금표의 단가를 확인해 주세요. 무료인 경우 0원을 입력하세요.');
      window.SkiWorkflowCommon.integer(quantity, 1, 500); window.SkiWorkflowCommon.integer(unitWon, 0, Number.MAX_SAFE_INTEGER); window.SkiWorkflowCommon.integer(discountWon, 0, Number.MAX_SAFE_INTEGER);
      const line = { id: D.id('line'), sku: product.id, personId: read('personId') || null, quantity, start: d.start, end: product.kind === 'liftTicket' ? d.start : d.end, price: { unitWon, discountWon } };
      if (amount(line) < 0 || !Number.isSafeInteger(amount(line))) throw new Error('수량·기간·금액과 할인을 확인해 주세요.');
      const targets = line.personId === '__all' ? draftPeople().map(p => p.id) : [line.personId]; if (!targets.length || line.personId === '__many') throw new Error('대상 일행을 선택해 주세요.'); for (const personId of targets) d.lines.push({ ...line, id: D.id('line'), personId });
      d.personId = line.personId === '__all' ? draftPeople()[0].id : line.personId || ''; d.sku = line.sku; d.unitWon = unitWon; d.quantity = 1; d.discountWon = 0; S.close(); S.render();
    } catch (err) { error(err); }
  });
  // Step 3 options. Anything beyond the buttons (another date, time, vehicle or place) opens the existing schedule window.
  const pickPlan = value => {
    const d = state.draft, at = value.indexOf(':'), kind = value.slice(0, at), id = value.slice(at + 1), settings = settingsOf(); syncDates();
    if (kind === 'day') { setDates(id, dayCount(d)); if (id !== D.today && (!d.pickupPlan.time || d.pickupPlan.now)) { d.pickupPlan.time = '09:00'; d.pickupPlan.now = false; } d.same = false; }
    else if (kind === 'days') setDates(d.start, Number(id));
    else if (kind === 'time') { const now = id === 'now', vehicle = d.pickupPlan.method === 'delivery'; d.pickupPlan.now = now; d.pickupPlan.time = now ? (vehicle ? nowTime() : null) : id; }
    else if (kind === 'place') { const p = d.pickupPlan, r = d.returnPlan; if (!id) { p.method = 'shop'; p.place = '매장'; delete p.vehicleId; if (p.now) p.time = null; r.method = 'direct'; r.place = '매장'; delete r.vehicleId; } else { const vehicleId = p.vehicleId || settings.vehicles[0]?.id; if (!vehicleId) { S.toast('매장 설정에 차량을 먼저 등록해 주세요'); return; } p.method = 'delivery'; p.place = id; p.vehicleId = vehicleId; if (!p.time) { p.time = nowTime(); p.now = true; } r.method = 'vehicle'; r.place = id; r.vehicleId = r.vehicleId || vehicleId; } }
    else if (kind === 'return') { const t = settings.returnTimes.find(row => row.id === id); if (!t) return; d.returnOffset = t.dayOffset || 0; d.returnPlan.time = t.time; d.returnPlan.auto = true; d.returnPlan.date = addDays(d.end, d.returnOffset); }
    S.close(); S.render();
  };
  S.action('pos-plan-pick', pickPlan);
  // Pickup place window (S06): area chips, places as big buttons three across, paged when an area has more than nine.
  let placePick = null;
  function placeWindow() {
    const areas = settingsOf().areas || [], area = areas.find(row => row.id === placePick.areaId) || areas[0], per = 9, count = Math.max(1, Math.ceil((area?.places.length || 0) / per)), index = Math.min(placePick.page, count - 1);
    const cells = (area?.places || []).slice(index * per, index * per + per).map(place => '<button type="button" class="so-button pos-button pos-option pos-place" data-action="pos-place-choose" data-id="' + e(place) + '" aria-pressed="' + (placePick.place === place) + '"><span data-fit="words">' + e(shortPlace(place, area)) + '</span></button>').join('');
    P.modal('수령 장소 · ' + (area?.name || ''), '<div class="pos-choice">' + areas.map(row => '<button type="button" class="so-button pos-button pos-option" data-action="pos-place-area" data-id="' + e(row.id) + '" aria-pressed="' + (row.id === area?.id) + '">' + e(row.name + ' ' + row.places.length) + '</button>').join('') + '</div>'
      + (cells ? '<div class="pos-place-grid">' + cells + '</div>' : '<p class="pos-info">이 구역에 등록한 장소가 없습니다 · 매장 설정에서 추가</p>')
      + '<div class="pos-panel-foot"><span>' + e((area?.name || '') + ' ' + (area?.places.length || 0) + '곳 · 장소는 매장 설정에서 추가') + '</span>' + miniPager('pos-place-page', index, count) + '</div>' + errorBox(),
      btn('취소', 'close') + btn('직접 입력', 'pos-draft-plan', 'pickup-place') + btn('매장 수령으로', 'pos-plan-pick', 'place:') + btn('이 장소로 선택', 'pos-place-save', '', 'primary'), '차량이 배달하고 수거하는 장소');
  }
  S.action('pos-place-open', id => { const d = state.draft; syncDates(); placePick = { areaId: id || areaOfPlace(d.pickupPlan.place)?.id || '', place: d.pickupPlan.method === 'delivery' ? d.pickupPlan.place : '', page: 0 }; placeWindow(); });
  S.action('pos-place-area', id => { placePick.areaId = id; placePick.page = 0; placeWindow(); });
  S.action('pos-place-page', delta => { placePick.page = Math.max(0, placePick.page + Number(delta)); placeWindow(); });
  S.action('pos-place-choose', place => { placePick.place = place; placeWindow(); });
  S.action('pos-place-save', () => { if (!placePick.place) { error('장소를 하나 골라 주세요.'); return; } pickPlan('place:' + placePick.place); });
  S.action('pos-return-open', () => { const d = state.draft, presets = settingsOf().returnTimes; P.modal('반납 시간', '<div class="pos-place-grid">' + presets.map(t => '<button type="button" class="so-button pos-button pos-option is-two pos-place" data-action="pos-plan-pick" data-id="return:' + e(t.id) + '" aria-pressed="' + (d.returnPlan?.time === t.time && (d.returnOffset || 0) === (t.dayOffset || 0)) + '"><span>' + e(t.label) + '</span><b>' + e(t.time) + '</b></button>').join('') + '</div>', btn('취소', 'close') + btn('직접 입력', 'pos-draft-plan', 'return'), '반납 타임은 매장 설정에서 추가'); });
  S.action('pos-draft-dates', () => P.calendar({ title: '수령일 선택', selected: state.draft.start, today: D.today, action: 'pos-draft-start' }));
  S.action('pos-draft-start', date => { const d = state.draft; if (date < D.today) { S.toast('오늘 이후 날짜를 골라 주세요'); return; } setDates(date, dayCount(d)); d.same = false; if (date !== D.today && d.pickupPlan && (!d.pickupPlan.time || d.pickupPlan.now)) { d.pickupPlan.time = '09:00'; d.pickupPlan.now = false; } S.close(); S.render(); });
  const daysModal = n => P.modal('이용 일수', '<div class="pos-stepper is-large"><button type="button" class="so-button pos-button" data-action="pos-draft-days" data-id="' + (n - 1) + '" aria-label="하루 줄이기"' + (n > 1 ? '' : ' disabled') + '>−</button><b>' + n + '</b><span>일</span><button type="button" class="so-button pos-button" data-action="pos-draft-days" data-id="' + (n + 1) + '" aria-label="하루 늘리기"' + (n < 30 ? '' : ' disabled') + '>+</button></div><p class="pos-info">' + e(short(state.draft.start) + ' ~ ' + short(addDays(state.draft.start, n - 1)) + ' 이용') + '</p>', btn('취소', 'close') + btn(n + '일 적용', 'pos-plan-pick', 'days:' + n, 'primary'));
  S.action('pos-draft-days-open', () => daysModal(Math.max(4, dayCount(state.draft))));
  S.action('pos-draft-days', value => daysModal(Math.max(1, Math.min(30, Number(value)))));
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
  function applyPlan() { capturePlan(); const v = planEdit.value, pickup = planEdit.kind === 'pickup'; window.SkiWorkflowCommon.date(v.date); window.SkiWorkflowCommon.time(v.time); const dates = state.draft.lines.map(l => pickup ? l.start : l.end).sort(); if (pickup ? v.date > dates[0] : v.date < dates.at(-1)) throw new Error(pickup ? '이용 시작일 이전으로 수령일을 선택하세요.' : '이용 종료일 이후로 반납일을 선택하세요.'); if (['delivery','vehicle'].includes(v.method)) { window.SkiWorkflowCommon.id(v.vehicleId); window.SkiWorkflowCommon.string(v.place); } else { delete v.vehicleId; v.place = '매장'; } v.auto = false; v.now = false; state.draft[planEdit.kind + 'Plan'] = structuredClone(v); if (planEdit.kind === 'return') state.draft.returnOffset = Math.max(0, Math.round((Date.parse(v.date) - Date.parse(state.draft.end)) / 86400000)); }
  S.action('pos-draft-plan', id => planModal(id === 'return' ? 'return' : 'pickup'));
  S.change('pos-plan-method', value => { capturePlan(); planEdit.value.method = value; drawPlan(); });
  S.action('pos-plan-switch', kind => { try { applyPlan(); planModal(kind); } catch (err) { error(err); } });
  S.action('pos-plan-save', () => { try { applyPlan(); S.close(); S.render(); } catch (err) { error(err); } });
  S.action('pos-line-remove', id => { state.draft.lines = state.draft.lines.filter(l => l.id !== id); S.render(); });
  // 접수 완료 창 (P33): the receipt number and what was booked, with the usual next steps.
  function doneModal(id, summary) {
    const o = D.order(id); if (!o) return; const pending = sizePending(o);
    const row = (k, parts, fit = 'parts', tone = '') => '<div><dt>' + e(k) + '</dt><dd data-tone="' + tone + '" data-fit="' + fit + '" data-parts="' + e(JSON.stringify(parts.filter(Boolean))) + '">' + e(parts.filter(Boolean).join(' · ')) + '</dd></div>';
    P.modal('접수 완료 · ' + (o.receiptNo || o.id), '<dl class="pos-summary-list is-done">' + row('대표자', [o.customer.name + ' 팀', o.people.length ? o.people.length + '명' : '']) + row('대여 품목', summary.items, 'items') + row('일정', [summary.pickup + ' 수령', summary.back + ' 반납']) + row('수납', summary.paid?.length ? summary.paid : ['나중에 수납 · 미수 ' + won(summary.total)], 'parts', summary.paid?.length ? '' : 'orange') + row('사이즈 입력', [pending ? pending + '명 미입력' : '입력할 일행 없음'], 'parts', pending ? 'orange' : '') + '</dl>'
      + '<div class="pos-summary-total"><span>합계</span><b>' + e(won(summary.total)) + '</b></div>', (pending ? btn('사이즈 입력 요청', 'pos-preinput', o.id) : '') + btn('접수 상세', 'close') + go('접수 목록', 'intake', '', 'primary'));
  }
  // 접수 확정 창 (S07R · docs/44): gear and lift tickets are settled separately — one discount each (never stacked) and their own payment method.
  const methodNames = { card: '카드', cash: '현금', transfer: '계좌이체' };
  function confirmMath(d) {
    const c = d.confirm, presets = settingsOf().discounts || [], days = dayCount(d), perUnit = Object.fromEntries(presets.filter(row => row.kind === 'perUnit').map(row => [row.sku, row.amountWon]));
    const rows = d.lines.map(l => ({ id: l.id, sku: l.sku, quantity: l.quantity, unitWon: l.price.unitWon, days, ticket: isLift(l) }));
    const gear = c.gear.kind === 'perUnit' ? { kind: 'perUnit', perUnit } : c.gear.kind === 'percent' && c.gear.percent ? { kind: 'percent', percent: c.gear.percent } : c.gear.kind === 'amount' && c.gear.amountWon ? { kind: 'amount', amountWon: c.gear.amountWon } : { kind: 'none' };
    const result = window.SkiWorkflowManagement.applyDiscounts(rows, { gear, lift: { percent: c.lift.percent || 0 } }), manual = l => l.price.discountWon || 0, gross = l => amount(l) + manual(l);
    const cut = l => Math.min(gross(l), manual(l) + result.lines[l.id]), part = lift => { const list = d.lines.filter(l => isLift(l) === lift), grossWon = list.reduce((n, l) => n + gross(l), 0), discountWon = list.reduce((n, l) => n + cut(l), 0); return { list, grossWon, discountWon, dueWon: grossWon - discountWon }; };
    return { cut, gear: part(false), lift: part(true), perUnit };
  }
  function confirmWindow() {
    const d = state.draft, c = d.confirm, o = d.orderId ? D.order(d.orderId) : null, name = o?.customer.name || d.customer.name, m = confirmMath(d), presets = settingsOf().discounts || [], total = m.gear.dueWon + m.lift.dueWon;
    const pick = (label, part, value, on, sub) => '<button type="button" class="so-button pos-button pos-option' + (sub ? ' is-two' : '') + '" data-action="pos-confirm-discount" data-id="' + part + ':' + value + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + (sub ? '<span>' + e(label) + '</span><b>' + e(sub) + '</b>' : e(label)) + '</button>';
    const methods = part => '<div class="pos-choice">' + Object.entries(methodNames).map(([id, text]) => '<button type="button" class="so-button pos-button pos-option" data-action="pos-confirm-method" data-id="' + part + ':' + id + '" aria-pressed="' + (c[part + 'Method'] === id) + '">' + text + '</button>').join('') + '</div>';
    const card = (title, part, p, buttons) => '<section class="pos-confirm-card"><div class="pos-confirm-head"><strong>' + title + '</strong><b>' + e(won(p.grossWon)) + '</b></div><span class="pos-confirm-label">할인</span><div class="pos-choice">' + buttons + '</div>'
      + '<div class="pos-confirm-line"><span data-fit="items" data-parts="' + e(JSON.stringify(itemsSummary(p.list))) + '">' + e(itemsSummary(p.list).join(' · ')) + '</span><b>' + (p.discountWon ? '−' + e(won(p.discountWon)) : '할인 없음') + '</b></div><span class="pos-confirm-label">결제 수단</span>' + methods(part) + '<div class="pos-confirm-due"><span>받을 금액</span><b>' + e(won(p.dueWon)) + '</b></div></section>';
    const perUnitText = Object.keys(m.perUnit).length ? '하루 ' + won(Math.max(...Object.values(m.perUnit))) : '설정 없음', liftPresets = presets.filter(row => row.kind === 'liftPercent').slice(0, 3);
    const gearButtons = pick('없음', 'gear', 'none', c.gear.kind === 'none') + pick('장비당 할인', 'gear', 'perUnit', c.gear.kind === 'perUnit', perUnitText) + pick('% 할인', 'gear', 'percent', c.gear.kind === 'percent', c.gear.kind === 'percent' ? c.gear.percent + '%' : '선택') + pick('금액 할인', 'gear', 'amount', c.gear.kind === 'amount', c.gear.kind === 'amount' ? won(c.gear.amountWon) : '선택');
    const liftCustom = c.lift.percent && !liftPresets.some(row => row.percent === c.lift.percent), liftButtons = pick('없음', 'lift', '0', !c.lift.percent) + liftPresets.map(row => pick(row.percent + '%', 'lift', String(row.percent), c.lift.percent === row.percent)).join('') + (liftCustom || !liftPresets.length || presets.filter(row => row.kind === 'liftPercent').length > 3 ? pick(liftCustom ? c.lift.percent + '%' : '직접', 'lift', 'choose', !!liftCustom) : '');
    const paid = {}; for (const part of ['gear', 'lift']) if (m[part].dueWon) paid[c[part + 'Method']] = (paid[c[part + 'Method']] || 0) + m[part].dueWon;
    const summary = ['할인 ' + won(m.gear.discountWon + m.lift.discountWon), ...Object.entries(paid).map(([id, value]) => methodNames[id] + ' ' + won(value))];
    P.modal(name + ' 팀 · ' + (o ? '추가 확정' : '접수 확정'), '<div class="pos-confirm-cards' + (m.gear.list.length && m.lift.list.length ? '' : ' is-one') + '">' + (m.gear.list.length ? card('장비 대여', 'gear', m.gear, gearButtons) : '') + (m.lift.list.length ? card('리프트권', 'lift', m.lift, liftButtons) : '') + '</div>'
      + '<div class="pos-confirm-total"><span data-fit="parts" data-parts="' + e(JSON.stringify(summary)) + '">' + e(summary.join(' · ')) + '</span><span>합계</span><b>' + e(won(total)) + '</b></div>' + errorBox(),
      btn('취소', 'close') + btn('나중에 수납', 'pos-confirm-save', 'later') + btn(total ? '수납하고 ' + (o ? '추가 확정' : '접수 확정') + ' · ' + won(total) : (o ? '추가 확정' : '접수 확정'), 'pos-confirm-save', 'pay', 'primary'),
      [short(d.start) + ' 수령', dayCount(d) + '일', '품목 ' + d.lines.reduce((n, l) => n + l.quantity, 0) + '개', '할인과 결제 수단을 고르세요'].join(' · '));
    S.$('#so-dialog')?.classList.add('is-wide');
  }
  S.action('pos-draft-save', () => { const d = state.draft; if (!d) return; syncDates(); d.confirm = d.confirm || { gear: { kind: 'none' }, lift: { percent: 0 }, gearMethod: 'card', liftMethod: 'cash' }; confirmWindow(); });
  S.action('pos-confirm-method', value => { const [part, method] = value.split(':'); state.draft.confirm[part + 'Method'] = method; confirmWindow(); });
  // % and amount discounts open a small chooser with the store's presets and a direct entry; the chosen value shows on the button.
  function chooseWindow(part, kind) {
    const presets = (settingsOf().discounts || []).filter(row => row.kind === (part === 'lift' ? 'liftPercent' : kind)), percent = kind !== 'amount';
    P.modal((part === 'lift' ? '리프트권 ' : '장비 ') + (percent ? '% 할인' : '금액 할인'), (presets.length ? '<div class="pos-place-grid">' + presets.map(row => '<button type="button" class="so-button pos-button pos-option pos-place" data-action="pos-confirm-value" data-id="' + part + ':' + kind + ':' + (percent ? row.percent : row.amountWon) + '">' + e(percent ? row.percent + '%' : won(row.amountWon)) + '</button>').join('') + '</div>' : '<p class="pos-info">매장 설정 · 할인에 넣어 둔 값이 없습니다</p>')
      + '<div class="pos-form-grid">' + input(percent ? '직접 입력 (%)' : '직접 입력 (원)', 'confirmValue', '', 'number', percent ? 'min="1" max="100" inputmode="numeric"' : 'min="1" inputmode="numeric"') + '<div class="so-field">&nbsp;' + btn('이 값으로', 'pos-confirm-value', part + ':' + kind + ':input') + '</div></div>' + errorBox(), btn('‹ 접수 확정 창으로', 'pos-confirm-back'), percent ? '합계의 몇 %를 뺍니다 · 10원 미만 버림' : '장비 총 금액에서 뺍니다');
  }
  S.action('pos-confirm-back', confirmWindow);
  S.action('pos-confirm-discount', value => { const [part, kind] = value.split(':'), c = state.draft.confirm; if (part === 'lift') { if (kind === 'choose') { chooseWindow('lift', 'percent'); return; } c.lift.percent = Number(kind) || 0; } else if (kind === 'none' || kind === 'perUnit') c.gear = { kind }; else { chooseWindow('gear', kind); return; } confirmWindow(); });
  S.action('pos-confirm-value', value => { try { const [part, kind, raw] = value.split(':'), n = Number(raw === 'input' ? read('confirmValue') : raw), c = state.draft.confirm; window.SkiWorkflowCommon.integer(n, 1, kind === 'amount' ? Number.MAX_SAFE_INTEGER : 100); if (part === 'lift') c.lift.percent = n; else c.gear = kind === 'amount' ? { kind, amountWon: n } : { kind, percent: n }; confirmWindow(); } catch (err) { error(err.message?.includes('정수') || !err.message ? '값을 확인해 주세요.' : err); } });
  S.action('pos-confirm-save', async mode => {
    const d = state.draft; if (!d) return;
    try { syncDates(); const m = confirmMath(d), c = d.confirm, pickupPlan = planOut(d.pickupPlan), returnPlan = planOut(d.returnPlan);
      const lines = d.lines.map(l => ({ ...l, price: { ...l.price, discountWon: m.cut(l) }, pickupPlan, ...(isLift(l) ? {} : { returnPlan }) }));
      const batch = { id: D.id('batch'), label: d.orderId ? '추가 접수 · ' + d.start : '첫 접수', lines };
      const summary = { items: itemsSummary(d.lines), total: m.gear.dueWon + m.lift.dueWon, pickup: (short(pickupPlan.date) + ' ' + (pickupPlan.time || '')).trim(), back: short(returnPlan.date) + ' ' + returnPlan.time, paid: [] };
      const result = await D.execute(d.orderId ? 'order.add' : 'order.create', { ...(d.orderId ? { orderId: d.orderId } : { id: D.id('R'), customer: d.customer }), people: d.people, batch });
      const created = !d.orderId, payer = d.orderId ? D.order(d.orderId)?.customer.name : d.customer.name; state.draft = null; state.detailTab = 'items';
      let payError = null;
      if (mode === 'pay') for (const part of ['gear', 'lift']) { // one payment record per part, each with its own method, allocated to its own lines
        const allocations = m[part].list.map(l => ({ lineId: l.id, amountWon: amount(l) + (l.price.discountWon || 0) - m.cut(l) })).filter(row => row.amountWon > 0), amountWon = allocations.reduce((n, row) => n + row.amountWon, 0);
        if (!amountWon) continue;
        try { await D.execute('finance.payment', { id: D.id('payment'), orderId: result.orderId, kind: 'payment', amountWon, method: c[part + 'Method'], payer, allocations }); summary.paid.push(methodNames[c[part + 'Method']] + ' ' + won(amountWon)); } catch (err) { payError = err; break; }
      }
      S.go('order-detail', { id: result.orderId });
      if (payError) S.toast('접수는 저장했습니다 · 수납 기록은 실패 — 접수 상세의 수납·환불에서 다시 해 주세요');
      else if (created) doneModal(result.orderId, summary); else S.toast(summary.paid.length ? '추가 확정 · 수납 ' + summary.paid.join(' · ') : '같은 접수에 저장 완료 · 준비·지급으로 이어서 진행');
    } catch (err) { if (D.pending) { S.close(); S.render(); } error(err); } // an uncertain result must leave the header's "앞선 처리 다시 확인" reachable
  });
  S.action('pos-line', id => {
    const o = D.order(), l = o.lines.find(l => l.id === id);
    P.modal(labelOf(l) + ' · 품목 내역', '<div class="pos-confirm-summary"><strong>' + e(lineDescription(o, l)) + '</strong><span>지급 예정 ' + l.quantity + ' · 실제 지급 ' + l.issuedQuantity + ' · 매장 확인 ' + l.shopQuantity + '</span><span>수령 ' + e(l.pickupPlan.date) + ' ' + e(l.pickupPlan.method === 'shop' ? '매장' : l.pickupPlan.place) + '</span><span>반납 ' + e(l.returnPlan.date) + ' ' + e(l.returnPlan.method === 'direct' ? '매장 직접' : l.returnPlan.place) + '</span><span>' + (l.price.source ? '기존 접수 전체금액에 포함 · 행별 요금 확인 필요' : '단가 ' + won(l.price.unitWon) + ' · 확정 청구 ' + won(l.price.amountWon)) + '</span></div>', btn('닫기', 'close') + (l.unissuedQuantity ? btn('이 추가분 취소', 'pos-cancel-line', l.id) : ''));
  });
  S.action('pos-line-group', ids => {
    const o = D.order(), list = o.lines.filter(l => ids.split(',').includes(l.id));
    P.modal(labelOf(list[0]) + ' · ' + list.length + '개 행', P.pager(list, 'line-group', l => P.row((o.people.find(p => p.id === l.personId)?.name || '팀 공용') + ' · ' + itemText(l), lineState(l)[0] + ' · ' + short(l.start) + (l.end !== l.start ? '~' + short(l.currentEnd || l.end) : ''), btn('품목 보기', 'pos-line', l.id)), 4), btn('닫기', 'close'));
  });
  S.action('pos-cancel-line', async id => { try { await D.execute('order.cancel', { orderId: D.order().id, lineIds: [id], reason: '미도착·미지급 추가분 취소' }); S.close(); S.render(); S.toast('선택한 미지급 품목 취소 완료'); } catch (err) { error(err); } });
  S.posOrders = { state, labels, rows, orderList, lineDescription, lineState, itemText, items, badgeOf, cardOf, pickupDate, pickupTime, returnDate, returnTime, activeLines, sizePending, ticketsToIssue, error, errorBox, input, select, read, go, pageSize, short };
  S.register('home', { title: '오늘 할 일', pos: true, render: home });
  for (const page of ['intake', 'preparation', 'rentals', 'returns']) S.register(page, { title: { intake: '1 접수·예약', preparation: '2 준비·지급', rentals: '3 이용 중·변경', returns: '4 반납·회수' }[page], pos: true, legacy: false, render: () => listing(page) });
  S.register('order-detail', { title: '접수 상세', parent: 'rentals', pos: true, render: detail });
  S.register('order-intake', { title: '새 접수', parent: 'intake', pos: true, legacy: false, render: intake });
})();
