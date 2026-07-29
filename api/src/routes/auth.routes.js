import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import * as auth from '../controllers/auth.controller.js';

const router = Router();

// Throttle credential endpoints against brute force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many attempts, try again later' } },
  // The test suite registers/logs in far more than 30 times from one IP; brute-force
  // throttling stays fully active outside NODE_ENV=test.
  skip: () => process.env.NODE_ENV === 'test',
});

router.post('/register', authLimiter, asyncHandler(auth.register));
router.post('/login', authLimiter, asyncHandler(auth.login));
router.post('/refresh', asyncHandler(auth.refresh));
router.post('/logout', asyncHandler(auth.logout));

router.get('/me', authenticate, asyncHandler(auth.me));

router.post('/mfa/setup', authenticate, asyncHandler(auth.mfaSetup));
router.post('/mfa/enable', authenticate, asyncHandler(auth.mfaEnable));
router.post('/mfa/disable', authenticate, asyncHandler(auth.mfaDisable));

export default router;
