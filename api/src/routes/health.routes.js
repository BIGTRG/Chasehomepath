import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { healthcheck } from '../db/pool.js';

const router = Router();

// Liveness — process is up.
router.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// Readiness — dependencies (DB) reachable.
router.get(
  '/readyz',
  asyncHandler(async (_req, res) => {
    const dbOk = await healthcheck();
    res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ready' : 'degraded', db: dbOk });
  }),
);

export default router;
