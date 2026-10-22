import { Router } from 'express';
import { TransfersController } from '../controllers/transfers.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';

const router = Router();

// Top 4 KPI metrics: Pending Fulfillment, Issued Today, Store Transfers, Ward Returns
router.get('/kpis', optionalAuthenticate, TransfersController.getKpis);

// Paginated, searchable, and filtered stock transfer & issue records
router.get('/', optionalAuthenticate, TransfersController.getTransfers);

// Lookups for stores, wards, patients, and formulary items
router.get('/lookups', optionalAuthenticate, TransfersController.getLookups);

// Single transfer detail with line items
router.get('/:id', optionalAuthenticate, TransfersController.getTransferById);

// Initiate stock transfer between stores
router.post('/', optionalAuthenticate, TransfersController.createTransfer);
router.post('/transfer', optionalAuthenticate, TransfersController.createTransfer);

// Issue items to ward or patient with stock deduction
router.post('/issue', optionalAuthenticate, TransfersController.createIssue);

// Update transfer status
router.patch('/:id/status', optionalAuthenticate, TransfersController.updateStatus);

export default router;
