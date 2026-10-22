import { Router } from 'express';
import { PurchaseOrdersController } from '../controllers/purchaseOrders.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
const router = Router();
// 1. Top 4 KPI metrics: Open POs, Overdue Delivery, Received Today, Awaiting Approval
router.get('/kpis', optionalAuthenticate, PurchaseOrdersController.getKpis);
// 2. Lookups for vendors, formulary items, and PO types
router.get('/lookups', optionalAuthenticate, PurchaseOrdersController.getLookups);
// 3. Paginated, searchable, status/type filtered and sorted PO list
router.get('/', optionalAuthenticate, PurchaseOrdersController.getPurchaseOrders);
// 4. Single PO full detail with line items manifest
router.get('/:id', optionalAuthenticate, PurchaseOrdersController.getPoById);
// 5. Create new enterprise Purchase Order with items
router.post('/', optionalAuthenticate, PurchaseOrdersController.createPurchaseOrder);
// 6. Update PO status (Approve, Dispatch, Deliver, Cancel)
router.patch('/:id/status', optionalAuthenticate, PurchaseOrdersController.updatePoStatus);
export default router;
