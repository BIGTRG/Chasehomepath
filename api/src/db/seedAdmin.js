import readline from 'node:readline';
import { pool, closePool, withTransaction } from './pool.js';
import { createUser } from '../services/user.service.js';
import { validatePasswordStrength } from '../auth/password.js';
import { audit } from '../lib/audit.js';

/**
 * Bootstrap the first HQ admin. Self-registration only creates members, so the
 * initial admin is seeded here. Usage:
 *
 *   ADMIN_EMAIL=you@chase.co ADMIN_PASSWORD='...' npm run seed:admin
 *
 * Idempotent: no-ops if a user with that email already exists.
 */

function fromEnvOrPrompt(name) {
  const val = process.env[name];
  if (val) return Promise.resolve(val);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${name}: `, (a) => { rl.close(); resolve(a.trim()); }));
}

async function main() {
  const email = (await fromEnvOrPrompt('ADMIN_EMAIL')).toLowerCase();
  const password = await fromEnvOrPrompt('ADMIN_PASSWORD');

  const strength = validatePasswordStrength(password);
  if (!strength.ok) throw new Error(strength.reason);

  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
  if (rows[0]) {
    console.log(`Admin ${email} already exists (${rows[0].id}). Nothing to do.`);
    return;
  }

  const user = await withTransaction(async (db) => {
    const u = await createUser({ email, password, role: 'admin' }, db);
    await db(
      `INSERT INTO staff (user_id, title) VALUES ($1, 'manager')`,
      [u.id],
    );
    await audit(
      { actorUserId: u.id, actorRole: 'admin', action: 'seed.admin_created', entityType: 'user', entityId: u.id },
      db,
    );
    return u;
  });

  console.log(`Created admin ${email} (${user.id}).`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
