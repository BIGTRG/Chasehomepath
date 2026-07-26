import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as ingest from '../controllers/ingestion.controller.js';

const router = Router();
router.use(authenticate);

// MLS sync + pending queue + review are operator actions (manager/admin).
router.post('/mls', authorize('manager', 'admin'), asyncHandler(ingest.runMls));
router.get('/pending', authorize('manager', 'admin', 'specialist'), asyncHandler(ingest.pending));
router.post('/listings/:id/review', authorize('manager', 'admin'), asyncHandler(ingest.review));

// Partner-route publishing.
router.post('/partner-listings', authorize('partner'), asyncHandler(ingest.submit));

export default router;
