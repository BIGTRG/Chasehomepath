// Imported FIRST by every test file so config/env and crypto see valid values.
// (ESM evaluates imports in order, so this runs before the modules under test.)
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-that-is-at-least-32-chars';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-that-is-at-least-32-chars';
// 32-byte key, base64 ("0123456789abcdef0123456789abcdef").
process.env.ENCRYPTION_KEY ||= 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.ENCRYPTION_KEY_ACTIVE ||= '1';
