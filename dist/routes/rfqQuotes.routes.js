import { Router } from 'express';
import { RfqQuotesController } from '../controllers/rfqQuotes.controller.js';
const router = Router();
// Retrieve configuration (approval matrices, purchase types)
router.get('/config', RfqQuotesController.getConfig);
// Retrieve all RFQs for selector
router.get('/', RfqQuotesController.getRfqs);
// Retrieve full comparison matrix for a specific RFQ
router.get('/:id', RfqQuotesController.getRfqComparison);
// Negotiate counter rates with a vendor
router.post('/:id/negotiate', RfqQuotesController.negotiateQuote);
// Award contract and generate Purchase Order
router.post('/:id/award', RfqQuotesController.awardAndCreatePo);
export default router;
