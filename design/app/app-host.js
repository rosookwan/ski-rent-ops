// This code runs in the same-origin top-level document, outside the demo sandbox.
(() => {
  'use strict';
  const frame = document.querySelector('iframe');
  const mode = matchMedia('(display-mode: standalone)');
  let promptEvent = null, position = 0, session = '';
  const standalone = () => mode.matches || navigator.standalone === true;
  const send = data => frame.contentWindow.postMessage(data, '*');
  const publish = () => send({type:'skinote-app-state', standalone:standalone(), installable:!!promptEvent});
  frame.addEventListener('load', publish);
  mode.addEventListener('change', publish);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event; publish();
  });
  window.addEventListener('appinstalled', () => { promptEvent = null; publish(); });
  window.addEventListener('message', async event => {
    if (event.source !== frame.contentWindow) return;
    const data = event.data;
    if (data?.type === 'skinote-ready') { publish(); return; }
    if (data?.type === 'skinote-install') {
      if (!promptEvent) { send({type:'skinote-install-help'}); return; }
      const pending = promptEvent; promptEvent = null; publish();
      try { await pending.prompt(); await pending.userChoice; }
      catch { send({type:'skinote-install-help'}); }
      return;
    }
    if (!standalone()) return;
    if (data?.type === 'skinote-back' && position > 0) { history.back(); return; }
    if (data?.type !== 'skinote-history' || !Number.isSafeInteger(data.position) || data.position < 0) return;
    if (data.mode === 'reset') session = crypto.randomUUID();
    if (!session || !['reset','replace','push'].includes(data.mode)) return;
    position = data.position;
    // Keep customer names, IDs and rental details out of URLs and browser history.
    const state = {skinoteSession:session, position};
    if (data.mode === 'push') history.pushState(state, '', location.href);
    else history.replaceState(state, '', location.href);
  });
  window.addEventListener('popstate', event => {
    if (!standalone() || !session || event.state?.skinoteSession !== session || !Number.isSafeInteger(event.state.position)) return;
    position = event.state.position;
    send({type:'skinote-pop', position});
  });
})();
