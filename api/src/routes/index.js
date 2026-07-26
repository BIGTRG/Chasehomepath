import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);

// Later phases mount here: /plan (2), /credit (3), /money (4), /team (5),
// /learn (6), /marketplace (7), /ingest (8), /agent (9), /operator (10),
// /partner (11), /onboarding (12), /home (13).

export default router;
