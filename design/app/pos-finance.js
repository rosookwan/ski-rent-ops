(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, U = S.posOrders, e = S.esc, won = S.money, b = P.button;
  const { input, select, read, error, errorBox, go } = U;
  const names = { payment: '수납', refund: '고객 환불', deposit_in: '보증금 받기', deposit_out: '보증금 반환' };
  const reasons = [['awaiting_payment', '남은 수납 확인'], ['awaiting_return', '고객 반납 기다림'], ['awaiting_shop', '차량 입고 기다림'], ['awaiting_refund', '환불·보증금 반환 확인'], ['scheduled', '다음 약속 확정'], ['other', '기타 사유']];
  const weekday = date => ['일', '월', '화', '수', '목', '금', '토'][new Date(date + 'T00:00:00').getDay()];
  const dayLabel = date => Number(date.slice(5, 7)) + '월 ' + Number(date.slice(8, 10)) + '일 ' + weekday(date) + '요일';
  let moneyDraft = null, closingDraft = null, listFilter = 'all', listQuery = '';
  function openMoney(id, kind = 'payment', resume = null) {
    const o = D.order(id), f = o.finance;
    moneyDraft = { orderId: id, kind, resume, revision: D.snapshot.revision, amountWon: kind === 'payment' ? f.dueWon : kind === 'refund' ? f.creditWon : kind === 'deposit_out' ? f.depositHeldWon : '', method: 'cash', scope: '', payer: o.customer.name, reason: '' };
    renderMoney();
  }
  function renderMoney() {
    const d = moneyDraft, o = D.order(d.orderId), f = o.finance, deposit = d.kind.startsWith('deposit'), full = d.kind === 'payment' ? f.dueWon : d.kind === 'refund' ? f.netPaidWon : d.kind === 'deposit_out' ? f.depositHeldWon : 0;
    const tabs = '<div class="pos-tabs">' + Object.entries(names).map(([kind, name]) => '<button type="button" class="so-button pos-button pos-option" data-action="pos-money-kind" data-id="' + kind + '" aria-pressed="' + (kind === d.kind) + '">' + e(name) + '</button>').join('') + '</div>';
    const scope = [['', '팀 전체 · 미배분 수납'], ...o.lines.filter(l => !l.cancelledQuantity).map(l => [l.id, (o.people.find(p => p.id === l.personId)?.name || '팀 공용') + ' · ' + (l.label || l.sku) + ' · ' + l.start.slice(5)])];
    const quick = '<div class="pos-choice">' + (full ? b('전액 ' + won(full), 'pos-money-quick', 'full') : '') + b('+50,000원', 'pos-money-quick', '50000') + b('+10,000원', 'pos-money-quick', '10000') + b('지우기', 'pos-money-quick', 'clear') + '</div>';
    P.modal(o.customer.name + ' 팀 · ' + names[d.kind], tabs + '<div class="pos-money-head"><span>' + (deposit ? '보증금 보관' : '미수') + '</span><b data-tone="' + (deposit ? 'blue' : f.dueWon ? 'red' : 'green') + '">' + e(won(deposit ? f.depositHeldWon : f.dueWon)) + '</b></div>'
      + '<div class="pos-form-grid">' + input('실제로 처리한 금액 (원)', 'moneyAmount', d.amountWon, 'number', 'min="1" inputmode="numeric"') + '<div class="so-field">처리 수단' + P.choice('moneyMethod', [['cash', '현금'], ['card', '카드 단말'], ['transfer', '계좌이체']], d.method) + '</div></div>' + quick
      + '<div class="pos-form-grid">' + input('실제 결제자 (선택)', 'payer', d.payer) + (deposit ? '<div class="pos-info">보증금은 대여료와 별도 보관</div>' : select('금액 적용 대상', 'moneyScope', scope, d.scope)) + (d.kind === 'refund' || d.kind === 'deposit_out' ? input('환불·반환 사유', 'moneyReason', d.reason || '실제 반환 확인') : '') + '</div>' + errorBox(),
      b('취소', 'pos-money-cancel') + b('금액 조정', 'pos-adjust', o.id) + b(names[d.kind] + ' 내역 확인', 'pos-money-review', '', 'primary'), (o.receiptNo || o.id) + ' · 청구 ' + won(f.chargedWon) + ' · 수납 ' + won(f.netPaidWon || 0) + (f.creditWon ? ' · 초과 수납 ' + won(f.creditWon) : ''));
  }
  S.action('pos-money-quick', value => { const el = S.$('#so-dialog[open] [data-pos-input="moneyAmount"]'); if (!el) return; const d = moneyDraft, f = D.order(d.orderId).finance, full = d.kind === 'payment' ? f.dueWon : d.kind === 'refund' ? f.netPaidWon : f.depositHeldWon; el.value = value === 'clear' ? '' : value === 'full' ? full : (Number(el.value) || 0) + Number(value); el.dispatchEvent(new Event('input', { bubbles: true })); });
  S.action('pos-money', id => openMoney(id || D.order().id));
  S.action('pos-deposit-out', id => openMoney(id, 'deposit_out'));
  S.action('pos-money-cancel', () => { const resume = moneyDraft?.resume; moneyDraft = null; S.close(); resume?.(false); });
  S.posFinance = { openMoney };
  S.action('pos-money-kind', kind => openMoney(moneyDraft.orderId, kind, moneyDraft.resume));
  S.action('pos-money-review', () => {
    try {
      const d = moneyDraft; d.amountWon = Number(read('moneyAmount')); d.method = read('moneyMethod'); d.payer = read('payer'); d.scope = read('moneyScope') || ''; d.reason = read('moneyReason') || '';
      window.SkiWorkflowCommon.integer(d.amountWon, 1, Number.MAX_SAFE_INTEGER);
      const o = D.order(d.orderId), f = o.finance;
      if (d.kind === 'refund' && d.amountWon > f.netPaidWon) throw new Error('실제 수납한 금액보다 많이 환불할 수 없습니다.');
      if (d.kind === 'deposit_out' && d.amountWon > f.depositHeldWon) throw new Error('보관 중인 보증금을 초과합니다.');
      const scope = o.lines.find(l => l.id === d.scope);
      P.modal(names[d.kind] + ' 확인', '<div class="pos-confirm-summary"><strong>' + e(o.customer.name) + ' 팀 · ' + e(o.receiptNo || o.id) + '</strong><span>' + names[d.kind] + ' ' + won(d.amountWon) + ' · ' + ({ cash: '현금', card: '외부 카드 단말', transfer: '계좌이체' }[d.method]) + '</span><span>적용: ' + e(scope ? (scope.label || scope.sku) + ' · ' + scope.start : d.kind.startsWith('deposit') ? '별도 보증금' : '팀 전체 · 미배분 금액') + '</span><span>' + (d.method === 'card' ? '외부 단말 승인·취소 완료 결과 기록' : '실제 주고받은 금액 기록') + '</span></div>' + errorBox(), b('수정', 'pos-money-edit') + b('실제 처리 확인·기록', 'pos-money-save', '', 'primary'));
    } catch (err) { error(err); }
  });
  S.action('pos-money-edit', renderMoney);
  S.action('pos-money-save', async () => {
    try { const d = moneyDraft; if (d.revision !== D.snapshot.revision) throw new Error('기록이 변경되었습니다. 금액을 다시 확인해 주세요.');
      await D.execute('finance.payment', { id: D.id('payment'), orderId: d.orderId, kind: d.kind, amountWon: d.amountWon, method: d.method, payer: d.payer, ...(d.scope ? { allocations: [{ lineId: d.scope, amountWon: d.amountWon }] } : {}), ...(d.reason ? { reason: d.reason } : {}) });
      moneyDraft = null; S.close(); S.render(); d.resume?.(true); S.toast(names[d.kind] + ' ' + won(d.amountWon) + ' 기록 완료');
    } catch (err) { error(err); }
  });
  S.action('pos-adjust', id => {
    const o = D.order(id); moneyDraft = { orderId: id, revision: D.snapshot.revision };
    P.modal('청구 금액 조정', '<div class="pos-confirm-summary"><strong>' + e(o.customer.name) + ' 팀 · 현재 청구 ' + won(o.finance.chargedWon) + '</strong><span>원래 요금 보존 · 조정 근거 별도 기록</span></div><div class="pos-form-grid">' + select('조정 방향', 'adjustDirection', [['minus', '할인·청구 감소'], ['plus', '추가 청구']], 'minus') + input('조정 금액 (원)', 'adjustAmount', '', 'number', 'min="1" inputmode="numeric"') + select('사유', 'adjustReason', [['현장 할인 확인', '현장 할인 확인'], ['취소·조기반납 환불액 확인', '취소·조기반납 비용 조정'], ['연체 비용 직원 확인', '연체 비용 직원 확인'], ['파손·분실 배상액 확인', '파손·분실 배상액 확인']], '현장 할인 확인') + '</div><p class="pos-label">조기반납·연체·파손 비용은 확인한 금액만 입력 · 환불은 실제 반환 후 별도 기록</p>' + errorBox(), b('취소', 'close') + b('조정 기록', 'pos-adjust-save', '', 'primary'));
  });
  S.action('pos-adjust-save', async () => { try { const d = moneyDraft; if (d.revision !== D.snapshot.revision) throw new Error('변경된 금액을 다시 확인해 주세요.'); const amountWon = Number(read('adjustAmount')) * (read('adjustDirection') === 'minus' ? -1 : 1); await D.execute('finance.adjustment', { id: D.id('adjust'), orderId: d.orderId, amountWon, reason: read('adjustReason') }); S.close(); S.render(); S.toast('금액 조정 기록 완료'); } catch (err) { error(err); } });
  // Closing list rows (UI v4): one 52px line per team or partner, the whole row opens its one action.
  function customerRow(o) {
    const f = o.finance, due = f.dueWon > 0;
    return P.lineRow({ name: o.customer.name + ' 팀', noteParts: [due ? U.labels[o.status] : '보증금 보관', o.receiptNo || o.id], amount: won(due ? f.dueWon : f.depositHeldWon), tone: due ? 'red' : 'blue', label: due ? '수납' : '보증금 반환', action: due ? 'pos-money' : 'pos-deposit-out', id: o.id });
  }
  function partnerRow(row) {
    const pending = row.borrowedPendingQuantity + row.lentPendingQuantity;
    return P.lineRow({ name: row.name, noteParts: ['거래처', row.receivableWon ? '받을 약정' : row.payableWon ? '줄 약정' : '실물 정산', row.agreementUnconfirmed ? '약정 확인 필요' : ''], amount: row.receivableWon ? won(row.receivableWon) : row.payableWon ? won(row.payableWon) : pending + '개', tone: row.receivableWon ? 'red' : row.payableWon ? 'orange' : 'purple', label: '장부 열기', go: { page: 'partner-detail', id: row.id } });
  }
  function closing() {
    const f = D.snapshot.finance, closed = D.snapshot.closings.find(c => c.date === D.today && !c.reopenings.length);
    const q = listQuery.replace(/[\s-]/g, '').toLowerCase(), hit = text => text.replace(/[\s-]/g, '').toLowerCase().includes(q);
    const open = D.snapshot.orders.filter(o => o.finance.dueWon > 0 || o.finance.depositHeldWon > 0), openPartners = (f.partnerBalances || []).filter(row => row.receivableWon || row.payableWon || row.borrowedPendingQuantity || row.lentPendingQuantity);
    const orders = open.filter(o => hit(o.customer.name + o.customer.phone + (o.receiptNo || o.id))), partners = openPartners.filter(row => hit(row.name));
    const dueTeams = orders.filter(o => o.finance.dueWon > 0), depositTeams = orders.filter(o => !o.finance.dueWon && o.finance.depositHeldWon > 0);
    const due = dueTeams.reduce((n, o) => n + o.finance.dueWon, 0), deposit = orders.reduce((n, o) => n + o.finance.depositHeldWon, 0), payable = partners.reduce((n, r) => n + r.payableWon, 0);
    const rows = [...(listFilter !== 'partners' ? [...dueTeams, ...depositTeams].map(customerRow) : []), ...(listFilter !== 'customers' ? partners.map(partnerRow) : [])];
    const total = dueTeams.length + depositTeams.length + partners.length;
    // The side panel always shows the whole business day, whatever the search box says.
    const dueAll = open.filter(o => o.finance.dueWon > 0), dueAllWon = dueAll.reduce((n, o) => n + o.finance.dueWon, 0), depositAll = open.reduce((n, o) => n + o.finance.depositHeldWon, 0);
    const figure = (label, value, tone = '') => '<div class="pos-side-figure"><small>' + e(label) + '</small><b data-tone="' + tone + '">' + e(value) + '</b></div>';
    const check = (state, text) => '<li data-state="' + state + '">' + S.icon(state === 'done' ? 'circle-check' : 'circle') + '<span>' + e(text) + '</span></li>';
    const side = '<aside class="pos-panel pos-side" aria-label="오늘 마감 준비"><div class="pos-side-head"><strong>오늘 마감 준비</strong><span>' + e(Number(D.today.slice(5, 7)) + '월 ' + Number(D.today.slice(8, 10)) + '일 (' + weekday(D.today) + ')') + '</span></div>'
      + figure('오늘 수납', won(f.paymentWon || 0), 'green') + figure('미수', won(dueAllWon), dueAllWon ? 'red' : '') + figure('보증금 보관', won(depositAll), 'blue') + figure('예상 현금', won((f.openingCashWon || 0) + (f.cashMovementWon || 0)))
      + '<ul class="pos-checks">' + check(openPartners.length ? 'todo' : 'done', '거래처 미정산 ' + openPartners.length + '건') + check(dueAll.length ? 'todo' : 'done', dueAll.length ? '미수 ' + dueAll.length + '건 · 내일로 이월' : '미수 없음') + check(closed ? 'done' : 'wait', closed ? '오늘 마감 확정' : '현금 대조 전') + '</ul></aside>';
    const list = P.cards([{ cards: rows }], { fixed: true, lines: true, signature: [listFilter, listQuery].join('|'), empty: listQuery ? '검색 결과 없음' : '정산 대기 없음', emptyNote: closed ? '오늘 마감 확정' : '오늘 수납·미수 없음' });
    const toolbar = P.search('pos-closing-search', listQuery, '고객 · 거래처 · 접수번호') + P.toolbarLabel('영업일 ' + D.today.slice(5).replace('-', '/'))
      + P.group(P.chip('전체', 'pos-closing-filter', 'all', listFilter === 'all', total) + P.chip('고객', 'pos-closing-filter', 'customers', listFilter === 'customers', dueTeams.length + depositTeams.length) + P.chip('거래처', 'pos-closing-filter', 'partners', listFilter === 'partners', partners.length))
      + P.group(P.chipGo('마감 이력', 'closing-history'));
    return P.page('5 정산·마감', '', '<div class="pos-split"><div class="pos-panel">' + list + '</div>' + side + '</div>',
      '<span>' + e('정산 대기 ' + total + '건 · 미수 ' + won(due) + ' · 미지급 ' + won(payable) + ' · 보증금 ' + won(deposit)) + '</span><div class="so-actions">' + b('현금 입출금', 'pos-cash') + b('거래처 미정산 확인', 'pos-closing-partners') + (closed ? b('마감표 확인', 'pos-closing-view', closed.id, 'primary') : b('마감 확정', 'pos-closing-start', '', 'primary')) + '</div>',
      { toolbar, wait: total ? total + '건' : '없음', sums: [['오늘 수납', won(f.paymentWon || 0), 'green'], ['고객 환불', won(f.refundWon || 0)], ['현금 증감', won(f.cashMovementWon || 0), (f.cashMovementWon || 0) < 0 ? 'red' : '']] });
  }
  S.search('pos-closing-search', value => { listQuery = value; const cursor = S.$('[data-search="pos-closing-search"]')?.selectionStart; S.render(); const el = S.$('[data-search="pos-closing-search"]'); el?.focus(); if (el && cursor != null) el.setSelectionRange(cursor, cursor); });
  S.action('pos-closing-filter', value => { listFilter = value; S.render(); });
  function closingHistory() {
    const closings = D.snapshot.closings.slice().sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)), today = D.today;
    const openToday = !closings.some(c => c.date === today && !c.reopenings.length);
    const handover = (D.snapshot.finance.handoverDefaults || []).length;
    const pending = openToday ? [P.orderCard({ tone: 'red', badge: ['마감 대기', 'red'], name: dayLabel(today), metaParts: ['오늘', '마감 전'], itemFit: 'parts', itemParts: ['오늘 수납 ' + won(D.snapshot.finance.paymentWon || 0), '현금 증감 ' + won(D.snapshot.finance.cashMovementWon || 0)], money: ['미처리 인계 ' + handover + '팀', handover ? 'orange' : 'grey'], actions: b('마감 확정', 'pos-closing-start', '', 'primary') })] : [];
    const done = closings.map(c => P.orderCard({ id: c.id, tone: c.reopenings.length ? 'orange' : 'green', badge: c.reopenings.length ? ['재개됨', 'orange'] : ['마감 완료', 'green'], name: dayLabel(c.date), metaParts: [c.at.slice(11, 16) + ' 확정', '처리자 ' + c.actor.id, '인계 ' + c.snapshot.handover.length + '팀'],
      itemFit: 'parts', itemParts: ['실제 ' + won(c.countedCashWon), '예상 ' + won(c.expectedCashWon)], state: c.differenceWon ? ['차이 ' + won(c.differenceWon), 'red'] : ['현금 일치', 'green'], money: [c.differenceWon ? (c.differenceReason || '차이 사유 없음') : '현금 일치', c.differenceWon ? 'red' : 'green'], actions: b('마감표 확인', 'pos-closing-view', c.id) }));
    return P.page('마감 이력', '', P.cards([{ title: '마감 대기', sub: pending.length + '일', cards: pending }, { title: '마감 완료', sub: closings.length + '일', cards: done }], { fixed: true, signature: 'closings', empty: '마감 기록 없음' }),
      '<span>' + e('마감 대기 ' + pending.length + '일 · 마감 기록 ' + closings.length + '일') + '</span><div class="so-actions">' + go('정산·마감', 'closing') + '</div>',
      { toolbar: P.toolbarLabel('날짜별 마감 기록 · 사장 확인용'), wait: pending.length ? '마감 ' + pending.length + '일' : '없음', sums: [['마감 기록', closings.length + '일'], ['이번 미수', won(D.snapshot.orders.reduce((n, o) => n + o.finance.dueWon, 0)), 'red']] });
  }
  function captureClosing() {
    if (!closingDraft) return;
    for (const key of ['openingCashWon', 'countedCashWon']) if (read(key) !== undefined) closingDraft[key] = read(key) === '' ? '' : Number(read(key));
    if (read('differenceReason') !== undefined) closingDraft.differenceReason = read('differenceReason');
    const row = closingDraft.handover[closingDraft.index];
    if (row && read('handoverReason') !== undefined) Object.assign(row, { reason: read('handoverReason'), assignee: read('assignee'), nextDate: read('nextDate') || null, note: read('handoverNote') });
  }
  function closingDifference() {
    if (!closingDraft) return;
    const d = closingDraft, expected = Number(d.openingCashWon) + D.snapshot.finance.cashMovementWon;
    const amount = S.$('[data-closing-expected]'), difference = S.$('[data-closing-difference]');
    if (amount) amount.textContent = won(expected);
    if (difference) { const value = d.countedCashWon === '' ? null : Number(d.countedCashWon) - expected; difference.textContent = value === null ? '실사 전' : won(Math.abs(value)) + (value < 0 ? ' 부족' : value > 0 ? ' 초과' : ' 일치'); difference.dataset.tone = value ? 'red' : 'green'; }
  }
  function showClosing() {
    const d = closingDraft; if (!d) return; const report = D.snapshot.finance;
    const steps = '<div class="pos-a3-steps">' + ['현금 대조', '미처리 이월', '확정'].map((name, index) => '<span' + (d.step === index ? ' aria-current="step"' : '') + '>' + (index + 1) + ' ' + name + '</span>').join('') + '</div>';
    let body;
    if (d.step === 0) body = '<dl class="pos-a3-ledger"><div><dt>예상 현금</dt><dd class="is-amount" data-closing-expected></dd>' + b('시작 현금', 'pos-closing-opening') + '</div></dl>'
      + '<input type="hidden" data-pos-input="openingCashWon" value="' + e(d.openingCashWon) + '">'
      + '<div class="pos-a3-inline">' + input('실제 금고 현금', 'countedCashWon', d.countedCashWon, 'number', 'min="0" inputmode="numeric"') + '</div>'
      + '<dl class="pos-a3-ledger"><div><dt>차이</dt><dd class="is-amount" data-closing-difference></dd></div></dl>'
      + '<div class="pos-option-row pos-a3-difference"><span>현금 차이 처리</span><div class="pos-a2-options">' + b('현금 재확인', 'pos-closing-recount', '', 'pos-option') + '<button type="button" class="so-button pos-button pos-option" data-action="pos-closing-reason-edit" aria-pressed="' + Boolean(d.differenceReason.trim()) + '"><span data-fit="auto">' + e(d.differenceReason.trim() ? '차이 기록 · ' + d.differenceReason.trim() : '차이 기록') + '</span></button></div></div>'
      + '<input type="hidden" data-pos-input="differenceReason" value="' + e(d.differenceReason) + '">';
    else if (d.step === 1) {
      const row = d.handover[d.index];
      body = '<div class="pos-option-row"><span>다음에 할 일</span>' + b(reasons.find(([id]) => id === row.reason)?.[1] || '사유 선택', 'pos-closing-reason') + '<input type="hidden" data-pos-input="handoverReason" value="' + e(row.reason || '') + '"></div>'
        + '<div class="pos-a3-inline">' + input('담당자', 'assignee', row.assignee || '') + input('다음 확인일', 'nextDate', row.nextDate || D.today, 'date') + input('메모 (기타 필수)', 'handoverNote', row.note || '') + '</div>';
    } else body = '<dl class="pos-a3-ledger">' + [['예상 현금', won(Number(d.openingCashWon) + report.cashMovementWon)], ['실제 현금', won(d.countedCashWon)], ['차이', won(d.countedCashWon - d.openingCashWon - report.cashMovementWon)], ['미처리 이월', d.handover.length + '팀']].map(([name, value]) => '<div><dt>' + name + '</dt><dd class="is-amount">' + e(value) + '</dd></div>').join('') + '</dl><p class="pos-a3-note">마감표 보존 · 반납·정비 진행 상태는 별도</p>';
    P.modal(Number(D.today.slice(5, 7)) + '월 ' + Number(D.today.slice(8, 10)) + '일 마감 확정 · 미처리 ' + d.handover.length + '팀', '<section class="pos-a3-form pos-a3-closing">' + steps + body + '</section>' + errorBox(),
      '<div class="pos-fulfillment-extra">' + b('거래처 미정산 확인', 'pos-closing-partners') + '</div>' + b('취소', 'pos-closing-cancel') + (d.step ? b('이전', 'pos-closing-back') : '') + b(d.step === 0 ? (d.handover.length ? '다음 · 미처리 이월' : '다음 · 확정') : d.step === 1 ? (d.index + 1 < d.handover.length ? '다음 팀' : '다음 · 확정') : '오늘 마감 확정', d.step < 2 ? 'pos-closing-next' : 'pos-closing-save', '', 'primary'), (d.step + 1) + ' / 3 단계 · ' + (d.step === 1 ? d.handover[d.index].customer.name + ' · ' + (d.index + 1) + '/' + d.handover.length + '팀 · 미수 ' + won(d.handover[d.index].dueWon) : ['현금 대조', '', '마감 확인'][d.step]));
    S.$('#so-dialog .pos-modal-sub').dataset.fit = 'auto'; P.fitPage(S.$('#so-dialog')); closingDifference();
  }
  function renderClosing() { queueMicrotask(showClosing); return closing(); }
  S.root.addEventListener('input', event => { if (event.target.closest('.pos-a3-closing')) { captureClosing(); closingDifference(); } });
  S.root.addEventListener('ski:close-dialogs', () => { closingDraft = null; });
  S.action('pos-closing-cancel', () => { closingDraft = null; S.go('closing'); });
  S.action('pos-closing-resume', showClosing);
  S.action('pos-closing-recount', () => S.$('[data-pos-input="countedCashWon"]')?.focus());
  S.action('pos-closing-reason-edit', () => { captureClosing(); P.modal('현금 차이 기록', input('차이 사유', 'closingDifferenceReason', closingDraft.differenceReason) + errorBox(), b('돌아가기', 'pos-closing-resume') + b('선택 적용', 'pos-closing-reason-save', '', 'primary')); });
  S.action('pos-closing-reason-save', () => { closingDraft.differenceReason = String(read('closingDifferenceReason') || '').trim(); showClosing(); });
  S.action('pos-closing-opening', () => { captureClosing(); P.modal('시작 현금 확인', input('시작 현금', 'closingOpening', closingDraft.openingCashWon, 'number', 'min="0" inputmode="numeric"') + errorBox(), b('돌아가기', 'pos-closing-resume') + b('선택 적용', 'pos-closing-opening-save', '', 'primary')); });
  S.action('pos-closing-opening-save', () => { try { const value = Number(read('closingOpening')); window.SkiWorkflowCommon.integer(value, 0, Number.MAX_SAFE_INTEGER); closingDraft.openingCashWon = value; showClosing(); } catch (err) { error(err); } });
  S.action('pos-closing-reason', () => { captureClosing(); P.modal('다음에 할 일', '<div class="pos-a3-options">' + reasons.map(([id, name]) => b(name, 'pos-closing-pick-reason', id)).join('') + '</div>', b('돌아가기', 'pos-closing-resume')); });
  S.action('pos-closing-pick-reason', value => { closingDraft.handover[closingDraft.index].reason = value; showClosing(); });
  S.action('pos-closing-start', () => { const f = D.snapshot.finance; closingDraft = { step: 0, index: 0, revision: D.snapshot.revision, openingCashWon: f.openingCashWon || 0, countedCashWon: '', differenceReason: '', handover: structuredClone(f.handoverDefaults || []) }; showClosing(); });
  S.action('pos-closing-next', () => {
    captureClosing(); const d = closingDraft;
    try {
      if (d.step === 0) { window.SkiWorkflowCommon.integer(d.countedCashWon, 0, Number.MAX_SAFE_INTEGER); if (d.countedCashWon - d.openingCashWon - D.snapshot.finance.cashMovementWon && !d.differenceReason.trim()) throw new Error('현금 차이의 사유를 입력해 주세요.'); d.step = d.handover.length ? 1 : 2; }
      else { const row = d.handover[d.index]; if (!row.reason || !row.assignee || row.reason === 'other' && !row.note) throw new Error('새 인계 사유와 담당자를 확인해 주세요.'); if (++d.index >= d.handover.length) d.step = 2; }
      showClosing();
    } catch (err) { error(err); }
  });
  S.action('pos-closing-back', () => { captureClosing(); const d = closingDraft; if (d.step === 2) { d.step = d.handover.length ? 1 : 0; d.index = Math.max(0, d.handover.length - 1); } else if (d.step === 1 && d.index) d.index--; else if (d.step === 1) d.step = 0; else { S.go('closing'); return; } showClosing(); });
  S.action('pos-closing-save', async () => { try { const d = closingDraft; if (d.revision !== D.snapshot.revision) throw new Error('업무가 변경되어 마감 내용을 다시 확인해야 합니다.'); await D.execute('closing.close', { id: D.id('close'), date: D.today, openingCashWon: d.openingCashWon, countedCashWon: d.countedCashWon, differenceReason: d.differenceReason, handover: d.handover.map(({ orderId, reason, assignee, nextDate, note }) => ({ orderId, reason, assignee, nextDate, note })) }); closingDraft = null; S.go('closing'); S.toast('마감표와 미처리 인계 내역 보존 완료'); } catch (err) { error(err); } });
  S.action('pos-closing-history', () => S.go('closing-history'));
  S.action('pos-closing-view', id => { const c = D.snapshot.closings.find(c => c.id === id); P.modal('보존된 마감표 · ' + c.date, '<div class="pos-confirm-summary"><strong>처리자 ' + e(c.actor.id) + '</strong><span>예상 ' + won(c.expectedCashWon) + ' · 실제 ' + won(c.countedCashWon) + ' · 차이 ' + won(c.differenceWon) + '</span><span>' + e(c.differenceReason || '현금 일치') + '</span><span>인계 ' + c.snapshot.handover.length + '팀 · 확정시각 ' + e(c.at) + '</span></div>', b('닫기', 'close') + b('마감 당시 거래처', 'pos-closing-partners', c.id) + (c.date === D.today && !c.reopenings.length ? b('관리자 마감 재개', 'pos-closing-reopen', id) : '')); });
  S.action('pos-closing-partners', closingId => {
    if (closingDraft) captureClosing();
    const saved = closingId ? D.snapshot.closings.find(row => row.id === closingId) : null, balances = saved ? saved.snapshot.partnerBalances || [] : D.snapshot.finance.partnerBalances || [];
    P.modal(saved ? saved.date + ' · 마감 당시 거래처' : '거래처 미정산·실물 의무', '<p class="pos-label">' + (saved ? '마감 확정 당시 보존 내역' : '현재 원장의 약정 잔액과 실물 의무') + ' · 미배분 금액은 약정에서 자동 차감하지 않음</p>' + P.pager(balances, 'closing-partners', row => P.row(row.name + ' · 받을 ' + won(row.receivableWon) + ' / 줄 ' + won(row.payableWon), '미배분 지급 ' + won(row.unallocatedPaymentWon) + ' · 받음 ' + won(row.unallocatedReceiptWon) + ' · 빌린 미반환 ' + row.borrowedPendingQuantity + '개 / 빌려준 미회수 ' + row.lentPendingQuantity + '개' + (row.agreementUnconfirmed ? ' · 약정 확인 필요' : ''), go(saved ? '현재 장부' : '장부 열기', 'partner-detail', row.id)), 2), b(closingDraft && !saved ? '마감으로' : '닫기', closingDraft && !saved ? 'pos-closing-resume' : 'close'));
  });
  S.action('pos-closing-reopen', id => P.modal('관리자 마감 재개', input('재개 사유', 'reopenReason', '') + errorBox(), b('취소', 'close') + b('권한 확인·재개', 'pos-closing-reopen-save', id, 'primary')));
  S.action('pos-closing-reopen-save', async id => { try { await D.execute('closing.reopen', { id, reason: read('reopenReason') }); S.close(); S.render(); } catch (err) { error(err); } });
  S.action('pos-cash', () => { const f = D.snapshot.finance; P.modal('현금 입출금 기록', '<div class="so-field">구분' + P.choice('cashKind', [['out', '금고 출금'], ['in', '금고 입금']], 'out') + '</div><div class="pos-form-grid">' + input('실제 금액', 'cashAmount', '', 'number', 'min="1" inputmode="numeric"') + input('입출금 사유', 'cashReason', '') + '</div>' + errorBox(), b('취소', 'close') + b('실제 입출금 기록', 'pos-cash-save', '', 'primary'), '오늘 현금 증감 ' + won(f.cashMovementWon || 0) + ' · 예상 현금 ' + won((f.openingCashWon || 0) + (f.cashMovementWon || 0))); });
  S.action('pos-cash-save', async () => { try { await D.execute('finance.cash', { id: D.id('cash'), kind: read('cashKind'), amountWon: Number(read('cashAmount')), reason: read('cashReason') }); S.close(); S.render(); } catch (err) { error(err); } });
  S.register('closing', { title: '5 정산·마감', pos: true, render: closing });
  S.register('closing-wizard', { title: '마감 확정', parent: 'closing', pos: true, render: renderClosing });
  S.register('closing-history', { title: '마감 이력', pos: true, workspace: 'management', render: closingHistory });
})();
