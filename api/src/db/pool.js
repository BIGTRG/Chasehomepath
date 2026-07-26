import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

// pg returns NUMERIC/BIGINT as strings by default (to avoid float precision loss).
// Money columns use NUMERIC — keep them as strings and parse at the edges where needed.

const poolConfig = env.db.connectionString
  ? { connectionString: env.db.connectionString, ssl: env.db.ssl ? { rejectUnauthorized: false } : false }
  : {
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
    };

export const pool = new Pool({
  ...poolConfig,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // Idle client errors shouldn't crash the process; log and let pg recycle.
  console.error('[db] idle client error', err);
});

/** Run a single query. Params are always parameterized ($1, $2 …) — never interpolate SQL. */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a function inside a transaction. Rolls back on throw, commits otherwise.
 * The callback receives a bound query fn so callers never touch raw clients.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const boundQuery = (text, params) => client.query(text, params);
    const result = await fn(boundQuery, client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function healthcheck() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

export async function closePool() {
  await pool.end();
}

export default pool;
