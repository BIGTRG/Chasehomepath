import { AppError } from '../lib/errors.js';
import { ZodError } from 'zod';

/** 404 for unmatched routes. */
export function notFound(_req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}

/** Central error handler. Maps typed errors to responses; hides 5xx internals.
 *  The 4-arg signature (incl. _next) is required for Express to treat this as an error handler. */
export function errorHandler(err, req, res, _next) {
  // Zod validation errors -> 422 with field details.
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'validation_error',
        message: 'Validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof AppError) {
    const body = { error: { code: err.code, message: err.expose ? err.message : 'Internal error' } };
    if (err.details !== undefined) body.error.details = err.details;
    return res.status(err.status).json(body);
  }

  // Unknown error: log server-side, return opaque 500.
  req.log?.error({ err }, 'unhandled error');
  return res.status(500).json({ error: { code: 'internal_error', message: 'Internal error' } });
}
