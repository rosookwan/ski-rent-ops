(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, O = S.posOrders, e = S.esc, b = P.button;
  const needed = line => line.category !== 'liftTicket' && line.unissuedQuantity > 0 && (line.pickupPlan?.date || line.start) <= window.SkiWorkflowCommon.nextDate(D.today);
  const people = order => order.people.filter(person => order.lines.some(line => line.personId === person.id && needed(line)));
  const orders = () => D.snapshot.orders.filter(order => order.lines.some(needed));
  function card(order) {
    const members = people(order), ready = members.filter(person => person.preinput).length, missing = members.length - ready;
    const forms = D.snapshot.forms.filter(form => form.orderId === order.id || order.links?.some(link => link.sourceType === 'form' && link.sourceId === form.id));
    const pending = forms.some(form => { const latest = form.submissions.filter(row => row.status === 'submitted').at(-1), applied = order.preinputApplications?.filter(row => row.formId === form.id).at(-1); return latest && applied?.submissionVersion !== latest.version; });
    const label = !members.length ? '대표자 접수' : pending ? '제출 확인 필요' : missing ? '미입력 ' + missing + '명' : '입력 완료';
    const pickup = order.lines.filter(needed).map(line => line.pickupPlan || { date: line.start }).sort((a, b) => a.date.localeCompare(b.date))[0];
    return P.orderCard({ name: order.customer.name + (order.customer.name.endsWith(' 팀') ? '' : ' 팀'), phone: order.customer.phone, tone: pending || missing ? 'orange' : members.length ? 'green' : '', badge: [label, 'grey'],
      metaParts: [(pickup?.date ? Number(pickup.date.slice(5, 7)) + '/' + Number(pickup.date.slice(8, 10)) : '') + (pickup?.time ? ' ' + pickup.time : '') + ' 수령', pickup?.place, order.receiptNo || order.id], itemFit: 'parts', itemParts: members.length ? ['입력 ' + ready + ' / ' + members.length + '명'] : ['개인별 입력 없음'],
      state: [pending ? '매장 확인 필요' : forms.length ? '링크 준비 ' + forms.length + '건' : '요청 전', pending ? 'orange' : 'grey'], money: [members.length ? '접수에 적용한 규격' : '준비에서 실물 규격 확인', 'grey'],
      actions: b(!members.length ? '준비표·스티커' : pending || !missing ? '상세' : forms.length ? '재요청 ' + missing + '명' : '입력폼 준비', !members.length ? 'pos-size-prints' : 'pos-preinput', order.id, missing ? 'primary' : ''), go: { page: 'order-preinput', id: order.id } });
  }
  function render() {
    const list = orders(), missing = list.reduce((sum, order) => sum + people(order).filter(person => !person.preinput).length, 0);
    return P.page('사이즈 입력 현황', '', P.cards([{ title: '오늘·내일 수령', sub: list.length + '팀', cards: list.map(card) }], { fixed: true, signature: 'size-status', empty: '규격을 준비할 접수 없음' }),
      '<span>미입력 ' + missing + '명 · 준비 대상 ' + list.length + '팀</span><div class="so-actions">' + b('사이즈 집계', 'pos-size-summary') + b('최신 제출 확인', 'pos-refresh') + '</div>',
      { toolbar: O.go('준비·지급', 'preparation') + '<div class="so-actions pos-size-tabs">' + P.chip('팀별 현황', 'pos-size-status', '', true, list.length) + b('사이즈 집계', 'pos-size-summary') + '</div>', wait: missing ? '미입력 ' + missing + '명' : '없음' });
  }
  S.action('pos-size-status', () => S.go('size-status'));
  S.action('pos-size-prints', id => { S.posPreinput.state.tab = 'prints'; S.go('order-preinput', { id }); });
  S.action('pos-size-summary', () => {
    const counts = new Map(); let pending = 0;
    for (const order of orders()) for (const person of people(order)) {
      if (!person.preinput) { pending++; continue; }
      const p = person.preinput;
      for (const [name, value] of [['발', p.footMm == null ? '' : p.footMm + 'mm'], ['의류', p.clothingSize]]) if (value) { const key = name + ' ' + value; counts.set(key, (counts.get(key) || 0) + 1); }
    }
    P.modal('사이즈 집계', '<section class="pos-a3-form">' + P.pager([...counts].sort(([a], [b]) => a.localeCompare(b, 'ko', { numeric: true })), 'size-summary', ([name, count]) => P.row(name, '접수에 적용한 고객 규격', '<strong>' + count + '명</strong>'), innerHeight < 700 ? 3 : 4) + '</section>', b('닫기', 'close'), '오늘·내일 준비 대상 · 미입력 ' + pending + '명 · 장비 실물 규격과 별도');
  });
  S.register('size-status', { title: '사이즈 입력 현황', parent: 'preparation', pos: true, render });
})();
