(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, U = S.posOrders, e = S.esc, won = S.money, b = P.button;
  const { input, select, read, error, errorBox, go } = U;
  const conditions = [['ready', '준비 완료'], ['cleaning', '세척 중'], ['inspection', '점검 대기'], ['repair', '수리 중'], ['lost', '분실']];
  const settingTabs = [['store', '매장 정보'], ['places', '수령 장소'], ['rates', '장비 요금'], ['discounts', '할인'], ['returnTimes', '반납 타임'], ['staff', '직원'], ['vehicles', '차량'], ['nightCutoff', '야간 기준']];
  const addLabels = { places: '장소 추가', discounts: '할인 추가', returnTimes: '반납 타임 추가', staff: '직원 추가', vehicles: '차량 추가' };
  const discountKinds = [['perUnit', '장비당 할인'], ['percent', '% 할인'], ['amount', '금액 할인'], ['liftPercent', '리프트권 할인']];
  // Starting values per ski resort (docs/44). Sample lists until the real database is connected; rates and discounts are never touched.
  const resortTemplates = [
    { id: 'muju', name: '무주덕유산리조트', areas: [['만선', ['만선 티롤 앞', '만선 광장', '만선 매표소 앞', '만선 주차장 입구', '만선 셔틀 정류장']], ['설천', ['설천 주차장', '설천 매표소 앞', '설천 곤도라 앞', '설천 셔틀 정류장']], ['기타', ['리조트 웰컴센터', '가족호텔 로비', '국민호텔 로비']]], tickets: [['오전권', 4], ['오후권', 4], ['야간권', 4], ['심야권', 3], ['주간권', 8], ['종일권', 12]] },
    { id: 'jisan', name: '지산포레스트리조트', areas: [['정문', ['정문 매표소 앞', '정문 주차장']], ['기타', ['콘도 로비', '셔틀 정류장']]], tickets: [['오전권', 4], ['오후권', 4], ['야간권', 4], ['심야권', 3]] },
    { id: 'konjiam', name: '곤지암리조트', areas: [['스키하우스', ['스키하우스 정문', '스키하우스 주차장']], ['기타', ['콘도 로비']]], tickets: [['4시간권', 4], ['6시간권', 6], ['야간권', 4]] }
  ];
  const templateTimes = [['오전타임 후', '12:00', 0], ['오후타임 후', '16:30', 0], ['야간타임 후', '22:00', 0], ['익일 오전', '09:00', 1]];
  const state = { sku: '', condition: '', assetQuery: '', inventoryQuery: '', inventoryFilter: '', selected: new Set(), partnerTab: 'loans', settingTab: 'store', area: '', discountKind: 'perUnit', template: 'muju', draft: null, customerQuery: '' };
  const m = () => D.snapshot.management, product = id => D.snapshot.catalog.find(row => row.id === id), partner = id => m().partners.find(row => row.id === id);
  const size = () => innerHeight < 700 ? 4 : 6, settingSize = () => innerHeight < 700 ? 5 : 7; // the settings screen has no toolbar row, so one more row fits
  const info = text => '<p class="pos-info">' + e(text) + '</p>';
  const form = html => '<div class="pos-form-grid">' + html + '</div>';
  const back = () => go('관리 목록', 'management');
  const won0 = value => won(value || 0);
  const location = a => a.condition === 'lost' ? '마지막 위치: ' + ({ shop: '매장', vehicle: '차량', customer: '고객', vendor: '거래처' }[a.location.kind] || a.location.kind) : ({ shop: '매장', vehicle: '차량 보관', customer: '고객 보유', vendor: a.activePartnerLendingId ? '거래처에 대여 중' : '거래처 반환' }[a.location.kind] || a.location.kind);
  const assetTitle = a => (product(a.sku)?.label || a.sku) + (a.size ? ' · ' + a.size : '') + ' · ' + a.id;
  const assetDescription = a => location(a) + ' · ' + (conditions.find(c => c[0] === a.condition)?.[1] || a.condition) + (a.owner?.kind === 'partner' ? ' · 차입 장비' : '') + (a.orderPreparation ? ' · 준비 배정됨' : '');
  async function save(type, payload, message, after) {
    try { const result = await D.execute(type, payload); S.close(); state.draft = null; if (after) after(result); else S.render(); S.toast(message); }
    catch (err) { error(err); }
  }
  function hub() {
    const inv = m().inventory, lost = m().assets.filter(a => a.condition === 'lost').length, service = m().assets.filter(a => ['cleaning', 'inspection', 'repair'].includes(a.condition)).length;
    const balances = D.snapshot.finance.partnerBalances || [], unsettled = balances.filter(row => row.receivableWon || row.payableWon || row.borrowedPendingQuantity || row.lentPendingQuantity).length;
    const closings = D.snapshot.closings, openToday = !closings.some(c => c.date === D.today && !c.reopenings.length);
    const receivable = balances.reduce((n, r) => n + r.receivableWon, 0), payable = balances.reduce((n, r) => n + r.payableWon, 0), last = closings.slice().sort((x, y) => y.date.localeCompare(x.date))[0], store = m().settings;
    const tiles = [
      P.tile({ name: '재고·정비', route: 'inventory', badge: lost ? ['분실 ' + lost, 'red'] : service ? ['정비 ' + service, 'orange'] : ['정상', 'green'], tone: lost ? 'red' : '', lines: [['대여 가능 ' + inv.reduce((n, row) => n + row.available, 0) + '개 · 전체 ' + m().assets.length + '개', ''], ['세척·점검·수리 ' + service + '개 · 분실 ' + lost + '개', service || lost ? 'orange' : '']] }),
      P.tile({ name: '거래처 장부', route: 'partners', badge: unsettled ? ['정산 대기 ' + unsettled + '곳', 'red'] : ['정산 완료', 'green'], tone: unsettled ? 'red' : '', lines: [['거래처 ' + m().partners.length + '곳', ''], ['미수 ' + won0(receivable) + ' · 미지급 ' + won0(payable), unsettled ? 'red' : '']] }),
      P.tile({ name: '고객 관리', route: 'customers', badge: ['고객 ' + m().customerProfiles.length + '명', 'blue'], lines: [['연락처 등록 ' + m().customerProfiles.length + '명', ''], ['미등록 방문 ' + m().unlinkedVisits.length + '건', m().unlinkedVisits.length ? 'orange' : '']] }),
      P.tile({ name: '매장 설정', route: 'settings', badge: ['설정 ' + m().settingsVersion + '판', 'grey'], lines: [['요금 ' + store.rates.length + '건 · 수령 장소 ' + store.places.length + '곳', ''], ['차량 ' + store.vehicles.length + '대 · 직원 ' + store.staff.length + '명 · 반납 타임 ' + store.returnTimes.length, '']] }),
      P.tile({ name: '인쇄물', route: 'guide', badge: ['QR · 안내', 'grey'], lines: [['QR 안내판 · 고객 안내', ''], [store.store?.link ? '안내 주소 등록됨' : '안내 주소 미등록', store.store?.link ? '' : 'orange']] }),
      P.tile({ name: '마감 이력', route: 'closing-history', badge: openToday ? ['오늘 마감 전', 'red'] : ['오늘 마감 완료', 'green'], tone: openToday ? 'red' : '', lines: [['마감 기록 ' + closings.length + '일', ''], [last ? '최근 ' + last.date.slice(5).replace('-', '/') + ' · 현금 차이 ' + won0(last.differenceWon) : '마감 기록 없음', last?.differenceWon ? 'red' : '']] })
    ];
    return P.page('매장 관리', '', '<div class="pos-tiles">' + tiles.join('') + '</div>', '<span>' + e('정비 ' + service + '개 · 분실 ' + lost + '개 · 거래처 미정산 ' + unsettled + '곳') + '</span><div class="so-actions">' + go('오늘 할 일', 'home') + '</div>', { wait: openToday ? '마감 전' : '없음', sums: [['정비', service + '개', service ? 'orange' : ''], ['분실', lost + '개', lost ? 'red' : ''], ['거래처 미정산', unsettled + '곳', unsettled ? 'red' : '']] });
  }
  const bareSelect = (name, values, value, label) => '<select class="pos-toolbar-select" data-pos-input="' + name + '" data-change="pm-inventory-filter" aria-label="' + e(label) + '">' + values.map(([id, text]) => '<option value="' + e(id) + '"' + (id === value ? ' selected' : '') + '>' + e(text) + '</option>').join('') + '</select>';
  const stockAssets = () => m().assets.filter(a => a.location.kind !== 'vendor' || a.activePartnerLendingId);
  const serviceCount = row => row.conditions.inspection + row.conditions.repair + row.conditions.damaged;
  function inventory() {
    const assets = stockAssets(), query = state.inventoryQuery.toLowerCase().trim();
    const count = (row, filter) => filter === 'available' ? row.available : filter === 'service' ? serviceCount(row) : filter ? row.conditions[filter] || 0 : row.total;
    const ordinary = row => product(row.sku)?.kind !== 'liftTicket' && !row.sku.startsWith('legacy-');
    const rows = m().inventory.filter(row => row.total || ordinary(row)).sort((a, b) => Number(ordinary(b)) - Number(ordinary(a)));
    const shown = rows.filter(row => (!state.inventoryFilter || count(row, state.inventoryFilter)) && (!query || (row.label + ' ' + row.sku).toLowerCase().includes(query) || assets.some(a => a.sku === row.sku && (a.id + ' ' + (a.size || '')).toLowerCase().includes(query))));
    const total = filter => rows.reduce((sum, row) => sum + count(row, filter), 0);
    const cards = shown.map(row => {
      const service = serviceCount(row), lost = row.conditions.lost, cleaning = row.conditions.cleaning;
      return P.tile({ name: row.label, action: 'pm-inventory-open', id: row.sku, open: '상태 변경', tone: lost ? 'red' : service || cleaning ? 'orange' : '',
        badge: lost ? ['분실 ' + lost, 'red'] : service ? ['정비 중 ' + service, 'orange'] : cleaning ? ['세척 대기 ' + cleaning, 'orange'] : ['정상', 'green'], figures: [{ label: '대여 가능', value: row.available }],
        lines: [['보유 ' + row.total + ' · 대여 중 ' + row.customer + (row.vehicle ? ' · 차량 ' + row.vehicle : '') + (row.partnerOut ? ' · 거래처 ' + row.partnerOut : ''), ''], ['세척 ' + cleaning + ' · 정비 ' + service + ' · 분실 ' + lost, '']] });
    });
    const filters = [['', '전체'], ['available', '대여 가능'], ['cleaning', '세척 대기'], ['service', '정비 중'], ['lost', '분실']];
    return P.page('재고·정비', '', '<div class="pm-inventory-tiles">' + P.cards([{ cards }], { fixed: true, cols: 3, cardHeight: 180, signature: 'inventory|' + state.inventoryFilter + '|' + query, empty: '해당 품목 없음' }) + '</div>',
      '<span>' + e('대여 가능 ' + total('available') + '개 · 세척 ' + total('cleaning') + '개 · 정비 ' + total('service') + '개 · 분실 ' + total('lost') + '개') + '</span><div class="so-actions">' + back() + b('실물 목록', 'pm-inventory-open') + '</div>',
      { toolbar: P.search('pm-inventory-query', state.inventoryQuery, '품목 · 물품번호 · 사이즈') + P.group(filters.map(([id, label]) => P.chip(label, 'pm-inventory-state', id, state.inventoryFilter === id, total(id))).join('')), wait: total('lost') ? '분실 ' + total('lost') + '개' : total('service') ? '정비 ' + total('service') + '개' : '없음' });
  }
  S.action('pm-inventory-state', value => { state.inventoryFilter = value; S.render(); });
  S.search('pm-inventory-query', value => { state.inventoryQuery = value; const cursor = S.$('[data-search="pm-inventory-query"]')?.selectionStart; S.render(); const el = S.$('[data-search="pm-inventory-query"]'); el?.focus(); if (cursor != null) el?.setSelectionRange(cursor, cursor); });
  S.action('pm-inventory-open', id => { state.sku = id; state.condition = state.inventoryFilter; state.assetQuery = state.inventoryQuery; state.selected.clear(); S.go('inventory-assets'); P.setPage('management-assets', 0); });
  function inventoryAssets() {
    const snapshot = { ...D.snapshot, movements: D.history.movements };
    const condition = a => state.condition === 'available' ? a.location.kind === 'shop' && window.SkiWorkflowInventory.allocatable(snapshot, a) : state.condition === 'service' ? ['inspection', 'repair', 'damaged'].includes(a.condition) : !state.condition || a.condition === state.condition;
    const assets = stockAssets().filter(a => (!state.sku || a.sku === state.sku) && condition(a) && (!state.assetQuery || (a.id + ' ' + (a.size || '') + ' ' + product(a.sku)?.label).toLowerCase().includes(state.assetQuery.toLowerCase())));
    const available = m().inventory.filter(row => !state.sku || row.sku === state.sku).reduce((n, row) => n + row.available, 0);
    const count = condition => m().assets.filter(a => a.condition === condition && (!state.sku || a.sku === state.sku)).length, service = count('cleaning') + count('inspection') + count('repair'), lost = count('lost');
    const toolbar = go('품목별 보기', 'inventory') + P.search('pm-assets', state.assetQuery, '물품번호 · 사이즈') + P.group(bareSelect('pmSkuFilter', [['', '전체 품목'], ...D.snapshot.catalog.map(row => [row.id, row.label])], state.sku, '품목') + bareSelect('pmConditionFilter', [['', '전체 상태'], ['available', '대여 가능'], ['service', '점검·수리'], ...conditions], state.condition, '상태')) + P.toolbarLabel('대여 가능 ' + available + '개 · 표시 ' + assets.length + '개');
    const rows = P.pager(assets, 'management-assets', a => P.row(assetTitle(a), assetDescription(a), a.activePartnerLendingId ? go('거래처 회수', 'partner-detail', a.location.id) : a.condition === 'lost' ? b('발견 확인', 'pm-found', a.id) : b(state.selected.has(a.id) ? '선택됨 ✓' : '선택', 'pm-asset-select', a.id, state.selected.has(a.id) ? 'soft' : '')), size());
    return P.page('재고·정비 · 실물 목록', '', rows, '<span>' + e('대여 가능 ' + available + '개 · 정비 ' + service + '개 · 분실 ' + lost + '개 · ' + state.selected.size + '개 선택') + '</span><div class="so-actions">' + go('품목별 보기', 'inventory') + b('선택 해제', 'pm-asset-clear') + b('선택 물품 상태 변경', 'pm-asset-state', '', 'primary') + '</div>', { toolbar, wait: service ? '정비 ' + service + '개' : '없음', sums: [['대여 가능', available + '개', 'green'], ['정비', service + '개', service ? 'orange' : ''], ['분실', lost + '개', lost ? 'red' : '']] });
  }
  S.change('pm-inventory-filter', () => { state.sku = read('pmSkuFilter'); state.condition = read('pmConditionFilter'); state.selected.clear(); P.setPage('management-assets', 0); });
  S.search('pm-assets', value => { state.assetQuery = value; state.selected.clear(); P.setPage('management-assets', 0, { render: false }); const cursor = S.$('[data-search="pm-assets"]')?.selectionStart; S.render(); const el = S.$('[data-search="pm-assets"]'); el?.focus(); if (cursor != null) el?.setSelectionRange(cursor, cursor); });
  S.action('pm-asset-select', id => { state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); S.render(); });
  S.action('pm-asset-clear', () => { state.selected.clear(); S.render(); });
  S.action('pm-asset-state', () => {
    if (!state.selected.size) { S.toast('먼저 상태를 바꿀 물품을 선택해 주세요.'); return; }
    P.modal('선택 물품 상태 변경', info(state.selected.size + '개 물품 · 세척·점검·수리가 끝나면 매장에서 준비 완료로 바꿔 주세요.') + form(select('변경할 상태', 'pmCondition', conditions, 'inspection') + select('처리 사유', 'pmReason', [['반납 후 상태 확인', '반납 후 상태 확인'], ['세척 작업 시작', '세척 작업 시작'], ['정비 완료 확인', '정비 완료 확인'], ['파손 확인', '파손 확인'], ['실물 미확인·분실', '실물 미확인·분실']], '반납 후 상태 확인')) + errorBox(), b('취소', 'close') + b('상태 변경 기록', 'pm-asset-save', '', 'primary'));
  });
  S.action('pm-asset-save', () => save('management.asset', { assetIds: [...state.selected], condition: read('pmCondition'), reason: read('pmReason') }, '물품 상태와 처리 이력을 기록했습니다.', () => { state.selected.clear(); S.render(); }));
  S.action('pm-found', id => P.modal('분실품 발견·매장 입고', info(assetTitle(m().assets.find(a => a.id === id))) + select('발견 확인', 'pmFoundReason', [['고객이 매장에 반납', '고객이 매장에 반납'], ['차량에서 찾아 매장 입고', '차량에서 찾아 매장 입고'], ['매장 안에서 발견', '매장 안에서 발견']], '매장 안에서 발견') + info('실물을 매장에서 확인한 뒤 기록하세요. 발견 후에는 점검 대기로 남습니다.') + errorBox(), b('취소', 'close') + b('실물 확인·입고 기록', 'pm-found-save', id, 'primary')));
  S.action('pm-found-save', id => save('management.found', { assetId: id, condition: 'inspection', reason: read('pmFoundReason') }, '발견한 물품을 매장 점검 대기로 기록했습니다.'));
  function partnerCard(p) {
    const loans = p.loans.reduce((n, l) => n + l.outstandingQuantity, 0), lendings = p.lendings.reduce((n, l) => n + l.outstandingQuantity, 0), receivable = p.receivableWon || 0, payable = p.payableWon || 0;
    const tone = receivable ? 'red' : payable ? 'orange' : '';
    return P.orderCard({ id: p.id, tone, badge: receivable ? ['미수', 'red'] : payable ? ['미지급', 'orange'] : loans || lendings ? ['실물 정산 대기', 'purple'] : ['정산 완료', 'green'], name: p.name, phone: p.phone || '', metaParts: ['빌린 물품 ' + p.loans.length + '건', '빌려준 물품 ' + p.lendings.length + '건', p.agreements.length ? '' : '약정 확인 필요'],
      itemFit: 'parts', itemParts: ['돌려줄 물품 ' + loans + '개', '돌려받을 물품 ' + lendings + '개'], state: loans || lendings ? ['실물 ' + (loans + lendings) + '개', 'purple'] : null,
      money: receivable ? ['미수 ' + won0(receivable), 'red'] : payable ? ['미지급 ' + won0(payable), 'orange'] : ['정산 완료', 'green'], actions: go('장부 열기', 'partner-detail', p.id), go: { page: 'partner-detail', id: p.id } });
  }
  function partners() {
    const rows = m().partners, receivable = rows.reduce((n, p) => n + (p.receivableWon || 0), 0), payable = rows.reduce((n, p) => n + (p.payableWon || 0), 0);
    return P.page('거래처 장부', '', P.cards([{ title: '거래처', sub: rows.length + '곳', cards: rows.map(partnerCard) }], { fixed: true, signature: 'partners', empty: '거래처 없음', emptyNote: '거래처 추가로 시작' }), '<span>' + e('거래처 ' + rows.length + '곳 · 미수 ' + won0(receivable) + ' · 미지급 ' + won0(payable)) + '</span><div class="so-actions">' + back() + b('거래처 추가', 'pm-partner-edit', '', 'primary') + '</div>', { toolbar: P.toolbarLabel('빌려오기 → 실물 반환 → 실제 금액 기록'), wait: rows.filter(p => p.receivableWon || p.payableWon).length ? '미정산 ' + rows.filter(p => p.receivableWon || p.payableWon).length + '곳' : '없음', sums: [['미수', won0(receivable), receivable ? 'red' : ''], ['미지급', won0(payable), payable ? 'orange' : '']] });
  }
  const detailInfo = rows => '<dl class="pos-detail-info">' + rows.map(([label, parts]) => '<div><dt>' + e(label) + '</dt><dd data-fit="parts" data-parts="' + e(JSON.stringify(parts)) + '">' + e(parts.join(' · ')) + '</dd></div>').join('') + '</dl>';
  const detailSums = rows => '<div class="pm-detail-totals">' + rows.map(([label, value, tone]) => '<span class="pos-sum"><span>' + e(label) + '</span><strong data-tone="' + e(tone || '') + '">' + e(value) + '</strong></span>').join('') + '</div>';
  function transferCard(name, note, labels, values) {
    return '<article class="pos-card pos-item-card pm-transfer-card"><span class="pos-item-copy"><strong>' + e(name) + '</strong><span data-fit="auto">' + e(note) + '</span></span><span class="pos-item-figures">' + labels.map((label, index) => '<span><small>' + e(label) + '</small><b' + (index === 2 && values[index] ? ' data-tone="orange"' : '') + '>' + values[index] + '</b></span>').join('') + '</span></article>';
  }
  function partnerDetail() {
    const p = partner(S.state.params.id); if (!p) return partners();
    const borrowed = p.loans.reduce((sum, row) => sum + row.outstandingQuantity, 0), lent = p.lendings.reduce((sum, row) => sum + row.outstandingQuantity, 0);
    const side = '<aside class="pos-panel pos-detail-side"><div class="pos-detail-name"><strong data-fit="words">' + e(p.name) + '</strong>' + P.badge(p.receivableWon ? '미수' : p.payableWon ? '미지급' : '정산 확인', p.receivableWon ? 'red' : p.payableWon ? 'orange' : 'grey') + '</div>'
      + detailInfo([['연락처', [p.phone || '미등록']], ['미수', [won0(p.receivableWon)]], ['미지급', [won0(p.payableWon)]], ['돌려줄', [borrowed + '개']], ['돌려받을', [lent + '개']], ['약정', [p.agreements.length ? p.agreements.length + '건 · 상계 ' + won0(p.offsetWon) : '금액 확인 필요']]])
      + '<div class="pos-detail-actions pos-shortcuts">' + b('연락처', 'pm-partner-edit', p.id) + b('실제 금액 기록', 'pm-partner-money', p.id) + b('물품 빌려오기', 'pm-partner-borrow', p.id) + b('실제 반환', 'pm-partner-return', p.id) + b('물품 빌려주기', 'pm-partner-lend', p.id) + b('실제 회수', 'pm-partner-receive', p.id) + '</div></aside>';
    let cards, summary = '', actions;
    const loanTab = state.partnerTab === 'loans' || state.partnerTab === 'lendings', lending = state.partnerTab === 'lendings';
    if (loanTab) {
      cards = lending ? p.lendings.map(row => transferCard([...new Set(row.assetIds.map(id => product(m().assets.find(a => a.id === id)?.sku)?.label || '물품'))].join(' · ') + ' ' + row.assetIds.length + '개', '돌려받을 날 ' + row.dueDate, ['대여', '회수', '미회수'], [row.assetIds.length, row.receivedQuantity, row.outstandingQuantity]))
        : p.loans.map(row => transferCard((product(row.sku)?.label || row.sku) + ' ' + row.quantity + '개', '돌려줄 날 ' + row.dueDate + (row.size ? ' · 규격 ' + row.size : ''), ['차입', '반환', '미반환'], [row.quantity, row.returnedQuantity, row.outstandingQuantity]));
      const agreements = p.agreements.filter(row => row.kind === (lending ? 'receivable' : 'payable'));
      const figures = [[lending ? '받을 약정' : '줄 약정', agreements.length ? won(agreements.reduce((sum, row) => sum + row.amountWon, 0)) : '미등록', ''], [lending ? '실제 받음' : '실제 지급', won0(lending ? p.receivedWon : p.paidWon), 'green'], [lending ? '미수' : '미지급', won0(lending ? p.receivableWon : p.payableWon), 'red']];
      summary = '<div class="pos-panel pm-balance-lines">' + figures.map(([label, amount, tone]) => '<div><span>' + label + '</span><b data-tone="' + tone + '">' + e(amount) + '</b></div>').join('') + '</div><p class="pos-detail-hint" data-fit="auto">거래처 전체 금액 · 미배분·상계는 별도 확인</p>';
      actions = b(lending ? '물품 빌려주기' : '물품 빌려오기', lending ? 'pm-partner-lend' : 'pm-partner-borrow', p.id, 'primary');
    } else if (state.partnerTab === 'agreements') {
      cards = p.agreements.map(row => P.orderCard({ name: (row.kind === 'receivable' ? '받을 약정 ' : '줄 약정 ') + won(row.amountWon), metaParts: [row.reason], itemFit: 'parts', itemParts: ['실제 배분 ' + won(row.paidWon), '상계 ' + won(row.offsetWon)], money: ['남음 ' + won(row.outstandingWon), row.outstandingWon ? 'red' : 'green'], actions: row.outstandingWon ? b('실제 금액 기록', 'pm-agreement-money', row.id) : '' }));
      actions = b('상계 이력', 'pm-offset-history', p.id) + b('상계 확인', 'pm-partner-offset', p.id) + b('약정 금액 기록', 'pm-partner-agreement', p.id, 'primary');
    } else {
      cards = p.money.slice().reverse().map(row => P.orderCard({ name: (row.kind === 'payment' ? '지급 ' : '받음 ') + won(row.amountWon), metaParts: [row.at.slice(0, 10), { cash: '현금', card: '외부 카드 단말', transfer: '계좌이체' }[row.method] || '수단 확인 필요'], itemFit: 'words', itemParts: [row.reason], money: [row.agreementId ? '약정에 배분' : '미배분', 'grey'] }));
      actions = b('약정 금액 기록', 'pm-partner-agreement', p.id) + b('실제 금액 기록', 'pm-partner-money', p.id, 'primary');
    }
    const list = P.cards([{ cards }], { fixed: true, cols: 1, cardHeight: loanTab ? 108 : 171, signature: p.id + '|' + state.partnerTab, empty: '기록 없음' });
    const tabBar = P.group([['loans', '빌린 물품'], ['lendings', '빌려준 물품'], ['agreements', '약정·상계'], ['money', '실제 금액']].map(([id, label]) => P.chip(label, 'pm-partner-tab', id, state.partnerTab === id)).join(''));
    return P.page('거래처 장부', '', '<div class="pos-detail pm-detail">' + side + '<div class="pos-detail-main">' + list + summary + '</div></div>', go('거래처 목록', 'partners') + '<div class="so-actions">' + actions + '</div>',
      { toolbar: go('목록', 'partners') + tabBar + detailSums([['미수', won0(p.receivableWon), 'red'], ['미지급', won0(p.payableWon), '']]), wait: p.receivableWon || p.payableWon ? '미정산' : '없음' });
  }
  S.action('pm-partner-tab', id => { state.partnerTab = id; S.render(); });
  S.action('pm-partner-edit', id => { const p = partner(id); state.draft = { partnerId: id || D.id('partner') }; P.modal(p ? '거래처 연락처' : '거래처 추가', form(input('거래처 이름', 'pmPartnerName', p?.name || '') + input('연락처', 'pmPartnerPhone', p?.phone || '', 'tel')) + errorBox(), b('취소', 'close') + b('거래처 저장', 'pm-partner-save', '', 'primary')); });
  S.action('pm-partner-save', () => save('partner.save', { id: state.draft.partnerId, name: read('pmPartnerName'), phone: read('pmPartnerPhone') }, '거래처 연락처를 저장했습니다.'));
  S.action('pm-partner-borrow', id => { state.draft = { partnerId: id }; P.modal(partner(id).name + ' · 물품 빌려오기', form(select('빌려온 품목', 'pmBorrowSku', D.snapshot.catalog.filter(s => s.kind !== 'liftTicket' && !s.id.startsWith('legacy-')).map(s => [s.id, s.label]), 'ski') + input('실제로 받은 수량', 'pmBorrowQuantity', 1, 'number', 'min="1" max="500" inputmode="numeric"') + input('사이즈 (선택)', 'pmBorrowSize', '') + input('돌려줄 예정일', 'pmBorrowDue', D.today, 'date')) + info('빌려온 소유권을 표시해 재고에 추가합니다. 대금은 실제 지급한 뒤 따로 기록하세요.') + errorBox(), b('취소', 'close') + b('실물 확인·차입 기록', 'pm-borrow-save', '', 'primary')); });
  S.action('pm-borrow-save', () => save('partner.borrow', { id: D.id('loan'), partnerId: state.draft.partnerId, sku: read('pmBorrowSku'), quantity: Number(read('pmBorrowQuantity')), size: read('pmBorrowSize'), dueDate: read('pmBorrowDue') }, '차입 실물과 돌려줄 예정일을 기록했습니다.'));
  function partnerReturn() {
    const d = state.draft, assets = m().assets.filter(a => a.owner?.kind === 'partner' && a.owner.id === d.partnerId && a.location.kind === 'shop' && a.condition !== 'lost');
    P.modal(partner(d.partnerId).name + ' · 실제 반환', info('매장에서 거래처로 실제 보낸 물품을 선택하세요. 배정 중인 물품은 먼저 배정을 해제해야 합니다.') + P.pager(assets, 'partner-return-assets', a => P.row(assetTitle(a), assetDescription(a), b(d.assetIds.has(a.id) ? '선택됨 ✓' : '선택', 'pm-return-select', a.id, d.assetIds.has(a.id) ? 'soft' : '')), 3) + errorBox(), b('취소', 'close') + b(d.assetIds.size + '개 실제 반환 기록', 'pm-return-save', '', 'primary'));
  }
  S.action('pm-partner-return', id => { state.draft = { partnerId: id, assetIds: new Set() }; partnerReturn(); });
  S.action('pm-return-select', id => { const ids = state.draft.assetIds; ids.has(id) ? ids.delete(id) : ids.add(id); partnerReturn(); });
  S.action('pm-return-save', () => save('partner.return', { id: D.id('partner-return'), assetIds: [...state.draft.assetIds] }, '거래처에 반환한 실물을 기록했습니다.'));
  function openPartnerMoney(id, agreementId = '') { const a = partner(id).agreements.find(a => a.id === agreementId); state.draft = { partnerId: id, agreementId }; P.modal(partner(id).name + ' · 실제 금액 기록', form(select('주고받은 방향', 'pmMoneyKind', [['payment', '거래처에 지급'], ['receipt', '거래처에서 받음']], a?.kind === 'receivable' ? 'receipt' : 'payment') + input('실제로 처리한 금액 (원)', 'pmMoneyAmount', a?.outstandingWon || '', 'number', 'min="1" inputmode="numeric"') + select('실제 처리 수단', 'pmMoneyMethod', [['cash', '현금'], ['transfer', '계좌이체'], ['card', '외부 카드 단말']], 'cash') + input('금액 처리 사유', 'pmMoneyReason', a?.reason || '차입 장비 대금')) + info('외부 단말·이체 결과를 확인한 뒤 기록하세요. 현금만 오늘 금고 입출금에 함께 반영합니다.') + errorBox(), b('취소', 'close') + b('기록 내용 확인', 'pm-money-review', '', 'primary')); }
  S.action('pm-partner-money', id => openPartnerMoney(id));
  S.action('pm-agreement-money', id => openPartnerMoney(S.state.params.id, id));
  S.action('pm-money-review', () => {
    try { const amountWon = Number(read('pmMoneyAmount')); window.SkiWorkflowCommon.integer(amountWon, 1, Number.MAX_SAFE_INTEGER); Object.assign(state.draft, { kind: read('pmMoneyKind'), amountWon, method: read('pmMoneyMethod'), reason: read('pmMoneyReason'), agreementId: state.draft.agreementId || null });
      const d = state.draft; P.modal('거래처 금액 확인', info(partner(d.partnerId).name + ' · ' + (d.kind === 'payment' ? '지급 ' : '받음 ') + won(d.amountWon) + ' · ' + ({ cash: '현금', transfer: '계좌이체', card: '외부 카드 단말' }[d.method])) + info(d.reason) + select('명시적으로 적용할 약정', 'pmMoneyAgreement', [['', '미배분 실제 금액'], ...partner(d.partnerId).agreements.filter(a => a.outstandingWon && a.kind === (d.kind === 'receipt' ? 'receivable' : 'payable')).map(a => [a.id, won(a.outstandingWon) + ' · ' + a.reason])], d.agreementId || '') + errorBox(), b('취소', 'close') + b('실제 처리 확인·기록', 'pm-money-save', '', 'primary'));
    } catch (err) { error(err); }
  });
  S.action('pm-money-save', () => { const d = state.draft; d.agreementId = read('pmMoneyAgreement') || null; save('partner.money', { id: D.id('partner-money'), partnerId: d.partnerId, kind: d.kind, amountWon: d.amountWon, method: d.method, reason: d.reason, ...(d.agreementId ? { agreementId: d.agreementId } : {}) }, '거래처 금액을 기록했습니다.'); });
  function partnerLend() {
    const d = state.draft;
    const candidates = m().assets.filter(a => a.location.kind === 'shop' && a.condition === 'ready' && !a.ticket && a.owner?.kind !== 'partner' && !a.orderPreparation && !a.exchangeReservationId && (!d.query || (a.id + ' ' + (a.size || '') + ' ' + product(a.sku)?.label).includes(d.query)));
    P.modal(partner(d.partnerId).name + ' · 실제 빌려주기', '<div class="pm-filters">' + input('물품·사이즈 찾기', 'pmLendQuery', d.query, 'text', 'data-search="pm-lend-query"') + input('돌려받을 예정일', 'pmLendDue', d.dueDate, 'date', 'data-change="pm-lend-due"') + '<span>자사 장비만 · 배정은 저장 시 재확인</span></div>' + P.pager(candidates, 'partner-lend-assets', a => P.row(assetTitle(a), assetDescription(a), b(d.assetIds.has(a.id) ? '선택됨 ✓' : '선택', 'pm-lend-select', a.id, d.assetIds.has(a.id) ? 'soft' : '')), 2) + errorBox(), b('취소', 'close') + b(d.assetIds.size + '개 실물 전달 기록', 'pm-lend-save', '', 'primary'));
  }
  S.action('pm-partner-lend', id => { state.draft = { partnerId: id, assetIds: new Set(), dueDate: D.today, query: '' }; partnerLend(); });
  S.change('pm-lend-due', value => { state.draft.dueDate = value; });
  S.search('pm-lend-query', value => { state.draft.query = value; P.setPage('partner-lend-assets', 0, { render: false }); partnerLend(); const el = S.$('[data-search="pm-lend-query"]'); el?.focus(); el?.setSelectionRange(value.length, value.length); });
  S.action('pm-lend-select', id => { const d = state.draft; d.assetIds.has(id) ? d.assetIds.delete(id) : d.assetIds.add(id); partnerLend(); });
  S.action('pm-lend-save', () => save('partner.lend', { id: D.id('lending'), partnerId: state.draft.partnerId, assetIds: [...state.draft.assetIds], dueDate: state.draft.dueDate, reason: '거래처에 실제 실물 전달 확인' }, '빌려준 실물과 회수 예정일을 기록했습니다.'));
  function partnerReceive() { const d = state.draft, ids = partner(d.partnerId).lendings.flatMap(l => l.outstandingAssetIds), assets = m().assets.filter(a => ids.includes(a.id)); P.modal(partner(d.partnerId).name + ' · 실제 회수', info('실물을 매장에서 받은 뒤 선택하세요. 회수한 장비는 점검 대기로 남습니다.') + P.pager(assets, 'partner-receive-assets', a => P.row(assetTitle(a), assetDescription(a), b(d.assetIds.has(a.id) ? '선택됨 ✓' : '선택', 'pm-receive-select', a.id, d.assetIds.has(a.id) ? 'soft' : '')), 3) + errorBox(), b('취소', 'close') + b(d.assetIds.size + '개 실제 회수 기록', 'pm-receive-save', '', 'primary')); }
  S.action('pm-partner-receive', id => { state.draft = { partnerId: id, assetIds: new Set() }; partnerReceive(); });
  S.action('pm-receive-select', id => { const d = state.draft; d.assetIds.has(id) ? d.assetIds.delete(id) : d.assetIds.add(id); partnerReceive(); });
  S.action('pm-receive-save', () => save('partner.receive', { id: D.id('partner-receive'), assetIds: [...state.draft.assetIds], reason: '거래처에서 실제 회수 확인' }, '회수한 실물을 매장 점검 대기로 기록했습니다.'));
  S.action('pm-partner-agreement', id => { state.draft = { partnerId: id }; P.modal('거래처 약정 금액', form(select('약정 방향', 'pmAgreementKind', [['payable', '거래처에 줄 돈'], ['receivable', '거래처에서 받을 돈']], 'payable') + input('합의한 금액 (원)', 'pmAgreementAmount', '', 'number', 'min="1" inputmode="numeric"') + input('약정 근거·내역', 'pmAgreementReason', '')) + info('실제 주고받은 돈과 별도로 약정을 기록합니다. 기존 미배분 금액은 자동 적용하지 않습니다.') + errorBox(), b('취소', 'close') + b('약정 금액 기록', 'pm-agreement-save', '', 'primary')); });
  S.action('pm-agreement-save', () => save('partner.agreement', { id: D.id('agreement'), partnerId: state.draft.partnerId, kind: read('pmAgreementKind'), amountWon: Number(read('pmAgreementAmount')), reason: read('pmAgreementReason') }, '확인한 약정 금액을 기록했습니다.'));
  S.action('pm-partner-offset', id => { const p = partner(id); state.draft = { partnerId: id }; P.modal('받을 돈·줄 돈 명시 상계', form(select('받을 약정', 'pmOffsetReceivable', [['', '약정 선택'], ...p.agreements.filter(a => a.kind === 'receivable' && a.outstandingWon).map(a => [a.id, won(a.outstandingWon) + ' · ' + a.reason])], '') + select('줄 약정', 'pmOffsetPayable', [['', '약정 선택'], ...p.agreements.filter(a => a.kind === 'payable' && a.outstandingWon).map(a => [a.id, won(a.outstandingWon) + ' · ' + a.reason])], '') + input('상계에 합의한 금액 (원)', 'pmOffsetAmount', '', 'number', 'min="1" inputmode="numeric"') + input('상계 근거·사유', 'pmOffsetReason', '')) + info('선택한 양쪽 약정만 같은 금액만큼 줄입니다. 실제 현금은 이동하지 않습니다.') + errorBox(), b('취소', 'close') + b('상계 내용 확인', 'pm-offset-review', '', 'primary')); });
  S.action('pm-offset-review', () => { try { const d = state.draft, p = partner(d.partnerId); Object.assign(d, { receivableId: read('pmOffsetReceivable'), payableId: read('pmOffsetPayable'), amountWon: Number(read('pmOffsetAmount')), reason: read('pmOffsetReason') }); const r = p.agreements.find(a => a.id === d.receivableId), a = p.agreements.find(a => a.id === d.payableId); if (!r || !a) throw new Error('양쪽 약정을 선택해 주세요.'); window.SkiWorkflowCommon.integer(d.amountWon, 1, Math.min(r.outstandingWon, a.outstandingWon)); P.modal('명시 상계 확인', info('받을 약정: ' + r.reason + ' / 줄 약정: ' + a.reason) + info(won(d.amountWon) + ' 상계 · ' + d.reason + ' · 현금 이동 없음') + errorBox(), b('취소', 'close') + b('선택 약정 상계 기록', 'pm-offset-save', '', 'primary')); } catch (err) { error(err); } });
  S.action('pm-offset-save', () => { const d = state.draft; save('partner.offset', { id: D.id('offset'), partnerId: d.partnerId, receivableId: d.receivableId, payableId: d.payableId, amountWon: d.amountWon, reason: d.reason }, '합의한 상계를 기록했습니다. 현금은 변경하지 않았습니다.'); });
  S.action('pm-offset-history', id => P.modal('거래처 상계 이력', P.pager(partner(id).offsets.slice().reverse(), 'partner-offsets', row => P.row(won(row.amountWon) + ' · ' + row.at.slice(0, 10), row.reason + ' · 현금 이동 없음'), 3), b('닫기', 'close')));
  function customers() {
    const q = state.customerQuery.replace(/[\s-]/g, '');
    const profiles = m().customerProfiles.filter(p => !q || (p.name + p.phone).replace(/[\s-]/g, '').includes(q)), visits = m().unlinkedVisits.filter(v => !q || (v.customer.name + (v.customer.phone || '')).replace(/[\s-]/g, '').includes(q));
    const due = id => D.order(id)?.finance.dueWon || 0;
    const cards = [...profiles.map(p => { const owed = p.orderIds.reduce((n, id) => n + due(id), 0); return P.orderCard({ id: p.id, tone: owed ? 'red' : '', badge: owed ? ['미수', 'red'] : ['등록 고객', 'blue'], name: p.name, phone: p.phone || '', metaParts: ['연결 방문 ' + p.orderIds.length + '회', p.matchingCandidates.length ? '같은 연락처 후보 ' + p.matchingCandidates.length + '건' : ''], itemFit: 'words', itemParts: [p.note || '메모 없음'], money: owed ? ['미수 ' + won(owed), 'red'] : ['미수 없음', 'grey'], actions: go('연락처·방문', 'customer-profile', p.id), go: { page: 'customer-profile', id: p.id } }); }),
      ...visits.map(v => P.orderCard({ id: v.orderId, tone: due(v.orderId) ? 'red' : '', badge: due(v.orderId) ? ['미수', 'red'] : ['연락처 미등록', 'orange'], name: v.customer.name, phone: v.customer.phone || '', metaParts: ['방문 ' + v.orderId, '연락처 미등록'], itemFit: 'words', itemParts: ['연락처를 등록하면 다음 방문과 연결'], money: due(v.orderId) ? ['미수 ' + won(due(v.orderId)), 'red'] : ['미수 없음', 'grey'], actions: go('연락처·방문', 'customer-profile', 'visit:' + v.orderId), go: { page: 'customer-profile', id: 'visit:' + v.orderId } }))];
    return P.page('고객 관리', '', P.cards([{ title: '고객', sub: cards.length + '명', cards }], { fixed: true, signature: 'customers|' + q, empty: q ? '검색 결과 없음' : '고객 기록 없음' }), '<span>' + e('등록 고객 ' + m().customerProfiles.length + '명 · 미등록 방문 ' + m().unlinkedVisits.length + '건') + '</span><div class="so-actions">' + back() + '</div>', { toolbar: P.search('pm-customers', state.customerQuery, '이름 · 연락처 뒷자리') + P.toolbarLabel('연락처 확인 → 방문별 조회 → 같은 고객 연결'), wait: m().unlinkedVisits.length ? '미등록 ' + m().unlinkedVisits.length + '건' : '없음', sums: [['등록 고객', m().customerProfiles.length + '명', 'blue'], ['미등록 방문', m().unlinkedVisits.length + '건', m().unlinkedVisits.length ? 'orange' : '']] });
  }
  function currentProfile() { return m().customerProfiles.find(p => p.id === S.state.params.id); }
  function customerDetail() {
    const p = currentProfile(), order = !p && D.order(String(S.state.params.id).replace(/^visit:/, ''));
    if (!p && !order) return customers();
    const contact = p || order.customer, visits = p ? p.orderIds.map(id => D.order(id)).filter(Boolean) : [order];
    const due = visits.reduce((sum, row) => sum + row.finance.dueWon, 0), held = visits.reduce((sum, row) => sum + row.totals.customerQuantity, 0);
    const side = '<aside class="pos-panel pos-detail-side"><div class="pos-detail-name"><strong data-fit="words">' + e(contact.name) + '</strong>' + P.badge(p ? '등록 고객' : '미등록 방문', p ? 'blue' : 'orange') + '</div>'
      + detailInfo([['연락처', [contact.phone || '미등록']], ['방문', [visits.length + '회']], ['미수 합계', [won(due)]], ['미반납', [held + '개']]])
      + '<p class="pm-customer-note" data-fit="words" title="' + e(p?.note || '메모 없음') + '">' + e(p?.note || '메모 없음') + '</p>'
      + '<div class="pos-detail-actions pos-shortcuts pm-customer-actions">' + b('연락처·메모 수정', 'pm-customer-edit', visits[0].id) + (p ? b('같은 연락처 후보 ' + p.matchingCandidates.length + '건', 'pm-customer-link', p.id) : '') + '</div></aside>';
    const cards = visits.map(o => P.orderCard({ name: (o.createdAt?.slice(0, 10) || o.lines[0]?.start || '') + ' 방문', metaParts: [o.customer.name, o.receiptNo || o.id], itemFit: 'parts', itemParts: ['미반납 ' + o.totals.customerQuantity + '개', '미지급 ' + o.totals.unissuedQuantity + '개'], money: ['미수 ' + won(o.finance.dueWon), o.finance.dueWon ? 'red' : 'green'], actions: go('방문 열기', 'order-detail', o.id) + b('정산', 'pos-money', o.id) }));
    return P.page('고객 상세', '', '<div class="pos-detail pm-detail">' + side + '<div class="pos-detail-main">' + P.cards([{ title: '방문 내역', sub: visits.length + '회', cards }], { fixed: true, cols: 1, signature: p?.id || order.id, empty: '연결된 방문 없음' }) + '</div></div>',
      '<span>방문 당시 접수·확정 요금 보존</span><div class="so-actions">' + go('고객 목록', 'customers') + b('연락처·메모 수정', 'pm-customer-edit', visits[0].id, 'primary') + '</div>',
      { toolbar: go('목록', 'customers') + P.toolbarLabel('현재 연락처 · 방문별 내역') + detailSums([['방문', visits.length + '회', ''], ['미수 합계', won(due), due ? 'red' : '']]), wait: due ? '미수 ' + visits.filter(o => o.finance.dueWon).length + '건' : '없음' });
  }
  S.search('pm-customers', value => { state.customerQuery = value; P.setPage('management-customers', 0, { render: false }); const cursor = S.$('[data-search="pm-customers"]')?.selectionStart; S.render(); const el = S.$('[data-search="pm-customers"]'); el?.focus(); if (cursor != null) el?.setSelectionRange(cursor, cursor); });
  S.action('pm-customer-edit', id => { const p = m().customerProfiles.find(p => p.orderIds.includes(id)), contact = p || D.order(id).customer; state.draft = { orderId: id }; P.modal('현재 연락처·메모', form(input('현재 고객 이름', 'pmCustomerName', contact.name) + input('현재 연락처', 'pmCustomerPhone', contact.phone || '', 'tel') + input('고객 메모 (선택)', 'pmCustomerNote', p?.note || '', 'text', 'maxlength="500"')) + info('이번 방문에 고객 연락처를 연결합니다. 다른 방문은 후보를 확인한 뒤 직접 선택합니다.') + errorBox(), b('취소', 'close') + b('연락처 저장', 'pm-customer-save', '', 'primary')); });
  S.action('pm-customer-save', () => save('management.customer', { orderId: state.draft.orderId, name: read('pmCustomerName'), phone: read('pmCustomerPhone'), note: read('pmCustomerNote') }, '현재 연락처와 메모를 저장했습니다.', r => S.go('customer-profile', { id: r.profileId })));
  function renderCustomerLink() { const d = state.draft, p = m().customerProfiles.find(p => p.id === d.profileId); P.modal('같은 고객인지 확인 후 연결', info('연락처가 같은 방문 후보입니다. 방문은 각각 보존하며 접수 자체를 합치지 않습니다.') + P.pager(p.matchingCandidates, 'customer-candidates', v => P.row(v.customer.name + ' · ' + v.customer.phone, '방문 ' + v.orderId, b(d.orderIds.has(v.orderId) ? '선택됨 ✓' : '선택', 'pm-link-select', v.orderId, d.orderIds.has(v.orderId) ? 'soft' : '')), 3) + errorBox(), b('취소', 'close') + b(d.orderIds.size + '개 방문 연결', 'pm-link-save', '', 'primary')); }
  S.action('pm-customer-link', id => { state.draft = { profileId: id, orderIds: new Set() }; renderCustomerLink(); });
  S.action('pm-link-select', id => { const ids = state.draft.orderIds; ids.has(id) ? ids.delete(id) : ids.add(id); renderCustomerLink(); });
  S.action('pm-link-save', () => save('management.customer.link', { profileId: state.draft.profileId, orderIds: [...state.draft.orderIds] }, '선택한 방문을 고객 연락처에 연결했습니다.'));
  const areaOf = () => m().settings.areas.find(area => area.id === state.area) || m().settings.areas[0];
  const discountText = d => d.kind === 'perUnit' ? [(product(d.sku)?.label || d.sku) + ' 할인', (product(d.sku)?.label || d.sku) + ' 1' + (product(d.sku)?.unit || '개') + '마다 · 하루 기준', '−' + won(d.amountWon)] : d.kind === 'amount' ? [won(d.amountWon) + ' 할인', '장비 총 금액에서', '−' + won(d.amountWon)] : d.kind === 'percent' ? ['장비 ' + d.percent + '% 할인', '장비 합계에서', d.percent + '%'] : ['리프트권 ' + d.percent + '% 할인', '리프트권 합계에서', d.percent + '%'];
  function settingRows() {
    const key = state.settingTab, values = m().settings[key];
    if (key === 'store') { const store = values || {}; return [['name', '매장명', store.name || '미등록 · 화면 상단에 표시'], ['phone', '매장 전화', store.phone || '미등록 · 고객 안내에 표시'], ['address', '주소', store.address || '미등록'], ['link', '안내 주소', store.link || '미등록 · QR 안내 주소']].map(([id, title, description]) => ({ id, title, description })); }
    if (key === 'rates') return D.snapshot.catalog.filter(s => !s.id.startsWith('legacy-')).map(s => ({ id: s.id, title: s.label, description: values.some(v => v.sku === s.id) ? '신규 접수 단가 ' + won(values.find(v => v.sku === s.id).unitWon) : '요금 미등록 · 접수 시 확인' }));
    if (key === 'nightCutoff') return [{ id: 'nightCutoff', title: values == null ? '야간 기준 미확정' : '보관한 기준 ' + values, description: '업무 정책 보류 · 날짜 계산에 자동 적용되지 않습니다.' }];
    if (key === 'places') { const area = areaOf(); return area ? area.places.map((place, index) => ({ id: area.id + '|' + index, title: place, description: area.name + ' · 차량 배달·수거' })) : []; }
    if (key === 'discounts') return values.filter(d => d.kind === state.discountKind).map(d => { const [title, description, amount] = discountText(d); return { id: d.id, title, description, amount }; });
    return values.map((v, index) => ({ id: String(index), title: typeof v === 'string' ? v : v.name || v.label, description: key === 'returnTimes' ? (v.dayOffset ? '익일 ' : '당일 ') + v.time : key === 'staff' ? ({ manager: '관리자', counter: '카운터', driver: '기사' }[v.role]) + ' · ' + (v.phone || '연락처 미등록') : '준비·배차에서 선택할 차량' }));
  }
  function settings() {
    const st = m().settings, key = state.settingTab;
    const counts = id => id === 'store' ? (st.store?.name ? '' : '!') : id === 'nightCutoff' ? (st.nightCutoff == null ? '보류' : st.nightCutoff) : st[id].length;
    const side = '<nav class="pos-settings-tabs" aria-label="설정 항목">' + settingTabs.map(([id, text]) => '<button type="button" class="pos-settings-tab" data-action="pm-settings-tab" data-id="' + id + '" aria-pressed="' + (id === key) + '"><span>' + e(text) + '</span><b>' + e(counts(id)) + '</b></button>').join('') + '</nav>';
    // Places are shown one area at a time and discounts one kind at a time, so long lists never crowd the screen.
    const chips = key === 'places' ? '<div class="pos-setting-chips">' + st.areas.map(area => P.chip(area.name, 'pm-area', area.id, area.id === areaOf()?.id, area.places.length)).join('') + '<button type="button" class="pos-chip" data-action="pm-area-edit" data-id="new">' + S.icon('plus') + '구역 추가</button></div>'
      : key === 'discounts' ? '<div class="pos-setting-chips">' + discountKinds.map(([id, text]) => P.chip(text, 'pm-discount-kind', id, id === state.discountKind, st.discounts.filter(d => d.kind === id).length)).join('') + '</div>' : '';
    const footerAction = key === 'store' ? b('매장 정보 수정', 'pm-setting-edit', 'store', 'primary') : key === 'rates' ? b('품목 추가', 'pm-catalog-add', '', 'primary') : key === 'nightCutoff' ? '' : (key === 'places' ? b('스키장 템플릿', 'pm-template') + (areaOf() ? b('구역 수정', 'pm-area-edit', areaOf().id) : '') : '') + b(addLabels[key], 'pm-setting-edit', 'new', 'primary');
    const summary = key === 'places' ? '수령 장소 ' + st.places.length + '곳 · 구역 ' + st.areas.length + '개' : key === 'discounts' ? '할인 ' + st.discounts.length + '개 · 접수 확정 창의 할인 버튼으로 나옵니다' : key === 'store' ? '이 화면 크기 ' + innerWidth + '×' + innerHeight + ' · 설정 ' + m().settingsVersion + '판' : key === 'nightCutoff' ? '기존 접수의 가격·약속은 보존' : '설정 ' + m().settingsVersion + '판 · 요금 변경은 새로 접수하는 품목에만 적용';
    return P.page('매장 설정', '', '<div class="pos-settings">' + side + '<div class="pos-settings-main">' + chips + P.pager(settingRows(), 'management-settings-' + key + (key === 'places' ? '-' + (areaOf()?.id || '') : key === 'discounts' ? '-' + state.discountKind : ''), row => P.row(row.title, row.description, (row.amount ? '<b class="pos-row-amount">' + e(row.amount) + '</b>' : '') + b('수정', 'pm-setting-edit', key === 'store' ? 'store' : row.id)), settingSize() - (chips ? 1 : 0)) + '</div></div>',
      '<span>' + e(summary) + '</span><div class="so-actions">' + back() + footerAction + '</div>', { wait: st.store?.name ? '없음' : '매장 정보', sums: [['요금', st.rates.length + '건'], ['차량', st.vehicles.length + '대'], ['직원', st.staff.length + '명']] });
  }
  S.action('pm-area', id => { state.area = id; S.render(); });
  S.action('pm-discount-kind', id => { state.discountKind = id; S.render(); });
  S.action('pm-area-edit', id => { const area = m().settings.areas.find(row => row.id === id); state.draft = { key: 'areas', id, revision: D.snapshot.revision }; P.modal(area ? '구역 수정' : '구역 추가', input('구역 이름 (예: 만선 · 설천 · 기타)', 'pmAreaName', area?.name || '', 'text', 'maxlength="30"') + (area ? info('이 구역의 장소 ' + area.places.length + '곳' + (area.places.length ? ' · 장소가 있는 구역은 지울 수 없습니다' : '')) : '') + errorBox(), b('취소', 'close') + (area && !area.places.length ? b('구역 삭제', 'pm-area-delete', area.id) : '') + b('구역 저장', 'pm-area-save', '', 'primary')); });
  S.action('pm-area-save', () => { try { const d = state.draft, areas = structuredClone(m().settings.areas), name = read('pmAreaName'), id = d.id === 'new' ? D.id('area') : d.id; if (d.id === 'new') areas.push({ id, name, places: [] }); else areas.find(row => row.id === id).name = name; state.area = id; save('management.settings', { patch: { areas } }, '구역을 저장했습니다.'); } catch (err) { error(err); } });
  S.action('pm-area-delete', id => { state.area = ''; save('management.settings', { patch: { areas: m().settings.areas.filter(row => row.id !== id) } }, '구역을 삭제했습니다.'); });
  // Resort template: fills areas, places, return times and lift ticket kinds that are missing; never removes or changes what is already there.
  function templateWindow() {
    const t = resortTemplates.find(row => row.id === state.template) || resortTemplates[0], line = (k, v) => '<div><dt>' + e(k) + '</dt><dd data-fit="parts" data-parts="' + e(JSON.stringify(v)) + '">' + e(v.join(' · ')) + '</dd></div>';
    P.modal('스키장 템플릿', '<div class="pos-template"><div class="pos-template-list">' + resortTemplates.map(row => '<button type="button" class="so-button pos-button pos-option" data-action="pm-template-pick" data-id="' + row.id + '" aria-pressed="' + (row.id === t.id) + '">' + e(row.name) + '</button>').join('') + '</div>'
      + '<div class="pos-template-preview"><strong>' + e(t.name + ' · 채워지는 값') + '</strong><dl class="pos-summary-list">' + line('구역', t.areas.map(([name]) => name)) + line('수령 장소', t.areas.map(([name, places]) => name + ' ' + places.length + '곳')) + line('반납 타임', [templateTimes[0][0] + ' ' + templateTimes[0][1], '외 ' + (templateTimes.length - 1) + '개']) + line('리프트권 권종', [t.tickets.slice(0, 3).map(([label]) => label).join(' · '), '외 ' + Math.max(0, t.tickets.length - 3) + '종']) + '</dl><span>요금과 할인은 바뀌지 않습니다 · 목록은 예시 값</span></div></div>'
      + info('이미 있는 값은 지우지 않고 없는 항목만 추가합니다') + errorBox(), b('취소', 'close') + b('이 템플릿으로 채우기', 'pm-template-apply', '', 'primary'), '스키장을 고르면 처음 값이 채워집니다');
  }
  S.action('pm-template', templateWindow);
  S.action('pm-template-pick', id => { state.template = id; templateWindow(); });
  S.action('pm-template-apply', async () => {
    try { const t = resortTemplates.find(row => row.id === state.template), st = m().settings, areas = structuredClone(st.areas), times = structuredClone(st.returnTimes);
      for (const [name, places] of t.areas) { let area = areas.find(row => row.name === name); if (!area) { area = { id: D.id('area'), name, places: [] }; areas.push(area); } for (const place of places) if (!areas.some(row => row.places.includes(place))) area.places.push(place); }
      for (const [label, time, dayOffset] of templateTimes) if (!times.some(row => row.time === time && (row.dayOffset || 0) === dayOffset)) times.push({ id: D.id('time'), label, time, dayOffset });
      times.sort((x, y) => (x.dayOffset || 0) - (y.dayOffset || 0) || x.time.localeCompare(y.time));
      for (const [label, hours] of t.tickets) if (!D.snapshot.catalog.some(row => row.kind === 'liftTicket' && row.label === label)) await D.execute('catalog.add', { id: D.id('sku'), label, kind: 'liftTicket', unit: '매', hours });
      await D.execute('management.settings', { patch: { areas, returnTimes: times } }); state.area = ''; S.close(); S.render(); S.toast(t.name + ' 값으로 채웠습니다. 리프트권 요금은 장비 요금에서 넣어 주세요.');
    } catch (err) { error(err); }
  });
  S.action('pm-catalog-add', () => P.modal('대여 품목 추가', form(input('품목 이름', 'pmCatalogLabel', '', 'text', 'maxlength="60"') + select('품목 종류', 'pmCatalogKind', [['equipment', '장비'], ['clothing', '의류'], ['helmet', '헬멧'], ['liftTicket', '리프트권']], 'equipment') + select('수량 단위', 'pmCatalogUnit', [['개', '개'], ['벌', '벌'], ['매', '매'], ['켤레', '켤레']], '개') + select('리프트권 사용 시간', 'pmCatalogHours', [['1', '1시간'], ['2', '2시간'], ['3', '3시간'], ['4', '4시간'], ['5', '5시간'], ['6', '6시간'], ['8', '8시간'], ['12', '12시간'], ['24', '24시간']], '4')) + info('품목을 저장한 뒤 신규 접수 단가를 설정합니다. 사용 시간은 리프트권에만 적용합니다.') + errorBox(), b('취소', 'close') + b('품목 저장', 'pm-catalog-save', '', 'primary')));
  S.action('pm-catalog-save', () => { const kind = read('pmCatalogKind'); save('catalog.add', { id: D.id('sku'), label: read('pmCatalogLabel'), kind, unit: read('pmCatalogUnit'), ...(kind === 'liftTicket' ? { hours: Number(read('pmCatalogHours')) } : {}) }, '새 품목을 저장했습니다. 접수 단가를 설정해 주세요.', () => { state.settingTab = 'rates'; S.render(); P.setPage('management-settings-rates', Math.floor((settingRows().length - 1) / settingSize())); }); });
  S.action('pm-settings-tab', key => { state.settingTab = key; S.render(); });
  S.action('pm-setting-edit', id => {
    const key = state.settingTab, values = m().settings[key], current = key === 'store' ? values || {} : key === 'rates' ? values.find(v => v.sku === id) : key === 'nightCutoff' ? values : values[Number(id)];
    state.draft = { key, id, current, revision: D.snapshot.revision }; let body;
    if (key === 'store') body = form(input('매장명 (화면 상단 표시)', 'pmStoreName', current?.name || '', 'text', 'maxlength="60"') + input('매장 전화', 'pmStorePhone', current?.phone || '', 'tel', 'maxlength="24"') + input('주소', 'pmStoreAddress', current?.address || '', 'text', 'maxlength="160"') + input('고객 안내 주소 (QR)', 'pmStoreLink', current?.link || '', 'text', 'maxlength="200"'));
    else if (key === 'rates') body = info(product(id)?.label || id) + input('신규 접수 단가 (원)', 'pmSettingAmount', current?.unitWon ?? '', 'number', 'min="0" inputmode="numeric"') + info('이미 접수한 품목의 확정 요금은 바꾸지 않습니다.');
    else if (key === 'places') { const [areaId, index] = String(id).split('|'), area = m().settings.areas.find(row => row.id === areaId) || areaOf(); state.draft.current = id === 'new' ? null : area?.places[Number(index)]; state.draft.areaId = area?.id || ''; body = input('수령·반납 장소 이름', 'pmSettingName', state.draft.current || '') + (m().settings.areas.length ? '<div class="so-field">구역' + P.choice('pmSettingArea', m().settings.areas.map(row => [row.id, row.name]), area?.id || '') + '</div>' : info('구역이 없으면 이름에 맞춰 자동으로 나눕니다(그 밖에는 기타)')); }
    else if (key === 'discounts') { const d = m().settings.discounts.find(row => row.id === id), kind = d?.kind || state.discountKind; state.draft.current = d || null; state.draft.kind = kind; const free = D.snapshot.catalog.filter(row => row.kind !== 'liftTicket' && !row.id.startsWith('legacy-') && (row.id === d?.sku || !m().settings.discounts.some(x => x.kind === 'perUnit' && x.sku === row.id)));
      body = kind === 'perUnit' ? form(select('품목', 'pmDiscountSku', free.map(row => [row.id, row.label]), d?.sku || free[0]?.id) + input('1개마다 하루 할인 (원)', 'pmDiscountAmount', d?.amountWon ?? '', 'number', 'min="1" inputmode="numeric"')) + info('수량 × 이용 일수만큼 빼 줍니다')
        : kind === 'amount' ? input('총 금액에서 뺄 금액 (원)', 'pmDiscountAmount', d?.amountWon ?? '', 'number', 'min="1" inputmode="numeric"') + info('장비 합계에서 뺍니다 · 리프트권은 리프트권 할인(%)으로')
        : input((kind === 'percent' ? '장비 합계' : '리프트권 합계') + ' 할인율 (%)', 'pmDiscountPercent', d?.percent ?? '', 'number', 'min="1" max="100" inputmode="numeric"') + info('할인은 한 번에 하나만 적용됩니다 · 10원 미만은 버립니다'); }
    else if (key === 'vehicles') body = input('차량 이름', 'pmSettingName', current?.name || '');
    else if (key === 'returnTimes') body = form(input('타임 이름', 'pmSettingName', current?.label || '') + select('기준 날짜', 'pmSettingDay', [['0', '당일'], ['1', '다음날']], String(current?.dayOffset || 0)) + input('약속 시간', 'pmSettingTime', current?.time || '17:00', 'time'));
    else if (key === 'staff') body = form(input('직원 이름', 'pmSettingName', current?.name || '') + input('연락처 (선택)', 'pmSettingPhone', current?.phone || '', 'tel') + select('업무 역할', 'pmSettingRole', [['counter', '카운터'], ['driver', '기사'], ['manager', '관리자']], current?.role || 'counter') + select('기사 담당 차량', 'pmSettingVehicle', [['', '담당 차량 없음'], ...m().settings.vehicles.map(v => [v.id, v.name])], current?.vehicleId || '')) + info('직원 목록 설정입니다. 로그인 계정이나 접근 권한은 별도로 관리합니다.');
    else body = form(select('정책 상태', 'pmSettingPolicy', [['pending', '미확정으로 보관'], ['saved', '기준 시각만 보관']], current == null ? 'pending' : 'saved') + input('야간 기준 시각', 'pmSettingTime', current || '02:00', 'time')) + info('야간 영업일 처리 정책이 확정되기 전에는 날짜 계산에 자동 적용하지 않습니다.');
    P.modal((key === 'discounts' ? discountKinds.find(k => k[0] === state.draft.kind)[1] : settingTabs.find(t => t[0] === key)[1]) + (id === 'new' ? ' 추가' : ' 설정'), body + errorBox(), b('취소', 'close') + (id !== 'new' && ['places', 'discounts', 'returnTimes'].includes(key) ? b('삭제', 'pm-setting-delete') : '') + b('설정 저장', 'pm-setting-save', '', 'primary'));
  });
  S.action('pm-setting-save', () => {
    try { const d = state.draft, key = d.key; if (d.revision !== D.snapshot.revision) throw new Error('설정이 변경되었습니다. 최신 내용을 다시 확인해 주세요.'); let value, row;
      if (key === 'store') value = { name: read('pmStoreName'), phone: read('pmStorePhone'), address: read('pmStoreAddress'), link: read('pmStoreLink') };
      else if (key === 'nightCutoff') value = read('pmSettingPolicy') === 'pending' ? null : read('pmSettingTime');
      else { value = structuredClone(m().settings[key]); if (key === 'rates') { if (read('pmSettingAmount') === '') throw new Error('단가를 입력해 주세요. 무료는 0원으로 저장합니다.'); row = { sku: d.id, unitWon: Number(read('pmSettingAmount')) }; const index = value.findIndex(v => v.sku === d.id); if (index < 0) value.push(row); else value[index] = row; }
        else if (key === 'places') { const name = read('pmSettingName'); if (!name?.trim()) throw new Error('장소 이름을 입력해 주세요.'); const areas = structuredClone(m().settings.areas), target = read('pmSettingArea') || d.areaId;
          for (const area of areas) area.places = area.places.map(place => place === d.current ? null : place).filter(Boolean);
          if (!areas.length) { save('management.settings', { patch: { places: [...m().settings.places.filter(place => place !== d.current), name] } }, '새 설정을 저장했습니다. 이전 접수 내용은 보존됩니다.'); return; }
          (areas.find(area => area.id === target) || areas[0]).places.push(name); state.area = target || areas[0].id; save('management.settings', { patch: { areas } }, '새 설정을 저장했습니다. 이전 접수 내용은 보존됩니다.'); return; }
        else if (key === 'discounts') { row = d.kind === 'perUnit' ? { id: d.current?.id || D.id('discount'), kind: d.kind, sku: read('pmDiscountSku'), amountWon: Number(read('pmDiscountAmount')) } : d.kind === 'amount' ? { id: d.current?.id || D.id('discount'), kind: d.kind, amountWon: Number(read('pmDiscountAmount')) } : { id: d.current?.id || D.id('discount'), kind: d.kind, percent: Number(read('pmDiscountPercent')) }; const index = value.findIndex(v => v.id === row.id); if (index < 0) value.push(row); else value[index] = row; }
        else { if (key === 'places') row = read('pmSettingName'); if (key === 'vehicles') row = { id: d.current?.id || D.id('vehicle'), name: read('pmSettingName') }; if (key === 'returnTimes') row = { id: d.current?.id || D.id('time'), label: read('pmSettingName'), time: read('pmSettingTime'), dayOffset: Number(read('pmSettingDay')) }; if (key === 'staff') row = { id: d.current?.id || D.id('staff'), name: read('pmSettingName'), phone: read('pmSettingPhone'), role: read('pmSettingRole'), vehicleId: read('pmSettingVehicle') || null }; if (d.id === 'new') value.push(row); else value[Number(d.id)] = row; }
      } save('management.settings', { patch: { [key]: value } }, '새 설정을 저장했습니다. 이전 접수 내용은 보존됩니다.');
    } catch (err) { error(err); }
  });
  S.action('pm-setting-delete', () => { const d = state.draft, key = d.key, st = m().settings;
    if (key === 'places') save('management.settings', { patch: { areas: st.areas.map(area => ({ ...area, places: area.places.filter(place => place !== d.current) })) } }, '장소를 삭제했습니다. 이전 접수의 약속 장소는 그대로입니다.');
    else if (key === 'discounts') save('management.settings', { patch: { discounts: st.discounts.filter(row => row.id !== d.current.id) } }, '할인을 삭제했습니다.');
    else save('management.settings', { patch: { returnTimes: st.returnTimes.filter((row, index) => index !== Number(d.id)) } }, '반납 타임을 삭제했습니다.');
  });
  function guide() {
    const store = m().settings.store || {};
    const ready = store.name && store.phone, tiles = [
      P.tile({ name: 'QR 안내판', action: 'guide-print', badge: ['인쇄', 'blue'], open: '확인', lines: [[['기존 QR은 같은 고객 안내 주소 사용', '같은 안내 주소 사용', 'QR 안내'], ''], [store.link ? [store.link, '안내 주소 등록됨'] : '안내 주소 미등록', store.link ? '' : 'orange']] }),
      P.tile({ name: '고객 안내', route: 'guest-guide', badge: ['확인', 'grey'], lines: [[['방문·반납 장소 · 교환·연장 안내', '장소 · 교환·연장 안내', '고객 안내'], ''], [['손님에게 보여 주는 화면', '손님용 화면'], '']] }),
      P.tile({ name: '현장 적용 전 확인', route: 'settings', badge: ready ? ['준비 완료', 'green'] : ['매장 정보 확인', 'orange'], tone: ready ? '' : 'orange', open: '매장 설정', lines: [[(store.name || '매장명 미등록') + ' · ' + (store.phone || '전화 미등록'), ''], [['실제 장소·연락처 확인 필요', '장소·연락처 확인', '확인 필요'], '']] })];
    return P.page('인쇄물', '', '<div class="pos-tiles is-row">' + tiles.join('') + '</div>', '<span>' + e('카운터와 차량에서 고객에게 안내할 내용을 먼저 확인') + '</span><div class="so-actions">' + back() + '</div>', { wait: '없음', sums: [['안내 주소', store.link ? '등록' : '미등록', store.link ? 'green' : 'orange']] });
  }
  S.register('inventory-assets', { title: '재고·정비', pos: true, parent: 'inventory', workspace: 'management', render: inventoryAssets });
  for (const [id, title, render] of [['management', '매장 관리', hub], ['inventory', '재고·정비', inventory], ['partners', '거래처 장부', partners], ['partner-detail', '거래처 장부', partnerDetail], ['customers', '고객 관리', customers], ['customer-profile', '고객 방문', customerDetail], ['settings', '매장 설정', settings], ['guide', '인쇄물', guide]]) S.register(id, { title, pos: true, parent: 'management', workspace: 'management', render });
})();
