(() => {
  'use strict';
  const S = window.SkiOps, root = S.root, e = S.esc;
  const selector = 'input[type="number"],input[inputmode="numeric"],input[inputmode="decimal"]';
  const controls = new WeakMap();
  let active = null, queued = false;
  const eligible = input => input.matches(selector) && !['hidden', 'tel', 'password', 'date', 'time'].includes(input.type) && !input.closest('.pos-keypad');
  const labelOf = input => input.getAttribute('aria-label') || input.labels?.[0]?.textContent.replace(/숫자판/g, '').trim() || input.placeholder || '숫자';
  function customerSummary() {
    const draft = S.state.page === 'order-intake' ? S.posOrders?.state.draft : null;
    const order = S.posData?.order(draft?.orderId || S.state.params.id);
    if (order) return order.customer.name + ' · 접수 ' + (order.receiptNo || order.id);
    if (draft) return (root.querySelector('[data-pos-input="name"]')?.value || draft.customer.name || '새 팀') + ' · 새 접수 초안';
    return root.querySelector('#so-dialog[open] .pos-confirm-summary strong')?.textContent || root.querySelector('.pos-page-heading h1')?.textContent || '현재 업무';
  }
  function close(restore = true) {
    if (!active) return;
    const { dialog, trigger } = active;
    active = null;
    trigger.setAttribute('aria-expanded', 'false');
    dialog.close(); dialog.remove();
    if (restore && trigger.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true });
  }
  function refresh() {
    active.dialog.querySelector('[data-keypad-new]').textContent = active.value || '미입력';
    active.dialog.querySelector('[data-keypad-new]').style.fontSize = active.value.length > 16 ? '16px' : '';
    active.dialog.querySelector('[data-keypad-hint]').textContent = active.replace ? '숫자를 누르면 새 값으로 바뀝니다.' : '적용하면 이 입력칸에만 반영됩니다.';
    active.dialog.querySelector('[data-keypad-error]').textContent = '';
  }
  function edit(key) {
    if (!active) return;
    let value = active.value;
    if (key === 'clear') value = '';
    else if (key === 'back') value = value.slice(0, -1);
    else if (key === 'sign') { if (!active.signed) return; value = value.startsWith('-') ? value.slice(1) : '-' + value; }
    else if (key === '.') { if (!active.decimal) return; if (active.replace) value = ''; if (!value.includes('.')) value = (value || '0') + '.'; }
    else if (/^\d+$/.test(key)) { value = (active.replace ? '' : value) + key; value = value.replace(/^(-?)0+(?=\d)/, '$1'); }
    else return;
    if (value.length > 24) return;
    active.value = value; active.replace = false; refresh();
  }
  function validation(input, value) {
    if (value === '') return input.required ? '값을 입력해 주세요.' : '';
    if (!/^-?\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) return '완성된 숫자를 입력해 주세요.';
    // Use the original field's native constraints without touching its value or listeners.
    const probe = input.cloneNode(false); probe.type = 'number'; probe.value = value;
    if (probe.validity.rangeUnderflow) return input.min + ' 이상 입력해 주세요.';
    if (probe.validity.rangeOverflow) return input.max + ' 이하 입력해 주세요.';
    if (probe.validity.stepMismatch) return input.step && input.step !== '1' ? input.step + ' 단위로 입력해 주세요.' : '정수로 입력해 주세요.';
    if (Number.isInteger(Number(value)) && !Number.isSafeInteger(Number(value))) return '숫자가 너무 큽니다. 입력값을 확인해 주세요.';
    if (!probe.checkValidity()) return '입력 가능한 값을 확인해 주세요.';
    return '';
  }
  function apply() {
    if (!active) return;
    const { input, value } = active;
    if (!input.isConnected || input.disabled || input.readOnly || (active.parentDialog && !active.parentDialog.open)) { close(false); return; }
    const error = validation(input, value);
    if (error) { active.dialog.querySelector('[data-keypad-error]').textContent = error; return; }
    const changed = input.value !== value;
    close();
    if (changed) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function open(input, trigger) {
    if (root.dataset.pos !== 'true' || input.disabled || input.readOnly || !input.isConnected) return;
    close();
    const decimal = input.step === 'any' || (input.step && Number(input.step) % 1 !== 0) || Number(input.min || 0) % 1 !== 0;
    const signed = input.min === '' || Number(input.min) < 0;
    const dialog = document.createElement('dialog');
    dialog.className = 'pos-keypad'; dialog.id = 'pos-keypad';
    dialog.setAttribute('aria-labelledby', 'pos-keypad-title'); dialog.setAttribute('aria-describedby', 'pos-keypad-customer');
    const button = (key, text, attrs = '') => '<button type="button" data-keypad-key="' + e(key) + '" ' + attrs + '>' + e(text) + '</button>';
    dialog.innerHTML = '<header><p id="pos-keypad-customer">' + e(customerSummary()) + '</p><h2 id="pos-keypad-title">' + e(labelOf(input)) + ' · 숫자판</h2></header>'
      + '<div class="pos-keypad-values"><div><span>기존 값</span><output data-keypad-old>' + e(input.value || '미입력') + '</output></div><div><span>새 값</span><output data-keypad-new aria-live="polite"></output></div></div>'
      + '<div class="pos-keypad-board"><div class="pos-keypad-grid">'
      + ['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0'].map(key => button(key, key)).join('') + button('back', '한 칸 지움', 'aria-label="마지막 숫자 지우기"') + '</div>'
      + '<div class="pos-keypad-tools">' + button('clear', '전체 지움') + (signed ? button('sign', '+ / −', 'aria-label="양수 음수 전환"') : '') + (decimal ? button('.', '.', 'aria-label="소수점"') : '') + '</div></div>'
      + '<div class="pos-keypad-feedback"><p class="pos-keypad-hint" data-keypad-hint></p><p class="pos-keypad-error" data-keypad-error role="alert"></p></div><footer><button type="button" data-keypad-cancel>취소</button><button type="button" class="pos-keypad-apply" data-keypad-apply>입력칸에 적용</button></footer>';
    root.append(dialog);
    active = { dialog, input, trigger, parentDialog: input.closest('dialog'), value: input.value, replace: true, signed, decimal };
    trigger.setAttribute('aria-expanded', 'true'); refresh();
    dialog.addEventListener('click', event => {
      event.stopPropagation();
      const button = event.target.closest('button'); if (!button) return;
      if (button.hasAttribute('data-keypad-cancel')) close();
      else if (button.hasAttribute('data-keypad-apply')) apply();
      else edit(button.dataset.keypadKey);
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Enter') { event.preventDefault(); apply(); }
      else if (/^\d$/.test(event.key) || ['Backspace', 'Delete', '.', '-', '+'].includes(event.key)) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault(); edit(({ Backspace: 'back', Delete: 'clear', '-': 'sign', '+': 'sign' })[event.key] || event.key);
      } else if (event.key === 'Tab') {
        const buttons = [...dialog.querySelectorAll('button')], first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    dialog.showModal(); dialog.querySelector('[data-keypad-key="7"]').focus({ preventScroll: true });
  }
  function scan() {
    queued = false;
    if (active && (!active.input.isConnected || root.dataset.pos !== 'true' || (active.parentDialog && !active.parentDialog.open))) close(false);
    if (root.dataset.pos !== 'true') return;
    root.querySelectorAll(selector).forEach(input => {
      if (!eligible(input)) return;
      let control = controls.get(input);
      if (!control) {
        const label = labelOf(input);
        // Keep the field's accessible name stable when its label gains a second control.
        if (!input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby')) input.setAttribute('aria-label', label);
        const wrapper = document.createElement('span'), trigger = document.createElement('button');
        wrapper.className = 'pos-keypad-control'; trigger.type = 'button'; trigger.className = 'pos-keypad-trigger';
        trigger.textContent = '숫자판'; trigger.setAttribute('aria-label', label + ' 숫자판'); trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
        trigger.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open(input, trigger); });
        // Move, never clone, the original input so its identity and draft handlers survive.
        input.before(wrapper); wrapper.append(input, trigger); control = { wrapper, trigger }; controls.set(input, control);
      }
      const disabled = input.disabled || input.readOnly;
      if (control.trigger.disabled !== disabled) control.trigger.disabled = disabled;
    });
  }
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(scan); } };
  // Ignore our own button/dialog changes; wrapping triggers at most one harmless rescan.
  new MutationObserver(records => {
    if (records.some(record => record.target === root || (!record.target.closest?.('.pos-keypad,.pos-keypad-control') && record.type === 'childList') || (record.type === 'attributes' && record.target.matches?.('input,dialog')) || (active && [...record.removedNodes].includes(active.input)))) schedule();
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pos', 'disabled', 'readonly', 'type', 'inputmode', 'open'] });
  root.addEventListener('ski:close-dialogs', () => close(false));
  S.posKeypad = { close, scan };
  schedule();
})();
