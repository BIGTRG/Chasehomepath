import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import planRoutes from './plan.routes.js';
import creditRoutes from './credit.routes.js';
import moneyRoutes from './money.routes.js';
import teamRoutes from './team.routes.js';
import educationRoutes from './education.routes.js';
import marketplaceRoutes from './marketplace.routes.js';
import ingestionRoutes from './ingestion.routes.js';
import agentRoutes from './agent.routes.js';
import assistanceRoutes from './assistance.routes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/plan', planRoutes);
router.use('/credit', creditRoutes);
router.use('/money', moneyRoutes);
router.use('/team', teamRoutes);
router.use('/learn', educationRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/ingest', ingestionRoutes);
router.use('/agent', agentRoutes);
router.use('/assistance', assistanceRoutes);

// Later phases mount here: /operator (10), /partner (11), /onboarding (12), /home (13).

export default router;
