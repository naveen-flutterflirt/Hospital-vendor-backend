import { Router } from 'express';
import { PurchaseRequestsController } from '../controllers/purchaseRequests.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
const router = Router();
// 1. Top 4 dynamic KPI metrics
router.get('/kpis', optionalAuthenticate, PurchaseRequestsController.getKpis);
// 2. Lookups for departments, formulary items, purchase types
router.get('/lookups', optionalAuthenticate, PurchaseRequestsController.getLookups);
// 3. Paginated, searchable, status/dept filtered and sorted PR list
router.get('/', optionalAuthenticate, PurchaseRequestsController.getPurchaseRequests);
// 4. Single PR full detail with line items manifest
router.get('/:id', optionalAuthenticate, PurchaseRequestsController.getPrById);
// 5. Create new enterprise Purchase Request with items in transaction
router.post('/', optionalAuthenticate, PurchaseRequestsController.createPurchaseRequest);
// 6. Update PR status (Pending L1, Pending CFO, Approved, Rejected)
router.patch('/:id/status', optionalAuthenticate, PurchaseRequestsController.updatePrStatus);
router.patch('/:id/approve-l1', optionalAuthenticate, PurchaseRequestsController.approveL1);
router.patch('/:id/approve-cfo', optionalAuthenticate, PurchaseRequestsController.approveCfo);
// 7. Convert Approved PR to Purchase Order or RFQ
router.post('/:id/convert', optionalAuthenticate, PurchaseRequestsController.convertToPoOrRfq);
router.post('/:id/convert-to-po', optionalAuthenticate, PurchaseRequestsController.convertToPoDirect);
export default router;
