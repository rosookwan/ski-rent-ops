(() => {
  'use strict';
  const repository = window.SkiReturnService.createMemoryRepository();
  const shopId = 'demo-shop';
  const storeService = window.SkiReturnService.createService(repository, { shopId, actor: { id: 'demo-store', role: 'store' } });
  const driverService = window.SkiReturnService.createService(repository, { shopId, actor: { id: 'demo-driver', role: 'driver', vehicleId: 'demo-van-1' } });
  const sampleOrderIds = window.SkiReturnDemo.seed(storeService, window.SkiOpsData.today);
  // UI binding is intentionally separate from the current screen-design work.
  // Both clients share one page's memory. This is not a multi-device connection.
  window.SkiOps.returns = Object.freeze({ version: '1.0.0', mode: 'memory', persistent: false, multiDevice: false,
    sampleOrderIds,
    store: window.SkiReturnClient.createLocalClient(storeService),
    driver: window.SkiReturnClient.createLocalClient(driverService),
    prepareVehicleReturn: window.SkiReturns.prepareVehicleReturn,
    newCommand: window.SkiReturnClient.newCommand
  });
})();
