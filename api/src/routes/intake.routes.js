import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as intake from '../controllers/intake.controller.js';

// The intake funnel (walkthrough 2-5): qualify → credit authorization → schedule → prep.
// Member-only — this is the self-service front desk.
const router = Router();

router.use(authenticate, authorize('member'));

router.get('/', asyncHandler(intake.getMine));
router.post('/', asyncHandler(intake.save));
router.get('/checklist', asyncHandler(intake.checklist));
router.post('/documents', asyncHandler(intake.uploadDocument));
router.get('/slots', asyncHandler(intake.slots));
router.post('/appointments', asyncHandler(intake.book));

export default router;
