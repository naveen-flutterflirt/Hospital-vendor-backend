import { Router } from 'express';
import { ReportsController } from '../controllers/reports.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
const router = Router();
// Public/semi-open download endpoint for direct browser streaming
router.get('/download/:code', ReportsController.downloadReport);
// Protected endpoints
router.get('/kpis', authenticate, ReportsController.getKpis);
router.get('/trends', authenticate, ReportsController.getTrends);
router.get('/generated', authenticate, ReportsController.getGeneratedReports);
router.post('/generate', authenticate, ReportsController.generateCustomReport);
router.post('/schedule', authenticate, ReportsController.scheduleReport);
router.get('/schedules', authenticate, ReportsController.getSchedules);
export default router;
