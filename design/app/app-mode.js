(() => {
  'use strict';
  const S = window.SkiOps;
  let enabled = false, available = false, restoring = false, position = 0;
  let entries = [], initialHistory = [];
  const send = data => window.parent.postMessage(data, '*');
  const route = value => ({ page:value.page, params:{...value.params}, workspace:value.workspace });
  const snapshot = () => route(S.state);

  function refreshInstall() {
    const button = S.$('[data-action="install-app"]');
    if (button) {
      button.hidden = enabled;
      button.textContent = available ? '스키노트 설치' : '앱 설치 안내';
    }
    const label = S.$('.so-installed-label');
    if (label) label.hidden = !enabled;
  }
  function help() {
    S.modal('스키노트 설치', '<div class="so-install-help"><section><strong>갤럭시 · PC</strong><p>Chrome 또는 Edge 메뉴에서 앱 설치를 선택해 주세요. 설치한 스키노트 아이콘을 누르면 별도 앱 창으로 열립니다.</p></section><section><strong>아이폰 · 아이패드</strong><p>Safari에서 공유 → 홈 화면에 추가를 누르고, 표시되는 경우 웹 앱으로 열기를 켜 주세요.</p></section><p>화면 체험용 앱입니다. 입력 내용은 새로고침하거나 완전히 다시 실행하면 초기화됩니다.</p></div>');
  }
  S.action('install-app', () => available ? send({type:'skinote-install'}) : help());
  S.action('back', () => {
    if (enabled && position > 0) { send({type:'skinote-back'}); return; }
    const previous = S.state.history.pop();
    if (previous) S.go(previous.page, previous.params, true, previous.workspace);
    else S.go('home', {}, true);
  });
  S.appMode = {
    navigated(replace) {
      refreshInstall();
      if (!enabled || restoring) return;
      if (S.state.page === 'login') {
        position = 0; initialHistory = []; entries = [snapshot()];
        send({type:'skinote-history', mode:'reset', position});
        return;
      }
      if (!replace) { position += 1; entries.splice(position); }
      entries[position] = snapshot();
      send({type:'skinote-history', mode:replace ? 'replace' : 'push', position});
    }
  };
  window.addEventListener('message', event => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (data?.type === 'skinote-app-state') {
      const newlyEnabled = !enabled && data.standalone === true;
      enabled = data.standalone === true; available = data.installable === true;
      if (newlyEnabled) {
        position = 0; initialHistory = S.state.history.map(route); entries = [snapshot()];
        send({type:'skinote-history', mode:'reset', position});
      }
      refreshInstall();
    } else if (data?.type === 'skinote-install-help') {
      help();
    } else if (enabled && data?.type === 'skinote-pop' && Number.isSafeInteger(data.position) && entries[data.position]) {
      const saved = entries[data.position];
      position = data.position; restoring = true;
      try {
        S.state.history = [...initialHistory.map(route), ...entries.slice(0, position).map(route)];
        S.go(saved.page, {...saved.params}, true, saved.workspace);
      } finally { restoring = false; }
    }
  });
  send({type:'skinote-ready'});
})();
