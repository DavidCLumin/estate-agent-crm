# RUNBOOK

## Repository Overview

Monorepo layout:
- `/Users/davidcasey/Documents/Codex /Estate Agent CRM/apps/mobile` Expo React Native app (expo-router)
- `/Users/davidcasey/Documents/Codex /Estate Agent CRM/apps/admin` Next.js admin app
- `/Users/davidcasey/Documents/Codex /Estate Agent CRM/packages/api` Fastify API
- `/Users/davidcasey/Documents/Codex /Estate Agent CRM/packages/db` Prisma schema, migrations, seed
- `/Users/davidcasey/Documents/Codex /Estate Agent CRM/packages/ui` shared RN UI components
- `/Users/davidcasey/Documents/Codex /Estate Agent CRM/packages/shared` shared zod/types

## Feature Surface Map (from code)

### Mobile routes (`apps/mobile/app`)
- `/login`
- `/(tabs)/index` (tab root)
- `/(tabs)/properties`
- `/(tabs)/property/[id]`
- `/(tabs)/appointments`
- `/(tabs)/messages`
- `/(tabs)/thread/[propertyId]`
- `/(tabs)/leads`
- `/(tabs)/reminders`
- `/(tabs)/profile`

### Admin routes (`apps/admin/src/app`)
- `/`
- `/login`
- `/properties`
- `/appointments`
- `/bids`
- `/users`
- `/audit`
- `/branding`
- `/settings`
- `/buyers`
- `/super-admin`

### API route groups (`packages/api/src/modules`)
- `auth`: register, verify-email, login, refresh
- `users`: profile, buyer docs, uploads
- `properties`: list/create/update/delete/publish
- `bids`: place/list/close bidding
- `appointments`: list/request/approve/decline/complete/ics export
- `messages`: threads, property messages, mark read
- `leads`: leads CRUD-ish, notes, reminders
- `tenants`: branding, super-admin tenant management
- `tenants`: branding + tenant settings (test mode + email template subjects)
- `audit`: audit logs + GDPR endpoints

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop
- Xcode + iOS Simulator (for mobile iOS)

## Environment Setup

From repo root `/Users/davidcasey/Documents/Codex /Estate Agent CRM`:

```bash
cp .env.example .env
cp packages/api/.env.example packages/api/.env
cp packages/db/.env.example packages/db/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Required key values:
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/estate_crm?schema=public`
- `EXPO_PUBLIC_API_URL=http://127.0.0.1:4000` (iOS simulator local API)
- `EXPO_PUBLIC_DEFAULT_TENANT_KEY=acme`
- API beta defaults:
  - `EMAIL_DELIVERY_MODE=stub`
  - `BID_RATE_LIMIT_MAX=20`
  - `BID_RATE_LIMIT_WINDOW=1 minute`

## Install + Database Bootstrap

```bash
docker compose up -d
pnpm install
pnpm db:generate
pnpm --filter @estate/db db:push
pnpm db:rls
pnpm db:seed
```

## Run Modes

### Full workspace
```bash
pnpm dev
```

### Mobile + API only (recommended for feature QA)
```bash
pnpm dev:mobile-api
```

### Individual processes
```bash
pnpm --filter @estate/api dev
pnpm --filter @estate/admin dev
pnpm --filter @estate/mobile dev
```

## Build / Typecheck / Tests

From repo root:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Package-targeted:

```bash
pnpm --filter @estate/api typecheck
pnpm --filter @estate/mobile typecheck
pnpm --filter @estate/api test
pnpm --filter @estate/mobile test
```

## Production Hardening

### Secrets and env

- Do not commit real production secrets.
- Use:
  - `/Users/davidcasey/Documents/Codex /Estate Agent CRM/packages/api/.env.production.example`
  - `/Users/davidcasey/Documents/Codex /Estate Agent CRM/apps/mobile/.env.production.example`
  - `/Users/davidcasey/Documents/Codex /Estate Agent CRM/apps/admin/.env.production.example`
- Generate strong values:
  - `JWT_ACCESS_SECRET` (>=64 chars)
  - `JWT_REFRESH_SECRET` (>=64 chars)
  - `BID_HASH_SECRET` (>=32 chars)
- Configure email mode:
  - beta-safe default: `EMAIL_DELIVERY_MODE=stub` (logs to server output)
  - production SMTP: `EMAIL_DELIVERY_MODE=smtp` + `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS`

### API protections enabled

- Global rate limit: `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW`
- Login-specific rate limit: `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW`
- Client error ingest limit: `CLIENT_ERROR_RATE_LIMIT_MAX` / `CLIENT_ERROR_RATE_LIMIT_WINDOW`
- Bid submit limit: `BID_RATE_LIMIT_MAX` / `BID_RATE_LIMIT_WINDOW`
- Structured logging with redaction:
  - `authorization` and `cookie` headers are redacted
