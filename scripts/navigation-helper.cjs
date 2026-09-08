// Follow the same POS/management switch that staff use, including shared routes.
module.exports.storeNavigation = frame => async route => {
  if (route === 'returns') route = 'rentals';
  const button = frame.locator('#so-navigation [data-go="' + route + '"]');
  if (!await button.count()) await frame.locator('#so-workspace-switch').click();
  await button.click();
};
