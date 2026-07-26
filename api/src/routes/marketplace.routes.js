import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import * as market from '../controllers/marketplace.controller.js';

const router = Router();
// Any authenticated user can browse inventory; members additionally get enrichment.
router.use(authenticate);

router.get('/listings', asyncHandler(market.listings));
router.get('/listings/:id', asyncHandler(market.listing));
router.get('/plans', asyncHandler(market.plans));
router.get('/plans/:planId/lots', asyncHandler(market.planLots));

export default router;
