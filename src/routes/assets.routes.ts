import { Router } from 'express';
import { AssetsController } from '../controllers/assets.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// KPI metrics endpoint
router.get('/kpis', authenticate, AssetsController.getKpis);

// Paginated & searchable assets table
router.get('/', authenticate, AssetsController.getAssets);

// Modal autocomplete suggestions
router.get('/search-suggestions', authenticate, AssetsController.searchSuggestions);

// Asset registration
router.post('/', authenticate, AssetsController.registerAsset);

// Maintenance logger
router.post('/maintenance', authenticate, AssetsController.logMaintenance);

export default router;
