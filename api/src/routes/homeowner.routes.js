import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as home from '../controllers/homeowner.controller.js';

const router = Router();
router.use(authenticate, authorize('member'));

router.get('/', asyncHandler(home.dashboard));
router.post('/', asyncHandler(home.record));
router.post('/maintenance/:id/done', asyncHandler(home.completeMaintenance));

export default router;
