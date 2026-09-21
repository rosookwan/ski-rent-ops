(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, O = S.posOrders, e = S.esc, b = P.button;
  let draft = null, api = null, choicePage = 0;
  const settings = () => D.snapshot.management?.settings || {};
  const day = (date, n = 0) => { const value = new Date(date + 'T00:00:00Z'); value.setUTCDate(value.getUTCDate() + n); return value.toISOString().slice(0, 10); };
  const short = date => Number(date.slice(5, 7)) + '/' + Number(date.slice(8, 10));
  const label = line => line.label || D.snapshot.catalog.find(item => item.id === line.sku)?.label || line.sku;
  const hidden = (name, value, title = '') => '<input type="hidden" data-pos-input="' + e(name) + '" aria-label="' + e(title) + '" value="' + e(value) + '">';
  const option = (field, value, text, selected, disabled = false) => '<button type="button" class="so-button pos-button pos-option" data-action="pos-a2-pick" data-field="' + field + '" data-id="' + e(value) + '" aria-pressed="' + selected + '"' + (disabled ? ' disabled' : '') + '><span data-fit="words">' + e(text) + '</span></button>';
  const row = (title, controls) => '<div class="pos-option-row"><span>' + e(title) + '</span><div class="pos-a2-options">' + controls + '</div></div>';
  const info = rows => '<dl class="pos-a2-summary">' + rows.map(([name, value]) => '<div><dt>' + e(name) + '</dt><dd data-fit="auto" title="' + e(value) + '">' + e(value) + '</dd></div>').join('') + '</dl>';
  function fit() { const dialog = S.$('#so-dialog'); dialog.querySelectorAll('.pos-modal-sub').forEach(el => { el.dataset.fit = 'auto'; }); P.fitPage(dialog); }
  function request(title, body, type, payload, done, confirmLabel, sub) {
    api.request(title, '<section class="pos-a2-form">' + body + '</section>', type, payload, done, confirmLabel, sub);
    api.state.request.revision = draft.revision; fit();
  }
  function dates(field, dates) {
    return [...new Set(dates)].map(date => option(field, date, short(date), draft[field] === date)).join('') + b('달력', 'pos-a2-calendar', field);
  }
  function extension(order, line, terms, amount, services) {
    api = services; const last = terms.slice().sort().at(-1) || line.end;
    draft = { type: 'extension', order, line, terms, min: day(last, 1), end: day(last, 1), amount, reason: '고객 요청 기간 연장', revision: D.snapshot.revision };
    draft.amountWon = amount(draft.end); render();
  }
  function appointment(options, services) {
    api = services;
    draft = { type: 'appointment', ...options, ...options.values, offset: 0, revision: D.snapshot.revision };
    render();
  }
  function exchange(value, kinds, services) {
    api = services;
    const order = D.order(value.orderId), line = order.lines.find(line => line.id === value.lineId);
    draft = { type: 'exchange', order, line, assets: value.assets, kinds, baseId: value.assets[0].id, kind: line.sku, oldSize: value.assets[0].size || '', newSize: '', reason: 'size', method: 'shop', revision: value.revision };
    render();
  }
  function render() {
    const d = draft, { order, line } = d, sub = (order.receiptNo || order.id) + ' · ' + label(line);
    if (d.type === 'extension') {
      request(order.customer.name + ' · 기간 연장', row('이용 종료일', dates('end', [d.min, day(d.min, 1), ...(d.end > day(d.min, 1) ? [d.end] : [])]))
        + info([['연장 대상', line.customerQuantity ? '남은 ' + d.terms.length + '개만 이용 연장' : '미지급 ' + d.terms.length + '개'], ['변경 후 종료', d.end], ['추가 금액', S.money(d.amountWon)]])
        + hidden('fulfillment-end', d.end, '새 이용 종료일') + hidden('fulfillment-amount', d.amountWon, '이번 추가 청구액 (원)') + hidden('fulfillment-reason', d.reason)
        + '<div class="pos-a2-tools">' + b('금액·사유 확인', 'pos-a2-edit', 'extension') + '<span>반납한 실물의 기간은 유지</span></div>', 'ops.extend',
        () => ({ orderId: order.id, lineIds: [line.id], end: d.end, amountWon: Number(d.amountWon), reason: d.reason }), null, '확인하고 저장', sub);
    } else if (d.type === 'appointment') {
      const places = [...new Set([d.place, ...(settings().places || [])])].filter(Boolean), times = settings().returnTimes || [], preset = times.find(t => t.time === d.time && (t.dayOffset || 0) === d.offset);
      const timeChoices = [preset, ...times.filter(t => t !== preset)].filter(Boolean).slice(0, 2);
      const vehicles = api.vehicleNames;
      request(order.customer.name + ' · ' + d.title, row('수거일', dates('date', [d.date, day(d.date, 1)]))
        + row('수거 장소', places.slice(0, 2).map(place => option('place', place, place, d.place === place)).join('') + b('더 보기', 'pos-a2-options', 'place'))
        + row('수거 시각', timeChoices.map(t => option('timePreset', t.id, t.label + ' ' + t.time, preset === t)).join('') + b(preset ? '더 보기' : d.time + ' · 더 보기', 'pos-a2-options', 'time'))
        + row('담당 차량', vehicles.slice(0, 2).map(([id, name]) => option('vehicleId', id, name, id === d.vehicleId)).join('') + (vehicles.length > 2 ? b('더 보기', 'pos-a2-options', 'vehicle') : ''))
        + info([['변경 후 약속', d.date + ' ' + d.time + ' · ' + d.place + ' · ' + (api.vehicleName(d.vehicleId) || '차량 선택')]])
        + Object.entries(d.fields).map(([field, name]) => hidden(name, d[field])).join(''), d.command, () => d.payload(d), d.done, d.confirmLabel || '확인하고 저장', sub + ' · 차량 수거 약속');
    } else {
      const sizes = [...new Set([d.oldSize, ...D.snapshot.assets.filter(asset => asset.sku === d.kind && asset.location.kind === 'shop' && asset.condition === 'ready' && !asset.orderPreparation && !asset.exchangeReservationId).map(asset => asset.size), d.newSize])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
      const picked = sizes.includes(d.newSize) && sizes.indexOf(d.newSize) >= 7 ? [d.newSize, ...sizes.filter(size => size !== d.newSize)] : sizes;
      const hiddenFields = { 'exchange-base': d.baseId, 'exchange-kind': d.kind, 'exchange-old-size': d.oldSize, 'exchange-new-size': d.newSize, 'exchange-reason': d.reason, 'exchange-method': d.method };
      P.modal(order.customer.name + ' · 교환 1개', '<section class="pos-a2-form pos-a2-exchange">'
        + row('교환 품목', d.kinds.map(([id, name]) => option('kind', id, name, id === d.kind)).join(''))
        + '<div class="pos-a2-size-head"><strong>교환 사이즈</strong><span>현재 ' + e(d.oldSize || '규격 확인 필요') + '</span>' + b('현재 장비·규격', 'pos-a2-edit', 'base') + '</div>'
        + '<div class="pos-a2-size-grid">' + picked.slice(0, 7).map(size => option('newSize', size, size + (size === d.oldSize ? ' 현재' : ''), d.newSize === size, size === d.oldSize && d.reason === 'size')).join('') + b(sizes.length > 7 ? '더 보기·입력' : '직접 입력', 'pos-a2-options', 'size') + '</div>'
        + info([['교환', (d.oldSize || '현재 규격 미확인') + ' 회수 · ' + (d.newSize || '새 규격 선택') + ' 지급'], ['추가 금액', '없음']])
        + Object.entries(hiddenFields).map(([name, value]) => hidden(name, value)).join('') + '</section>' + api.errorBox(), '<div class="pos-fulfillment-extra">' + b((d.method === 'shop' ? '매장에서 교환' : '차량으로 교환') + ' · ' + (d.reason === 'size' ? '사이즈 변경' : '파손 교체'), 'pos-a2-edit', 'method') + '</div>' + b('취소', 'close') + b('교환 내용 확인', 'pos-exchange-request-review', '', 'primary'), sub + ' · ' + d.baseId);
      fit();
    }
  }
  S.action('pos-a2-pick', (value, target) => {
    const d = draft, field = target.dataset.field;
    if (field === 'timePreset') { const t = (settings().returnTimes || []).find(t => t.id === value); if (!t) return; d.date = day(d.date, (t.dayOffset || 0) - d.offset); d.time = t.time; d.offset = t.dayOffset || 0; }
    else { d[field] = value; if (field === 'date') d.offset = 0; if (field === 'end') d.amountWon = d.amount(value); if (field === 'kind') { const component = D.snapshot.assets.find(asset => asset.componentBaseId === d.baseId && asset.sku === value); d.oldSize = value === d.line.sku ? d.assets.find(asset => asset.id === d.baseId).size || '' : component?.size || ''; d.newSize = ''; } }
    render();
  });
  S.action('pos-a2-calendar', field => { draft.dateField = field; P.calendar({ title: field === 'end' ? '새 이용 종료일' : '수거일', selected: draft[field], today: D.today, action: 'pos-a2-date', clear: ['돌아가기', 'pos-a2-back'] }); });
  S.action('pos-a2-date', value => { const d = draft, field = d.dateField; if (value < (field === 'end' ? d.min : D.today)) { S.toast('선택할 수 있는 날짜를 다시 확인해 주세요.'); return; } d[field] = value; if (field === 'end') d.amountWon = d.amount(value); else d.offset = 0; render(); });
  S.action('pos-a2-back', render);
  function options(field) {
    draft.optionField = field; const d = draft;
    const values = field === 'place' ? [...new Set([d.place, ...(settings().places || [])])].filter(Boolean).map(value => [value, value])
      : field === 'time' ? (settings().returnTimes || []).map(t => [t.id, t.label + ' ' + t.time]) : field === 'vehicle' ? api.vehicleNames
      : [...new Set([d.oldSize, ...D.snapshot.assets.filter(asset => asset.sku === d.kind && asset.location.kind === 'shop' && asset.condition === 'ready' && !asset.orderPreparation && !asset.exchangeReservationId).map(asset => asset.size), d.newSize])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })).map(value => [value, value]);
    const per = innerHeight < 700 ? 6 : 9, pages = Math.max(1, Math.ceil(values.length / per)); choicePage = Math.min(choicePage, pages - 1);
    const key = { place: 'place', time: 'timePreset', vehicle: 'vehicleId', size: 'newSize' }[field], title = { place: '수거 장소', time: '수거 시각', vehicle: '담당 차량', size: '새 규격' }[field];
    const selected = field === 'time' ? (settings().returnTimes || []).find(t => t.time === d.time && (t.dayOffset || 0) === d.offset)?.id : d[key];
    P.modal(title, '<div class="pos-a2-choice-grid">' + values.slice(choicePage * per, (choicePage + 1) * per).map(([id, text]) => option(key, id, text, selected === id, field === 'size' && id === d.oldSize && d.reason === 'size')).join('') + '</div>'
      + (pages > 1 ? '<div class="pos-pager"><span>' + (choicePage + 1) + ' / ' + pages + '쪽</span><div>' + b('이전', 'pos-a2-option-page', '-1') + b('다음', 'pos-a2-option-page', '1') + '</div></div>' : '')
      + (!values.length ? '<p class="pos-info">등록한 선택값이 없습니다. 직접 입력으로 확인해 주세요.</p>' : ''), b('돌아가기', 'pos-a2-back') + (field === 'vehicle' ? '' : b('직접 입력', 'pos-a2-edit', field)));
    fit();
  }
  S.action('pos-a2-options', field => { choicePage = 0; options(field); });
  S.action('pos-a2-option-page', delta => { choicePage = Math.max(0, choicePage + Number(delta)); options(draft.optionField); });
  S.action('pos-a2-edit', field => {
    const d = draft; d.editField = field;
    const content = field === 'extension' ? O.input('이번 추가 청구액 (원)', 'a2-amount', d.amountWon, 'number', 'min="0"') + O.select('처리 사유', 'a2-reason', [['고객 요청 기간 연장', '고객 요청 기간 연장'], ['접수 시 이용 기간 누락', '접수 시 이용 기간 누락']], d.reason)
      : field === 'base' ? O.select('현재 고객 장비', 'a2-base', d.assets.map(asset => [asset.id, (asset.size || '규격 미기록') + ' · ' + asset.id]), d.baseId) + O.input('현재 규격', 'a2-old-size', d.oldSize, 'text', 'maxlength="24"')
      : field === 'method' ? '<div class="so-field">교환 방법' + P.choice('a2-method', [['shop', '매장에서 교환'], ['vehicle', '차량으로 교환']], d.method) + '</div><div class="so-field">교환 사유' + P.choice('a2-reason', [['size', '사이즈 변경'], ['damage', '파손 교체']], d.reason) + '</div>'
      : O.input({ place: '수거 장소', time: '수거 시각', size: '새 규격' }[field], 'a2-value', field === 'size' ? d.newSize : d[field], field === 'time' ? 'time' : 'text', field === 'size' ? 'maxlength="24"' : '');
    P.modal({ extension: '추가 금액·사유 확인', base: '교환할 실물·현재 규격', method: '교환 방법·사유', place: '수거 장소 직접 입력', time: '수거 시각 직접 입력', size: '새 규격 직접 입력' }[field], '<div class="pos-form-grid">' + content + '</div>' + api.errorBox(), b('취소', 'pos-a2-back') + b('선택 적용', 'pos-a2-edit-save', '', 'primary'));
  });
  S.root.addEventListener('change', event => { if (event.target.dataset.posInput === 'a2-base') { const d = draft, base = d.assets.find(asset => asset.id === event.target.value), component = D.snapshot.assets.find(asset => asset.componentBaseId === base.id && asset.sku === d.kind); S.$('[data-pos-input="a2-old-size"]').value = d.kind === d.line.sku ? base.size || '' : component?.size || ''; } });
  S.action('pos-a2-edit-save', () => {
    const d = draft, field = d.editField;
    if (field === 'extension') { const amount = Number(O.read('a2-amount')); if (!Number.isSafeInteger(amount) || amount < 0) { api.error('추가 청구액을 확인해 주세요.'); return; } d.amountWon = amount; d.reason = O.read('a2-reason'); }
    else if (field === 'base') { d.baseId = O.read('a2-base'); d.oldSize = O.read('a2-old-size').trim(); d.newSize = ''; }
    else if (field === 'method') { d.method = O.read('a2-method'); d.reason = O.read('a2-reason'); if (d.reason === 'size' && d.newSize === d.oldSize) d.newSize = ''; }
    else { const value = O.read('a2-value').trim(); if (!value) { api.error('값을 입력해 주세요.'); return; } if (field === 'size' && value === d.oldSize && d.reason === 'size') { api.error('바꿀 새 규격을 선택해 주세요.'); return; } d[field === 'size' ? 'newSize' : field] = value; if (field === 'time') d.offset = 0; }
    render();
  });
  S.posAdjustmentForms = { extension, appointment, exchange };
})();
