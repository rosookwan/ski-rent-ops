(() => {
  'use strict';
  const S = window.SkiOps, { esc, icon } = S, runtime = S.notificationRuntime, C = window.SkiNotificationClient;
  const role = () => S.state.page === 'vehicle' ? 'driver' : 'store';
  const service = () => runtime[role()];
  const active = () => S.state.authenticated && !['login', 'guest-form', 'guest-guide'].includes(S.state.page);
  const unread = row => row.lifecycle === 'active' && !row.acknowledgedAt;
  const incoming = () => service().sync(0).records;
  const metadata = {
    collection: ['package-check', '수거 내역'], priority: ['bell-ring', '확인 요청'],
    help: ['message-circle', '기사님 요청'], schedule: ['calendar-clock', '일정 변경'],
    assignment: ['truck', '새 일정'], cancelled: ['calendar-x', '일정 취소'],
    correction: ['rotate-ccw', '수량 변경'], handover: ['clipboard-check', '매장 인계'], 'task-complete': ['check', '업무 처리']
  };
  const stateLabel = row => row.lifecycle !== 'active' ? ({ resolved: '처리됨', cancelled: '취소됨', superseded: '변경됨', expired: '종료됨' }[row.lifecycle] || '종료됨') : row.acknowledgedAt ? '확인함' : '미확인';
  const stamp = at => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(new Date(at));
  const makeButton = (label, action, attrs = '', kind = '') => '<button type="button" class="so-notice-button ' + kind + '" data-notice="' + action + '" ' + attrs + '>' + label + '</button>';
  const bell = document.createElement('button');
  bell.type = 'button'; bell.className = 'so-notice-bell'; bell.id = 'so-notice-bell'; bell.setAttribute('aria-haspopup', 'dialog'); bell.setAttribute('aria-controls', 'so-notice-dialog');
  bell.innerHTML = icon('bell') + '<span class="so-notice-count" hidden></span>';
  S.$('.so-topbar-right').insertBefore(bell, S.$('.so-topbar-right [data-go]'));
  const dialog = document.createElement('dialog');
  dialog.id = 'so-notice-dialog'; dialog.setAttribute('aria-labelledby', 'so-notice-title');
  S.root.append(dialog);
  const live = document.createElement('span'); live.className = 'so-notice-sr'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); S.root.append(live);
  let tab = 'unread', screen = 'list', selected = null, returnFocus = null, composingOrder = null, pendingCommand = null, lastRole = '', seenRevision = -1;
  let audio = null, audioReady = new Set(), audioError = '', lastPlayed = 0, playedCount = 0, timer = null, lastSoundRole = '', playback = null;
  const oscillatorNodes = new Set();
  const prefs = () => service().preferences();
  const audioUsable = () => audioReady.has(role()) && audio?.state === 'running' && !audioError;
  const soundReady = () => prefs().sound && audioUsable();
  const stopSound = (remindersOnly = false) => {
    if (remindersOnly && playback === 'preview') return;
    for (const node of oscillatorNodes) { try { node.stop(); } catch (_) {} }
    oscillatorNodes.clear(); playback = null;
  };
  function playSound(kind = 'reminder') {
    if (!audioUsable() || (kind !== 'preview' && !prefs().sound) || !active() || document.hidden || !prefs().volume) return false;
    stopSound();
    playback = kind;
    const start = audio.currentTime;
    for (const [frequency, offset] of [[880, 0], [660, .19]]) {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + offset);
      gain.gain.linearRampToValueAtTime(.16 * prefs().volume / 100, start + offset + .012);
      gain.gain.exponentialRampToValueAtTime(.001, start + offset + .27);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start + offset); oscillator.stop(start + offset + .28);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); oscillatorNodes.delete(oscillator); if (!oscillatorNodes.size) playback = null; };
      oscillatorNodes.add(oscillator);
    }
    lastPlayed = Date.now(); playedCount++; return true;
  }
  function tick() {
    if (active() && !document.hidden && incoming().some(row => unread(row) && row.attentionRequired)) {
      if (Date.now() - lastPlayed >= prefs().interval * 1000) playSound();
    } else stopSound(true);
  }
  async function enableSound(previewOnly = false) {
    const requestedRole = role();
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('이 브라우저에서 소리를 지원하지 않습니다.');
      if (!audio) audio = new Audio();
      let timeout;
      try {
        await Promise.race([audio.resume(), new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('소리가 차단됐어요. 브라우저의 사이트 소리 설정을 확인하고 다시 눌러 주세요.')), 3000);
        })]);
      } finally { clearTimeout(timeout); }
      if (!active() || role() !== requestedRole) return;
      if (audio.state !== 'running') throw new Error('브라우저의 소리 재생을 허용해 주세요.');
      audioError = ''; audioReady.add(role());
      if (!previewOnly) service().execute(C.command('preferences', { ...prefs(), sound: true }));
      playSound('preview'); updateSettings();
    } catch (error) { audioError = error.message; updateSettings(); }
  }
  function preferencesHtml() {
    const p = prefs(), ready = soundReady();
    return '<div class="so-notice-settings"><div class="so-notice-setting-intro"><span class="so-notice-large-icon">' + icon('volume-2') + '</span><h3>확인이 필요할 때, <br>소리로 알려드릴게요.</h3><p>이 화면에서 사용할 소리를 설정하세요.</p></div>' +
      makeButton('<span><strong>알림 소리</strong><small>' + (ready ? '켜짐 · 소리를 받을 준비가 됐어요' : p.sound ? '소리 재생을 다시 확인해 주세요' : '꺼짐 · 종과 숫자는 계속 표시돼요') + '</small></span><span class="so-notice-switch ' + (ready ? 'is-on' : '') + '" aria-hidden="true"></span>', 'sound-toggle', 'aria-label="알림 소리 ' + (ready ? '끄기' : '켜기') + '"', 'so-notice-setting-row') +
      '<div class="so-notice-setting"><span>미확인 알림 반복</span><div class="so-notice-segments">' + [30, 60].map(n => makeButton(n + '초', 'interval', 'data-value="' + n + '" aria-pressed="' + (p.interval === n) + '"')).join('') + '</div></div>' +
      '<label class="so-notice-setting"><span>소리 크기 <b id="so-notice-volume-value">' + p.volume + '%</b></span><input type="range" min="0" max="100" step="10" value="' + p.volume + '" data-notice-volume aria-label="알림 소리 크기"></label>' +
      makeButton(icon('play') + (p.volume ? '소리 들어보기' : '소리 크기를 올려 주세요'), 'sound-test', p.volume ? '' : 'disabled', 'wide') +
      '<p class="so-notice-hint">' + esc(audioError || '확인하면 반복 소리가 멈춥니다. 화면을 끄거나 다른 앱을 사용하면 소리가 제한될 수 있어요.') + '</p></div>';
  }
  function listHtml() {
    let rows = incoming();
    if (tab === 'sent') rows = service().sent().records;
    else if (tab === 'unread') rows = rows.filter(unread);
    rows = [...rows].sort((a, b) => (tab === 'unread' ? Number(b.type === 'priority' || b.type === 'help') - Number(a.type === 'priority' || a.type === 'help') : 0) || b.createdAt.localeCompare(a.createdAt) || b.revision - a.revision);
    return '<div class="so-notice-tabs" role="group" aria-label="알림 보기">' + [['unread', '미확인'], ['all', '전체'], ['sent', '보낸 요청']].map(([id, label]) => makeButton(label + (id === 'unread' ? '<span>' + incoming().filter(unread).length + '</span>' : ''), 'tab', 'data-value="' + id + '" aria-pressed="' + (tab === id) + '"')).join('') + '</div>' +
      '<div class="so-notice-list">' + (rows.length ? rows.map(row => {
        const [glyph, label] = metadata[row.type] || ['bell', '알림'];
        return '<button type="button" class="so-notice-row ' + (unread(row) && tab !== 'sent' ? 'is-unread' : '') + '" data-notice="detail" data-id="' + esc(row.id) + '"><span class="so-notice-row-icon ' + row.type + '">' + icon(glyph) + '</span><span class="so-notice-row-copy"><span class="so-notice-row-meta"><span>' + label + '</span><time>' + stamp(row.createdAt) + '</time></span><strong>' + esc(row.title) + '</strong><span class="so-notice-excerpt">' + esc(row.summary.split('\n')[0]) + '</span><span class="so-notice-row-state">' + (tab === 'sent' ? row.acknowledgedAt ? (row.recipient === 'store' ? '매장 확인함 · ' : '기사님 확인함 · ') + stamp(row.acknowledgedAt) : row.lifecycle !== 'active' ? stateLabel(row) : row.receivedAt ? (row.recipient === 'store' ? '매장에 전달됨' : '차량에 전달됨') : '요청됨 · 확인 대기' : stateLabel(row)) + ' · ' + esc(row.orderId) + '</span></span>' + icon('chevron-right') + '</button>';
      }).join('') : '<div class="so-notice-empty">' + icon('check-check') + '<strong>' + (tab === 'unread' ? '모두 확인했어요' : tab === 'sent' ? '보낸 요청이 없어요' : '아직 알림이 없어요') + '</strong><p>' + (tab === 'unread' ? '새로운 소식이 오면 종으로 알려드릴게요.' : '업무 소식을 이곳에서 확인할 수 있어요.') + '</p></div>') + '</div>';
  }
  function detailHtml() {
    const row = incoming().concat(service().sent().records).find(row => row.id === selected);
    if (!row) return '<p class="so-notice-empty">알림을 찾을 수 없습니다.</p>';
    return '<div class="so-notice-detail"><span class="so-notice-detail-label">' + (metadata[row.type]?.[1] || '알림') + ' · ' + stateLabel(row) + '</span><h3>' + esc(row.title) + '</h3><time>' + stamp(row.createdAt) + ' · ' + esc(row.orderId) + '</time><p class="so-notice-detail-message">' + esc(row.summary) + '</p>' +
      (row.type === 'collection' ? '<p class="so-notice-hint">' + icon('info') + '알림 확인 후에도 매장에서 실제 인계 수량을 확인해 주세요.</p>' : '') +
      (row.acknowledgedAt ? '<p class="so-notice-receipt">' + icon('check-check') + '확인함 · ' + stamp(row.acknowledgedAt) + '</p>' : '') +
      '<div id="so-notice-error" role="alert"></div>' +
      (S.returnUI.current(row.orderId) ? makeButton((role() === 'driver' ? '차량 업무 보기' : row.type === 'priority' ? '배달·수거 보기' : '반납 내역 보기') + icon('arrow-right'), 'job', 'data-id="' + esc(row.orderId) + '"', 'primary wide') : '') + '</div>';
  }
  function requestHtml() {
    const allowed = new Set(runtime.orders(role()).map(order => order.id));
    const orders = S.data.orders.filter(order => { const current = S.returnUI.current(order.id); return allowed.has(order.id) && current && !current.complete && current.vehicleId; });
    if (!composingOrder || !orders.some(row => row.id === composingOrder)) composingOrder = orders[0]?.id;
    const quick = role() === 'driver' ? [['수량 확인 요청', '수량 확인이 필요해요'], ['고객 연락 안 됨', '고객님과 연락이 안 돼요'], ['기타 확인 요청', '매장에 확인할 일이 있어요']] : [['우선 확인 요청', '이 업무를 먼저 확인해 주세요.'], ['고객 연락 요청', '고객님께 연락해 주세요.']];
    return '<div class="so-notice-compose"><p class="so-notice-hint">어떤 업무를 확인하면 될까요?</p><label>고객·업무<select data-notice-order>' + orders.map(row => '<option value="' + esc(row.id) + '" ' + (row.id === composingOrder ? 'selected' : '') + '>' + esc(row.name) + ' · ' + esc(row.place) + '</option>').join('') + '</select></label><label>요청 내용<textarea data-notice-message rows="2" maxlength="240" placeholder="확인할 내용을 적어 주세요.">' + (role() === 'driver' ? '' : '이 업무를 먼저 확인해 주세요.') + '</textarea></label><div class="so-notice-quick">' + quick.map(([label, message]) => makeButton(esc(label), 'quick', 'data-value="' + esc(message) + '"')).join('') + '</div><div id="so-notice-error" role="alert"></div>' + makeButton(icon('send') + (role() === 'driver' ? '매장에 요청 보내기' : '기사님께 요청 보내기'), 'send', orders.length ? '' : 'disabled', 'primary wide') + '</div>';
  }
  function draw() {
    const focusAction = document.activeElement?.dataset?.notice;
    const focusValue = document.activeElement?.dataset?.value;
    const title = screen === 'settings' ? '알림 설정' : screen === 'request' ? (role() === 'driver' ? '매장에 요청' : '기사님 확인 요청') : screen === 'detail' ? '알림 내용' : '알림';
    dialog.dataset.role = role();
    dialog.innerHTML = '<header class="so-notice-header"><div>' + (screen !== 'list' ? makeButton(icon('arrow-left'), 'back', 'aria-label="알림 목록으로"') : '<span class="so-notice-header-icon">' + icon('bell') + '</span>') + '<h2 id="so-notice-title">' + title + '</h2></div>' + makeButton(icon('x'), 'close', 'aria-label="알림 닫기"') + '</header><div class="so-notice-content">' +
      (screen === 'list' ? listHtml() : screen === 'detail' ? detailHtml() : screen === 'request' ? requestHtml() : preferencesHtml()) + '</div>' +
      (screen === 'list' ? '<footer class="so-notice-footer">' + makeButton(icon('volume-' + (soundReady() ? '2' : 'x')) + '<span>알림 소리 <b>' + (soundReady() ? '켜짐' : '꺼짐') + '</b></span>' + icon('chevron-right'), 'settings', '', 'so-notice-audio-link') + (role() === 'driver' ? makeButton(icon('message-circle') + '매장에 요청', 'request', '', 'primary wide') : '') + '</footer>' : '');
    S.icons();
    if (dialog.open) {
      const buttons = [...dialog.querySelectorAll('[data-notice]')];
      const next = buttons.find(button => button.dataset.notice === focusAction && button.dataset.value === focusValue) || buttons[0];
      next?.focus({ preventScroll: true });
    }
  }
  function open(next = 'list', orderId) {
    if (!active()) return;
    returnFocus = document.activeElement; screen = next; selected = null; composingOrder = orderId || null; pendingCommand = null;
    draw(); if (!dialog.open) dialog.showModal();
  }
  function close() {
    if (dialog.open) dialog.close();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function updateSettings() {
    refresh();
    if (dialog.open && screen === 'settings') draw();
    const mount = S.$('#so-notice-settings-page'); if (mount) { mount.innerHTML = preferencesHtml(); S.icons(); }
  }
  function refresh() {
    const currentRole = role();
    if (lastRole !== currentRole) { stopSound(); lastPlayed = 0; lastSoundRole = ''; seenRevision = -1; tab = 'unread'; screen = 'list'; selected = null; if (dialog.open) close(); lastRole = currentRole; }
    bell.hidden = !active();
    if (!active()) { close(); stopSound(); clearInterval(timer); timer = null; bell.classList.remove('has-unread'); return; }
    let data = service().sync(0);
    for (const row of data.records.filter(row => unread(row) && !row.receivedAt)) service().execute(C.command('received', {}, row.id));
    data = service().sync(0);
    const count = data.unreadCount, badge = bell.querySelector('.so-notice-count');
    badge.textContent = count > 99 ? '99+' : String(count); badge.hidden = !count;
    bell.setAttribute('aria-label', '알림' + (count ? ' · 미확인 ' + count + '개' : ' · 모두 확인함'));
    bell.classList.toggle('has-unread', count > 0);
    if (seenRevision >= 0 && data.revision !== seenRevision) live.textContent = '확인하지 않은 알림 ' + count + '개';
    seenRevision = data.revision;
    const soundRole = currentRole + ':' + data.records.filter(row => unread(row) && row.attentionRequired).map(row => row.id).join(',');
    if (soundRole !== lastSoundRole) {
      if (data.records.some(row => unread(row) && row.attentionRequired) && Date.now() - lastPlayed > 1500) playSound();
      lastSoundRole = soundRole;
    }
    if (!count) stopSound(true);
    if (!timer) timer = setInterval(tick, 1000);
  }
  function acknowledge(id) {
    service().execute(C.command('ack', {}, id)); refresh();
  }
  function handle(action, button) {
    if (action === 'close') close();
    else if (action === 'back') { screen = 'list'; draw(); }
    else if (action === 'reload') draw();
    else if (action === 'tab') { tab = button.dataset.value; draw(); }
    else if (action === 'settings') { screen = 'settings'; draw(); }
    else if (action === 'request') { screen = 'request'; draw(); }
    else if (action === 'detail') {
      selected = button.dataset.id; screen = 'detail'; draw();
      if (incoming().some(row => row.id === selected && unread(row))) {
        try { acknowledge(selected); draw(); }
        catch (error) { dialog.querySelector('#so-notice-error').textContent = '확인 저장 실패 · ' + error.message; }
      }
    } else if (action === 'job') {
      const orderId = button.dataset.id; close();
      if (role() === 'driver') {
        S.go('vehicle');
        S.$('#ski-first-look').dispatchEvent(new CustomEvent('ski:open-order', { detail: orderId }));
      } else S.go('return-detail', { id: orderId });
    } else if (action === 'quick') { dialog.querySelector('[data-notice-message]').value = button.dataset.value; pendingCommand = null; }
    else if (action === 'send') {
      try {
        const orderId = dialog.querySelector('[data-notice-order]').value, order = S.returnUI.current(orderId);
        if (!pendingCommand) pendingCommand = C.command('request', { orderId, expectedVersion: order.version, message: dialog.querySelector('[data-notice-message]').value });
        service().execute(pendingCommand); pendingCommand = null; tab = 'sent'; screen = 'list'; draw(); refresh(); S.toast(role() === 'driver' ? '매장에 확인을 요청했습니다.' : '기사님께 확인을 요청했습니다.');
      } catch (error) { if (error.code !== 'CONNECTION_ERROR') pendingCommand = null; dialog.querySelector('#so-notice-error').textContent = error.message; }
    } else if (action === 'sound-toggle') {
      if (soundReady()) { service().execute(C.command('preferences', { ...prefs(), sound: false })); stopSound(); updateSettings(); }
      else void enableSound();
    } else if (action === 'sound-test') void enableSound(true);
    else if (action === 'interval') { service().execute(C.command('preferences', { ...prefs(), interval: Number(button.dataset.value) })); updateSettings(); }
  }
  bell.addEventListener('click', () => open());
  S.root.addEventListener('click', event => { const button = event.target.closest('[data-notice]'); if (button && !button.disabled) handle(button.dataset.notice, button); });
  S.root.addEventListener('input', event => {
    if (event.target.matches('[data-notice-message], [data-notice-order]')) pendingCommand = null;
    if (event.target.hasAttribute('data-notice-volume')) {
      service().execute(C.command('preferences', { ...prefs(), volume: Number(event.target.value) }));
      const settings = event.target.closest('.so-notice-settings'), volume = Number(event.target.value);
      settings.querySelector('#so-notice-volume-value').textContent = volume + '%';
      const test = settings.querySelector('[data-notice=sound-test]');
      test.disabled = !volume; test.innerHTML = icon('play') + (volume ? '소리 들어보기' : '소리 크기를 올려 주세요');
      if (!volume) stopSound();
      S.icons();
    }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopSound(); else { lastPlayed = Date.now(); refresh(); } });
  let refreshQueued = false;
  runtime.subscribe(() => {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      const before = seenRevision; refresh();
      if (dialog.open && screen === 'list' && before !== seenRevision && !dialog.querySelector('[data-notice=reload]')) {
        const header = dialog.querySelector('.so-notice-header>div');
        header.insertAdjacentHTML('beforeend', makeButton('새 소식 보기', 'reload', '', 'so-notice-update'));
      }
    });
  });
  S.action('driver-alert', orderId => open('request', orderId));
  S.notifications = {
    refresh, open,
    settingsView: () => '<section id="so-notice-settings-page">' + preferencesHtml() + '</section>',
    pendingForOrder: orderId => runtime.driver.sync(0).records.some(row => row.orderId === orderId && row.type === 'priority' && unread(row)),
    acknowledgeOrder: orderId => {
      for (const row of runtime.driver.sync(0).records.filter(row => row.orderId === orderId && row.type === 'priority' && unread(row))) runtime.driver.execute(C.command('ack', {}, row.id));
      refresh();
    },
    soundInfo: () => ({ ready: soundReady(), playedCount, lastPlayed, preferences: prefs(), playback, audioState: audio?.state || 'not-started' })
  };
})();
