import { Router } from 'express';
import { VendorsController } from '../controllers/vendors.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
const router = Router();
// Top 4 KPI metrics: Active Vendors, Pending Onboarding, Top Performers, Suspended
router.get('/kpis', optionalAuthenticate, VendorsController.getKpis);
// Paginated, searchable, and filtered vendors formulary
router.get('/', optionalAuthenticate, VendorsController.getVendors);
// Single vendor details with PO history
router.get('/:id', optionalAuthenticate, VendorsController.getVendorById);
// Onboard new vendor into verification queue
router.post('/', optionalAuthenticate, VendorsController.createVendor);
// Update vendor status (Active, Onboarding, Suspended)
router.patch('/:id/status', optionalAuthenticate, VendorsController.updateStatus);
export default router;
