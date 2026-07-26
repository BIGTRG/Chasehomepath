import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as agent from '../controllers/agent.controller.js';

const router = Router();
router.use(authenticate, authorize('member'));

router.get('/', asyncHandler(agent.assistance));

export default router;
