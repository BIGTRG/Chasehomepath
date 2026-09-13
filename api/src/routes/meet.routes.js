import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import * as meet from '../controllers/meet.controller.js';

// EventSource cannot send headers: accept the access token as a query param for the stream only.
function tokenFromQuery(req, _res, next) {
  if (!req.headers.authorization && req.query.access_token) req.headers.authorization = `Bearer ${req.query.access_token}`;
  next();
}

const router = Router();
router.get('/:code', authenticate, asyncHandler(meet.info));
router.get('/:code/events', tokenFromQuery, authenticate, asyncHandler(meet.events));
router.post('/:code/signal', authenticate, asyncHandler(meet.signal));
export default router;
