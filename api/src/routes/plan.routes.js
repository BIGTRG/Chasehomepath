import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { STAFF_ROLES } from '../auth/rbac.js';
import * as plan from '../controllers/plan.controller.js';

const router = Router();

router.use(authenticate);

// Member's own plan home.
router.get('/', authorize('member'), asyncHandler(plan.getMyPlan));
router.patch('/milestones/:id', authorize('member'), asyncHandler(plan.patchMilestone));

// Operator-facing plan management (staff/manager/admin). 90-day rule enforced server-side.
router.patch('/:memberId/tracks/:trackType', authorize(...STAFF_ROLES), asyncHandler(plan.patchTrack));
router.post('/:memberId/placement-ready', authorize(...STAFF_ROLES), asyncHandler(plan.postPlacementReady));

export default router;
