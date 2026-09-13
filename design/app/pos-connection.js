(() => {
  'use strict';
  if (!window.SkiPosOperating) return;
  const S = window.SkiOps, P = S.pos, D = S.posData;
  const render = () => '<section class="pos-connection"><div class="pos-connection-card"><span class="pos-label">SKINOTE · 매장 운영</span><h1>매장 포스 연결</h1><p>등록된 직원 인증키로 이 매장의 기록을 엽니다.</p><label class="so-field">직원 인증키<input type="password" id="pos-access-key" autocomplete="off" spellcheck="false" aria-label="직원 인증키"></label><p class="pos-error" id="pos-connect-error" role="alert" hidden></p>' + P.button('인증하고 업무 시작', 'pos-connect', '', 'primary') + '<p class="pos-label">이 기기에서는 인증키를 저장하지 않습니다.</p></div></section>';
  S.register('login', { title: '매장 연결', public: true, entry: true, render });
  S.action('pos-connect', async () => {
    const field = S.$('#pos-access-key'), box = S.$('#pos-connect-error'), button = S.$('[data-action="pos-connect"]');
    if (button.disabled) return; button.disabled = true;
    try {
      const client = window.SkiWorkflowClient.createHttpClient({ baseUrl: location.origin, token: field.value.trim() });
      await D.connect(client, window.SkiNotificationClient.createHttpClient({ baseUrl: location.origin, token: field.value.trim() })); field.value = '';
      S.state.authenticated = true;
      S.$('.so-demo-label').textContent = '운영 연결 · ' + D.snapshot.actor.id;
      S.go(D.snapshot.actor.role === 'driver' ? 'dispatch' : 'home', {}, true);
    } catch (error) { box.hidden = false; box.textContent = error.message; }
    finally { button.disabled = false; }
  });
  S.action('logout', () => {
    if (D.pending || D.busy) { S.toast('처리 결과를 먼저 확인한 뒤 나가 주세요.'); return; }
    D.disconnect(); S.state.authenticated = false; S.state.afterLogin = null; S.state.history = []; S.state.posReturn = null;
    S.go('login', {}, true, 'pos');
  });
})();
