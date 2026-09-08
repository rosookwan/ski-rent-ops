(() => {
  const valid = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const pad = value => String(value).padStart(2, '0');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const spoken = value => {
    if (!valid(value)) return '시간 선택';
    const [hour, minute] = value.split(':').map(Number);
    return (hour < 12 ? '오전 ' : '오후 ') + (hour % 12 || 12) + '시 ' + minute + '분';
  };
  const clock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const face = value => '<span class="so-time-value">' + (valid(value) ? '<b>' + value + '</b><small>' + spoken(value) + '</small>' : '<span>시간 선택</span>') + '</span>' + clock;
  let active = null;

  function control(value, attributes = '', label = '시간', describedBy = '') {
    return '<span class="so-time-control"><input type="hidden" value="' + esc(value) + '" ' + attributes + '><button type="button" class="so-time-trigger" data-time-open data-time-label="' + esc(label) + '" aria-label="' + esc(label + ', ' + spoken(value)) + '" aria-haspopup="dialog" aria-expanded="false"' + (describedBy ? ' aria-describedby="' + esc(describedBy) + '"' : '') + '>' + face(value) + '</button></span>';
  }
  function close() {
    if (!active) return;
    const {dialog, trigger} = active;
    active = null;
    dialog.close();
    dialog.remove();
    trigger.setAttribute('aria-expanded', 'false');
    if (trigger.isConnected) trigger.focus({preventScroll: true});
  }
  function refresh() {
    const {dialog, hour, minute, selected} = active;
    const value = pad(hour) + ':' + pad(minute);
    dialog.querySelector('[data-time-preview]').textContent = selected ? value : '시간 미정';
    dialog.querySelector('[data-time-spoken]').textContent = selected ? spoken(value) : '시와 분을 선택해 주세요';
    dialog.querySelector('[data-time-fine]').textContent = pad(minute) + '분';
    for (const [part, current] of [['hour', hour], ['minute', minute]]) {
      const buttons = [...dialog.querySelectorAll('[data-time-' + part + ']')];
      const tabValue = part === 'minute' ? Math.floor(current / 5) * 5 : current;
      buttons.forEach(button => {
        const number = Number(button.dataset[part === 'hour' ? 'timeHour' : 'timeMinute']);
        button.setAttribute('aria-pressed', String(selected && number === current));
        button.tabIndex = number === tabValue ? 0 : -1;
      });
    }
    dialog.querySelector('[data-time-step="-1"]').disabled = minute === 0;
    dialog.querySelector('[data-time-step="1"]').disabled = minute === 59;
  }
  function apply() {
    const {input, trigger, hour, minute, selected} = active;
    const value = selected ? pad(hour) + ':' + pad(minute) : '';
    close();
    if (!input.isConnected) return;
    const changed = input.value !== value;
    input.value = value;
    trigger.innerHTML = face(value);
    trigger.setAttribute('aria-label', trigger.dataset.timeLabel + ', ' + spoken(value));
    if (changed) {
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new Event('change', {bubbles: true}));
    }
  }
  function open(trigger) {
    close();
    const input = trigger.parentElement.querySelector('input');
    const [hour, minute] = (valid(input.value) ? input.value : '09:00').split(':').map(Number);
    const dialog = document.createElement('dialog');
    dialog.className = 'so-time-picker';
    dialog.setAttribute('aria-labelledby', 'so-time-title');
    const choices = (part, values) => values.map(value => '<button type="button" data-time-' + part + '="' + value + '" aria-label="' + value + (part === 'hour' ? '시' : '분') + '" aria-pressed="false">' + pad(value) + '</button>').join('');
    dialog.innerHTML = '<div class="so-time-heading"><h2 id="so-time-title">' + esc(trigger.dataset.timeLabel) + ' 선택</h2><button type="button" data-time-cancel aria-label="시간 선택 닫기">×</button></div>' +
      '<div class="so-time-body"><div class="so-time-preview" role="status" aria-live="polite" aria-atomic="true"><strong data-time-preview></strong><span data-time-spoken></span></div>' +
      '<div class="so-time-columns"><section aria-labelledby="so-time-hour-label"><h3 id="so-time-hour-label">시 <small>24시간 기준</small></h3><div class="so-time-hours" role="group" aria-label="시 선택">' + choices('hour', Array.from({length: 24}, (_, index) => index)) + '</div></section>' +
      '<section aria-labelledby="so-time-minute-label"><h3 id="so-time-minute-label">분 <small>5분 간격</small></h3><div class="so-time-minutes" role="group" aria-label="분 선택">' + choices('minute', Array.from({length: 12}, (_, index) => index * 5)) + '</div>' +
      '<div class="so-time-adjust"><button type="button" data-time-step="-1" aria-label="1분 줄이기">−1분</button><output data-time-fine aria-label="선택한 분"></output><button type="button" data-time-step="1" aria-label="1분 늘리기">+1분</button></div></section></div></div>' +
      '<div class="so-time-footer"><button type="button" class="so-time-clear" data-time-clear>시간 지우기</button><button type="button" data-time-cancel>취소</button><button type="button" class="so-time-apply" data-time-apply>시간 적용</button></div>';
    (document.getElementById('ski-ops') || document.body).append(dialog);
    active = {dialog, trigger, input, hour, minute, selected: valid(input.value)};
    refresh();
    trigger.setAttribute('aria-expanded', 'true');
    dialog.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-time-cancel')) { close(); return; }
      if (button.hasAttribute('data-time-apply')) { apply(); return; }
      if (button.hasAttribute('data-time-clear')) active.selected = false;
      else {
        if (button.hasAttribute('data-time-hour')) active.hour = Number(button.dataset.timeHour);
        if (button.hasAttribute('data-time-minute')) active.minute = Number(button.dataset.timeMinute);
        if (button.hasAttribute('data-time-step')) active.minute = Math.max(0, Math.min(59, active.minute + Number(button.dataset.timeStep)));
        active.selected = true;
      }
      refresh();
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
      // The time dialog owns focus even when another settings dialog is underneath.
      event.stopPropagation();
      if (event.key === 'Tab') {
        const stops = [...dialog.querySelectorAll('button:not(:disabled)')].filter(button => button.tabIndex >= 0);
        const first = stops[0], last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      const button = event.target.closest('[data-time-hour],[data-time-minute]');
      if (!button || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...button.parentElement.children], index = buttons.indexOf(button);
      const columns = getComputedStyle(button.parentElement).gridTemplateColumns.split(' ').length;
      const delta = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns}[event.key];
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + delta));
      buttons[next].click();
      buttons[next].focus();
    });
    dialog.showModal();
    dialog.querySelector('[data-time-hour="' + hour + '"]').focus({preventScroll: true});
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-time-open]');
    if (trigger && !trigger.disabled) open(trigger);
  });
  window.SkiTimePicker = {control, close};
})();
