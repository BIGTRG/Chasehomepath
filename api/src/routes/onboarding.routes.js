import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as onboarding from '../controllers/onboarding.controller.js';

const router = Router();
// Onboarding is administered by managers/admins.
router.use(authenticate, authorize('manager', 'admin'));

router.get('/queue', asyncHandler(onboarding.queue));
router.post('/cases', asyncHandler(onboarding.start));
router.get('/cases/:caseId', asyncHandler(onboarding.getCase));
router.post('/steps/:stepId/advance', asyncHandler(onboarding.advance));

export default router;
