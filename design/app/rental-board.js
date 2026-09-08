(() => {
'use strict';
const S = window.SkiOps, F = S.workflow;

const today = S.data.today;
const day = n => new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const d = s => s ? Number(s.slice(5, 7)) + '/' + Number(s.slice(8, 10)) : '';
const diff = s => Math.round((Date.parse(s + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
const rel = s => ({ '-1': '어제', 0: '오늘', 1: '내일', 2: '모레' })[diff(s)] || d(s);
const money = n => Number(n).toLocaleString('ko-KR') + '원';
const UNIT = { '스키': '세트', '보드': '세트', '의류': '벌', '리프트권': '매', '헬멧': '개' };
const unit = name => UNIT[name] || '개';
const it = (name, total, customer, vehicle, confirmed, due, method) => ({ name, total, customer, vehicle, confirmed, due, method });

const SLOT_ORDER = ['오후타임 후', '야간타임 후', '익일 오전', '직접 시간', '수거 없음'];
const FILTERS = [['all', '전체'], ['pickup', '수령 예정'], ['out', '대여 중'], ['partial', '일부만 받음'], ['done', '반납 완료'], ['overdue', '예정일 지남'], ['unpaid', '미수 있음']];
const BADGE = {
  blue: 'background:var(--mk-label-beverages-bg,#E9F4FF);color:var(--mk-label-beverages-fg,#0074D9);',
  orange: 'background:var(--mk-orange-100,#FFE6D4);color:var(--mk-orange-600,#EF3408);',
  purple: 'background:var(--mk-label-spaghetti-bg,#F1E9FF);color:var(--mk-label-spaghetti-fg,#5000D9);',
  green: 'background:var(--mk-green-100,#DCFCE7);color:var(--mk-green-700,#15803D);',
  gray: 'background:var(--mk-neutral-100,#E7E7E7);color:#1A1A1A;',
  red: 'background:var(--mk-red-50,#FEF2F2);color:var(--mk-red-600,#DC2626);'
};
const PLATE = {
  neutral: 'background:var(--mk-neutral-50,#F8F8F8);color:#1A1A1A;box-shadow:inset 0 0 0 1px var(--mk-neutral-100,#E7E7E7);',
  orange: 'background:var(--mk-orange-50,#FFF4ED);color:var(--mk-orange-700,#C62208);box-shadow:inset 0 0 0 1px var(--mk-orange-200,#FFCAA8);',
  purple: 'background:var(--mk-label-spaghetti-bg,#F1E9FF);color:var(--mk-label-spaghetti-fg,#5000D9);box-shadow:inset 0 0 0 1px rgba(80,0,217,.2);',
  green: 'background:var(--mk-green-50,#F0FDF4);color:var(--mk-green-700,#15803D);box-shadow:inset 0 0 0 1px var(--mk-green-200,#BBF7D0);'
};
const FIELD = 'box-sizing:border-box;width:100%;min-width:0;height:48px;padding:0 12px;font-size:16px;font-weight:500;color:#1A1A1A;background:#fff;border:0;border-radius:var(--mk-radius-md,8px);box-shadow:inset 0 0 0 1px var(--mk-neutral-200,#D1D1D1);';

class RentalBoard {
  state = { view: 'list', id: 'R-025', tab: 'return', filter: 'all', dateTab: 'all', sort: 'slot', query: '', railOpen: false, dialog: null, notice: '',
    data: [] };

  say(t) { clearTimeout(this._t); this.setState({ notice: t }); this._t = setTimeout(() => this.setState({ notice: '' }), 4500); }
  order() { return this.state.data.find(o => o.id === this.state.id) || this.state.data[0]; }
  buckets(o) {
    const sum = k => o.items.reduce((n, i) => n + i[k], 0);
    return { total: sum('total'), customer: sum('customer'), vehicle: sum('vehicle'), confirmed: sum('confirmed'), remaining: sum('customer') + sum('vehicle') };
  }
  remainingItems(o) { return o.items.filter(i => i.customer + i.vehicle + i.unissued > 0); }
  isLate(o) { return o.stage === 'out' && o.items.some(i => i.customer + i.vehicle > 0 && diff(i.due) < 0); }
  // 카드·상세에서 같은 상태 이름을 쓴다
  stateOf(o) {
    const b = this.buckets(o);
    if (o.stage === 'pickup') return { label: o.stageLabel || '수령 예정', color: 'blue', card: 'background:#fff;box-shadow:inset 0 0 0 1px var(--mk-neutral-100,#E7E7E7);' };
    if (b.remaining === 0 && !o.unissued) return { label: '반납 완료', color: 'green', card: 'background:var(--mk-green-50,#F0FDF4);box-shadow:inset 0 0 0 1px var(--mk-green-200,#BBF7D0);' };
    const white = 'background:#fff;box-shadow:inset 0 0 0 1px var(--mk-neutral-100,#E7E7E7);';
    if (b.remaining === 0 && o.unissued) return { label: '추가 지급 대기', color: 'blue', card: white };
    if (b.confirmed > 0 || b.vehicle > 0) return { label: '일부만 받음', color: 'orange', card: white };
    if (this.isLate(o)) return { label: '반납 안 됨', color: 'red', card: white };
    return { label: this.remainingItems(o).every(i => i.method === '직접반납') ? '내려와서 반납' : '대여 중 · 차량 수거', color: 'gray', card: white };
  }
  itemState(o, i) {
    if (i.unissued > 0 && !i.customer && !i.vehicle && !i.confirmed) return { text: '지급 전', color: 'gray' };
    if (i.vehicle > 0) return { text: '차량 인수 · 매장 확인 대기', color: 'purple' };
    if (i.customer > 0) return { text: (i.name === '리프트권' ? '미회수 · ' : '고객 보유 · ') + i.method + ' 예정', color: diff(i.due) < 0 ? 'red' : 'orange' };
    return { text: '매장 확인 완료', color: 'green' };
  }
  keep(o, f) {
    const b = this.buckets(o);
    if (f === 'pickup') return o.stage === 'pickup' || !b.remaining && o.unissued > 0;
    if (f === 'out') return o.stage === 'out' && b.remaining > 0;
    if (f === 'partial') return o.stage === 'out' && b.remaining > 0 && (b.confirmed > 0 || b.vehicle > 0);
    if (f === 'done') return o.stage === 'out' && b.remaining === 0 && !o.unissued;
    if (f === 'overdue') return this.isLate(o);
    if (f === 'unpaid') return o.amount > o.paid;
    return true;
  }
  keepDate(o, t) {
    if (t === 'all') return true;
    const date = t === 'today' ? day(0) : day(1);
    return (o.start <= date && o.end >= date) || o.pickup === date;
  }
  keepQuery(o) {
    const q = this.state.query.replace(/[\s-]/g, '');
    return !q || [o.name, o.phone, o.id].some(v => v.replace(/[\s-]/g, '').toLocaleLowerCase().includes(q.toLocaleLowerCase()));
  }
  list(f, t) {
    f = f || this.state.filter; t = t || this.state.dateTab;
    return this.state.data.filter(o => this.keepQuery(o) && this.keep(o, f) && this.keepDate(o, t));
  }

  setQty(name, value, max) {
    this.setState(s => ({ dialog: { ...s.dialog, qty: { ...(s.dialog.qty || {}), [name]: Math.max(0, Math.min(max, value)) } } }));
  }
  qtyText(o, qty) { return o.items.filter(i => (qty[i.id] || 0) > 0).map(i => i.name + ' ' + qty[i.id] + unit(i.name)).join(' · '); }

  openForm(kind) {
    const o = this.order();
    const lead = o.name + ' 고객님 · ' + o.id;
    const D = {
      extend: { title: '이용 기간 연장', lead, fields: [{ label: '현재 이용 종료일', value: o.end, inputType: 'date', readOnly: true }, { label: '변경할 종료일', value: day(2), inputType: 'date' }], note: '날짜별 장비 수량과 추가 요금을 확인한 뒤 변경하는 화면입니다.' },
      exchange: { title: '장비 교환', lead, fields: [{ label: '돌려받는 장비', options: [...o.items.map(i => i.name), '없음'] }, { label: '교환할 장비', options: ['스키 · 일반', '스키 · 고급', '보드 · 일반'] }, { label: '교환 수량', value: '1', inputType: 'number' }, { label: '사이즈·메모', value: '부츠 260 → 265mm', inputType: 'text' }] },
      schedule: { title: '반납 일정 변경 (전체)', lead, fields: [{ label: '반납일', value: o.end, inputType: 'date' }, { label: '반납 타임', options: ['오후타임 후', '야간타임 후', '익일 오전', '직접 시간'] }, { label: '반납 방법', options: ['차량 수거', '직접반납'] }, { label: '장소', options: ['만선 티롤 앞', '설천 주차장', '만선 광장', '스키샵'] }], note: '품목 하나만 바꾸려면 반납 확인 탭의 "예정 변경"을 쓰세요.' },
      payment: { title: '수납 내역 입력', lead, summaryLabel: '받은 금액 / 받을 잔액', summaryValue: money(o.paid) + ' / ' + money(o.amount - o.paid), fields: [{ label: '결제 수단', options: ['카드', '현금', '계좌이체'] }, { label: '받을 금액', value: String(o.amount - o.paid), inputType: 'number' }, { label: '메모', value: '', inputType: 'text', placeholder: '정산·환불 사유' }] },
      refund: { title: '환불 내역 입력', lead, summaryLabel: '받은 금액 / 받을 잔액', summaryValue: money(o.paid) + ' / ' + money(o.amount - o.paid), fields: [{ label: '결제 수단', options: ['카드', '현금', '계좌이체'] }, { label: '환불할 금액', value: '0', inputType: 'number' }, { label: '메모', value: '', inputType: 'text', placeholder: '정산·환불 사유' }] },
      contact: { title: '고객 연락', lead, phone: o.phone, fields: [], note: '[우리 스키샵] 차량이 출발하였습니다. 5분 내로 도착하니 약속한 장소에서 대기해 주세요.' }
    };
    if (kind === 'schedule') {
      const values = { '반납일': this.remainingItems(o)[0]?.due || o.end, '반납 타임': o.slot, '반납 방법': o.items.find(i => i.customer || i.unissued)?.method || '직접반납', '장소': o.place };
      D.schedule.fields.forEach(field => { field.value = values[field.label]; if (field.options && !field.options.includes(field.value)) field.options.push(field.value); });
    }
    this.setState({ dialog: { kind, form: D[kind], revision: F.snap().revision } });
  }

  renderVals() {
    const s = this.state;
    const o = this.order();
    const b = this.buckets(o);
    const st = this.stateOf(o);
    const dlg = s.dialog;
    const form = dlg && dlg.form;
    const list = this.list();
    const rem = this.remainingItems(o);
    const balance = o.amount - o.paid;

    const badge = 'display:inline-block;font-size:15px;font-weight:700;padding:6px 10px;border-radius:var(--mk-radius-sm,6px);white-space:nowrap;';
    const chip = 'display:flex;align-items:center;gap:8px;min-height:46px;padding:11px 15px;font-size:16px;font-weight:600;border:0;border-radius:var(--mk-radius-xl,14px);transition:background 180ms cubic-bezier(.2,0,.2,1);';
    const tab = 'display:flex;align-items:center;gap:7px;min-height:44px;padding:10px 14px;font-size:15px;font-weight:600;border:0;border-radius:var(--mk-radius-md,8px);transition:background 180ms cubic-bezier(.2,0,.2,1);';
    const num = 'font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:-0.02em;';
    const plate = 'box-sizing:border-box;padding:13px 14px;border-radius:var(--mk-radius-lg,12px);';
    const open = s.railOpen;
    const navBase = 'display:flex;align-items:center;min-height:48px;border:0;border-radius:var(--mk-radius-xl,14px);transition:background 180ms cubic-bezier(.2,0,.2,1);' + (open ? 'gap:11px;padding:10px 13px;font-size:16px;' : 'gap:0;padding:10px;font-size:0;justify-content:center;');

    const cardOf = x => {
      const cs = this.stateOf(x);
      const late = this.isLate(x);
      const done = 'font-size:17px;font-weight:600;text-decoration:line-through;color:var(--mk-neutral-500,#6D6D6D);white-space:nowrap;';
      const hold = 'font-size:18px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap;';
      const note = 'font-size:14px;font-weight:600;white-space:nowrap;text-align:right;';
      const lines = [];
      x.items.forEach(i => {
        if (i.unissued > 0) lines.push({ text: i.name + ' ' + i.unissued + unit(i.name), style: hold, note: '지급 전', noteStyle: note + 'color:var(--mk-neutral-500,#6D6D6D);' });
        if (x.stage === 'pickup') { return; }
        if (i.confirmed > 0) lines.push({ text: i.name + ' ' + i.confirmed + unit(i.name), style: done, note: '받음', noteStyle: note + 'color:var(--mk-green-700,#15803D);' });
        if (i.vehicle > 0) lines.push({ text: i.name + ' ' + i.vehicle + unit(i.name), style: done, note: '차량에서 받음', noteStyle: note + 'color:var(--mk-label-spaghetti-fg,#5000D9);' });
        if (i.customer > 0) lines.push({
          text: i.name + ' ' + i.customer + unit(i.name), style: hold,
          note: (diff(i.due) === 0 ? '' : rel(i.due) + ' · ') + (i.method === '직접반납' ? '내려와서 반납' : '차량 수거 예정'),
          noteStyle: note + (diff(i.due) < 0 ? 'color:var(--mk-red-600,#DC2626);' : i.method === '직접반납' ? 'color:#1A1A1A;' : 'color:var(--mk-orange-600,#EF3408);')
        });
      });
      const foots = [];
      if (late) foots.push({ text: '반납 예정일 지남 · ' + rel(rem0(x)) + ' 예정', style: 'font-size:14px;font-weight:700;color:var(--mk-red-600,#DC2626);' });
      if (x.amount > x.paid) foots.push({ text: '미수 ' + money(x.amount - x.paid), style: 'font-size:14px;font-weight:700;color:var(--mk-orange-600,#EF3408);' });
      const period = d(x.start) + (x.start !== x.end ? '~' + d(x.end) : '') + ' 이용';
      const when = s.sort === 'slot' ? d(x.pickup) + ' ' + x.pickupTime + ' 수령' : x.slot + (x.time ? ' ' + x.time : '');
      return {
        id: x.id, name: x.name, phone: x.phone, state: cs.label,
        badgeStyle: 'flex-shrink:0;' + badge + BADGE[cs.color],
        meta: period + ' · ' + when + ' · ' + x.place,
        lines, hasFoot: foots.length > 0, foots,
        style: 'display:block;text-align:left;box-sizing:border-box;width:100%;min-width:0;padding:16px 18px;border:0;border-radius:var(--mk-radius-2xl,16px);color:#1A1A1A;transition:box-shadow 180ms cubic-bezier(.2,0,.2,1);' + cs.card,
        onOpen: () => this.setState({ view: 'detail', id: x.id, tab: x.stage === 'pickup' ? 'items' : 'return' })
      };
    };
      const rem0 = x => x.items.filter(i => i.customer + i.vehicle > 0 && diff(i.due) < 0)[0].due;

    const groups = (s.sort === 'slot'
      ? [...new Set([...SLOT_ORDER, ...list.map(x => x.slot)])].map(label => ({ label, time: (list.find(x => x.slot === label && x.time) || {}).time || '', cards: list.filter(x => x.slot === label) })).filter(g => g.cards.length)
      : [{ label: '', time: '', cards: [...list].sort((p, q) => (p.pickup + p.pickupTime).localeCompare(q.pickup + q.pickupTime)) }]
    ).map(g => ({ label: g.label, time: g.label === '직접 시간' ? '각 카드의 시간 확인' : (g.time ? g.time + ' 반납' : ''), count: g.cards.length + '건', showHead: s.sort === 'slot', cards: g.cards.map(cardOf) }));

    const n = f => s.data.filter(x => this.keep(x, f)).length;
    const TABS = [['return', '반납 확인'], ['items', '장비·리프트권'], ['payment', '결제·환불'], ['history', '변경 이력']];
    const PANE = { 'return': '품목별 반납 상태', items: '대여 품목', payment: '결제 내역', history: '변경 이력' };

    const qtyRows = dlg && dlg.qty ? o.items.filter(i => i[dlg.field] > 0).map(i => {
      const v = dlg.qty[i.id] || 0;
      return {
        name: i.name, value: v,
        note: (dlg.kind === 'fix' ? '확인 완료 ' : dlg.kind === 'vehicle' ? '차량 인수 ' : '고객 보유 ') + i[dlg.field] + unit(i.name) + ' 중',
        decLabel: i.name + ' 수량 줄이기', incLabel: i.name + ' 수량 늘리기', decOff: v <= 0, incOff: v >= i[dlg.field],
        onDec: () => this.setQty(i.id, v - 1, i[dlg.field]), onInc: () => this.setQty(i.id, v + 1, i[dlg.field])
      };
    }) : [];
    const picked = dlg && dlg.qty ? Object.values(dlg.qty).some(v => v > 0) : false;
    const TITLE = { direct: '고객 직접반납 받음', vehicle: '차량 인수분 최종 확인', fix: '반납 수량 정정', plan: '반납 예정일 · 방법 변경' };
    const LEAD = {
      direct: '고객이 직접 가져온 품목만 선택하세요. 선택하지 않은 품목은 남은 품목으로 그대로 둡니다.',
      vehicle: '차량이 인수해 온 수량을 매장에서 확인합니다. 고객 보유 품목에는 영향을 주지 않습니다.',
      fix: '잘못 처리한 확인 완료 수량을 고객 보유로 되돌립니다.',
      plan: dlg ? dlg.name + ' 남은 수량의 반납 예정일과 방법을 바꿉니다.' : ''
    };
    const PRIMARY = { direct: '직접반납 처리', vehicle: '매장 확인 완료', fix: '정정 저장', plan: '예정 변경', contact: '문자 보내기' };

    return {
      railOpen: open,
      toggleRail: () => this.setState(x => ({ railOpen: !x.railOpen })),
      railStyle: 'flex-shrink:0;box-sizing:border-box;background:#fff;box-shadow:inset -1px 0 0 var(--mk-neutral-100,#E7E7E7);display:flex;flex-direction:column;overflow-y:auto;' + (open ? 'width:214px;padding:16px 14px 14px;gap:18px;' : 'width:72px;padding:14px 12px;gap:14px;'),
      brandRowStyle: 'display:flex;align-items:center;gap:11px;flex-shrink:0;' + (open ? 'padding:0 6px;' : 'justify-content:center;'),
      brandTextStyle: open ? 'min-width:0' : 'display:none',
      captionStyle: open ? 'font-size:14px;font-weight:500;color:var(--mk-neutral-500,#6D6D6D);padding:0 0 6px 14px' : 'display:none',
      footStyle: open ? 'margin-top:auto;background:var(--mk-neutral-50-alt,#FAFAFA);border-radius:var(--mk-radius-lg,12px);box-shadow:inset 0 0 0 1px var(--mk-neutral-100,#E7E7E7);padding:12px 13px' : 'display:none',
      navStyle: navBase + 'color:var(--mk-neutral-600,#5D5D5D);background:transparent;font-weight:500;',
      navActiveStyle: navBase + 'color:#fff;background:var(--mk-orange-500,#FE4E10);font-weight:700;',

      isList: s.view === 'list', isDetail: s.view === 'detail',
      crumb: s.view === 'list' ? '렌탈·반납 현황' : '렌탈·반납 상세',
      backToList: () => this.setState({ view: 'list' }),

      tally: '수령 예정 ' + n('pickup') + '건 · 대여 중 ' + n('out') + '건 (일부만 받음 ' + n('partial') + ') · 반납 완료 ' + n('done') + '건 · 예정일 지남 ' + n('overdue') + '건',
      query: s.query, onQuery: e => this.setState({ query: e.target.value }),
      sortBtns: [['slot', '반납 시간 묶음'], ['rented', '빌린 순서']].map(([id, label]) => ({
        label, pressed: s.sort === id,
        style: 'display:flex;align-items:center;justify-content:center;min-height:44px;padding:8px 16px;font-size:16px;font-weight:600;border:0;border-radius:var(--mk-radius-md,10px);transition:background 180ms cubic-bezier(.2,0,.2,1);' + (s.sort === id ? 'color:#fff;background:#1A1A1A;' : 'color:#5D5D5D;background:transparent;'),
        onClick: () => this.setState({ sort: id })
      })),
      filters: FILTERS.map(([id, label]) => ({
        label, count: this.list(id, s.dateTab).length, pressed: s.filter === id,
        style: chip + (s.filter === id ? 'color:#fff;background:var(--mk-orange-500,#FE4E10);' : 'color:#5D5D5D;background:#fff;box-shadow:inset 0 0 0 1px var(--mk-neutral-200,#D1D1D1);'),
        countStyle: 'font-size:14px;font-weight:700;padding:1px 7px;border-radius:var(--mk-radius-xs,4px);font-variant-numeric:tabular-nums;' + (s.filter === id ? 'background:rgba(255,255,255,.24);color:#fff;' : 'background:var(--mk-neutral-100,#E7E7E7);color:#5D5D5D;'),
        onClick: () => this.setState({ filter: id })
      })),
      dateTabs: [['all', '전체'], ['today', '오늘 ' + d(day(0))], ['tomorrow', '내일 ' + d(day(1))]].map(([id, label]) => ({
        label, pressed: s.dateTab === id,
        style: tab + (s.dateTab === id ? 'color:#fff;background:#1A1A1A;' : 'color:#5D5D5D;background:#fff;box-shadow:inset 0 0 0 1px var(--mk-neutral-200,#D1D1D1);'),
        onClick: () => this.setState({ dateTab: id })
      })),
      resetFilters: () => this.setState({ filter: 'all', dateTab: 'all', query: '' }),
      groups, noRows: list.length === 0,

      detailTitle: o.name + ' 고객님', detailState: st.label, detailStateStyle: badge + BADGE[st.color],
      detailMeta: o.id + ' · ' + o.phone + ' · ' + o.place + ' · ' + d(o.pickup) + ' ' + o.pickupTime + ' 수령',
      detailTabs: TABS.map(([id, label]) => ({
        label, pressed: s.tab === id,
        style: 'min-height:46px;padding:11px 16px;font-size:16px;font-weight:600;border:0;border-radius:var(--mk-radius-xl,14px);transition:background 180ms cubic-bezier(.2,0,.2,1);' + (s.tab === id ? 'color:#fff;background:var(--mk-orange-500,#FE4E10);' : 'color:#5D5D5D;background:#fff;box-shadow:inset 0 0 0 1px var(--mk-neutral-200,#D1D1D1);'),
        onClick: () => this.setState({ tab: id })
      })),
      paneTitle: PANE[s.tab],
      paneBodyStyle: s.tab === 'return' ? 'display:none' : 'padding:18px',
      isReturnTab: s.tab === 'return', isItemsTab: s.tab === 'items', isPaymentTab: s.tab === 'payment', isHistoryTab: s.tab === 'history',

      items: o.items.map(i => {
        const is = this.itemState(o, i);
        const pre = o.stage === 'pickup';
        return {
          name: i.name, total: i.total + unit(i.name),
          customer: i.customer > 0 ? i.customer + unit(i.name) : '—', customerStyle: num + (i.customer > 0 && !pre ? 'color:var(--mk-orange-600,#EF3408);' : 'color:var(--mk-neutral-400,#888);font-weight:500;'),
          vehicle: i.vehicle > 0 ? i.vehicle + unit(i.name) : '—', vehicleStyle: num + (i.vehicle > 0 ? 'color:var(--mk-label-spaghetti-fg,#5000D9);' : 'color:var(--mk-neutral-400,#888);font-weight:500;'),
          confirmed: i.confirmed > 0 ? i.confirmed + unit(i.name) : '—', confirmedStyle: num + (i.confirmed > 0 ? 'color:var(--mk-green-700,#15803D);' : 'color:var(--mk-neutral-400,#888);font-weight:500;'),
          plan: i.customer + i.vehicle + i.unissued > 0 ? rel(i.due) + ' ' + d(i.due) + ' · ' + i.method : '확인 완료',
          planNote: is.text,
          planNoteStyle: 'display:block;margin-top:3px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + (is.color === 'red' ? 'color:var(--mk-red-600,#DC2626);font-weight:600;' : 'color:var(--mk-neutral-500,#6D6D6D);'),
          canPlan: i.customer > 0 || i.unissued > 0,
          onPlan: () => this.setState({ dialog: { kind: 'plan', id: o.id, name: i.name, itemId: i.id, due: i.due, method: i.method, revision: F.snap().revision } })
        };
      }),
      noItems: o.items.length === 0,
      noDirect: o.stage === 'pickup' || b.customer === 0, noVehicle: b.vehicle === 0, noFix: b.confirmed === 0,
      openDirect: () => this.setState({ dialog: { kind: 'direct', id: o.id, revision: F.snap().revision, field: 'customer', qty: {} } }),
      openVehicle: () => this.setState({ dialog: { kind: 'vehicle', id: o.id, revision: F.snap().revision, field: 'vehicle', qty: Object.fromEntries(o.items.map(i => [i.id, i.vehicle])) } }),
      openFix: () => this.setState({ dialog: { kind: 'fix', id: o.id, revision: F.snap().revision, field: 'confirmed', qty: {} } }),

      gear: o.gear, gearDetail: o.detail, tickets: o.tickets, note: o.note,
      orderId: o.id, needsIssue: !!o.unissued, needsGear: o.items.some(i => i.unissued && !i.ticket), needsTickets: o.items.some(i => i.unissued && i.ticket), hasDaily: !!o.daily,
      dailyRows: (o.daily || []).map((q, i) => ({ date: d(day(i)), qty: q + '대', amount: money(q * 20000) })),
      itemCounts: [
        { label: '실제 지급', value: o.items.reduce((n, i) => n + i.total - i.unissued, 0), note: o.stage === 'pickup' ? '아직 지급 전' : '고객에게 건넨 수량', style: plate + PLATE.neutral },
        { label: '차량 인수', value: b.vehicle, note: '차량이 수거 · 매장 확인 전', style: plate + PLATE.purple },
        { label: '매장 확인', value: b.confirmed, note: '매장 최종 확인 (반납 완료)', style: plate + PLATE.green }
      ],

      paymentLines: [{ label: '최종 대여금액', value: money(o.amount) }, { label: '받은 금액', value: money(o.paid) }],
      balance: money(balance),
      balanceStyle: 'font-size:21px;font-weight:700;letter-spacing:-0.03em;font-variant-numeric:tabular-nums;' + (balance > 0 ? 'color:var(--mk-orange-600,#EF3408);' : ''),
      openPayment: () => this.openForm('payment'), openRefund: () => this.openForm('refund'),

      history: o.log.map(([time, text, who]) => ({ time, text, who })), noHistory: o.log.length === 0,

      summary: [
        { label: '고객 보유', note: '아직 받지 않은 수량', value: b.customer, style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;' + plate + PLATE.orange },
        { label: '매장 확인 대기', note: '차량 인수 후 확인 전', value: b.vehicle, style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;' + plate + PLATE.purple },
        { label: '매장 확인 완료', note: '반납 처리 완료', value: b.confirmed, style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;' + plate + PLATE.green }
      ],
      period: d(o.start) + (o.start !== o.end ? ' ~ ' + d(o.end) : ''),
      due: rem.length ? rel(rem.map(i => i.due).sort()[0]) + ' · ' + o.slot + (o.time ? ' ' + o.time : '') : '모두 확인 완료',
      dueNote: rem.length ? rem.map(i => i.method).filter((v, k, a) => a.indexOf(v) === k).join(' · ') + ' · ' + o.place : '',
      openSchedule: () => this.openForm('schedule'), openExtend: () => this.openForm('extend'), openExchange: () => this.openForm('exchange'), openContact: () => this.openForm('contact'),

      dialogError: dlg?.error || '', dialogOpen: !!dlg,
      dialogTitle: dlg ? (form ? form.title : TITLE[dlg.kind]) : '',
      dialogLead: dlg ? (form ? form.lead : LEAD[dlg.kind]) : '',
      dialogHasQty: !!(dlg && dlg.qty), dialogIsPlan: !!(dlg && dlg.kind === 'plan'),
      qtyRows,
      dialogResult: dlg ? (dlg.kind === 'plan' ? dlg.name + ' · ' + rel(dlg.due) + ' ' + d(dlg.due) + ' · ' + dlg.method : (picked ? '처리 대상: ' + this.qtyText(o, dlg.qty) : '수량을 선택하세요')) : '',
      planDue: dlg && dlg.due ? dlg.due : day(0), planMethod: dlg && dlg.method ? dlg.method : '직접반납',
      onPlanDue: e => this.setState(x => ({ dialog: { ...x.dialog, due: e.target.value } })),
      onPlanMethod: e => this.setState(x => ({ dialog: { ...x.dialog, method: e.target.value } })),
      dialogHasSummary: !!(form && form.summaryLabel), dialogSummaryLabel: form && form.summaryLabel ? form.summaryLabel : '', dialogSummaryValue: form && form.summaryValue ? form.summaryValue : '',
      dialogHasPhone: !!(form && form.phone), dialogPhone: form && form.phone ? form.phone : '',
      dialogHasFields: !!(form && form.fields.length),
      dialogFields: (form ? form.fields : []).map(f => ({ label: f.label, isSelect: !!f.options, isInput: !f.options, options: f.options || [], inputType: f.inputType || 'text', value: f.value || '', placeholder: f.placeholder || '', readOnly: !!f.readOnly, style: FIELD + (f.readOnly ? 'background:var(--mk-neutral-50,#F8F8F8);color:#5D5D5D;' : '') })),
      dialogHasNote: !!(form && form.note), dialogNote: form && form.note ? form.note : '',
      dialogPrimary: dlg ? (PRIMARY[dlg.kind] || '저장') : '',
      dialogPrimaryOff: !!(dlg && dlg.qty && !picked),
      dialogConfirm: () => this.confirm(),
      closeDialog: () => this.setState({ dialog: null }),

      notice: s.notice,
      goHome: () => this.say('오늘 현황 화면으로 이동합니다.'),
      goIntake: () => this.say('새 대여 접수 화면으로 이동합니다.'),
      goDispatch: () => this.say('배달·수거 화면으로 이동합니다.'),
      goPartners: () => this.say('거래처 장부 화면으로 이동합니다.'),
      goClosing: () => this.say('하루 마감 화면으로 이동합니다.'),
      goPreparation: () => this.say('사전 입력·준비 화면으로 이동합니다.'),
      goCustomers: () => this.say('고객관리 화면으로 이동합니다.'),
      goInventory: () => this.say('재고·정비 화면으로 이동합니다.'),
      goSettings: () => this.say('매장 설정 화면으로 이동합니다.'),
      goGuide: () => this.say('QR 이용 안내 화면으로 이동합니다.'),
      goVehicle: () => this.say('차량 태블릿 화면으로 이동합니다.'),
      doLogout: () => this.say('로그인 화면으로 이동합니다.')
    };
  }
}

// The reference controls presentation. Quantities and actions use the existing
// shared physical ledger; the reference's illustrative counters are not seeded.
function projectOrders() {
  const snapshot = F.snap(), movements = F.store.history().movements;
  const known = [...S.data.orders.map(o => o.id), ...F.orders.keys(), ...movements.filter(m => m.kind === 'deliver').map(m => m.to.id), ...snapshot.assets.filter(a => a.location.kind === 'customer').map(a => a.location.id)];
  const ids = [...new Set(known)].filter(id => ![...F.orders.keys()].some(parent => parent !== id && F.customerIds(parent).includes(id)));
  return ids.flatMap(id => {
    const projected = F.projectOrder(id);
    if (!projected) return [];
    const base = S.data.orders.find(o => o.id === id) || {};
    const reservation = snapshot.reservations.find(r => r.id === id);
    const tasks = snapshot.tasks.filter(t => t.customerId === id && t.kind === 'collection' && !['cancelled', 'completed'].includes(t.status));
    const dates = reservation?.lines.map(l => l.useDate).sort() || [];
    const start = base.start || projected.rental?.startDate || dates[0] || today;
    const end = base.end || projected.rental?.endDate || dates.at(-1) || start;
    const bindings = projected.bindings || [];
    const items = projected.items.map(i => {
      const binding = bindings.find(b => (b.itemId || b.item?.id) === i.id);
      const assetIds = [...(binding?.assetIds || []), ...(binding?.stagedAssetIds || [])];
      const task = tasks.find(t => t.assetIds.some(a => assetIds.includes(a)));
      const plan = i.returnPlan || {};
      const ticket = i.category === 'liftTicket';
      return { id: i.id, name: ticket ? '리프트권' : i.label, ticket, total: i.plannedQuantity, customer: i.customerQuantity, vehicle: i.vehicleQuantity, confirmed: i.shopQuantity, unissued: i.unissuedQuantity,
        due: task?.date || plan.date || end, method: task || plan.method === 'vehicle' ? '차량 수거' : '직접반납', assetIds,
        time: task?.time || plan.time || base.time || '16:30', place: task?.place || plan.place || base.place || '매장' };
    });
    const total = key => items.reduce((n, i) => n + i[key], 0);
    const stage = total('total') === total('unissued') ? 'pickup' : 'out';
    const relevantIds = items.flatMap(i => i.assetIds);
    const history = movements.filter(m => m.kind !== 'stock.opening' && (m.assetIds.some(a => relevantIds.includes(a)) || m.to?.id === id));
    const log = history.slice().reverse().map(m => [new Date(m.at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }),
      ({ directReturn: '직접반납 접수', collect: '차량 수거', receive: '차량 인수분 최종 확인', deliver: '장비 지급', correction: '수량 정정' }[m.kind] || m.kind) + ' · ' + m.assetIds.filter(a => relevantIds.includes(a)).length + '개' + (m.reversedAssetIds.length ? ' (정정 ' + m.reversedAssetIds.length + '개)' : ''), m.actor?.role === 'driver' ? '차량' : '카운터']);
    const customer = S.workflowCustomer(id);
    return [{ ...base, id, name: base.name || customer.name, phone: base.phone || customer.phone || '', start, end,
      stage, stageLabel: stage === 'pickup' && items.every(i => i.ticket) ? '리프트권 전달 대기' : '',
      pickup: base.pickup || start, pickupTime: base.pickupTime || reservation?.lines[0]?.startTime || '09:00',
      slot: base.slot || '직접 시간', time: base.time || tasks[0]?.time || '', place: base.place || tasks[0]?.place || '매장 수령',
      amount: base.amount ?? projected.rental?.amountWon ?? 0, paid: base.paid ?? projected.rental?.paidWon ?? 0,
      gear: base.gear || items.filter(i => !i.ticket).map(i => i.name + ' ' + i.total).join(' · ') || '장비 없음',
      detail: base.detail || '1일 이용', tickets: base.tickets || items.filter(i => i.ticket).map(i => i.total + '매').join(' · ') || '없음',
      note: base.note || '', items, unissued: total('unissued'), log }];
  });
}

function assetsFor(item, field, orderId) {
  return F.assets(item.assetIds).filter(a => field === 'customer' ? a.location.kind === 'customer' && F.customerIds(orderId).includes(a.location.id)
    : field === 'vehicle' ? a.location.kind === 'vehicle' && a.location.id === F.vehicleId
      : a.location.kind === 'shop' && a.location.id === F.shopId);
}

function updatePlan(order, selectedItems, plan) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.date) || !Number.isFinite(Date.parse(plan.date)) || !['direct', 'vehicle'].includes(plan.method)) throw new Error('반납 예정일과 방법을 확인해 주세요.');
  const selected = selectedItems.flatMap(i => assetsFor(i, 'customer', order.id).map(a => a.id));
  const tasks = F.snap().tasks.filter(t => t.kind === 'collection' && !['cancelled', 'completed'].includes(t.status) && t.assetIds.some(id => selected.includes(id)));
  if (tasks.some(t => t.status !== 'waiting')) throw new Error('차량이 진행 중인 수거 업무는 배달·수거 화면에서 먼저 확인해 주세요.');
  const held = F.assets(selected);
  if (tasks.length || plan.method === 'vehicle' && held.length) F.atomic(commit => {
    for (const task of tasks) {
      const remaining = F.remaining(task).filter(id => !selected.includes(id));
      if (remaining.length) commit('task.save', { ...F.taskPayload(task), assetIds: task.assetIds.filter(id => !selected.includes(id)) });
      else commit('task.status', { id: task.id, status: 'cancelled' });
    }
    if (plan.method === 'vehicle') for (const owner of new Set(held.map(a => a.location.id))) commit('task.save', {
      id: window.SkiWorkflowClient.randomId('rental-plan-'), kind: 'collection', vehicleId: F.vehicleId, customerId: owner, orderId: order.id,
      title: order.name + ' 수거', date: plan.date, time: plan.time || order.time || '16:30', place: plan.place || order.place || '매장',
      assetIds: held.filter(a => a.location.id === owner).map(a => a.id)
    });
  });
  if (!F.orders.has(order.id)) {
    const projected = F.projectOrder(order.id);
    if (projected) F.orders.set(order.id, projected);
  }
  for (const binding of F.orders.get(order.id)?.bindings || []) if (selectedItems.some(i => i.id === (binding.itemId || binding.item.id))) {
    binding.item.returnPlan = { ...binding.item.returnPlan, ...plan };
  }
}

const board = new RentalBoard();
let callbacks = new Map(), lastRoute = '', focusBack = null;
const isDetail = () => ['rental', 'return-detail'].includes(S.state.page);
const bind = (handler, path) => { const key = path + ':' + callbacks.size; callbacks.set(key, handler); return key; };
const emptyOrder = { id: '', items: [], log: [], amount: 0, paid: 0, start: today, end: today, pickup: today };
board.order = () => board.state.data.find(o => o.id === board.state.id) || board.state.data[0] || emptyOrder;

board.setState = function (update) {
  const next = typeof update === 'function' ? update(this.state) : update;
  const previous = this.state;
  this.state = { ...previous, ...next };
  S.state.filters.rentalQuery = this.state.query;
  S.state.tabs.rental = this.state.tab;
  if (next.view && (next.view !== previous.view || next.id && next.id !== previous.id)) {
    S.go(next.view === 'list' ? 'rentals' : 'rental', next.view === 'list' ? {} : { id: this.state.id });
    return;
  }
  const active = document.activeElement;
  const selection = active?.type === 'search' ? [active.selectionStart, active.selectionEnd] : null;
  const focusKey = active?.getAttribute('data-rental-input') || active?.getAttribute('data-rental-change') || active?.getAttribute('data-rental-click');
  if (!previous.dialog && next.dialog) focusBack = focusKey;
  const scrolls = [...S.root.querySelectorAll('.so-rental-board *')].filter(el => el.scrollTop || el.scrollLeft).map(el => ({ el, top: el.scrollTop, left: el.scrollLeft }));
  const indexed = [...S.root.querySelectorAll('.so-rental-board *')];
  S.render();
  const rendered = [...S.root.querySelectorAll('.so-rental-board *')];
  for (const scroll of scrolls) { const target = rendered[indexed.indexOf(scroll.el)]; if (target) { target.scrollTop = scroll.top; target.scrollLeft = scroll.left; } }
  const targetKey = previous.dialog && !this.state.dialog ? focusBack : focusKey;
  const target = [...S.root.querySelectorAll('[data-rental-input],[data-rental-change],[data-rental-click]')].find(el => [...el.attributes].some(a => a.name.startsWith('data-rental-') && a.value === targetKey));
  if (target && !target.disabled && (previous.dialog || !this.state.dialog)) {
    target.focus({ preventScroll: true });
    if (selection && target.type === 'search') target.setSelectionRange(...selection);
  }
};

board.confirm = function () {
  const dlg = this.state.dialog;
  if (!dlg) return;
  if (dlg.form && dlg.kind !== 'schedule') { this.setState({ dialog: null }); this.say(dlg.form.title + ' — 화면 체험용이라 저장되지 않습니다.'); return; }
  try {
    if (dlg.revision !== F.snap().revision) throw new Error('수량이나 일정이 변경됐습니다. 창을 닫고 최신 내용을 다시 확인해 주세요.');
    const order = this.order();
    if (dlg.kind === 'schedule') {
      const read = label => S.root.querySelector('[data-rental-form-field="' + label + '"]').value;
      const slot = read('반납 타임'), time = window.SkiIntake.getReturnPresets().find(p => p.label === slot)?.time || order.time || '16:30';
      const plan = { date: read('반납일'), slot, time, method: read('반납 방법') === '차량 수거' ? 'vehicle' : 'direct', place: read('장소') };
      const selected = order.items.filter(i => i.customer || i.unissued);
      if (!selected.length) throw new Error('변경할 고객 보유 물품이나 지급 예정 물품이 없습니다.');
      updatePlan(order, selected, plan);
      const base = S.data.orders.find(o => o.id === order.id);
      if (base) Object.assign(base, { due: plan.date, slot, time, method: plan.method === 'vehicle' ? '차량 수거' : '매장 직접', place: plan.place });
      this.setState({ dialog: null }); this.say('반납 일정과 남은 수거 업무를 변경했습니다.'); return;
    }
    if (dlg.kind === 'plan') {
      const item = order.items.find(i => i.id === dlg.itemId);
      updatePlan(order, [item], { date: dlg.due, method: dlg.method === '차량 수거' ? 'vehicle' : 'direct', time: item.time, place: item.place });
      this.setState({ dialog: null }); this.say(item.name + ' 반납 예정을 변경했습니다.'); return;
    }
    const selected = order.items.flatMap(i => {
      const quantity = dlg.qty[i.id] || 0;
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > i[dlg.field]) throw new Error('처리 수량을 확인해 주세요.');
      const assets = assetsFor(i, dlg.field, order.id).slice(0, quantity);
      if (assets.length !== quantity) throw new Error('물품 위치가 변경됐습니다. 최신 수량을 다시 확인해 주세요.');
      return assets;
    });
    if (!selected.length) throw new Error('수량을 선택하세요.');
    const ids = selected.map(a => a.id);
    if (dlg.kind === 'direct') F.returnCustomer(order.id, ids);
    else if (dlg.kind === 'vehicle') F.run('stock.move', { kind: 'receive', from: F.van, to: F.shop, assetIds: ids });
    else {
      const history = F.store.history().movements;
      const corrections = new Map();
      for (const id of ids) {
        const movement = history.filter(m => m.assetIds.includes(id) && !m.reversedAssetIds.includes(id)).at(-1);
        if (!movement || !['directReturn', 'receive'].includes(movement.kind)) throw new Error('이 수량은 초기 샘플 기록입니다. 이 화면에서 처리한 반납 기록만 정정할 수 있습니다.');
        if (!corrections.has(movement.id)) corrections.set(movement.id, []);
        corrections.get(movement.id).push(id);
      }
      F.atomic(commit => { for (const [movementId, assetIds] of corrections) commit('movement.undo', { movementId, assetIds, reason: '반납 수량 확인 후 정정' }); });
    }
    S.workflowUI.syncBase();
    const text = this.qtyText(order, dlg.qty);
    this.setState({ dialog: null });
    this.say(({ direct: '직접반납 처리: ', vehicle: '차량 인수분 최종 확인: ', fix: '반납 수량 정정: ' })[dlg.kind] + text);
  } catch (error) { this.setState({ dialog: { ...dlg, error: error.message } }); }
};

function render() {
  const route = S.state.page + ':' + (S.state.params.id || '');
  if (lastRoute !== route) board.state.dialog = null;
  lastRoute = route;
  board.state.data = projectOrders();
  board.state.view = isDetail() ? 'detail' : 'list';
  board.state.id = S.state.params.id || board.state.data[0]?.id;
  board.state.tab = S.state.tabs.rental || (board.order().stage === 'pickup' ? 'items' : 'return');
  board.state.query = S.state.filters.rentalQuery || '';
  const values = board.renderVals();
  if (board.state.dialog?.kind === 'fix') values.dialogLead = '잘못 처리한 수량을 되돌립니다. 직접반납은 고객 보유로, 차량 인수분은 차량 보관으로 돌아갑니다.';
  callbacks = new Map();
  return window.SkiRentalView(values, bind, S.esc);
}

function mount() {
  for (const select of S.root.querySelectorAll('.so-rental-overlay select[value]')) select.value = select.getAttribute('value');
  for (const field of board.state.dialog?.form?.fields || []) {
    const control = [...S.root.querySelectorAll('[data-rental-form-field]')].find(el => el.dataset.rentalFormField === field.label);
    if (control && field.value != null) control.value = field.value;
  }
  const dialog = S.$('.so-rental-overlay');
  S.$('.so-sidebar').inert = !!dialog;
  S.$('.so-topbar').inert = !!dialog;
  S.$('.so-rental-board').inert = !!dialog;
  if (dialog) dialog.querySelector('button:not(:disabled),input,select')?.focus({ preventScroll: true });
}

for (const type of ['click', 'input', 'change']) S.root.addEventListener(type, event => {
  const target = event.target.closest('[data-rental-' + type + ']');
  if (!target || target.disabled) return;
  const handler = callbacks.get(target.getAttribute('data-rental-' + type));
  if (handler) handler(event);
});
S.root.addEventListener('keydown', event => {
  const dialog = S.$('.so-rental-overlay');
  if (!dialog) return;
  if (event.key === 'Escape') { event.preventDefault(); board.setState({ dialog: null }); }
  if (event.key === 'Tab') {
    const focusable = [...dialog.querySelectorAll('button:not(:disabled),input,select,a[href]')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
S.root.addEventListener('ski:close-dialogs', () => {
  clearTimeout(board._t);
  board.state.notice = '';
  board.state.dialog = null;
  for (const el of S.root.querySelectorAll('.so-sidebar,.so-topbar,.so-rental-board')) el.inert = false;
});

S.register('rentals', { title: '렌탈·반납 현황', render, mount });
S.register('returns', { title: '렌탈·반납 현황', parent: 'rentals', render, mount });
S.register('rental', { title: '렌탈·반납 상세', parent: 'rentals', render, mount });
S.register('return-detail', { title: '렌탈·반납 상세', parent: 'rentals', render, mount });
S.rentalBoard = Object.freeze({ snapshot: projectOrders });
})();
