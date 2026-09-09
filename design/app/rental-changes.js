(() => {
'use strict';
const S = window.SkiOps, F = S.workflow, W = S.workflowUI, E = window.SkiWorkflows.exchanges, C = window.SkiWorkflowClient;
const { esc: e, button: b, field, select } = S;
let current = null, revision = 0, stockExchange = null;
const options = Object.entries(E.kinds).map(([id, k]) => [id, k.label]);
const reasonOptions = Object.entries(E.reasons);
const read = id => W.read('exchange-' + id);
const catalog = sku => F.snap().catalog.find(s => s.id === sku);
const exchanges = id => F.snap().exchanges.filter(x => x.orderId === id);
const kind = () => read('kind') || 'ski';
const baseRows = () => {
  const k = E.kinds[kind()];
  return current.items.filter(i => i.customer && F.assets(i.assetIds).some(a => (k.parent ? a.sku === k.parent : ['ski', 'board'].includes(a.sku)) && a.location.kind === 'customer' && !a.exchangeReservationId));
};
function normalPlan(item) {
  return { method: item?.method === '차량 수거' ? 'vehicle' : 'direct', date: item?.due || current.end || S.data.today, time: item?.time || '16:30', place: item?.place || current.place || '매장', vehicleId: F.vehicleId };
}
function title(x) { return e(E.summary(x)); }
function status(x) { return x.status === 'cancelled' ? '취소됨' : '새 장비 전달 ' + x.units.filter(u => u.deliveredAt).length + '/' + x.units.length + ' · 기존품 회수 ' + x.units.filter(u => u.collectedAt || u.receivedAt).length + '/' + x.units.length + ' · 매장 확인 ' + x.units.filter(u => u.receivedAt).length + '/' + x.units.length; }
function list(id) {
  return exchanges(id).map(x => W.row(title(x), e(status(x)), b('교환 처리', 'exchange-open', x.id))).join('');
}
function openExchange(order) {
  current = order; revision = F.snap().revision;
  const p = normalPlan(order.items.find(i => i.customer));
  const body = '<p><strong>' + e(order.name) + '</strong> · ' + e(order.id) + '</p><div class="wf-form-grid">'
    + select('교환 품목', options, 'ski', 'id="exchange-kind" aria-label="교환 품목" data-exchange-input')
    + select('대상 대여 장비', [], '', 'id="exchange-base" aria-label="대상 대여 장비" data-exchange-input')
    + field('교환 수량', '1', 'number', 'id="exchange-qty" min="1" max="500" data-exchange-input')
    + select('교환 사유', reasonOptions, 'damage', 'id="exchange-reason" aria-label="교환 사유" data-exchange-input')
    + field('기존 규격', '', 'text', 'id="exchange-old" maxlength="24" placeholder="예: 150 / 255" data-exchange-input')
    + field('새 규격', '', 'text', 'id="exchange-new" maxlength="24" placeholder="예: 150 / 260" data-exchange-input')
    + '</div><label id="exchange-component-label" class="so-field" hidden><span><input type="checkbox" id="exchange-component"> 선택한 대여 세트에 포함된 기존 구성품을 확인했습니다.</span></label>'
    + '<p class="wf-hint">부츠 한 켤레·폴대 한 조를 1개로 계산합니다. 교환 구성품은 본체와 구분해 회수합니다.</p>'
    + field('추가 메모', '', 'text', 'id="exchange-memo" maxlength="200" placeholder="차량에서 알아야 할 내용 · 기타는 필수" data-exchange-input')
    + '<output id="exchange-preview" class="wf-hint" aria-live="polite"></output><div class="wf-form-grid">'
    + select('교환 방법', [['vehicle', '차량 배달'], ['shop', '매장 교환']], p.method === 'vehicle' ? 'vehicle' : 'shop', 'id="exchange-method" aria-label="교환 방법" data-exchange-input')
    + select('담당 차량', [['demo-van-1', '1호 차량'], ['demo-van-2', '2호 차량']], F.vehicleId, 'id="exchange-vehicle" aria-label="담당 차량"')
    + field('방문 날짜', S.data.today, 'date', 'id="exchange-date"') + field('방문 시간', p.time, 'time', 'id="exchange-time"')
    + field('방문 장소', p.place, 'text', 'id="exchange-place" maxlength="160"') + '</div>'
    + '<p class="wf-hint">요청 저장 후 교환품을 준비합니다. 요금·수납·환불 금액은 자동으로 바뀌지 않습니다.</p>'
    + (exchanges(order.id).length ? '<h3>교환 내역</h3>' + list(order.id) : '');
  W.modal('장비 교환', body, b('취소', 'close', '', 'ghost') + b('교환 요청 저장', 'exchange-save', '', 'primary'));
  updateForm(true);
}
function updateForm(reset = false) {
  if (!S.$('#exchange-kind')) return;
  const rows = baseRows(), input = S.$('#exchange-base');
  if (reset) input.innerHTML = rows.map(i => '<option value="' + e(i.id) + '">' + e(i.name) + ' · 고객 보유 ' + i.customer + '</option>').join('') || '<option value="">교환 가능한 장비 없음</option>';
  const item = rows.find(i => i.id === read('base')); S.$('#exchange-qty').max = item?.customer || 0;
  S.$('#exchange-component-label').hidden = !E.kinds[kind()].component;
  S.$('#exchange-preview').textContent = E.summary({ kind: kind(), reason: read('reason'), oldSize: read('old'), newSize: read('new'), memo: read('memo'), units: Array.from({ length: Math.min(500, Math.max(0, Number(read('qty')) || 0)) }) });
}
S.root.addEventListener('input', ev => { if (ev.target.hasAttribute('data-exchange-input')) updateForm(ev.target.id === 'exchange-kind'); });
S.root.addEventListener('change', ev => { if (ev.target.hasAttribute('data-exchange-input')) updateForm(ev.target.id === 'exchange-kind'); });
S.action('exchange-save', W.safe(() => {
  if (revision !== F.snap().revision) throw new Error('수량이나 업무가 변경됐습니다. 창을 닫고 다시 확인해 주세요.');
  const item = baseRows().find(i => i.id === read('base')), quantity = W.number('exchange-qty');
  if (!item || quantity < 1) throw new Error('교환할 대여 장비와 수량을 선택해 주세요.');
  const bases = F.assets(item.assetIds).filter(a => a.location.kind === 'customer' && F.customerIds(current.id).includes(a.location.id) && !a.exchangeReservationId).slice(0, quantity);
  if (bases.length !== quantity || new Set(bases.map(a => a.location.id)).size !== 1) throw new Error('같은 고객의 실제 보유 수량을 확인해 주세요.');
  const id = C.randomId('exchange-');
  F.run('exchange.request', { id, orderId: current.id, customerId: bases[0].location.id, customerName: current.name, kind: kind(), baseAssetIds: bases.map(a => a.id), reason: read('reason'), oldSize: read('old'), newSize: read('new'), memo: read('memo'), confirmExistingComponent: S.$('#exchange-component').checked,
    method: read('method'), visit: { method: read('method') === 'vehicle' ? 'vehicle' : 'direct', date: read('date'), time: read('time'), place: read('place'), vehicleId: read('vehicle') }, returnPlan: normalPlan(item) });
  W.changed('교환 요청을 저장했습니다. 교환품을 준비해 주세요.'); openRecord(id);
}));
function openRecord(id) {
  const x = F.snap().exchanges.find(x => x.id === id); if (!x) throw new Error('교환 요청을 찾을 수 없습니다.');
  revision = F.snap().revision;
  const count = predicate => x.units.filter(predicate).length, left = count(u => !u.newAssetId), normal = F.snap().assets.filter(a => a.sku === x.sku && a.location.kind === 'shop' && E.healthy(a) && !a.componentBaseId && (!a.size || a.size === x.newSize));
  let actions = '';
  if (x.status !== 'cancelled') {
    if (left) actions += b('교환품 준비', 'exchange-prepare', id, 'primary') + b('매장 보유 교환품 등록', 'exchange-stock', id);
    if (x.method === 'vehicle') actions += b('배달·수거 목록', 'exchange-dispatch', id);
    else {
      if (count(u => u.newAssetId && !u.deliveredAt)) actions += b('새 장비 전달', 'exchange-transfer', id + ':new', 'primary');
      if (count(u => !u.receivedAt)) actions += b('기존품 받음', 'exchange-transfer', id + ':old');
    }
    if (!count(u => u.deliveredAt || u.collectedAt || u.receivedAt)) actions += b('요청 취소', 'exchange-cancel', id);
  }
  W.modal('장비교환 처리', '<p><strong>' + e(x.customerName) + '</strong> · ' + e(x.orderId) + '</p><h3>' + title(x) + '</h3><p>' + e(status(x)) + '</p><p>준비 대기 ' + left + '개 · 규격에 맞는 매장 재고 ' + normal.length + '개</p>'
    + '<p>' + e(x.method === 'vehicle' ? x.visit.date + ' ' + x.visit.time + ' · ' + x.visit.place : '매장 교환') + '</p><div class="wf-actions" style="flex-wrap:wrap">' + actions + '</div><p class="wf-hint">전달과 회수는 각각 실제 수량만 처리합니다. 차량 수거 후에는 매장에 내리기를 진행하세요. 파손품은 정상 출고에서 제외합니다. 금액은 자동 정산하지 않습니다.</p>', b('닫기', 'close'));
}
S.action('exchange-open', W.safe(openRecord));
S.action('exchange-prepare', W.safe(id => {
  const x = F.snap().exchanges.find(x => x.id === id), expected = F.snap().revision, left = x.units.filter(u => !u.newAssetId).length;
  const reserved = F.snap().tasks.filter(t => t.kind === 'delivery' && ['waiting', 'in_progress'].includes(t.status)).flatMap(F.remaining);
  const candidates = F.snap().assets.filter(a => a.sku === x.sku && a.location.kind === 'shop' && E.healthy(a) && !a.componentBaseId && (!a.size || a.size === x.newSize) && !reserved.includes(a.id));
  if (!candidates.length) throw new Error('규격에 맞는 매장 재고가 없습니다. 실제 보유 교환품을 먼저 등록해 주세요.');
  W.openPicker('교환품 준비 · ' + E.kinds[x.kind].label + ' ' + x.newSize, candidates, ids => {
    if (expected !== F.snap().revision) throw new Error('재고가 변경됐습니다. 다시 확인해 주세요.');
    if (ids.length > left) throw new Error('준비 대기 ' + left + '개까지만 선택해 주세요.');
    F.run('exchange.prepare', { id, assetIds: ids }); W.changed('교환품을 준비했습니다.'); openRecord(id);
  }, '<p>실제 규격 ' + e(x.newSize || x.memo) + '을 확인해 선택하세요. 준비 대기 ' + left + '개</p>');
}));
S.action('exchange-stock', W.safe(id => {
  stockExchange = id; const x = F.snap().exchanges.find(x => x.id === id); revision = F.snap().revision;
  W.modal('매장 보유 교환품 등록', '<p>' + title(x) + '</p><p>실제로 매장에 보관 중인 정상 교환품만 등록하세요. 등록만으로 적재되거나 고객에게 전달되지 않습니다.</p>' + field('등록 수량', '1', 'number', 'id="exchange-stock-qty" min="1" max="500"') + field('확인 규격', x.newSize, 'text', 'id="exchange-stock-size" maxlength="24"') + field('입고·실사 기록번호', '', 'text', 'id="exchange-stock-reference" maxlength="120" placeholder="중복 등록을 막기 위한 고유 기록번호"'), b('취소', 'close') + b('보유 수량 등록', 'exchange-stock-save', '', 'primary'));
}));
S.action('exchange-stock-save', W.safe(() => {
  if (revision !== F.snap().revision) throw new Error('재고가 변경됐습니다. 창을 닫고 확인해 주세요.');
  const x = F.snap().exchanges.find(x => x.id === stockExchange), reference = read('stock-reference');
  if (!reference.trim()) throw new Error('입고·실사 기록번호를 입력해 주세요.');
  F.run('stock.receive', { sku: x.sku, quantity: W.number('exchange-stock-qty'), size: read('stock-size'), sourceReference: reference });
  W.changed('실제 보유 교환품 수량을 등록했습니다.'); openRecord(x.id);
}));
S.action('exchange-transfer', W.safe(value => {
  const [id, side] = value.split(':'), x = F.snap().exchanges.find(x => x.id === id), expected = F.snap().revision;
  const ids = x.units.filter(u => side === 'new' ? u.newAssetId && !u.deliveredAt : !u.receivedAt).map(u => side === 'new' ? u.newAssetId : u.oldAssetId);
  W.openPicker(side === 'new' ? '새 장비 전달 확인' : '기존품 받음', F.assets(ids), selected => {
    if (expected !== F.snap().revision) throw new Error('교환 수량이 변경됐습니다. 다시 확인해 주세요.');
    F.run('stock.move', { kind: side === 'new' ? 'deliver' : 'directReturn', assetIds: selected, from: side === 'new' ? F.shop : { kind: 'customer', id: x.customerId }, to: side === 'new' ? { kind: 'customer', id: x.customerId } : F.shop, exchangeId: x.id });
    W.changed('실제 처리 수량을 반영했습니다.'); openRecord(x.id);
  }, '<p>' + title(x) + '</p>', { received: true });
}));
S.action('exchange-cancel', W.safe(id => {
  const expected = F.snap().revision;
  W.modal('교환 요청 취소', '<p>아직 적재·전달·회수하지 않은 요청을 취소하고 기존 반납 일정을 복원합니다.</p>' + field('취소 사유', '', 'text', 'id="exchange-cancel-reason"'), b('돌아가기', 'exchange-open', id) + b('교환 요청 취소', 'exchange-cancel-confirm', id, 'primary'));
  revision = expected;
}));
S.action('exchange-cancel-confirm', W.safe(id => { if (revision !== F.snap().revision) throw new Error('업무가 변경됐습니다. 다시 확인해 주세요.'); F.run('exchange.cancel', { id, reason: read('cancel-reason') }); W.changed('교환 요청을 취소했습니다.'); }));
S.action('exchange-dispatch', id => { S.close(); S.go('dispatch'); S.dispatchBoard.selectTask(id + '-new'); });

let earlyOrder = null, earlyRevision = 0, earlyRows = [];
const earlyRead = key => W.read('early-' + key);
function openEarly(order) {
  earlyOrder = order; earlyRevision = F.snap().revision;
  const state = F.snap(), scheduled = state.tasks.filter(t => t.earlyReturnId && ['waiting','in_progress'].includes(t.status)).flatMap(F.remaining);
  earlyRows = order.items.map(i => ({ ...i, eligible: F.assets(i.assetIds).filter(a => a.location.kind === 'customer' && F.customerIds(order.id).includes(a.location.id) && !a.exchangeReservationId && !scheduled.includes(a.id)) })).filter(i => i.eligible.length);
  const quantities = earlyRows.map((i, index) => W.row('<label><input type="checkbox" data-early-check="' + index + '" aria-label="' + e(i.name) + ' 조기반납"> ' + e(i.name) + ' · 선택 가능 ' + i.eligible.length + '</label>', '실제로 조기반납할 품목과 수량', '<input type="number" id="early-qty-' + index + '" data-early-qty="' + index + '" aria-label="' + e(i.name) + ' 조기반납 수량" min="0" max="' + i.eligible.length + '" value="0" style="width:90px;min-height:48px;text-align:center;font-size:20px">')).join('');
  W.modal('일부 조기반납', '<p><strong>' + e(order.name) + '</strong> · ' + e(order.id) + '</p>' + (quantities || '<p>조기반납할 수 있는 고객 보유 물품이 없습니다. 이미 예약한 조기수거와 진행 중인 장비교환도 확인해 주세요.</p>')
    + '<div class="wf-form-grid">' + select('조기반납 사유', Object.entries(window.SkiWorkflows.earlyReturns.reasons), 'injury', 'id="early-reason" aria-label="조기반납 사유"')
    + select('조기반납 방법', [['direct','매장 직접반납'],['vehicle','차량 조기수거 예약']], 'direct', 'id="early-method" aria-label="조기반납 방법"') + '</div>'
    + field('조기반납 메모', '', 'text', 'id="early-memo" maxlength="200" placeholder="예: 부상으로 일행 1명만 먼저 반납 · 기타는 필수"')
    + '<div id="early-visit" hidden><div class="wf-form-grid">' + field('조기수거 날짜', S.data.today, 'date', 'id="early-date"') + field('조기수거 시간', '13:00', 'time', 'id="early-time"')
    + field('조기수거 장소', order.place || '만선 광장', 'text', 'id="early-place" maxlength="160"') + select('조기수거 차량', [['demo-van-1','1호 차량'],['demo-van-2','2호 차량']], F.vehicleId, 'id="early-vehicle" aria-label="조기수거 차량"') + '</div></div>'
    + '<output id="early-preview" class="wf-hint" aria-live="polite"></output><p class="wf-hint">선택하지 않은 물품의 기존 일정과 대여금액은 유지합니다. 부츠·폴대 교환 이력이 있다면 실제 함께 반납하는 구성품도 선택하세요. 환불 금액은 자동으로 바뀌지 않습니다.</p>', b('취소','close') + b('조기반납 저장','early-save','','primary'));
  updateEarly();
}
function updateEarly() {
  if (!S.$('#early-method')) return;
  const selected = earlyRows.filter((i, index) => Number(earlyRead('qty-' + index)) > 0).map((i) => i.name + ' ' + earlyRead('qty-' + earlyRows.indexOf(i)));
  S.$('#early-visit').hidden = earlyRead('method') !== 'vehicle';
  S.$('#early-preview').textContent = selected.length ? (earlyRead('method') === 'vehicle' ? '별도 조기수거 예약: ' : '지금 매장에서 받음: ') + selected.join(' · ') : '조기반납할 품목과 수량을 선택해 주세요.';
  S.$('[data-action="early-save"]').disabled = !selected.length;
}
S.root.addEventListener('change', event => {
  const target = event.target;
  if (target.dataset.earlyCheck != null) S.$('#early-qty-' + target.dataset.earlyCheck).value = target.checked ? earlyRows[+target.dataset.earlyCheck].eligible.length : 0;
  if (target.id.startsWith('early-') || target.dataset.earlyCheck != null) updateEarly();
});
S.root.addEventListener('input', event => {
  const target = event.target;
  if (target.dataset.earlyQty != null) { S.$('[data-early-check="' + target.dataset.earlyQty + '"]').checked = Number(target.value) > 0; updateEarly(); }
});
S.action('early-save', W.safe(() => {
  if (earlyRevision !== F.snap().revision) throw new Error('수량이나 일정이 변경됐습니다. 창을 닫고 다시 확인해 주세요.');
  const assetIds = earlyRows.flatMap((i, index) => { const q = W.number('early-qty-' + index); if (q > i.eligible.length) throw new Error('선택 가능한 수량을 확인해 주세요.'); return i.eligible.slice(0, q).map(a => a.id); });
  if (!assetIds.length) throw new Error('조기반납할 품목과 수량을 선택해 주세요.');
  const method = earlyRead('method');
  F.run('earlyReturn.create', { id: C.randomId('early-'), orderId: earlyOrder.id, customerName: earlyOrder.name, assetIds, reason: earlyRead('reason'), memo: earlyRead('memo'), method,
    ...(method === 'vehicle' ? { visit: { date: earlyRead('date'), time: earlyRead('time'), place: earlyRead('place'), vehicleId: earlyRead('vehicle') } } : {}) });
  W.changed(method === 'vehicle' ? '선택한 수량만 조기수거로 예약했습니다. 나머지 일정은 유지됩니다.' : '선택한 수량을 조기반납 처리했습니다. 나머지 대여와 금액은 유지됩니다.');
}));
S.rentalChanges = { openExchange, openRecord, openEarly, list };
})();
