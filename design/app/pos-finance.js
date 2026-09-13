(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, U = S.posOrders, e = S.esc, won = S.money, b = P.button;
  const { input, select, read, error, errorBox, go } = U;
  const names = { payment: '수납', refund: '고객 환불', deposit_in: '보증금 받기', deposit_out: '보증금 돌려주기' };
  const reasons = [['awaiting_payment', '남은 수납 확인'], ['awaiting_return', '고객 반납 기다림'], ['awaiting_shop', '차량 입고 기다림'], ['awaiting_refund', '환불·보증금 반환 확인'], ['scheduled', '다음 약속 확정'], ['other', '기타 사유']];
  let moneyDraft = null, closingDraft = null;
  function openMoney(id, kind = 'payment') {
    const o = D.order(id), f = o.finance;
    moneyDraft = { orderId: id, kind, revision: D.snapshot.revision, amountWon: kind === 'payment' ? f.dueWon : kind === 'refund' ? f.creditWon : kind === 'deposit_out' ? f.depositHeldWon : '', method: 'cash', scope: '', payer: o.customer.name, reason: '' };
    renderMoney();
  }
  function renderMoney() {
    const d = moneyDraft, o = D.order(d.orderId), f = o.finance, deposit = d.kind.startsWith('deposit');
    const actions = '<div class="pos-shortcuts">' + Object.entries(names).map(([kind, name]) => b(name, 'pos-money-kind', kind, kind === d.kind ? 'soft' : '')).join('') + '</div>';
    const balance = '<div class="pos-customer-strip"><b>' + e(o.customer.name) + ' · ' + e(o.id) + '</b><span>남은 잔액 ' + won(f.dueWon) + '</span><span>초과 수납 ' + won(f.creditWon) + ' · 보증금 ' + won(f.depositHeldWon) + '</span></div>';
    const scope = [['', '팀 전체 · 미배분 수납'], ...o.lines.filter(l => !l.cancelledQuantity).map(l => [l.id, (o.people.find(p => p.id === l.personId)?.name || '팀 공용') + ' · ' + (l.label || l.sku) + ' · ' + l.start.slice(5)])];
    P.modal(names[d.kind] + ' 기록', balance + actions + '<div class="pos-form-grid">' + input('실제로 처리한 금액 (원)', 'moneyAmount', d.amountWon, 'number', 'min="1" inputmode="numeric"') + select('처리 수단', 'moneyMethod', [['cash', '현금'], ['card', '외부 카드 단말'], ['transfer', '계좌이체']], d.method) + input('실제 결제자 (선택)', 'payer', d.payer) + (deposit ? '<div class="pos-info">보증금은 대여료와 별도로 보관합니다.</div>' : select('금액 적용 대상', 'moneyScope', scope, d.scope)) + (d.kind === 'refund' || d.kind === 'deposit_out' ? input('환불·반환 사유', 'moneyReason', d.reason || '실제 반환 확인') : '') + '</div><p class="pos-label">현금·이체 입금 또는 외부 단말 처리 결과를 확인한 뒤 기록하세요.</p>' + errorBox(), b('취소', 'close') + b('금액 조정', 'pos-adjust', o.id) + b(names[d.kind] + ' 내역 확인', 'pos-money-review', '', 'primary'));
  }
  S.action('pos-money', id => openMoney(id || D.order().id));
  S.action('pos-money-kind', kind => openMoney(moneyDraft.orderId, kind));
  S.action('pos-money-review', () => {
    try {
      const d = moneyDraft; d.amountWon = Number(read('moneyAmount')); d.method = read('moneyMethod'); d.payer = read('payer'); d.scope = read('moneyScope') || ''; d.reason = read('moneyReason') || '';
      window.SkiWorkflowCommon.integer(d.amountWon, 1, Number.MAX_SAFE_INTEGER);
      const o = D.order(d.orderId), f = o.finance;
      if (d.kind === 'refund' && d.amountWon > f.netPaidWon) throw new Error('실제 수납한 금액보다 많이 환불할 수 없습니다.');
      if (d.kind === 'deposit_out' && d.amountWon > f.depositHeldWon) throw new Error('보관 중인 보증금을 초과합니다.');
      const scope = o.lines.find(l => l.id === d.scope);
      P.modal(names[d.kind] + ' 확인', '<div class="pos-confirm-summary"><strong>' + e(o.customer.name) + ' · ' + e(o.id) + '</strong><span>' + names[d.kind] + ' ' + won(d.amountWon) + ' · ' + ({ cash: '현금', card: '외부 카드 단말', transfer: '계좌이체' }[d.method]) + '</span><span>적용: ' + e(scope ? (scope.label || scope.sku) + ' · ' + scope.start : d.kind.startsWith('deposit') ? '별도 보증금' : '팀 전체 · 미배분 금액') + '</span><span>' + (d.method === 'card' ? '외부 단말의 승인·취소가 완료된 결과를 기록합니다.' : '실제로 주고받은 금액을 기록합니다.') + '</span></div>' + errorBox(), b('수정', 'pos-money-edit') + b('실제 처리 확인·기록', 'pos-money-save', '', 'primary'));
    } catch (err) { error(err); }
  });
  S.action('pos-money-edit', renderMoney);
  S.action('pos-money-save', async () => {
    try { const d = moneyDraft; if (d.revision !== D.snapshot.revision) throw new Error('기록이 변경되었습니다. 금액을 다시 확인해 주세요.');
      await D.execute('finance.payment', { id: D.id('payment'), orderId: d.orderId, kind: d.kind, amountWon: d.amountWon, method: d.method, payer: d.payer, ...(d.scope ? { allocations: [{ lineId: d.scope, amountWon: d.amountWon }] } : {}), ...(d.reason ? { reason: d.reason } : {}) });
      moneyDraft = null; S.close(); S.render(); S.toast('실제 처리한 금액을 원장에 기록했습니다.');
    } catch (err) { error(err); }
  });
  S.action('pos-adjust', id => {
    const o = D.order(id); moneyDraft = { orderId: id, revision: D.snapshot.revision };
    P.modal('청구 금액 조정', '<div class="pos-confirm-summary"><strong>' + e(o.customer.name) + ' · 현재 청구 ' + won(o.finance.chargedWon) + '</strong><span>원래 요금을 보존하고 별도 조정 근거를 추가합니다.</span></div><div class="pos-form-grid">' + select('조정 방향', 'adjustDirection', [['minus', '할인·청구 감소'], ['plus', '추가 청구']], 'minus') + input('조정 금액 (원)', 'adjustAmount', '', 'number', 'min="1" inputmode="numeric"') + select('사유', 'adjustReason', [['현장 할인 확인', '현장 할인 확인'], ['취소·조기반납 환불액 확인', '취소·조기반납 비용 조정'], ['연체 비용 직원 확인', '연체 비용 직원 확인'], ['파손·분실 배상액 확인', '파손·분실 배상액 확인']], '현장 할인 확인') + '</div><p class="pos-label">조기반납·연체·파손 비용은 확인한 금액만 입력합니다. 환불은 실제 반환 후 따로 기록하세요.</p>' + errorBox(), b('취소', 'close') + b('조정 기록', 'pos-adjust-save', '', 'primary'));
  });
  S.action('pos-adjust-save', async () => { try { const d = moneyDraft; if (d.revision !== D.snapshot.revision) throw new Error('변경된 금액을 다시 확인해 주세요.'); const amountWon = Number(read('adjustAmount')) * (read('adjustDirection') === 'minus' ? -1 : 1); await D.execute('finance.adjustment', { id: D.id('adjust'), orderId: d.orderId, amountWon, reason: read('adjustReason') }); S.close(); S.render(); S.toast('금액 조정 근거를 기록했습니다.'); } catch (err) { error(err); } });
  function closing() {
    const f = D.snapshot.finance, closed = D.snapshot.closings.find(c => c.date === D.today && !c.reopenings.length);
    const metrics = '<div class="pos-task-cards">' + [['오늘 수납', f.paymentWon], ['고객 환불', f.refundWon], ['현금 증감', f.cashMovementWon], ['보증금 보관', D.snapshot.orders.reduce((n, o) => n + o.finance.depositHeldWon, 0)]].map(([label, value]) => '<div class="pos-info"><span>' + label + '</span><strong>' + won(value || 0) + '</strong></div>').join('') + '</div>';
    const pending = P.pager(f.handoverDefaults || [], 'closing-pending', row => P.row(row.customer.name, '남은 잔액 ' + won(row.dueWon) + ' · ' + (row.reason ? '인계 정보 있음' : '인계 확인 필요'), go('고객 확인', 'order-detail', row.orderId)), U.pageSize());
    return P.page('5. 정산·하루 마감', D.today + ' · ' + (closed ? '마감 확정 · 새 금전 처리는 관리자 재개가 필요합니다.' : '미처리 내역을 인계하고 실제 현금을 대조합니다.'), metrics + pending, '<div class="so-actions">' + b('마감 이력', 'pos-closing-history') + b('거래처 미정산 확인', 'pos-closing-partners') + '</div><div class="so-actions">' + b('현금 입출금', 'pos-cash') + (closed ? b('마감표 확인', 'pos-closing-view', closed.id, 'primary') : b('현금 대조·마감 시작', 'pos-closing-start', '', 'primary')) + '</div>');
  }
  function captureClosing() {
    if (!closingDraft) return;
    for (const key of ['openingCashWon', 'countedCashWon']) if (read(key) !== undefined) closingDraft[key] = read(key) === '' ? '' : Number(read(key));
    if (read('differenceReason') !== undefined) closingDraft.differenceReason = read('differenceReason');
    const row = closingDraft.handover[closingDraft.index];
    if (row && read('handoverReason') !== undefined) Object.assign(row, { reason: read('handoverReason'), assignee: read('assignee'), nextDate: read('nextDate') || null, note: read('handoverNote') });
  }
  function renderClosing() {
    const d = closingDraft, report = D.snapshot.finance; let body;
    if (d.step === 0) body = '<div class="pos-confirm-summary"><strong>오늘 현금 증감 ' + won(report.cashMovementWon) + '</strong><span>시작 현금과 실제 금고 잔액을 확인하세요.</span></div><div class="pos-form-grid">' + input('시작 현금', 'openingCashWon', d.openingCashWon, 'number', 'min="0" inputmode="numeric"') + input('실제 금고 현금', 'countedCashWon', d.countedCashWon, 'number', 'min="0" inputmode="numeric"') + input('차이가 있는 경우 사유', 'differenceReason', d.differenceReason) + '</div>';
    else if (d.step === 1) {
      const row = d.handover[d.index];
      body = '<div class="pos-confirm-summary"><strong>' + e(row.customer.name) + ' · ' + (d.index + 1) + '/' + d.handover.length + '팀</strong><span>미수 ' + won(row.dueWon) + ' · 기존 인계 정보는 이어서 사용합니다.</span></div><div class="pos-form-grid">' + select('다음에 할 일', 'handoverReason', [['', '사유 선택'], ...reasons], row.reason || '') + input('담당자', 'assignee', row.assignee || '') + input('다음 확인일', 'nextDate', row.nextDate || D.today, 'date') + input('메모 (기타 사유는 필수)', 'handoverNote', row.note || '') + '</div>';
    } else body = '<div class="pos-confirm-summary"><strong>' + D.today + ' 하루 마감</strong><span>예상 현금 ' + won(d.openingCashWon + report.cashMovementWon) + ' · 실제 현금 ' + won(d.countedCashWon) + '</span><span>차이 ' + won(d.countedCashWon - d.openingCashWon - report.cashMovementWon) + '</span><span>미수·미반납 ' + d.handover.length + '팀의 후속 업무를 인계합니다.</span><span>확정한 마감표는 보존하고 반납·정비 진행 상태는 별도로 이어갑니다.</span></div>';
    return P.page('하루 마감 · ' + (d.step + 1) + '/3', ['현금 대조', '미처리 업무 인계', '마감 확인'][d.step], body + errorBox(), b('이전', 'pos-closing-back') + b('거래처 미정산 확인', 'pos-closing-partners') + b(d.step < 2 ? '다음' : '오늘 마감 확정', d.step < 2 ? 'pos-closing-next' : 'pos-closing-save', '', 'primary'));
  }
  S.action('pos-closing-start', () => { const f = D.snapshot.finance; closingDraft = { step: 0, index: 0, revision: D.snapshot.revision, openingCashWon: f.openingCashWon || 0, countedCashWon: '', differenceReason: '', handover: structuredClone(f.handoverDefaults || []) }; S.go('closing-wizard'); });
  S.action('pos-closing-next', () => {
    captureClosing(); const d = closingDraft;
    try {
      if (d.step === 0) { window.SkiWorkflowCommon.integer(d.countedCashWon, 0, Number.MAX_SAFE_INTEGER); if (d.countedCashWon - d.openingCashWon - D.snapshot.finance.cashMovementWon && !d.differenceReason.trim()) throw new Error('현금 차이의 사유를 입력해 주세요.'); d.step = d.handover.length ? 1 : 2; }
      else { const row = d.handover[d.index]; if (!row.reason || !row.assignee || row.reason === 'other' && !row.note) throw new Error('새 인계 사유와 담당자를 확인해 주세요.'); if (++d.index >= d.handover.length) d.step = 2; }
      S.render();
    } catch (err) { error(err); }
  });
  S.action('pos-closing-back', () => { captureClosing(); const d = closingDraft; if (d.step === 2) { d.step = d.handover.length ? 1 : 0; d.index = Math.max(0, d.handover.length - 1); } else if (d.step === 1 && d.index) d.index--; else if (d.step === 1) d.step = 0; else { S.go('closing'); return; } S.render(); });
  S.action('pos-closing-save', async () => { try { const d = closingDraft; if (d.revision !== D.snapshot.revision) throw new Error('업무가 변경되어 마감 내용을 다시 확인해야 합니다.'); await D.execute('closing.close', { id: D.id('close'), date: D.today, openingCashWon: d.openingCashWon, countedCashWon: d.countedCashWon, differenceReason: d.differenceReason, handover: d.handover.map(({ orderId, reason, assignee, nextDate, note }) => ({ orderId, reason, assignee, nextDate, note })) }); closingDraft = null; S.go('closing'); S.toast('마감표와 미처리 인계 내역을 보존했습니다.'); } catch (err) { error(err); } });
  S.action('pos-closing-history', () => P.modal('마감 이력', P.pager(D.snapshot.closings, 'closing-history', c => P.row(c.date + (c.reopenings.length ? ' · 재개됨' : ' · 확정'), '실제 현금 ' + won(c.countedCashWon) + ' · 차이 ' + won(c.differenceWon), b('확인', 'pos-closing-view', c.id)), 3), b('닫기', 'close')));
  S.action('pos-closing-view', id => { const c = D.snapshot.closings.find(c => c.id === id); P.modal('보존된 마감표 · ' + c.date, '<div class="pos-confirm-summary"><strong>처리자 ' + e(c.actor.id) + '</strong><span>예상 ' + won(c.expectedCashWon) + ' · 실제 ' + won(c.countedCashWon) + ' · 차이 ' + won(c.differenceWon) + '</span><span>' + e(c.differenceReason || '현금 일치') + '</span><span>인계 ' + c.snapshot.handover.length + '팀 · 확정시각 ' + e(c.at) + '</span></div>', b('닫기', 'close') + b('마감 당시 거래처', 'pos-closing-partners', c.id) + (c.date === D.today && !c.reopenings.length ? b('관리자 마감 재개', 'pos-closing-reopen', id) : '')); });
  S.action('pos-closing-partners', closingId => {
    const saved = closingId ? D.snapshot.closings.find(row => row.id === closingId) : null, balances = saved ? saved.snapshot.partnerBalances || [] : D.snapshot.finance.partnerBalances || [];
    P.modal(saved ? saved.date + ' · 마감 당시 거래처' : '거래처 미정산·실물 의무', '<p class="pos-label">' + (saved ? '마감 확정 당시의 보존 내역입니다.' : '현재 원장의 약정 잔액과 실물 의무입니다.') + ' 미배분 금액은 약정에서 자동 차감하지 않습니다.</p>' + P.pager(balances, 'closing-partners', row => P.row(row.name + ' · 받을 ' + won(row.receivableWon) + ' / 줄 ' + won(row.payableWon), '미배분 지급 ' + won(row.unallocatedPaymentWon) + ' · 받음 ' + won(row.unallocatedReceiptWon) + ' · 빌린 미반환 ' + row.borrowedPendingQuantity + '개 / 빌려준 미회수 ' + row.lentPendingQuantity + '개' + (row.agreementUnconfirmed ? ' · 약정 확인 필요' : ''), go(saved ? '현재 장부' : '장부 열기', 'partner-detail', row.id)), 2), b('닫기', 'close'));
  });
  S.action('pos-closing-reopen', id => P.modal('관리자 마감 재개', input('재개 사유', 'reopenReason', '') + errorBox(), b('취소', 'close') + b('권한 확인·재개', 'pos-closing-reopen-save', id, 'primary')));
  S.action('pos-closing-reopen-save', async id => { try { await D.execute('closing.reopen', { id, reason: read('reopenReason') }); S.close(); S.render(); } catch (err) { error(err); } });
  S.action('pos-cash', () => P.modal('현금 입출금 기록', '<div class="pos-form-grid">' + select('구분', 'cashKind', [['in', '금고 입금'], ['out', '금고 출금']], 'out') + input('실제 금액', 'cashAmount', '', 'number', 'min="1" inputmode="numeric"') + input('입출금 사유', 'cashReason', '') + '</div>' + errorBox(), b('취소', 'close') + b('실제 입출금 기록', 'pos-cash-save', '', 'primary')));
  S.action('pos-cash-save', async () => { try { await D.execute('finance.cash', { id: D.id('cash'), kind: read('cashKind'), amountWon: Number(read('cashAmount')), reason: read('cashReason') }); S.close(); S.render(); } catch (err) { error(err); } });
  S.register('closing', { title: '정산·마감', pos: true, render: closing });
  S.register('closing-wizard', { title: '하루 마감', parent: 'closing', pos: true, render: renderClosing });
})();
