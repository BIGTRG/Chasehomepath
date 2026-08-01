import dotenv from 'dotenv';

// Load .env once, at process start. In test/CI the vars come from the environment.
dotenv.config();

function required(name, { allowInTest = false } = {}) {
  const val = process.env[name];
  if (val === undefined || val === '') {
    if (allowInTest && process.env.NODE_ENV === 'test') return '';
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

function optional(name, fallback) {
  const val = process.env[name];
  return val === undefined || val === '' ? fallback : val;
}

function int(name, fallback) {
  const raw = optional(name, undefined);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be an integer, got: ${raw}`);
  return n;
}

const NODE_ENV = optional('NODE_ENV', 'development');
const isProd = NODE_ENV === 'production';

// Secrets must be strong in production; a soft floor everywhere else.
function secret(name) {
  const val = required(name);
  if (isProd && val.length < 32) {
    throw new Error(`Env var ${name} must be at least 32 chars in production`);
  }
  return val;
}

export const env = {
  NODE_ENV,
  isProd,
  isTest: NODE_ENV === 'test',
  port: int('PORT', 4000),

  db: {
    connectionString: optional('DATABASE_URL', undefined),
    host: optional('PGHOST', 'localhost'),
    port: int('PGPORT', 5432),
    user: optional('PGUSER', 'chase'),
    password: optional('PGPASSWORD', 'chase'),
    database: optional('PGDATABASE', 'chase_homepath'),
    ssl: optional('PGSSLMODE', 'disable') === 'require',
  },

  auth: {
    accessSecret: secret('JWT_ACCESS_SECRET'),
    refreshSecret: secret('JWT_REFRESH_SECRET'),
    accessTtl: int('JWT_ACCESS_TTL', 900),
    refreshTtl: int('JWT_REFRESH_TTL', 2592000),
    mfaIssuer: optional('MFA_ISSUER', 'CHASE HomePath'),
    // Staff MFA enforcement — on in production unless explicitly disabled.
    requireStaffMfa: optional('REQUIRE_STAFF_MFA', isProd ? 'true' : 'false') === 'true',
  },

  encryption: {
    // Comma-free single active key today; rotation reads ENCRYPTION_KEY_<n>.
    activeKeyId: int('ENCRYPTION_KEY_ACTIVE', 1),
  },

  cors: {
    origins: optional('CORS_ORIGINS', 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  mail: {
    host: optional('SMTP_HOST', ''),
    port: int('SMTP_PORT', 587),
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
    from: optional('MAIL_FROM', 'CHASE HomePath <support@chasehomepath.com>'),
  },

  app: {
    // Public origin used to build links in emails.
    publicUrl: optional('PUBLIC_URL', 'https://chasehomepath.com'),
  },

  adapters: {
    plaid: optional('PLAID_ADAPTER', 'mock'),
    creditBureau: optional('CREDIT_BUREAU_ADAPTER', 'mock'),
    mls: optional('MLS_ADAPTER', 'mock'),
    esign: optional('ESIGN_ADAPTER', 'mock'),
    licenseLookup: optional('LICENSE_LOOKUP_ADAPTER', 'mock'),
    video: optional('VIDEO_ADAPTER', 'mock'),
    anthropic: optional('ANTHROPIC_ADAPTER', 'mock'),
  },
};

export default env;
