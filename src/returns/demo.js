(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkiReturnDemo = factory();
})(globalThis, function () {
  'use strict';
  // Explicit physical quantities; never infer these from usage days or label text.
  function seed(service, today) {
    const rental = { startDate: today, endDate: today, amountWon: 0 };
    const drafts = [
      { id: 'RETURN-DEMO-1', customer: { id: 'DEMO-C-1', name: '반납 체험 고객' }, vehicleId: 'demo-van-1', items: [
        { id: 'ski', label: '스키', category: 'equipment', unit: '세트', plannedQuantity: 2 },
        { id: 'clothes', label: '의류', category: 'clothing', unit: '벌', plannedQuantity: 2 },
        { id: 'ticket', label: '리프트권', category: 'liftTicket', unit: '매', plannedQuantity: 2 }
      ] },
      { id: 'RETURN-DEMO-2', customer: { id: 'DEMO-C-2', name: '리프트권 단독 체험 고객' }, items: [
        { id: 'ticket', label: '리프트권', category: 'liftTicket', unit: '매', plannedQuantity: 4 }
      ] }
    ];
    for (const draft of drafts) {
      const { id, ...payload } = draft;
      try { service.get(id); continue; } catch (error) { if (error.code !== 'NOT_FOUND') throw error; }
      service.execute({ type: 'create', orderId: id, requestId: id + '-create', expectedVersion: 0, payload: { ...payload, rental } });
      service.execute({ type: 'issue', orderId: id, requestId: id + '-issue', expectedVersion: 1, payload: { items: draft.items.map(item => ({ itemId: item.id, quantity: item.plannedQuantity })) } });
    }
    return drafts.map(draft => draft.id);
  }
  return { seed };
});
