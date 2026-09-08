(() => {
  const S = window.SkiOps;
  const F = window.SkiWorkflowDemo.create(S.sharedRepository, S.data.today);
  S.workflow = F;
  S.$('.so-demo-label').textContent = '체험 · 오늘 09시 기준';
  S.workflowsReady = F.seed(S.returns.initialOrders);
  const previous = S.returnUI.current;
  S.returnUI.current = id => F.projectOrder(id || S.state.params.id) || previous(id);
  S.returnUI.refresh = async () => {};
  S.returnUI.dispatchJobs = () => F.store.board({ vehicleId: F.vehicleId, date: S.data.today }).pending.map(t => ({ ...t, orderId: t.orderId || t.customerId, type: t.kind === 'collection' ? 'return' : t.kind, name: t.customer?.name || F.orders.get(t.customerId)?.customer.name || t.title, slot: '예정', statusText: t.kind === 'collection' ? '수거 대기' : t.kind === 'refund' ? '환불 대기' : '배달 대기', color: 'orange', items: F.snap().catalog.map(s => [s.label, F.assets(F.remaining(t)).filter(a => a.sku === s.id).length]).filter(r => r[1]) }));
  S.returnUI.vehicleJobs = () => S.returnUI.dispatchJobs().map(j => ({ ...j, dateOffset: 0, status: 'waiting' }));
  S.workflowCustomer = id => F.snap().reservations.find(r => r.id === id)?.customer || F.snap().forms.find(f => f.id === id)?.customer || F.orders.get(id)?.customer || { name: id, phone: '' };
})();
