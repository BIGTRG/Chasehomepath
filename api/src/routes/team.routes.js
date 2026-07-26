import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { STAFF_ROLES } from '../auth/rbac.js';
import * as team from '../controllers/team.controller.js';

const router = Router();
router.use(authenticate);

// Member-facing (own team + comms).
router.get('/', authorize('member'), asyncHandler(team.myTeam));
router.post('/ratings', authorize('member'), asyncHandler(team.rate));

// Thread messaging — any participant with access (member OR assigned team OR operator).
// The service enforces access per-thread.
router.get('/threads/:threadId/messages', asyncHandler(team.getThreadMessages));
router.post('/threads/:threadId/messages', asyncHandler(team.postThreadMessage));

// Operator-facing (staff/manager/admin).
router.post('/members/:memberId/assign', authorize(...STAFF_ROLES), asyncHandler(team.assign));
router.delete('/assignments/:id', authorize(...STAFF_ROLES), asyncHandler(team.unassign));
router.post('/members/:memberId/appointments', authorize(...STAFF_ROLES), asyncHandler(team.createAppt));
router.patch('/appointments/:id', authorize(...STAFF_ROLES), asyncHandler(team.updateAppt));

export default router;
