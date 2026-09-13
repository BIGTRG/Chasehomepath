import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as credit from '../controllers/credit.controller.js';
import * as dispute from '../controllers/dispute.controller.js';

const router = Router();

// All credit work is the member's own (self-directed, spec §8).
router.use(authenticate, authorize('member'));

router.post('/pull', asyncHandler(credit.pull));
router.get('/', asyncHandler(credit.overview));
router.get('/disputes', asyncHandler(credit.listDisputes));

// Do-it-yourself dispute workflow: Maren drafts, the member signs and sends (never the system).
router.get('/dispute-options', asyncHandler(dispute.options));
router.put('/letterhead', asyncHandler(dispute.setLetterhead));
router.get('/cases', asyncHandler(dispute.list));
router.get('/cases/:id', asyncHandler(dispute.get));
router.post('/cases/:id/outcome', asyncHandler(dispute.outcome));
router.post('/cases/:id/next', asyncHandler(dispute.nextRound));
router.get('/letters/:letterId', asyncHandler(dispute.getByLetter));
router.put('/letters/:letterId', asyncHandler(dispute.editLetter));
router.post('/letters/:letterId/sign', asyncHandler(dispute.approveLetter));
router.post('/letters/:letterId/sent', asyncHandler(dispute.markSent));
router.get('/scores', asyncHandler(credit.scoreHistory));
router.post('/scores', asyncHandler(credit.recordScores));
router.get('/items/:id', asyncHandler(credit.itemDetail));
router.post('/items/:id/dispute', asyncHandler((req, res, next) => (req.body?.reasonCode ? dispute.start(req, res, next) : credit.fileDispute(req, res, next))));
router.post('/disputes/:id/withdraw', asyncHandler(credit.withdrawDispute));

export default router;
