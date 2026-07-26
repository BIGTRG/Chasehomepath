import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as credit from '../controllers/credit.controller.js';

const router = Router();

// All credit work is the member's own (self-directed, spec §8).
router.use(authenticate, authorize('member'));

router.post('/pull', asyncHandler(credit.pull));
router.get('/', asyncHandler(credit.overview));
router.get('/disputes', asyncHandler(credit.listDisputes));
router.get('/items/:id', asyncHandler(credit.itemDetail));
router.post('/items/:id/dispute', asyncHandler(credit.fileDispute));
router.post('/disputes/:id/withdraw', asyncHandler(credit.withdrawDispute));

export default router;
