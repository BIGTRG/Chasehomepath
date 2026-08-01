# Security / Hardening Notes (2026-08-01 pass)

Verified live: helmet CSP + HSTS + nosniff + frame options; auth brute-force rate limit (429 after
30 tries/15min); generic error envelopes (no stack/detail leakage); uploads auth-gated with mime
allowlist + 8MB cap; no test-auth flags or debug endpoints; api npm audit clean.

Changes this pass:
- CORS: disallowed origins now get a clean deny (no ACAO headers) instead of a 500.
- Staff MFA enforced (REQUIRE_STAFF_MFA, default on in production): operator routes 403 until TOTP
  enrolled; console shows QR enrollment gate.
- Password reset: hashed single-use 30-min tokens, all sessions revoked on reset.

Accepted risk (revisit): react-router 6.30.4 has two moderate advisories fixed only in v7
(breaking). Neither applies as used: no SSR (deserializeErrors path unused), and navigation targets
are constant app paths, not user input. Plan: migrate to v7 in a maintenance window with full e2e.
