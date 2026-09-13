import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as journey from '../controllers/journey.controller.js';

// Onboarding v2 + scheduled training. Member-only.
const router = Router();
router.use(authenticate, authorize('member'));

router.get('/status', asyncHandler(journey.status));
router.post('/credit-monitoring', asyncHandler(journey.enroll));
router.post('/meeting', asyncHandler(journey.startMeeting));
router.get('/meeting/:id', asyncHandler(journey.getMeeting));
router.post('/meeting/:id/complete', asyncHandler(journey.completeMeeting));

router.get('/training', asyncHandler(journey.schedule));
router.post('/training/propose', asyncHandler(journey.propose));
router.post('/training/approve', asyncHandler(journey.approve));
router.get('/training/lessons/:moduleId', asyncHandler(journey.lesson));
router.post('/training/lessons/:moduleId/check', asyncHandler(journey.check));

export default router;
