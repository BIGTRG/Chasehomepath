# CHASE HomePath — Operations Runbook

Production: https://chasehomepath.com — server #1 (178.105.21.227), stack at `/opt/chasehomepath`.
Owner: TRG Tech Link (admin@trgtechlink.com).

## Architecture (one box, Docker Compose)
- Compose project: **`chasehomepath`** (pinned via `name:` in `deploy/docker-compose.prod.yml`).
  **Never remove the `name:` line** — without it the project defaults to `deploy` and collides
  with other apps on this host (their deploys remove chase containers as orphans; caused the
  Aug 2026 outage).
- Containers: `chase-postgres` (postgres:16, volume `deploy_chase_pgdata`),
  `chase-api` (Node/Express :4000 internal, uploads volume `deploy_chase_uploads`),
  `chase-web` (nginx :8101, serves SPA + proxies `/api`).
- Host nginx vhost `/etc/nginx/sites-available/chasehomepath` terminates TLS (Let's Encrypt,
  auto-renew via certbot cron) and proxies 443 → 127.0.0.1:8101.
- Mail: SMTP submission via mail.geniuseye.ai:587 (user `chasemailer`), from support@chasehomepath.com.

## Health checks
- Liveness: `GET /api/healthz` → `{"status":"ok"}`
- Readiness (DB): `GET /api/readyz` → `{"status":"ready","db":true}`
- Full check: `BASE=https://chasehomepath.com python3 deploy/e2e_smoke.py` (16 checks, read-mostly; safe on prod).

## Monitoring & alerting
- `deploy/monitor.sh` runs from the `viktor` crontab every 5 minutes:
  checks readyz → attempts auto-heal (`docker compose up -d`) → re-checks → emails
  admin@trgtechlink.com on sustained failure (alerts rate-limited to one per 2h per condition).
  Also alerts if the newest DB backup is older than 13h.
- Logs: `docker logs chase-api` (json-file, capped 10MB×5 per container).

## Incident response
1. **Site down (502/timeout)**
   - `docker ps | grep chase` — if api/web missing: `cd /opt/chasehomepath && docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d`
   - If containers up but 502: `docker logs --tail 100 chase-api`; check DB: `curl -s localhost:8101/api/readyz`.
   - Host nginx: `sudo nginx -t && sudo systemctl reload nginx`.
2. **Database issue**
   - `docker exec chase-postgres pg_isready -U chase -d chase_homepath`
   - Disk: `df -h /` (backups + docker can fill the 300G disk; prune with `docker system prune -f` if needed).
3. **Suspected breach / credential leak**
   - Rotate JWT secrets + `PGPASSWORD` + SMTP password in `/opt/chasehomepath/.env`, then
     `docker compose ... up -d --force-recreate api web`. Rotating JWT secrets logs everyone out (intended).
   - Review `audit_log` table for the window: `docker exec -it chase-postgres psql -U chase -d chase_homepath -c "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200;"`
   - Reset operator passwords; operators must re-enroll TOTP if compromised.

## Backups & restore
- `/opt/backups/scripts/chase-backup.sh` (root cron, every 6h):
  pg_dump (custom format) + uploads tar → `/opt/backups/chasehomepath/` (AES-256 encrypted,
  14-day retention) → rsync off-server to server #4 (167.233.26.135)
  `/home/viktor/backups/chasehomepath/`. Each run restores the fresh dump into a scratch DB
  and verifies row counts before declaring success (see log `/var/log/backups/chase-backup.log`).
- **Restore procedure** (from an encrypted dump):
  ```bash
  openssl enc -d -aes-256-cbc -pbkdf2 -in chase_YYYYMMDD.dump.enc -out chase.dump -pass pass:<backup passphrase>
  docker cp chase.dump chase-postgres:/tmp/
  docker exec chase-postgres pg_restore -U chase -d chase_homepath --clean --if-exists /tmp/chase.dump
  ```
  Uploads: untar into the `deploy_chase_uploads` volume via a throwaway container.

## Deploys
- CI (GitHub Actions) runs lint + migrations + full test suite on every push/PR to `main` — do not deploy red builds.
- From sandbox: tar repo (exclude .git/node_modules) → scp → extract in `/opt/chasehomepath` →
  `TMPDIR=$HOME/tmp docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --build`
  → run new migrations (`docker exec chase-api node src/db/migrate.js` runs automatically on boot) → e2e smoke.
- No sudo needed: `viktor` owns `/opt/chasehomepath` and is in the `docker` group.

## Security posture
- API: helmet, strict CORS allowlist, express-rate-limit on credential endpoints (30/15min/IP),
  bcrypt passwords, AES-256-GCM field encryption, JWT access+refresh, staff TOTP MFA enforced
  (`REQUIRE_STAFF_MFA=true`), immutable `audit_log` written in-transaction.
- Edge: HSTS + CSP + X-Frame-Options/nosniff/referrer/permissions policies on the host vhost.
- Dependency policy: `npm audit` on every CI run surfaces new advisories; patch/minor updates
  applied at next deploy; major upgrades (e.g. react-router v7) only in a planned maintenance window.
- Secrets rotation: rotate `.env` secrets quarterly or on staff departure (see breach steps above).
