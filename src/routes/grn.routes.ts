import { Router } from 'express';
import { GrnController } from '../controllers/grn.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';

const router = Router();

// Top 4 KPI metrics: Expected Today, Pending QC, QC Passed, Returns/Rejects
router.get('/kpis', optionalAuthenticate, GrnController.getKpis);

// Lookups for vendors, POs, and items
router.get('/lookups', optionalAuthenticate, GrnController.getLookups);

// Paginated, searchable, status-filtered GRN list
router.get('/', optionalAuthenticate, GrnController.getGRNs);

// Single GRN detail with items manifest
router.get('/:id', optionalAuthenticate, GrnController.getGrnById);

// Barcode scanner check-in
router.post('/scan', optionalAuthenticate, GrnController.scanDelivery);

// Create manual GRN
router.post('/', optionalAuthenticate, GrnController.createGrn);

// Process QC inspection approval/rejection with stock updates
router.patch('/:id/qc', optionalAuthenticate, GrnController.processQc);
router.patch('/:id/inspect', optionalAuthenticate, GrnController.processQc);

export default router;
