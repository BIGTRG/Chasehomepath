import { Router } from 'express';
import express from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { requireStaffMfa } from '../middleware/requireStaffMfa.js';
import { STAFF_ROLES } from '../auth/rbac.js';
import * as billing from '../controllers/billing.controller.js';

const router = Router();


// Processor webhook: raw body for signature verification, no auth header.
router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), asyncHandler(billing.webhook));

// Public catalog (pricing screen renders before login too).
router.get('/plans', asyncHandler(billing.plans));

// Counseling catalog: public for the marketing page; member-aware when a token is present.
router.get('/counseling', optionalAuthenticate, asyncHandler(billing.counseling));
router.post('/group-sessions/:id/join', authenticate, authorize('member'), asyncHandler(billing.joinGroup));
router.post('/operator/group-sessions', authenticate, requireStaffMfa, authorize(...STAFF_ROLES), asyncHandler(billing.createGroup));

// Member
router.get('/me', authenticate, authorize('member'), asyncHandler(billing.mine));
router.post('/subscribe', authenticate, authorize('member'), asyncHandler(billing.subscribe));
router.post('/cancel', authenticate, authorize('member'), asyncHandler(billing.cancel));
router.post('/resume', authenticate, authorize('member'), asyncHandler(billing.resume));
router.post('/change-plan', authenticate, authorize('member'), asyncHandler(billing.changePlan));
router.get('/sessions/slots', authenticate, authorize('member'), asyncHandler(billing.sessionSlots));
router.post('/sessions', authenticate, authorize('member'), asyncHandler(billing.bookSession));
router.post('/sessions/:id/cancel', authenticate, authorize('member'), asyncHandler(billing.cancelSession));

router.get('/reporting', authenticate, authorize('member'), asyncHandler(billing.reportingStatus));
router.post('/reporting/opt-in', authenticate, authorize('member'), asyncHandler(billing.reportingOptIn));
router.get('/readiness', authenticate, authorize('member'), asyncHandler(billing.readiness));

// Operator (MFA enforced)
router.get('/operator/reporting', authenticate, requireStaffMfa, authorize('manager', 'admin'), asyncHandler(billing.reportingSummary));
router.get('/operator/members/:memberId/readiness', authenticate, requireStaffMfa, authorize(...STAFF_ROLES), asyncHandler(billing.readinessForOperator))
router.get('/operator/summary', authenticate, requireStaffMfa, authorize('manager', 'admin'), asyncHandler(billing.summary));
router.get('/operator/members/:memberId', authenticate, requireStaffMfa, authorize(...STAFF_ROLES), asyncHandler(billing.memberBilling));
router.post('/operator/sessions/:id/mark', authenticate, requireStaffMfa, authorize(...STAFF_ROLES), asyncHandler(billing.markSession));

export default router;
