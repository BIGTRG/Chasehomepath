import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool, closePool } from './db/pool.js';

const app = createApp();

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
