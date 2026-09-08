(() => {
  'use strict';
  const repository = window.SkiReturnService.createMemoryRepository();
  window.SkiOps.sharedRepository = repository;
  const shopId = 'demo-shop';
  const storeService = window.SkiReturnService.createService(repository, { shopId, actor: { id: 'demo-store', role: 'store' } });
  const driverService = window.SkiReturnService.createService(repository, { shopId, actor: { id: 'demo-driver', role: 'driver', vehicleId: 'demo-van-1' } });
  const sampleOrderIds = window.SkiReturnDemo.seed(storeService, window.SkiOpsData.today);
  const operationIds = window.SkiReturnDemo.seedOperations(storeService, driverService, window.SkiOpsData.orders);
  const notificationStore = window.SkiNotificationService.createService(repository, { shopId, actor: { id: 'demo-store', role: 'store' } });
  const notificationDriver = window.SkiNotificationService.createService(repository, { shopId, actor: { id: 'demo-driver', role: 'driver', vehicleId: 'demo-van-1' } });
  repository.transactNotifications(shopId, state => {
    state.records = state.records.filter(row => operationIds.includes(row.orderId) && row.type === 'collection');
  });
  const priorityOrder = repository.get(shopId, 'R-021');
  if (priorityOrder) notificationStore.execute({ type: 'request', requestId: 'demo-priority-021', payload: { orderId: 'R-021', expectedVersion: priorityOrder.version, message: '만선 티롤 앞 고객님을 먼저 확인해 주세요.' } });
  window.SkiOps.notificationRuntime = {
    store: notificationStore, driver: notificationDriver,
    orders: role => (role === 'driver' ? driverService : storeService).sync(0).orders,
    client: role => window.SkiNotificationClient.createLocalClient(role === 'driver' ? notificationDriver : notificationStore),
    subscribe: listener => repository.subscribe(listener),
    mode: 'memory'
  };
  // Public Pages keeps all demonstration changes inside this one page.
  // All clients share one page's memory. This is not a multi-device connection.
  window.SkiOps.returns = Object.freeze({ version: '1.0.0', mode: 'memory', persistent: false, multiDevice: false,
    sampleOrderIds, operationIds, initialOrders: storeService.sync(0).orders.filter(order => operationIds.includes(order.id)),
    store: window.SkiReturnClient.createLocalClient(storeService),
    driver: window.SkiReturnClient.createLocalClient(driverService),
    prepareVehicleReturn: window.SkiReturns.prepareVehicleReturn,
    newCommand: window.SkiReturnClient.newCommand
  });
})();
