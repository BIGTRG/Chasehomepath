import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as education from '../controllers/education.controller.js';

const router = Router();
router.use(authenticate, authorize('member'));

router.get('/', asyncHandler(education.myLearn));
router.post('/:moduleId/done', asyncHandler(education.complete));

export default router;
