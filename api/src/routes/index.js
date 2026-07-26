import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import planRoutes from './plan.routes.js';
import creditRoutes from './credit.routes.js';
import moneyRoutes from './money.routes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/plan', planRoutes);
router.use('/credit', creditRoutes);
router.use('/money', moneyRoutes);

// Later phases mount here: /team (5), /learn (6), /marketplace (7), /ingest (8),
// /agent (9), /operator (10), /partner (11), /onboarding (12), /home (13).

export default router;
