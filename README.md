# Estate Agent CRM Monorepo

Production-grade multi-tenant scaffold:
- `apps/mobile` Expo + expo-router iOS-first app
- `apps/admin` Next.js admin dashboard
- `packages/api` Fastify API (TypeScript strict)
- `packages/db` Prisma + PostgreSQL schema, migration, seed
- `packages/ui` shared tokens/components
- `packages/shared` shared zod schemas/types

## Local Setup

1. Install prerequisites:
   - Node.js 20+
   - Docker
   - pnpm 9+

2. Start Postgres:

```bash
docker compose up -d
```

3. Create env files:

```bash
cp .env.example .env
cp packages/api/.env.example packages/api/.env
cp packages/db/.env.example packages/db/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

4. Install dependencies:

```bash
pnpm install
```

5. Generate Prisma client and apply schema:

```bash
pnpm db:generate
pnpm --filter @estate/db db:push
```

6. Apply RLS SQL migration:

```bash
pnpm db:rls
```

7. Seed demo data:

```bash
pnpm db:seed
```

8. Run API + admin + mobile together:

```bash
pnpm dev
```

### Mobile + API (iOS Simulator focused)

Use this flow when working on login/mobile without admin noise.

1. Start database:

```bash
docker compose up -d
```

2. Install/update dependencies:

```bash
pnpm install
```

3. Run only API + mobile:

```bash
pnpm dev:mobile-api
```

4. In Expo terminal, press `i` to open iOS Simulator.

5. In mobile app, login with:
   - Email: `buyer@acme.local`
   - Password: `Passw0rd!`

6. Success criteria:
   - Login screen shows no red error.
   - App routes to tabs (`Properties`, `Appointments`, `Messages`, `Profile`).
   - Properties screen renders without crashing.

Troubleshooting:
- If prompted `Use port 8083 instead?` and you already have Expo running on `8081`, answer `n` and use the existing Expo window.
- If login says `Cannot reach API...`, verify:
  - `packages/api` is running (or `pnpm dev:mobile-api` is active)
  - `apps/mobile/.env` points to reachable API host for simulator (`EXPO_PUBLIC_API_URL=http://192.168.1.23:4000` for this machine)
- If login says `Invalid credentials`, re-run `pnpm db:seed`.
- If login says `Email not verified`, re-run `pnpm db:seed` (seeded users should be verified).

9. Individual apps:

```bash
pnpm --filter @estate/api dev
pnpm --filter @estate/admin dev
pnpm --filter @estate/mobile dev
```

## Seed Credentials

- Super Admin: `super@estate.local` / `Passw0rd!`
- Tenant Admin: `admin@acme.local` / `Passw0rd!`
- Agent: `agent@acme.local` / `Passw0rd!`
- Buyer: `buyer@acme.local` / `Passw0rd!`

Seed prints the `tenantId` for `acme` in console output.

## API Examples

### Login

```bash
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acme.local","password":"Passw0rd!","tenantId":"<TENANT_ID>"}'
```

### Create Property

```bash
curl -X POST http://localhost:4000/properties \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'X-Tenant-Id: <TENANT_ID>' \
  -H 'Content-Type: application/json' \
  -d '{
    "title":"4 Bed Semi Detached",
    "address":"21 Orchard Lane, Dublin",
    "description":"Renovated family home",
    "priceGuide":520000,
    "status":"DRAFT",
    "biddingMode":"OPEN",
    "minIncrement":2000
  }'
```

### Submit Bid

```bash
curl -X POST http://localhost:4000/properties/<PROPERTY_ID>/bids \
  -H 'Authorization: Bearer <BUYER_ACCESS_TOKEN>' \
  -H 'X-Tenant-Id: <TENANT_ID>' \
  -H 'Content-Type: application/json' \
  -d '{"amount": 530000}'
```

### Request Appointment

```bash
curl -X POST http://localhost:4000/appointments/request \
  -H 'Authorization: Bearer <BUYER_ACCESS_TOKEN>' \
  -H 'X-Tenant-Id: <TENANT_ID>' \
  -H 'Content-Type: application/json' \
  -d '{
    "propertyId":"<PROPERTY_ID>",
    "preferredStart":"2026-02-20T18:00:00.000Z",
    "preferredEnd":"2026-02-20T18:30:00.000Z"
  }'
```

### Buyer Bid View (OPEN mode returns highest + masked history)

```bash
curl -X GET http://localhost:4000/properties/<PROPERTY_ID>/bids \
  -H 'Authorization: Bearer <BUYER_ACCESS_TOKEN>' \
  -H 'X-Tenant-Id: <TENANT_ID>'
```

### Audit Logs

```bash
curl -X GET 'http://localhost:4000/audit-logs?action=BID_SUBMITTED' \
  -H 'Authorization: Bearer <ADMIN_ACCESS_TOKEN>' \
  -H 'X-Tenant-Id: <TENANT_ID>'
```

## Tests

```bash
pnpm --filter @estate/api test
```
