import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as partner from '../controllers/partner.controller.js';

const router = Router();
router.use(authenticate);

// Partner-facing.
router.get('/profile', authorize('partner'), asyncHandler(partner.profile));
router.get('/clients', authorize('partner'), asyncHandler(partner.clients));
router.get('/listings', authorize('partner'), asyncHandler(partner.myListings));
router.post('/listings', authorize('partner'), asyncHandler(partner.publish));
router.post('/certification', authorize('partner'), asyncHandler(partner.submitCertification));

// Operator action: certify a partner (license verification runs here).
router.post('/:userId/certify', authorize('manager', 'admin'), asyncHandler(partner.certify));

export default router;
