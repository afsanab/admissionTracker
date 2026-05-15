# CareTrack — Nursing Home Admissions & Task Management

CareTrack is a HIPAA-aware clinical workflow tool that streamlines patient
admissions tracking and physician task management across one or more
skilled nursing facilities. The current code is a full-stack application:
a Node + Postgres backend (`caretrack-backend/`) and a React + Vite SPA
(`admissions-app/`).

> **Status:** functional end-to-end, with the security, audit, and
> operational hardening required by HIPAA implemented in code. The remaining
> production blockers are organizational (BAAs, risk analysis, infra
> provisioning) and are tracked in [`PROD_READINESS.md`](./PROD_READINESS.md).

---

## Repo layout

```
admissionTracker/
├── admissions-app/        # React 19 + Vite SPA
├── caretrack-backend/     # Node + Express + Postgres API
├── .github/workflows/     # CI (lint + test + build + audit)
└── README.md
```

Each package is independent. The frontend talks to the backend over `/api`
(via Vite's dev proxy locally; via `VITE_API_BASE` in production builds).

---

## Quick start

Prereqs: Node 20.19+ (or current Node 22 LTS), Postgres 15+ (or any managed Postgres).

```bash
# 1) Backend
cd caretrack-backend
npm install
cp .env.example .env          # DATABASE_URL, JWT_SECRET, SEED_DEMO_PASSWORD (for seed only)
npm run migrate
npm run seed                   # optional: demo users + patients
npm run dev                    # http://localhost:3001

# 2) Frontend (separate terminal)
cd admissions-app
npm install
npm run dev                    # http://localhost:5173
```

After `npm run seed`, demo accounts are **dr.smith**, **dr.patel**, **admin**, and **j.garcia**. Set **`SEED_DEMO_PASSWORD`** (≥12 characters) in `caretrack-backend/.env` before seeding; that value is the login password for all of them and is not stored in the repository.

---

## Security model (what the code does today)

- **Authentication:** httpOnly `caretrack_session` cookie carrying a signed
  JWT; CSRF protected by a double-submit `caretrack_csrf` cookie / header.
  No tokens stored in JS-accessible storage.
- **Account lockout:** N failed logins inside a sliding window lock the
  account for a configurable cooldown. Every attempt is logged.
- **Forced password change:** admin-issued password resets flag the account
  with `must_change_password`; the SPA prompts the user immediately.
- **Audit log:** every PHI-touching action and every login attempt is
  written to `audit_log` + `logs/audit.log`. In production, configuring
  `AZURE_STORAGE_CONNECTION_STRING` enables append-only shipping to Azure
  Blob Storage for immutable 7-year retention.
- **Request validation:** every route validates inputs through `zod`
  schemas (`src/schemas.js`); unknown keys are stripped, lengths are
  bounded, types are coerced.
- **DB SSL:** strict SSL with verification by default, with an opt-out
  flag for local dev only.
- **Scheduled jobs:** task generation, audit log retention purge, and
  login-attempts purge run via `node-cron` inside the API process.
- **Idle session timeout:** the SPA warns after 25 min of inactivity and
  signs the user out after a 5 min grace window.

---

## Tech stack

| Layer           | Tech                                                          |
| --------------- | ------------------------------------------------------------- |
| Frontend        | React 19, Vite 7, JS/JSX, inline styles + small `App.css`     |
| Backend         | Node 20.19+, Express 4, Postgres 15+ via `pg`                 |
| Validation      | `zod` (centralised schemas)                                   |
| Security        | `helmet`, `cors`, `express-rate-limit`, `cookie-parser`       |
| Auth            | `bcrypt` (cost 12+), `jsonwebtoken` in httpOnly cookie, CSRF  |
| Audit           | `winston` → local file + Postgres + optional Azure Blob       |
| Scheduling      | `node-cron`                                                   |
| Tests           | `vitest` (+ frontend SPA tests via vitest)                    |
| Target hosting  | Azure App Service + Azure DB for Postgres + Azure Static Web Apps |

---

## CI

`.github/workflows/ci.yml` runs on every push and PR:

- Backend: install → vitest → `npm audit --omit=dev --audit-level=high`
- Frontend: install → eslint → vitest → `vite build` → `npm audit`

Both jobs run against Node 20 and 22.

---

## What still needs you (outside this repo)

See [`PROD_READINESS.md`](./PROD_READINESS.md) for the full pre-launch
checklist. Highlights you can't put in source control:

- Sign a Business Associate Agreement with Microsoft Azure and any other
  vendor that touches PHI.
- Rotate the placeholder secrets and store production values in Azure Key
  Vault. Reference them from App Service settings with
  `@Microsoft.KeyVault(...)` syntax.
- Provision the Azure resources described in `caretrack-backend/README.md`,
  with the App Service and Postgres on a private VNet.
- Stand up MFA (TOTP enrollment + login challenge). The data model leaves
  room for it; the flow is the work to do.
- Document the risk analysis, policies, and training records required by
  §164.308 of the HIPAA Security Rule.
