import { query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { encrypt } from '../lib/crypto.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../lib/errors.js';
import { getEsignAdapter } from '../integrations/esign/index.js';
import { getLicenseAdapter } from '../integrations/licenseLookup/index.js';

// The pipeline order (spec §9 Phase 12, §3 onboarding_steps).
export const STEP_ORDER = [
  'application',
  'license_verify',
  'background',
  'agreement',
  'payroll',
  'training',
  'certification',
  'provisioning',
];

/** Start an onboarding case for a user with all steps pending. Idempotent per open case. */
export async function startOnboarding(userId, roleType, actor) {
  return withTransaction(async (db) => {
    const { rows: open } = await db(
      `SELECT id FROM onboarding_cases WHERE user_id = $1 AND stage <> 'complete' AND deleted_at IS NULL`,
      [userId],
    );
    if (open[0]) throw new ConflictError('An onboarding case is already open for this user');

    const { rows } = await db(
      `INSERT INTO onboarding_cases (user_id, role_type, stage) VALUES ($1, $2, 'application') RETURNING id`,
      [userId, roleType],
    );
    const caseId = rows[0].id;
    for (const step of STEP_ORDER) {
      await db(`INSERT INTO onboarding_steps (case_id, step, status) VALUES ($1, $2, 'pending')`, [caseId, step]);
    }
    await audit({ actorUserId: actor.userId, actorRole: actor.role, action: 'onboarding.started', entityType: 'onboarding_case', entityId: caseId, metadata: { userId, roleType }, ...actor.reqMeta }, db);
    return { caseId, stage: 'application' };
  });
}

// Run the integration behind a step. Returns { ok, note } or throws for hard failures.
async function runStepIntegration(step, userId, roleType, db) {
  switch (step) {
    case 'license_verify': {
      const { rows: licenses } = await db(
        `SELECT id, license_type, number FROM license_records WHERE user_id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [userId],
      );
      if (licenses.length === 0) return { ok: false, note: 'no license on file' };
      const lookup = getLicenseAdapter();
      const { decrypt } = await import('../lib/crypto.js');
      let allActive = true;
      for (const lic of licenses) {
        const number = lic.number ? decrypt(lic.number) : null;
        const result = await lookup.verify({ licenseType: lic.license_type, number });
        await db(`UPDATE license_records SET status = $2, verified_at = $3 WHERE id = $1`, [lic.id, result.status, result.verifiedAt]);
        if (result.status !== 'active') allActive = false;
      }
      return { ok: allActive, note: allActive ? 'licenses verified' : 'a license failed verification' };
    }
    case 'agreement': {
      const signed = await getEsignAdapter().sign({ type: roleType, userId });
      await db(`INSERT INTO agreements (user_id, type, esigned_at, document_ref) VALUES ($1, $2, $3, $4)`,
        [userId, roleType, signed.esignedAt, encrypt(signed.documentRef)]);
      return { ok: true, note: 'agreement e-signed' };
    }
    case 'provisioning': {
      // Final step: activate the account so it can be used (still gated elsewhere by stage=complete).
      await db(`UPDATE users SET status = 'active' WHERE id = $1`, [userId]);
      return { ok: true, note: 'account provisioned' };
    }
    default:
      // application / background / payroll / training / certification — no external call in v1 mock.
      return { ok: true, note: 'ok' };
  }
}

/**
 * Advance a step. decision 'pass' runs the step's integration (which may itself fail);
 * 'fail' records a failure. When every step is passed, the case stage becomes 'complete'
 * — which, with verified licenses, satisfies the onboarding gate (spec §8).
 */
export async function advanceStep(stepId, decision, actor) {
  return withTransaction(async (db) => {
    const { rows } = await db(
      `SELECT os.id, os.step, os.status, os.case_id, oc.user_id, oc.role_type
         FROM onboarding_steps os JOIN onboarding_cases oc ON oc.id = os.case_id
        WHERE os.id = $1 AND os.deleted_at IS NULL FOR UPDATE`,
      [stepId],
    );
    const step = rows[0];
    if (!step) throw new NotFoundError('Step not found');

    let status = 'failed';
    let note = 'failed by operator';
    if (decision === 'pass') {
      const result = await runStepIntegration(step.step, step.user_id, step.role_type, db);
      status = result.ok ? 'passed' : 'failed';
      note = result.note;
      if (!result.ok) throw new ForbiddenError(`Step ${step.step} could not pass: ${note}`);
    }

    await db(`UPDATE onboarding_steps SET status = $2, completed_at = $3 WHERE id = $1`,
      [stepId, status, status === 'passed' ? new Date() : null]);

    // Recompute case stage: first still-pending step, or 'complete'.
    const { rows: remaining } = await db(
      `SELECT step FROM onboarding_steps WHERE case_id = $1 AND status <> 'passed' AND deleted_at IS NULL`,
      [step.case_id],
    );
    const nextStage = remaining.length === 0
      ? 'complete'
      : STEP_ORDER.find((s) => remaining.some((r) => r.step === s)) ?? step.step;
    await db(`UPDATE onboarding_cases SET stage = $2 WHERE id = $1`, [step.case_id, nextStage]);

    await audit({
      actorUserId: actor.userId, actorRole: actor.role,
      action: nextStage === 'complete' ? 'onboarding.completed' : 'onboarding.step_advanced',
      entityType: 'onboarding_case', entityId: step.case_id, metadata: { step: step.step, status, note, nextStage }, ...actor.reqMeta,
    }, db);

    return { stepId, step: step.step, status, note, stage: nextStage };
  });
}

/** Onboarding queue (spec §5.4): cases in flight with progress. */
export async function getQueue() {
  const { rows } = await query(
    `SELECT oc.id, oc.user_id, u.email, u.role, oc.role_type, oc.stage, oc.started_at,
            (SELECT COUNT(*)::int FROM onboarding_steps s WHERE s.case_id = oc.id AND s.status = 'passed' AND s.deleted_at IS NULL) AS passed,
            (SELECT COUNT(*)::int FROM onboarding_steps s WHERE s.case_id = oc.id AND s.deleted_at IS NULL) AS total
       FROM onboarding_cases oc JOIN users u ON u.id = oc.user_id
      WHERE oc.deleted_at IS NULL ORDER BY (oc.stage = 'complete'), oc.started_at DESC`,
  );
  return rows;
}

export async function getCase(caseId) {
  const { rows: caseRows } = await query(
    `SELECT oc.id, oc.user_id, u.email, oc.role_type, oc.stage, oc.started_at
       FROM onboarding_cases oc JOIN users u ON u.id = oc.user_id
      WHERE oc.id = $1 AND oc.deleted_at IS NULL`,
    [caseId],
  );
  if (!caseRows[0]) throw new NotFoundError('Onboarding case not found');
  const { rows: steps } = await query(
    `SELECT id, step, status, completed_at FROM onboarding_steps WHERE case_id = $1 AND deleted_at IS NULL`,
    [caseId],
  );
  steps.sort((a, b) => STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step));
  return { case: caseRows[0], steps };
}
