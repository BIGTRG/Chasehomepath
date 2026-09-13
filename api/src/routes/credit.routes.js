import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as credit from '../controllers/credit.controller.js';
import * as dispute from '../controllers/dispute.controller.js';
import express from 'express';
import { requireStaffMfa } from '../middleware/requireStaffMfa.js';
import { STAFF_ROLES } from '../auth/rbac.js';

const router = Router();

// Mail provider webhook: raw body, no auth header. Operator switch for the mail service.
router.post('/mail-webhook', express.raw({ type: '*/*', limit: '1mb' }), asyncHandler(dispute.mailWebhook));
router.get('/operator/mail-service', authenticate, requireStaffMfa, authorize(...STAFF_ROLES), asyncHandler(dispute.getMailService));
router.put('/operator/mail-service', authenticate, requireStaffMfa, authorize('manager', 'admin'), asyncHandler(dispute.setMailService));

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
router.get('/letters/:letterId/mail-quote', asyncHandler(dispute.mailQuote));
router.post('/letters/:letterId/mail', asyncHandler(dispute.mailLetter));
router.post('/letters/:letterId/proofs', asyncHandler(dispute.attachProof));
router.get('/scores', asyncHandler(credit.scoreHistory));
router.post('/scores', asyncHandler(credit.recordScores));
router.get('/items/:id', asyncHandler(credit.itemDetail));
router.post('/items/:id/dispute', asyncHandler((req, res, next) => (req.body?.reasonCode ? dispute.start(req, res, next) : credit.fileDispute(req, res, next))));
router.post('/disputes/:id/withdraw', asyncHandler(credit.withdrawDispute));

export default router;
