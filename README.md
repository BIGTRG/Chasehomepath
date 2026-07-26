# CHASE HomePath

> Ensuring the American Dream.

A vertically integrated homeownership platform: one PostgreSQL database and one
Node/Express API serving three surfaces — the **member app**, the **operator console**,
and the **partner portal**. Mobile-first React web/PWA. Self-hosted on Hetzner.

The build follows [`CHASE_HomePath_Build_Spec`](docs/) phase-by-phase. This repository
is the source of truth; new ideas are parked in [`docs/backlog.md`](docs/backlog.md).

## Status

| Phase | Scope | State |
|---|---|---|
| **1 — Foundation** | Repo scaffold, full PostgreSQL schema, auth + roles + MFA, column encryption, audit log, API skeleton, CI | ✅ built |
| 2 — Plan core | Member signup/login, plan + six tracks, plan home, milestones, 90-day rule | ⏳ next |
| 3 — Credit engine | Rules engine, credit screens, member-initiated disputes | ⏳ |
| 4–13 | Money, Team, Education, Marketplace, Ingestion, AI agent, Operator console, Partner portal, Onboarding, Homeowner mode | ⏳ |

## Layout

```
api/                Node/Express API — one API, three surfaces
  migrations/       numbered .sql schema migrations (all Section 3 tables)
  src/
    config/         env loading + validation
    db/             pg pool, transactions, migration runner
    lib/            crypto (AES-256-GCM), audit log, errors
    auth/           password, JWT, TOTP MFA, RBAC
    compliance/     Section 8 rules (load-bearing) + copy gate
    middleware/     authenticate, authorize, error handler
    services/       data-access services
    controllers/    request handlers
    routes/         route wiring
  test/             unit tests (node:test)
web/                React web/PWA (built from Phase 2)
docs/               spec + backlog
.github/workflows/  CI (lint, migrate, test against Postgres)
```

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env        # then set secrets (see below)

# 3. Start PostgreSQL (self-hosted)
docker compose up -d db

# 4. Apply the schema
npm run migrate             # `npm run migrate:status` to preview

# 5. Run the API
npm run dev                 # http://localhost:4000/api/healthz
```

### Generating secrets

```bash
openssl rand -base64 48     # JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
openssl rand -base64 32     # ENCRYPTION_KEY (must decode to 32 bytes)
```

## Auth API (Phase 1)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Member self-signup (name, email, phone, password, consent) |
| POST | `/api/auth/login` | Email + password (+ MFA code if enrolled) |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Revoke refresh token |
| GET  | `/api/auth/me` | Current user |
| POST | `/api/auth/mfa/setup` | Begin TOTP enrollment (returns QR) |
| POST | `/api/auth/mfa/enable` | Confirm TOTP code, enable MFA |
| POST | `/api/auth/mfa/disable` | Disable MFA (requires current code) |

## Compliance (Section 8 — load-bearing)

These are enforced in code, not left to discretion. Phase 1 lays the primitives in
[`api/src/compliance`](api/src/compliance):

- **No outcome promises** — `copyGate.js` scans member-facing strings.
- **90-day minimum**, **score-withheld-until-meeting**, **onboarding gate**,
  **self-directed credit work** — pure rule functions in `rules.js`.
- **Everything auditable** — `lib/audit.js` writes an immutable `audit_log` row,
  in the same transaction as the action it describes.
- **Encryption (GLBA-grade)** — `lib/crypto.js` AES-256-GCM column encryption for
  SSNs, credit data, bank tokens, payroll.

## Testing

```bash
npm test        # unit tests (no DB required)
npm run lint
```

CI additionally spins up PostgreSQL and runs all migrations on every push/PR.
