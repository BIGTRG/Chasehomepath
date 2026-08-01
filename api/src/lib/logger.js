import pino from 'pino';

// Single process logger for non-request-scoped code (mailer, jobs).
export const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
