import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { STAFF_ROLES } from '../auth/rbac.js';
import * as op from '../controllers/operator.controller.js';

const router = Router();
router.use(authenticate);

// Roster + client detail: any staff (specialists limited to their own clients in the service).
router.get('/roster', authorize(...STAFF_ROLES), asyncHandler(op.roster));
router.get('/members/:memberId', authorize(...STAFF_ROLES), asyncHandler(op.clientDetail));
router.get('/inventory', authorize(...STAFF_ROLES), asyncHandler(op.inventory));

// Manager/admin: team capacity, ratings, inventory retire.
router.get('/capacity', authorize('manager', 'admin'), asyncHandler(op.capacity));
router.get('/ratings', authorize('manager', 'admin'), asyncHandler(op.ratings));
router.post('/inventory/:id/retire', authorize('manager', 'admin'), asyncHandler(op.retire));

// HQ admin only: user/role administration + program config.
router.get('/users', authorize('admin'), asyncHandler(op.users));
router.patch('/users/:id', authorize('admin'), asyncHandler(op.patchUser));
router.get('/programs', authorize('admin'), asyncHandler(op.programs));
router.put('/programs', authorize('admin'), asyncHandler(op.upsertProgram));

export default router;
