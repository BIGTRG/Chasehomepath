import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool, closePool } from './db/pool.js';

import { runAlerts } from './services/training.service.js';
import { syncMonitoringScores } from './services/credit.service.js';
import { expireCancelled } from './services/billing.service.js';

const app = createApp();

// Housekeeping every 5 minutes: training alerts + missed re-books, expired cancellations.
// Single API container today; move to a worker if a second replica is added.
const tick = async () => {
  try { await runAlerts(); await expireCancelled(); await syncMonitoringScores(); } catch (err) { console.error('housekeeping failed:', err.message); }
};
setInterval(tick, 5 * 60_000).unref();
setTimeout(tick, 15_000).unref();

const server = app.listen(env.port, () => {
  console.log(`CHASE HomePath API listening on :${env.port} (${env.NODE_ENV})`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  // Force-exit if connections don't drain in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Surface, don't swallow.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

export { app, pool };
