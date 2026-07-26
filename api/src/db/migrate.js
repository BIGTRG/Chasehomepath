import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { pool, withTransaction, closePool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadFiles() {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((f) => f.endsWith('.sql'))
    .sort() // zero-padded numeric prefixes sort correctly
    .map((f) => ({ id: f, filepath: path.join(MIGRATIONS_DIR, f) }));
}

async function appliedSet() {
  const { rows } = await pool.query('SELECT id, checksum FROM schema_migrations');
  return new Map(rows.map((r) => [r.id, r.checksum]));
}

function checksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

async function up() {
  await ensureMigrationsTable();
  const files = await loadFiles();
  const applied = await appliedSet();
  let count = 0;

  for (const { id, filepath } of files) {
    const sql = await readFile(filepath, 'utf8');
    const sum = checksum(sql);

    if (applied.has(id)) {
      if (applied.get(id) !== sum) {
        throw new Error(
          `Migration ${id} was modified after being applied (checksum mismatch). ` +
            'Migrations are immutable — add a new migration instead.',
        );
      }
      continue;
    }

    await withTransaction(async (q) => {
      await q(sql);
      await q('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [id, sum]);
    });
    console.log(`✓ applied ${id}`);
    count += 1;
  }

  console.log(count === 0 ? 'Already up to date.' : `Applied ${count} migration(s).`);
}

async function status() {
  await ensureMigrationsTable();
  const files = await loadFiles();
  const applied = await appliedSet();
  for (const { id } of files) {
    console.log(`${applied.has(id) ? '✓ applied ' : '· pending '} ${id}`);
  }
}

const command = process.argv[2] ?? 'up';

try {
  if (command === 'up') await up();
  else if (command === 'status') await status();
  else {
    console.error(`Unknown command: ${command}. Use "up" or "status".`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
