import { Router } from 'express';
import { InvoicesController } from '../controllers/invoices.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
const router = Router();
// Top 4 KPI metrics
router.get('/kpis', optionalAuthenticate, InvoicesController.getKpis);
// Paginated, searchable, filterable invoices table
router.get('/', optionalAuthenticate, InvoicesController.getInvoices);
// Lookups for LogInvoiceModal (vendors and POs)
router.get('/lookups', optionalAuthenticate, InvoicesController.getLookups);
// Pending invoices autocomplete for SettlePaymentModal
router.get('/pending-settlement', optionalAuthenticate, InvoicesController.getPendingSettlement);
// Log new invoice
router.post('/', optionalAuthenticate, InvoicesController.logInvoice);
// Settle payment with UTR or Cheque
router.post('/settle', optionalAuthenticate, InvoicesController.settlePayment);
router.post('/settle-batch', optionalAuthenticate, InvoicesController.settlePayment);
export default router;
