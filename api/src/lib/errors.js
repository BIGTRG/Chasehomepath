/**
 * Typed application errors. The error handler maps `status` to the HTTP response
 * and uses `code` as a stable machine-readable identifier for clients.
 */
export class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details = undefined } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500; // 4xx messages are safe to show clients; 5xx are not
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(message, { status: 422, code: 'validation_error', details });
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required', code = 'unauthenticated') {
    super(message, { status: 401, code });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not permitted', code = 'forbidden') {
    super(message, { status: 403, code });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, { status: 404, code: 'not_found' });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'conflict') {
    super(message, { status: 409, code });
  }
}

/**
 * ComplianceError — a Section 8 rule blocked the action. These are load-bearing:
 * "If a feature would break one, the feature is wrong, not the rule." (spec §11).
 */
export class ComplianceError extends AppError {
  constructor(message, rule) {
    super(message, { status: 403, code: 'compliance_block', details: { rule } });
  }
}
