import { Router } from 'express';
import { IndentsController } from '../controllers/indents.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';

const router = Router();

// 1. Top dynamic KPI metrics
router.get('/kpis', optionalAuthenticate, IndentsController.getKpis);

// 2. Master data lookups (departments, stores, formulary items)
router.get('/lookups', optionalAuthenticate, IndentsController.getLookups);

// 3. Paginated, searchable, filtered indents list
router.get('/', optionalAuthenticate, IndentsController.getIndents);

// 4. Single indent detail with line items manifest
router.get('/:id', optionalAuthenticate, IndentsController.getIndentById);

// 5. Create new ward indent with line items
router.post('/', optionalAuthenticate, IndentsController.createIndent);

// 6. Update status (Processing, Partially Issued, Completed, Cancelled)
router.patch('/:id/status', optionalAuthenticate, IndentsController.updateIndentStatus);
router.patch('/:id/fulfill', optionalAuthenticate, IndentsController.fulfillIndent);

// 7. Escalate out-of-stock indent to Purchase Request (PR)
router.post('/:id/escalate', optionalAuthenticate, IndentsController.escalateToPr);

export default router;
