import { env } from '../config/env.js';
import { logger } from './logger.js';

// Transactional mail via Genius Eye Mail (SMTP). When SMTP is not configured
// (dev/test), messages are logged instead of sent so flows stay testable.
let transport = null;
async function getTransport() {
  if (!env.mail.host) return null;
  if (!transport) {
    // Lazy import: nodemailer is only loaded when SMTP is actually configured,
    // keeping module load (and the no-DB test suite) free of side effects.
    const { default: nodemailer } = await import('nodemailer');
    transport = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: false, // STARTTLS on 587
      auth: { user: env.mail.user, pass: env.mail.pass },
    });
  }
  return transport;
}

/** Fire-and-forget safe sender. Never throws into the request path. */
export async function sendMail({ to, subject, text }) {
  const t = await getTransport();
  if (!t) {
    logger.info({ to, subject }, 'mailer disabled — message logged, not sent');
    return { sent: false };
  }
  try {
    await t.sendMail({ from: env.mail.from, to, subject, text });
    return { sent: true };
  } catch (err) {
    logger.error({ err: err.message, to, subject }, 'mail send failed');
    return { sent: false };
  }
}
