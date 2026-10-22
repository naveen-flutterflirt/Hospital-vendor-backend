import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller.js';
const router = Router();
// GET /api/v1/dashboard/overview
router.get('/overview', DashboardController.getOverview);
// POST /api/v1/dashboard/auto-create-reorder-pr
router.post('/auto-create-reorder-pr', DashboardController.autoCreateReorderPr);
export default router;
