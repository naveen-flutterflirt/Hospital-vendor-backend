import { Router } from 'express';
import { ItemsController } from '../controllers/items.controller.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
const router = Router();
// 1. Lookups for categories, forms, uoms, and item search list
router.get('/lookups', optionalAuthenticate, ItemsController.getLookups);
// 2. Paginated, searchable, categorized hospital formulary items
router.get('/', optionalAuthenticate, ItemsController.getItems);
// 3. Single item profile with KPIs, FEFO batches, 12-week consumption, vendors, movement log
router.get('/:id', optionalAuthenticate, ItemsController.getItemById);
// 4. Create new item in master formulary
router.post('/', optionalAuthenticate, ItemsController.createItem);
// 5. Stock adjustment (damage, physical verification discrepancy, write-off)
router.post('/:id/adjust', optionalAuthenticate, ItemsController.adjustStock);
export default router;
