(() => {
  'use strict';
  const S = window.SkiOps, D = S.posData, P = S.pos, U = S.posOrders, C = window.SkiNotificationClient;
  const bell = document.createElement('button'); bell.type = 'button'; bell.id = 'pos-notice-bell'; bell.className = 'so-notice-bell'; bell.dataset.action = 'pos-notices';
  S.$('.so-topbar-right').prepend(bell);
  let filter = 'unread', selected = null, pending = null, audio = null, sound = false, played = '', lastSound = 0;
  const unread = row => row.lifecycle === 'active' && !row.acknowledgedAt;
  const rows = () => D.snapshot?.notifications?.records || [];
  function refresh() {
    bell.hidden = !S.state.authenticated || !D.snapshot || ['login', 'guest-form', 'guest-guide'].includes(S.state.page);
    const count = rows().filter(unread).length;
    bell.innerHTML = S.icon('bell') + '<span class="so-notice-count"' + (!count ? ' hidden' : '') + '>' + Math.min(99, count) + '</span>';
    bell.setAttribute('aria-label', '알림 · 미확인 ' + count + '개'); S.icons();
    const signature = rows().filter(r => unread(r) && r.attentionRequired).map(r => r.id).join(',');
    if (signature && sound && !bell.hidden && !document.hidden && audio?.state === 'running' && (signature !== played || Date.now() - lastSound > 60000)) {
      const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.connect(gain); gain.connect(audio.destination); oscillator.frequency.value = 880; gain.gain.setValueAtTime(.12, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .8); oscillator.start(); oscillator.stop(audio.currentTime + .8); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); }; played = signature; lastSound = Date.now();
    }
  }
  function open() {
    const list = rows().filter(r => filter !== 'unread' || unread(r));
    const filters = [['unread', '미확인 ' + rows().filter(unread).length], ['all', '전체 기록']].map(([id, name]) => '<button type="button" class="so-button pos-button pos-option" data-action="pos-notice-filter" data-id="' + id + '" aria-pressed="' + (filter === id) + '">' + name + '</button>').join('');
    P.modal('업무 알림', '<section class="pos-a3-form"><div class="so-actions">' + filters + '</div>' + P.pager(list, 'notices', row => P.row(row.title, (unread(row) ? '미확인' : row.acknowledgedAt ? '확인함' : '처리됨') + ' · ' + row.summary.split('\n')[0], P.button('내용 보기', 'pos-notice-detail', row.id)), innerHeight < 700 ? 2 : 3) + '</section>' + U.errorBox(), P.button('닫기', 'close') + P.button('이 기기 소리 ' + (sound ? '끄기' : '켜기'), 'pos-notice-sound') + P.button('최신 알림', 'pos-notice-refresh'), '미확인 ' + rows().filter(unread).length + '건');
  }
  function detail(id) {
    selected = id; const row = rows().find(r => r.id === id); if (!row) return open();
    P.modal('알림 내용', '<div class="pos-confirm-summary"><strong>' + S.esc(row.title) + '</strong><span>' + S.esc(row.summary) + '</span><span>' + (unread(row) ? '아직 확인하지 않았습니다.' : '확인 또는 업무 처리된 기록입니다.') + '</span></div>' + U.errorBox(), P.button('목록', 'pos-notices') + (unread(row) ? P.button('확인함', 'pos-notice-ack', id) : '') + ((row.taskId || row.formId || D.order(row.orderId)) ? P.button('해당 업무 열기', 'pos-notice-open', id, 'primary') : ''));
  }
  S.action('pos-notices', open);
  S.action('pos-notice-filter', value => { filter = value; P.setPage('notices', 0, { render: false }); open(); });
  S.action('pos-notice-detail', detail);
  S.action('pos-notice-refresh', async () => { try { await D.refresh(); open(); } catch (error) { U.error(error); } });
  S.action('pos-notice-ack', async id => { try { pending ||= C.command('ack', {}, id); if (pending.notificationId !== id) throw new Error('앞선 알림의 확인 저장을 다시 시도해 주세요.'); await D.notices.execute(pending); pending = null; await D.refresh(); detail(id); } catch (error) { U.error(error); } });
  S.action('pos-notice-open', id => {
    const row = rows().find(r => r.id === id); if (!row) return;
    if (row.taskId && D.snapshot.tasks.some(t => t.id === row.taskId)) { S.posDispatch.openTask(row.taskId); }
    else { const order = D.order(row.orderId) || D.snapshot.orders?.find(o => o.links?.some(l => l.sourceType === 'form' && l.sourceId === row.formId)); if (order) S.go(row.formId ? 'order-preinput' : 'order-detail', { id: order.id }); else S.toast('담당 차량 업무에서 현재 기록을 확인해 주세요.'); }
  });
  S.action('pos-notice-sound', async () => { try { if (!sound) { audio ||= new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); if (audio.state !== 'running') throw new Error('브라우저에서 소리 재생을 허용해 주세요.'); } sound = !sound; played = ''; refresh(); open(); } catch (error) { U.error(error); } });
  const legacy = S.notifications;
  S.posNotifications = { refresh };
  S.notifications = { ...legacy, refresh() { legacy.refresh(); refresh(); } };
  setInterval(refresh, 5000);
})();
