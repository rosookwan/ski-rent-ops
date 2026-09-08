async function chooseTime(frame, selector, value) {
  await frame.locator(selector).locator('..').locator('[data-time-open]').click();
  const picker = frame.locator('.so-time-picker');
  if (value === '') await picker.locator('[data-time-clear]').click();
  else {
    const [hour, minute] = value.split(':').map(Number);
    await picker.locator('[data-time-hour="' + hour + '"]').click();
    await picker.locator('[data-time-minute="' + Math.floor(minute / 5) * 5 + '"]').click();
    for (let index = 0; index < minute % 5; index++) await picker.locator('[data-time-step="1"]').click();
  }
  await picker.locator('[data-time-apply]').click();
}
module.exports = {chooseTime};
