(() => {
  'use strict';
  const S = window.SkiOps, P = S.pos, D = S.posData, O = S.posOrders, Docs = window.SkiWorkflowOrderDocuments, C = window.SkiWorkflowClient, e = S.esc, button = P.button;
  const state = { tab: 'forms', draft: null, binding: null, guest: null, printId: null, tokens: new Map(), busy: false };
  const order = () => D.order(), latest = form => form.submissions.filter(row => row.status === 'submitted').at(-1), formOf = id => D.snapshot.forms.find(form => form.id === id);
  const copy = value => JSON.parse(JSON.stringify(value)), pageSize = () => innerHeight < 700 ? 2 : 3;
  const errorBox = () => '<p class="pos-error" data-preinput-error role="alert" hidden></p>';
  function error(reason) { const box = S.$('#so-dialog[open] [data-preinput-error]') || S.$('[data-preinput-error]'); if (box) { box.hidden = false; box.textContent = reason.message || reason; } else S.toast(reason.message || reason); }
  function safe(fn) { return async (...args) => { if (state.busy) return; state.busy = true; try { await fn(...args); } catch (reason) { error(reason); } finally { state.busy = false; } }; }
  const linkedForms = current => D.snapshot.forms.filter(form => form.orderId === current.id || (current.links || []).some(link => link.sourceType === 'form' && link.sourceId === form.id));
  const printStatus = job => ({ queued: '미리보기 준비', dispatched: '브라우저 인쇄 요청', unknown: '실제 출력 결과 확인 필요', confirmed: '직원 출력 확인', failed: '출력 실패', cancelled: '출력 취소' }[job.status] || job.status);
  const batchLabel = (current, id) => current.batches.find(batch => batch.id === id)?.label || id;
  function formsPanel(current) {
    const eligiblePeople = current.people.filter(person => current.lines.some(line => line.personId === person.id && line.category !== 'liftTicket' && line.cancelledQuantity < line.quantity));
    const applied = eligiblePeople.filter(person => person.preinput).length;
    return '<p class="pos-a3-note" data-fit="auto">' + e(current.customer.name + ' · ' + (eligiblePeople.length ? '규격 적용 ' + applied + '/' + eligiblePeople.length + '명' : '대표자 접수 · 준비에서 실물 규격 확인') + (current.people.some(person => person.preinput?.orderDifferences?.length) ? ' · 요청 품목 차이 확인 필요' : '')) + '</p>'
      + P.cards([{ title: '입력 요청 내역', cards: linkedForms(current).slice().reverse().map(form => {
        const applied = (current.preinputApplications || []).filter(row => row.formId === form.id).at(-1), pending = !!latest(form) && applied?.submissionVersion !== latest(form).version;
        return P.lineRow({ name: (form.orderBatchIds || []).map(id => batchLabel(current, id)).join(' / ') || form.id, noteParts: ['제출 ' + form.submittedPeople + '/' + form.expectedPeople + '명', pending ? '매장 확인 필요' : applied ? '규격 적용됨' : '입력 대기', form.linkStatus === 'active' ? '유효한 링크' : '링크 만료·닫힘'], action: 'pos-preinput-review', id: form.id, label: '입력 내용' });
      }) }], { lines: true, signature: 'preinput-forms-' + current.id, empty: '아직 준비한 입력 링크가 없습니다' });
  }
  function printPanel(current) {
    return '<div class="so-actions">' + button('A4 준비표 만들기', 'pos-preinput-print-new', 'a4', 'primary') + button('팀 스티커 만들기', 'pos-preinput-print-new', 'sticker') + '</div>'
      + P.pager(D.snapshot.printJobs.filter(job => job.orderId === current.id).slice().reverse(), 'preinput-print-jobs', job => P.row((job.kind === 'a4' ? 'A4 준비표' : '팀 스티커') + ' · ' + printStatus(job),
        job.id + ' · ' + job.document.sources.map(source => batchLabel(current, source.batchId)).join(' / '), button('원본 미리보기', 'pos-preinput-print-preview', job.id)), pageSize());
  }
  function sourcePanel(current) {
    const links = current.links || [], sources = [...D.snapshot.forms.map(source => ({ type: 'form', source })), ...D.snapshot.reservations.map(source => ({ type: 'reservation', source }))]
      .filter(row => !row.source.orderId && !D.snapshot.orders.some(other => (other.links || []).some(link => link.sourceType === row.type && link.sourceId === row.source.id)));
    return '<p class="pos-info">같은 고객인지 접수번호와 연락처를 확인하세요. 이름만으로 합치지 않습니다. 과거 지급 물품은 소급 이동하지 않습니다.</p>'
      + P.pager(sources, 'preinput-sources', row => P.row((row.type === 'form' ? '입력폼 · ' : '권 예약 · ') + row.source.customer.name, row.source.id + ' · ' + row.source.customer.phone,
        button('이 접수에 연결', 'pos-preinput-source', row.type + '|' + row.source.id)), pageSize())
      + '<p class="pos-label">이 접수에 연결된 기록 ' + links.length + '건</p>';
  }
  function render() {
    const current = order(); if (!current) return P.page('접수를 선택해 주세요', '', O.go('접수 목록', 'intake'));
    const tabs = '<div class="so-actions">' + O.go('팀별 현황', 'size-status') + [['forms', '일행 사전입력'], ['prints', '준비표·스티커'], ['sources', '기존 기록 연결']].map(([id, label]) => button(label, 'pos-preinput-tab', id, state.tab === id ? 'primary' : '')).join('') + '</div>';
    return P.page('사이즈 입력 현황', '', (state.tab === 'forms' ? formsPanel(current) : state.tab === 'prints' ? printPanel(current) : sourcePanel(current)) + errorBox(),
      O.go('고객 상세로', 'order-detail', current.id) + '<div class="so-actions">' + (state.tab === 'forms' ? button('이번 일행 입력 요청', 'pos-preinput-new', '', 'primary') : '') + button('최신 제출 확인', 'pos-refresh') + '</div>', { toolbar: tabs });
  }

  function eligible(current, batchId) { return current.people.filter(person => current.lines.some(line => line.batchId === batchId && line.personId === person.id && line.category !== 'liftTicket' && !line.cancelledQuantity)); }
  function startRequest() {
    const current = order(), batchId = current.batches.at(-1).id;
    state.draft = { batchId, personIds: eligible(current, batchId).filter(person => !person.preinput).map(person => person.id) }; requestModal();
  }
  function requestModal() {
    const current = order(), draft = state.draft, people = eligible(current, draft.batchId), chosen = people.filter(person => draft.personIds.includes(person.id));
    const formIds = linkedForms(current).map(form => form.id), deliveries = (D.snapshot.deliveries || []).filter(row => formIds.includes(row.formId));
    const sent = deliveries.filter(row => ['sent', 'delivered'].includes(row.status)).length;
    const row = (name, value, action = '') => '<div><dt>' + name + '</dt><dd data-fit="words" title="' + e(value) + '">' + e(value) + '</dd>' + action + '</div>';
    P.modal(current.customer.name + (current.customer.name.endsWith(' 팀') ? '' : ' 팀') + ' · 사이즈 요청 ' + chosen.length + '명', '<section class="pos-a3-form"><dl class="pos-a3-ledger">'
      + row('대상 일행', chosen.map(person => person.preinput?.name || person.name).join(' · ') || (people.length ? '선택 없음' : '대표자 접수 · 개인별 대상 없음'), button('대상 선택', 'pos-preinput-people'))
      + row('접수 차수', batchLabel(current, draft.batchId), button('차수 선택', 'pos-preinput-batches'))
      + row('받는 번호', current.customer.phone || '연락처 미입력') + row('발송 기록', sent ? '발송 기록 ' + sent + '건' : '자동 발송 안 함 · 링크만 준비') + '</dl>'
      + '<div class="pos-a3-note"><strong>안내 문구</strong><p>[' + e(P.storeName()) + '] ' + e(current.customer.name) + ' 님, 일행 사이즈를 미리 입력해 주세요.</p></div><p class="pos-a3-warn">사이즈 미입력 · 미입력 시 현장 측정</p></section>' + errorBox(),
      button('취소', 'close') + button(draft.personIds.length + '명 입력 링크 준비', 'pos-preinput-create', '', 'primary'), (current.receiptNo || current.id) + ' · 이미 아는 규격은 다시 묻지 않습니다');
    S.$('#so-dialog .pos-modal-sub').dataset.fit = 'auto'; P.fitPage(S.$('#so-dialog'));
    S.$('[data-action="pos-preinput-create"]').disabled = !draft.personIds.length;
  }
  function requestPeople() {
    const draft = state.draft, people = eligible(order(), draft.batchId);
    P.modal('이번에 입력할 일행 선택', '<section class="pos-a3-form">' + P.pager(people, 'preinput-request-people', person => P.row(person.preinput?.name || person.name, person.preinput ? '규격 입력 있음 · 필요하면 다시 선택' : '규격 입력 대기', button(draft.personIds.includes(person.id) ? '선택됨' : '선택', 'pos-preinput-person', person.id, draft.personIds.includes(person.id) ? 'primary' : '')), pageSize())
      + (!people.length ? '<p class="pos-label">대표자 접수는 준비에서 실물 규격을 확인합니다. 준비표는 바로 만들 수 있습니다.</p>' : '') + '</section>', button('선택 적용', 'pos-preinput-request-back', '', 'primary'));
  }
  S.action('pos-preinput-people', requestPeople);
  S.action('pos-preinput-request-back', requestModal);
  S.action('pos-preinput-batches', () => P.modal('입력 요청할 접수 차수', '<section class="pos-a3-form">' + P.pager(order().batches, 'preinput-batches', batch => P.lineRow({ name: batch.label || batch.id, noteParts: [eligible(order(), batch.id).length + '명'], action: 'pos-preinput-pick-batch', id: batch.id, label: '선택', selected: batch.id === state.draft.batchId }), 4) + '</section>', button('돌아가기', 'pos-preinput-request-back')));
  S.action('pos-preinput-pick-batch', id => { state.draft.batchId = id; state.draft.personIds = eligible(order(), id).filter(person => !person.preinput).map(person => person.id); requestModal(); });
  async function createForm() {
    const current = order(), draft = state.draft; if (!draft.personIds.length) throw new Error('입력을 요청할 일행을 선택해 주세요.');
    const id = D.id('form'), token = C.randomId(''), accessHash = await window.SkiWorkflowService.hashToken(token), expiresAt = new Date(Date.parse(D.snapshot.at) + 7 * 86400000).toISOString();
    state.tokens.set(id, token); if (!window.SkiPosOperating) S.workflow.tokens.set(id, token);
    await D.execute('docs.formCreate', { orderId: current.id, id, batchIds: [draft.batchId], personIds: draft.personIds, accessHash, expiresAt });
    await D.execute('delivery.queue', { id: D.id('link'), formId: id }); state.draft = null; linkModal(id); S.render();
  }
  function tokenOf(id) { return state.tokens.get(id) || (!window.SkiPosOperating ? S.workflow.tokens.get(id) : null); }
  function linkOf(id) { return window.SkiWorkflowClient.formLink(location.origin + '/guest', D.snapshot.shopId, id, tokenOf(id)); }
  function linkModal(id) {
    const form = formOf(id), token = tokenOf(id), active = form.linkStatus === 'active';
    P.modal('입력 링크 준비 · ' + form.customer.name, '<p>' + e(form.id) + ' · 이번 대상 ' + form.expectedPeople + '명</p>'
      + (window.SkiPosOperating ? token && active ? '<label class="so-field">고객 입력 링크<textarea rows="3" readonly data-preinput-link>' + e(linkOf(id)) + '</textarea></label><p class="pos-label">링크만 준비했습니다. 고객에게 자동 발송하지 않습니다.</p>' : '<p class="pos-label">이 화면에 링크 열쇠가 없거나 만료되었습니다. 새 링크를 준비하면 이전 링크는 닫힙니다.</p>'
        : '<p class="pos-info">현재 화면에서 이어지는 고객 입력 체험입니다. 새 기기로 이 체험 데이터가 전달되지는 않습니다.</p>') + errorBox(),
      button('닫기', 'close') + (!token || !active ? button('새 링크 준비', 'pos-preinput-renew', id, 'primary') : window.SkiPosOperating ? button('링크 복사', 'pos-preinput-copy', id, 'primary') : button('고객 입력 체험', 'pos-preinput-local-guest', id, 'primary')));
  }
  async function renew(id) {
    const token = C.randomId(''); state.tokens.set(id, token); if (!window.SkiPosOperating) S.workflow.tokens.set(id, token);
    await D.execute('intake.renew', { id, accessHash: await window.SkiWorkflowService.hashToken(token), expiresAt: new Date(Date.parse(D.snapshot.at) + 7 * 86400000).toISOString() }); linkModal(id);
  }
  function reviewModal(id) {
    const form = formOf(id), submitted = latest(form), bound = !!form.orderPersonLinks?.length;
    const people = submitted?.people || form.requestedPeople || [];
    P.modal(form.id + ' · 입력 확인', '<p class="pos-label">제출 ' + form.submittedPeople + '/' + form.expectedPeople + '명 · 아직 입력하지 않은 일행은 계속 남습니다.</p>'
      + P.pager(people, 'preinput-review-' + id, person => P.row(person.name, (person.equipment === 'ski' ? '스키' : person.equipment === 'board' ? '보드' : '장비 없음·확인') + ' · 키 ' + (person.heightCm ?? '현장 확인') + ' · 발 ' + (person.footMm ?? '현장 확인') + ' · 의류 ' + (person.clothing ? person.clothingSize || '현장 확인' : '없음') + ' · 헬멧 ' + (person.helmet ? '필요' : '없음'),
        submitted && bound ? button('규격 수정', 'pos-preinput-edit-person', id + '|' + person.id) : ''), pageSize()) + errorBox(),
      button('닫기', 'close') + (submitted ? button('입력 링크', 'pos-preinput-link', id) : '') + (submitted ? button(bound ? '확인하고 접수에 적용' : '기존 일행과 연결', bound ? 'pos-preinput-apply' : 'pos-preinput-bind', id, 'primary') : button('입력 링크', 'pos-preinput-link', id)));
  }
  async function apply(id, people) {
    const form = formOf(id); const result = await D.execute('docs.formApply', { orderId: order().id, formId: id, submissionVersion: latest(form).version, ...(people ? { people } : {}) });
    S.close(); S.render(); S.toast(result.needsOrderReview ? '규격을 적용했습니다. 요청 품목 차이가 있어 고객 상세에서 확인해 주세요.' : '제출한 일행의 규격을 접수에 적용했습니다. 실제 지급 규격은 준비에서 확인하세요.');
  }
  function bindModal(id) {
    if (state.binding?.formId !== id) state.binding = { formId: id, links: {} };
    const form = formOf(id), people = latest(form)?.people || [];
    P.modal('입력폼 일행을 명확하게 연결', '<p class="pos-label">이름만으로 자동 선택하지 않습니다. 이 접수에 해당하는 일행만 한 명씩 선택하세요.</p>'
      + P.pager(people, 'preinput-bind-' + id, person => P.row(person.name, person.id,
        '<select aria-label="' + e(person.name + ' 연결할 접수 일행') + '" data-change="pos-preinput-bind-person" data-person-id="' + e(person.id) + '"><option value="">연결 대상 선택</option>' + order().people.map(target => '<option value="' + e(target.id) + '"' + (state.binding.links[person.id] === target.id ? ' selected' : '') + '>' + e(target.preinput?.name || target.name) + ' · ' + e(target.id) + '</option>').join('') + '</select>'), pageSize()) + errorBox(),
      button('취소', 'close') + button('선택 일행 연결', 'pos-preinput-bind-save', id, 'primary'));
  }
  function printModal(kind) {
    P.modal(kind === 'a4' ? 'A4 준비표 만들기' : '팀 스티커 만들기', O.select('출력할 접수 차수', 'preinput-print-batch', [['all', '전체 차수'], ...order().batches.map(batch => [batch.id, batch.label || batch.id])], order().batches.at(-1).id)
      + '<p class="pos-label">접수번호·추가 차수·이용일을 출력합니다. 고객 입력과 현장에서 준비한 규격을 구분합니다.</p>' + errorBox(), button('취소', 'close') + button('미리보기 만들기', 'pos-preinput-print-create', kind, 'primary'));
  }
  function printPreview() {
    const job = D.snapshot.printJobs.find(job => job.id === state.printId); if (!job) return P.page('출력 원본을 찾지 못했습니다', '', O.go('고객 상세', 'order-detail', order()?.id));
    const html = Docs.html(job.document);
    return P.page(job.kind === 'a4' ? 'A4 준비표 미리보기' : '팀 스티커 미리보기', job.id + ' · ' + printStatus(job),
      '<iframe title="접수 준비표 인쇄 미리보기" sandbox srcdoc="' + e(html) + '" style="display:block;width:100%;height:100%;min-height:240px;border:1px solid #d9e0e5;border-radius:8px"></iframe>' + errorBox(),
      button('준비표 목록으로', 'pos-preinput-back-prints') + '<div class="so-actions">' + button('인쇄 창 열기', 'pos-preinput-browser-print', job.id, 'primary') + button('종이 출력 직접 확인', 'pos-preinput-print-confirm', job.id) + '</div>');
  }
  async function browserPrint(id) {
    const job = D.snapshot.printJobs.find(job => job.id === id), html = Docs.html(job.document);
    await D.execute('print.record', { id, status: 'dispatched', device: 'browser-preview', note: '직원이 인쇄 창 열기 요청' });
    if (window.parent !== window) window.parent.postMessage({ type: 'ski-print', html }, '*');
    else {
      const frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-same-origin allow-modals'); frame.style.cssText = 'position:fixed;left:-10000px;width:794px;height:1123px'; frame.title = '인쇄용 준비표';
      frame.onload = () => { frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true }); frame.contentWindow.focus(); frame.contentWindow.print(); };
      frame.srcdoc = html; document.body.append(frame);
    }
    await D.execute('print.record', { id, status: 'unknown', device: 'browser-preview', note: '브라우저 인쇄 요청, 실제 종이 출력 결과는 확인할 수 없음' }); S.render();
  }
  async function localGuest(id) {
    if (window.SkiPosOperating) throw new Error('운영 고객 입력은 준비한 고객 링크로 열어 주세요.');
    const data = await S.workflow.guest(id).get();
    state.guest = { ...data, orderId: order().id, index: 0, rows: copy(data.people.length ? data.people : formOf(id).requestedPeople || []), done: false };
    S.close(); S.go('order-preinput-guest', { id });
  }
  function captureGuest() {
    const row = state.guest?.rows[state.guest.index]; if (!row || !S.$('[data-pos-input="pre-guest-name"]')) return;
    row.name = O.read('pre-guest-name'); row.heightCm = O.read('pre-guest-height') === '' ? null : Number(O.read('pre-guest-height')); row.footMm = O.read('pre-guest-foot') === '' ? null : Number(O.read('pre-guest-foot'));
    row.clothingSize = O.read('pre-guest-clothing') || '';
  }
  function guestRender() {
    const guest = state.guest, row = guest?.rows[guest.index];
    if (!row) return P.page('입력할 일행이 없습니다', '', button('매장으로', 'pos-preinput-guest-back'));
    if (guest.done) return P.page('입력 내용을 제출했어요', '매장에서 확인한 뒤 장비를 준비합니다.', '<p class="pos-info">현재 화면에서 이어지는 체험입니다.</p>', button('매장에서 제출 확인', 'pos-preinput-guest-back', '', 'primary'));
    return P.page(guest.customer.name + ' 팀 사전입력', (guest.index + 1) + '/' + guest.rows.length + '번째 일행 · 모르는 규격은 비워 두세요.', '<div class="pos-form-grid">'
      + O.input('일행 이름', 'pre-guest-name', row.name, 'text', 'maxlength="60"') + O.input('키 (cm)', 'pre-guest-height', row.heightCm ?? '', 'number', 'min="60" max="240"')
      + O.input('발 (mm)', 'pre-guest-foot', row.footMm ?? '', 'number', 'min="130" max="380"') + (row.clothing ? O.input('의류 규격', 'pre-guest-clothing', row.clothingSize || '', 'text', 'maxlength="24" placeholder="모르면 비워 두세요"') : '')
      + '</div><p class="pos-label">접수한 장비: ' + e(row.equipment === 'ski' ? '스키' : row.equipment === 'board' ? '보드' : '현장 확인') + ' · 의류 ' + (row.clothing ? '필요' : '없음') + ' · 헬멧 ' + (row.helmet ? '필요' : '없음') + '</p>' + errorBox(),
      '<div class="so-actions">' + button('이전 일행', 'pos-preinput-guest-step', '-1') + button('다음 일행', 'pos-preinput-guest-step', '1') + '</div>' + button('작성 내용 제출', 'pos-preinput-guest-submit', '', 'primary'));
  }
  S.action('pos-preinput', id => { state.tab = 'forms'; S.go('order-preinput', { id }); });
  S.action('pos-preinput-tab', tab => { state.tab = tab; S.render(); }); S.action('pos-preinput-new', startRequest);
  S.change('pos-preinput-batch', id => { state.draft.batchId = id; state.draft.personIds = eligible(order(), id).filter(person => !person.preinput).map(person => person.id); requestModal(); });
  S.action('pos-preinput-person', id => { const ids = state.draft.personIds; state.draft.personIds = ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]; requestPeople(); });
  S.action('pos-preinput-create', safe(createForm)); S.action('pos-preinput-link', linkModal); S.action('pos-preinput-renew', safe(renew));
  S.action('pos-preinput-copy', safe(async id => { const link = linkOf(id); try { await navigator.clipboard.writeText(link); S.toast('입력 링크를 복사했습니다.'); } catch { const area = S.$('[data-preinput-link]'); area?.focus(); area?.select(); S.toast('링크를 선택했습니다. 복사해 주세요.'); } }));
  S.action('pos-preinput-review', reviewModal); S.action('pos-preinput-apply', safe(id => apply(id)));
  S.action('pos-preinput-edit-person', value => {
    const [formId, personId] = value.split('|'), person = latest(formOf(formId)).people.find(person => person.id === personId);
    P.modal(person.name + ' · 매장 규격 확인', '<div class="pos-form-grid">' + O.input('확인한 키 (cm)', 'preinput-height', person.heightCm ?? '', 'number', 'min="60" max="240"') + O.input('확인한 발 (mm)', 'preinput-foot', person.footMm ?? '', 'number', 'min="130" max="380"') + O.input('확인한 의류 규격', 'preinput-clothing', person.clothingSize, 'text', 'maxlength="24"') + '</div><p class="pos-label">고객 제출 원본은 보존합니다. 실제 장비 규격은 준비·지급에서 별도로 확인합니다.</p>' + errorBox(), button('취소', 'close') + button('수정하여 접수에 적용', 'pos-preinput-edit-save', value, 'primary'));
  });
  S.action('pos-preinput-edit-save', safe(async value => { const [formId, personId] = value.split('|'), rows = copy(latest(formOf(formId)).people), person = rows.find(person => person.id === personId);
    person.heightCm = O.read('preinput-height') === '' ? null : Number(O.read('preinput-height')); person.footMm = O.read('preinput-foot') === '' ? null : Number(O.read('preinput-foot')); person.clothingSize = O.read('preinput-clothing'); await apply(formId, rows.filter(person => formOf(formId).orderPersonLinks.some(link => link.formPersonId === person.id))); }));
  S.action('pos-preinput-bind', bindModal); S.change('pos-preinput-bind-person', (value, element) => { state.binding.links[element.dataset.personId] = value; });
  S.action('pos-preinput-bind-save', safe(async id => { const personLinks = Object.entries(state.binding.links).filter(([, personId]) => personId).map(([formPersonId, personId]) => ({ formPersonId, personId })); await D.execute('docs.formBind', { orderId: order().id, formId: id, personLinks }); state.binding = null; reviewModal(id); }));
  S.action('pos-preinput-source', value => { const [type, id] = value.split('|'), source = (type === 'form' ? D.snapshot.forms : D.snapshot.reservations).find(source => source.id === id);
    P.modal('기존 기록을 이 접수에 연결할까요?', '<div class="pos-confirm-summary"><strong>' + e(order().customer.name + ' · ' + (order().receiptNo || order().id)) + '</strong><span>' + e(source.customer.name + ' · ' + source.customer.phone) + '</span><span>' + e(type + ' · ' + id) + '</span></div><p class="pos-label">동일한 팀의 기록인지 직원이 확인합니다. 과거 지급 물품은 소급 합치지 않습니다.</p>' + errorBox(), button('취소', 'close') + button('이 팀 기록이 맞음', 'pos-preinput-source-save', value, 'primary')); });
  S.action('pos-preinput-source-save', safe(async value => { const [sourceType, sourceId] = value.split('|'); await D.execute('ops.link', { orderId: order().id, sourceType, sourceId }); S.close(); if (sourceType === 'form' && latest(formOf(sourceId))) bindModal(sourceId); else { S.render(); S.toast('선택한 기록을 연결했습니다.'); } }));
  S.action('pos-preinput-print-new', printModal); S.action('pos-preinput-print-create', safe(async kind => { const batch = O.read('preinput-print-batch'); const result = await D.execute('docs.orderPrint', { orderId: order().id, id: D.id('print'), kind, ...(batch === 'all' ? {} : { batchIds: [batch] }) }); state.printId = result.printJobId; S.close(); S.go('order-print-preview', { id: order().id }); }));
  S.action('pos-preinput-print-preview', id => { state.printId = id; S.go('order-print-preview', { id: order().id }); });
  S.action('pos-preinput-back-prints', () => { state.tab = 'prints'; S.go('order-preinput', { id: order().id }); }); S.action('pos-preinput-browser-print', safe(browserPrint));
  S.action('pos-preinput-print-confirm', safe(async id => { await D.execute('print.record', { id, status: 'confirmed', device: '직원 종이 확인', note: '직원이 출력물을 직접 확인함' }); S.render(); }));
  S.action('pos-preinput-local-guest', safe(localGuest)); S.action('pos-preinput-guest-step', delta => { captureGuest(); state.guest.index = Math.max(0, Math.min(state.guest.rows.length - 1, state.guest.index + Number(delta))); S.render(); });
  S.action('pos-preinput-guest-submit', safe(async () => { captureGuest(); const guest = state.guest; const result = await S.workflow.guest(guest.id).submit(C.newCommand('intake.submit', guest.submissionVersion, { id: guest.id, people: guest.rows, status: 'submitted' })); guest.submissionVersion = result.submissionVersion; guest.done = true; await D.refresh(); S.render(); }));
  S.action('pos-preinput-guest-back', () => { S.go('order-preinput', { id: state.guest.orderId }); });
  S.register('order-preinput', { title: '사이즈 입력 현황', parent: 'preparation', pos: true, render });
  S.register('order-print-preview', { title: '준비표 미리보기', parent: 'preparation', pos: true, render: printPreview });
  S.register('order-preinput-guest', { title: '일행 사전입력 체험', public: true, pos: true, render: guestRender });
  S.posPreinput = { state, render, printPreview, requestModal };
})();
