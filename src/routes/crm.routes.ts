import { Router } from 'express';
import { CrmController } from '../controllers/crm.controller.js';

const router = Router();

// Master Data & Operation Routes
router.get('/vendors', CrmController.getVendors);
router.post('/vendors', CrmController.createVendor);
router.get('/items', CrmController.getItems);
router.get('/purchase-orders', CrmController.getPurchaseOrders);
router.get('/indents', CrmController.getIndents);
router.get('/purchase-requests', CrmController.getPurchaseRequests);
router.get('/grn', CrmController.getGRNs);
router.get('/transfers', CrmController.getStockTransfers);
router.get('/invoices', CrmController.getInvoices);
router.get('/assets', CrmController.getAssets);
router.get('/reports', CrmController.getReports);
router.get('/stores', CrmController.getStores);
router.post('/barcode/lookup', CrmController.lookupBarcode);

export default router;
