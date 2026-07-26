import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as money from '../controllers/money.controller.js';

const router = Router();
router.use(authenticate, authorize('member'));

router.get('/', asyncHandler(money.overview));
router.post('/link-token', asyncHandler(money.linkToken));
router.post('/link', asyncHandler(money.link));
router.post('/sync', asyncHandler(money.sync));
router.put('/budgets', asyncHandler(money.setBudget));
router.put('/savings', asyncHandler(money.saveGoal));

export default router;
