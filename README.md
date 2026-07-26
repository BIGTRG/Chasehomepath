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
| **2 — Plan core** | Member signup/login, plan + six tracks, plan home screen, milestones, 90-day rule; mobile-first React app | ✅ built |
| **3 — Credit engine** | Deterministic FCRA rules engine, credit screens, member-initiated disputes, dispute tracking, bureau adapter | ✅ built |
| **4 — Money** | Plaid adapter, transaction sync, budgets vs actual, savings goals, deterministic coaching, Money screen | ✅ built |
| **5 — Team & comms** | Team assignment (onboarding-gated), in-app messaging, appointments, consultation→score unlock, ratings | ✅ built |
| **6 — Education** | Curriculum, assignment-from-plan, data-driven lock/unlock, before/during/after, Learn screen | ✅ built |
| **7 — Marketplace** | Listings (source-labeled), house-plan catalog, lot-plan fit, plan-to-lot all-in, per-member enrichment | ✅ built |
| **8 — Ingestion** | MLS/RESO connector, normalization, dedup, quality gate, partner-route publishing + operator review | ✅ built |
| **9 — AI agent** | Member agent over own file, deterministic rate/term/legal escalation, live program matching | ✅ built |
| **10 — Operator console** | Roster, client detail, team capacity, ratings dashboard, inventory review, HQ user/program admin | ✅ built |
| **11 — Partner portal** | Certification (e-sign + license verify), assigned clients, inventory publishing, compliance profile | ✅ built |
| **12 — Workforce onboarding** | Gated pipeline (application→…→provisioning), license/e-sign integrations, operator queue | ✅ built |
| 13 — Homeowner mode | Post-purchase: maintenance, escrow/taxes, value tracking, refi alerts | ⏳ last |

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

## Plan API (Phase 2)

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET  | `/api/plan` | member | Plan home: day count, six-track progress, milestones, 90-day status |
| PATCH | `/api/plan/milestones/:id` | member | Member marks their own milestone done/undone |
| PATCH | `/api/plan/:memberId/tracks/:trackType` | staff | Update a track's progress |
| POST | `/api/plan/:memberId/placement-ready` | staff | Mark placement-ready (blocked in code before day 90) |

The React app (`web/`) ships the first three member screens: **Create account** (with the
explicit data-never-sold consent), **Sign in** (with MFA step), and **Plan home** (leads with
the day count, shows the six tracks and the 90-day rule — no score).

## Credit API (Phase 3)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/credit/pull` | Ingest a report (bureau adapter), classify every item |
| GET  | `/api/credit` | Items split disputable vs accurate; score withheld pre-consultation |
| GET  | `/api/credit/items/:id` | Item finding + FCRA rights; nothing pre-selected |
| POST | `/api/credit/items/:id/dispute` | **Member-initiated** dispute; initiator recorded |
| POST | `/api/credit/disputes/:id/withdraw` | Withdraw an open dispute |
| GET  | `/api/credit/disputes` | Dispute tracker (status + day count) |

The **credit rules engine** (`api/src/credit/rulesEngine.js`) is deterministic and auditable —
explicit FCRA/CROA rules, not an LLM. It classifies each item `disputable`/`accurate`, generates
non-promissory guidance (run through the copy gate), and **never pre-selects or files a dispute**.
Bureau access sits behind a swappable adapter (`api/src/integrations/creditBureau`).

### Running both tiers in dev

```bash
docker compose up -d db && npm run migrate   # once
npm --workspace api run dev                   # API on :4000
npm --workspace web run dev                   # web on :5173 (proxies /api)
```

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
