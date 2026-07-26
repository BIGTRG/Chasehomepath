import { z } from 'zod';
import { withTransaction } from '../db/pool.js';
import {
  createUser,
  findByEmail,
  findById,
  markLoggedIn,
  enableMfa,
  disableMfa,
  toPublic,
} from '../services/user.service.js';
import { verifyPassword, validatePasswordStrength } from '../auth/password.js';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../auth/tokens.js';
import {
  generateSecret,
  buildEnrollment,
  verifyToken,
  encryptSecret,
  decryptSecret,
} from '../auth/mfa.js';
import { audit } from '../lib/audit.js';
import { AuthError, ValidationError, ConflictError } from '../lib/errors.js';
import { env } from '../config/env.js';

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(1);

// Member self-signup captures ONLY name/email/phone/password + consent (spec §4.1).
// Consent must explicitly acknowledge the data-never-sold policy (spec §8 "Data never sold").
const registerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: emailSchema,
  phone: z.string().trim().min(7).max(30).optional(),
  password: passwordSchema,
  consent: z.object({
    terms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
    dataNeverSold: z.literal(true, {
      errorMap: () => ({ message: 'You must acknowledge the data-never-sold policy' }),
    }),
  }),
});

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  mfaToken: z.string().trim().optional(),
});

const meta = (req) => ({ ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null });

function issueSession(user, req, db) {
  const accessToken = signAccessToken(user);
  return issueRefreshToken(user.id, meta(req), db).then((refresh) => ({
    accessToken,
    accessExpiresIn: env.auth.accessTtl,
    refreshToken: refresh.raw,
    refreshExpiresAt: refresh.expiresAt,
    user: toPublic(user),
  }));
}

export async function register(req, res) {
  const input = registerSchema.parse(req.body);

  const strength = validatePasswordStrength(input.password);
  if (!strength.ok) throw new ValidationError(strength.reason);

  const session = await withTransaction(async (db) => {
    // Phase 1 creates the account (the auth spine). Phase 2 extends this transaction
    // to also create the members row + plan + six tracks.
    const user = await createUser(
      { email: input.email, phone: input.phone ?? null, password: input.password, role: 'member' },
      db,
    );
    await audit(
      {
        actorUserId: user.id,
        actorRole: 'member',
        action: 'auth.register',
        entityType: 'user',
        entityId: user.id,
        metadata: { name: input.name, consent: input.consent },
        ...meta(req),
      },
      db,
    );
    return issueSession(user, req, db);
  });

  res.status(201).json(session);
}

export async function login(req, res) {
  const input = loginSchema.parse(req.body);
  const user = await findByEmail(input.email, { withSecret: true });

  // Uniform failure to avoid leaking which part was wrong.
  const passwordOk = user && (await verifyPassword(input.password, user.password_hash));
  if (!user || !passwordOk) {
    await audit({ action: 'auth.login_failed', metadata: { email: input.email }, ...meta(req) });
    throw new AuthError('Invalid email or password', 'invalid_credentials');
  }
  if (user.status !== 'active') throw new AuthError('Account is not active', 'account_inactive');

  // Second factor when enrolled.
  if (user.mfa_enabled) {
    if (!input.mfaToken) {
      return res.status(401).json({ error: { code: 'mfa_required', message: 'MFA code required' } });
    }
    const secret = decryptSecret(user.mfa_secret);
    if (!verifyToken(input.mfaToken, secret)) {
      await audit({
        actorUserId: user.id,
        action: 'auth.mfa_failed',
        entityType: 'user',
        entityId: user.id,
        ...meta(req),
      });
      throw new AuthError('Invalid MFA code', 'mfa_invalid');
    }
  }

  const session = await withTransaction(async (db) => {
    await markLoggedIn(user.id, db);
    await audit(
      { actorUserId: user.id, actorRole: user.role, action: 'auth.login', entityType: 'user', entityId: user.id, ...meta(req) },
      db,
    );
    return issueSession(user, req, db);
  });

  res.json(session);
}

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export async function refresh(req, res) {
  const { refreshToken } = refreshSchema.parse(req.body);
  let result;
  try {
    result = await rotateRefreshToken(refreshToken, meta(req));
  } catch {
    throw new AuthError('Invalid refresh token', 'refresh_invalid');
  }
  const user = await findById(result.userId);
  if (!user || user.status !== 'active') throw new AuthError('Account is not active', 'account_inactive');

  res.json({
    accessToken: signAccessToken(user),
    accessExpiresIn: env.auth.accessTtl,
    refreshToken: result.refresh.raw,
    refreshExpiresAt: result.refresh.expiresAt,
    user: toPublic(user),
  });
}

export async function logout(req, res) {
  const parsed = refreshSchema.safeParse(req.body);
  if (parsed.success) await revokeRefreshToken(parsed.data.refreshToken);
  res.status(204).end();
}

export async function me(req, res) {
  res.json({ user: toPublic(req.user) });
}

// ── MFA enrollment ──────────────────────────────────────────────────────────

export async function mfaSetup(req, res) {
  const secret = generateSecret();
  const enrollment = await buildEnrollment(req.user, secret);
  // Secret is returned once; the client echoes it back to /mfa/enable with a code.
  // Nothing is persisted until the code is verified (proves possession).
  res.json({ secret, otpauth: enrollment.otpauth, qrDataUrl: enrollment.qrDataUrl });
}

const mfaEnableSchema = z.object({ secret: z.string().min(1), token: z.string().trim().min(1) });

export async function mfaEnable(req, res) {
  const { secret, token } = mfaEnableSchema.parse(req.body);
  if (!verifyToken(token, secret)) throw new AuthError('Invalid MFA code', 'mfa_invalid');

  await withTransaction(async (db) => {
    await enableMfa(req.user.id, encryptSecret(secret), db);
    await audit(
      { actorUserId: req.user.id, actorRole: req.user.role, action: 'auth.mfa_enabled', entityType: 'user', entityId: req.user.id, ...meta(req) },
      db,
    );
  });
  res.json({ mfaEnabled: true });
}

const mfaDisableSchema = z.object({ token: z.string().trim().min(1) });

export async function mfaDisable(req, res) {
  const { token } = mfaDisableSchema.parse(req.body);
  const fresh = await findById(req.user.id, { withSecret: true });
  if (!fresh?.mfa_enabled) throw new ConflictError('MFA is not enabled', 'mfa_not_enabled');
  if (!verifyToken(token, decryptSecret(fresh.mfa_secret))) {
    throw new AuthError('Invalid MFA code', 'mfa_invalid');
  }
  await withTransaction(async (db) => {
    await disableMfa(req.user.id, db);
    await audit(
      { actorUserId: req.user.id, actorRole: req.user.role, action: 'auth.mfa_disabled', entityType: 'user', entityId: req.user.id, ...meta(req) },
      db,
    );
  });
  res.json({ mfaEnabled: false });
}