- Health endpoints:
  - `GET /health/live`
  - `GET /health/ready` (includes DB readiness)

### Mobile runtime crash reporting

- Mobile `ErrorBoundary` posts runtime errors to:
  - `POST /client-errors`
- Endpoint is authenticated and rate-limited.
- To validate quickly:

```bash
curl -i http://127.0.0.1:4000/health/live
curl -i http://127.0.0.1:4000/health/ready
```

## Mobile Dev Client Workflow

1. Build and run iOS app from Xcode (`apps/mobile/ios/EstateCRM.xcworkspace`) or:
```bash
pnpm --filter @estate/mobile ios
```
2. Start Metro in `apps/mobile`:
```bash
npx expo start --dev-client -c
```
3. In Metro terminal ensure it says:
- `Using development build`
- Do not press `s` (that switches to Expo Go)
4. In simulator, open dev menu and reload if needed.

## Seed Credentials

- `super@estate.local` / `Passw0rd!`
- `admin@acme.local` / `Passw0rd!`
- `agent@acme.local` / `Passw0rd!`
- `buyer@acme.local` / `Passw0rd!`

## Staging Deploy (Private Beta)

Target topology:
- API + Postgres on Render/Railway
- Admin panel on Vercel (or Render static)
- Mobile via Expo EAS internal/TestFlight

### 1) Deploy API + DB

Set API env vars:
- `NODE_ENV=production`
- `DATABASE_URL=<managed-postgres-url>`
- `JWT_ACCESS_SECRET=<strong-secret>`
- `JWT_REFRESH_SECRET=<strong-secret>`
- `BID_HASH_SECRET=<strong-secret>`
- `CORS_ORIGIN=<admin-domain>,<mobile-dev-url-if-needed>`
- `EMAIL_DELIVERY_MODE=stub` (or `smtp` + SMTP vars)

Run migrations + seed once:
```bash
pnpm --filter @estate/db db:push
pnpm db:seed
```

### 2) Deploy Admin (Next.js)

Set:
- `NEXT_PUBLIC_API_URL=https://<api-domain>`

Deploy:
```bash
pnpm --filter @estate/admin build
```

### 3) Mobile beta distribution (EAS)

In `apps/mobile/.env.production`:
- `EXPO_PUBLIC_API_URL=https://<api-domain>`
- `EXPO_PUBLIC_DEFAULT_TENANT_KEY=acme`

Build/distribute:
```bash
cd "/Users/davidcasey/Documents/Codex /Estate Agent CRM/apps/mobile"
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

Invite up to 10 testers:
- iOS: TestFlight internal testers
- Android: Play internal testing track (or direct APK/AAB internal share)

## Tester Onboarding

1. Seed/reset environment (`pnpm db:seed`) if needed.
2. Create agent and buyer users in admin `/users`.
3. Verify tenant branding/settings in `/branding` + `/settings`.
4. Share tester credentials securely.
5. Have testers run `QA_CHECKLIST.md` core flows.

## Quick API Smoke Checks

```bash
curl -i http://127.0.0.1:4000/

curl -X POST http://127.0.0.1:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"agent@acme.local","password":"Passw0rd!"}'
```

Publish flow smoke (scripted):
- login as agent
- create draft
- publish draft via `POST /properties/:id/publish`

## Release Sanity Run (Seeded Clean Data)

Run from repo root:

```bash
docker compose up -d
pnpm install
pnpm --filter @estate/db db:push
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Then run full API smoke (login/create/publish/bid/lifecycle/delete guard) using the script in:
- `/Users/davidcasey/Documents/Codex /Estate Agent CRM/QA_CHECKLIST.md` section `API End-to-End Smoke (deterministic)`.

## Monitoring + Rollback Readiness

### Monitoring signals

- API health:
  - `/health/live` should return 200
  - `/health/ready` should return 200
- Runtime error ingest:
  - track server logs for `Client runtime error reported`
- Bid/publish/lifecycle failures:
  - monitor 4xx/5xx in API logs by route

### Quick rollback / hotfix process

1. Keep one known-good build artifact for API/mobile/admin.
2. If release incident occurs:
   - Roll API to last known-good artifact.
   - Repoint mobile/admin API URL to stable API if needed.
3. Apply targeted hotfix in a new branch (`codex/<hotfix-name>` in git-backed repo).
4. Re-run:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - API deterministic smoke from `QA_CHECKLIST.md`
5. Redeploy and verify:
   - `/health/live`
   - `/health/ready`
   - buyer bid submit
   - agent lifecycle transition
   - admin delete guard

## Troubleshooting

- If `EADDRINUSE :4000`: another API process already running.
- If mobile says cannot reach API: verify `EXPO_PUBLIC_API_URL` and API process.
- If Metro module resolution fails: restart with cache clear:
```bash
npx expo start --dev-client -c
```
- If stale iOS native state persists: clean build folder in Xcode and relaunch app.
