# QA_CHECKLIST

## Preconditions

- Repo root: `/Users/davidcasey/Documents/Codex /Estate Agent CRM`
- Env files copied from examples.
- Postgres running (`docker compose up -d`).
- DB bootstrapped (`pnpm db:generate && pnpm --filter @estate/db db:push && pnpm db:rls && pnpm db:seed`).

## 1. Automated Baseline Checks

Run these and confirm success:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Expected:
- `typecheck`: all workspace packages pass.
- `test`: API vitest suite passes.
- `build`: shared/db/ui/api/admin build successfully.

## 2. API End-to-End Smoke (deterministic)

Run:

```bash
bash -lc '
set -euo pipefail
base="http://127.0.0.1:4000"

json_get(){ node -e "let d=\"\";process.stdin.on(\"data\",c=>d+=c).on(\"end\",()=>{const obj=JSON.parse(d); const path=process.argv[1].split(\".\"); let cur=obj; for (const p of path){cur=cur?.[p]} process.stdout.write(cur==null?\"\":String(cur));});" "$1"; }

agent_login=$(curl -sS -X POST "$base/auth/login" -H "content-type: application/json" -d "{\"email\":\"agent@acme.local\",\"password\":\"Passw0rd!\"}")
agent_token=$(printf "%s" "$agent_login" | json_get accessToken)

buyer_login=$(curl -sS -X POST "$base/auth/login" -H "content-type: application/json" -d "{\"email\":\"buyer@acme.local\",\"password\":\"Passw0rd!\"}")
buyer_token=$(printf "%s" "$buyer_login" | json_get accessToken)

created=$(curl -sS -X POST "$base/properties" -H "authorization: Bearer $agent_token" -H "content-type: application/json" -d "{\"title\":\"QA Listing\",\"address\":\"10 QA Street\",\"description\":\"QA description\",\"priceGuide\":321000,\"status\":\"DRAFT\",\"biddingMode\":\"OPEN\",\"minIncrement\":1000}")
prop_id=$(printf "%s" "$created" | json_get id)

curl -sS -X PUT "$base/properties/$prop_id" -H "authorization: Bearer $agent_token" -H "content-type: application/json" -d "{\"description\":\"Updated QA description\"}" >/dev/null
published=$(curl -sS -X POST "$base/properties/$prop_id/publish" -H "authorization: Bearer $agent_token")
pub_status=$(printf "%s" "$published" | json_get status)

buyer_props=$(curl -sS -X GET "$base/properties" -H "authorization: Bearer $buyer_token")
buyer_has=$(printf "%s" "$buyer_props" | node -e "let d=\"\";process.stdin.on(\"data\",c=>d+=c).on(\"end\",()=>{const arr=JSON.parse(d); const id=process.argv[1]; process.stdout.write(arr.some(x=>x.id===id&&x.status===\"LIVE\")?\"yes\":\"no\");});" "$prop_id")

printf "published_status=%s buyer_sees_live=%s\n" "$pub_status" "$buyer_has"
'
```

Expected:
- `published_status=LIVE`
- `buyer_sees_live=yes`

## 3. Mobile Manual QA (Expo Dev Client)

### Start services

API:
```bash
pnpm --filter @estate/api dev
```

Metro:
```bash
cd "/Users/davidcasey/Documents/Codex /Estate Agent CRM/apps/mobile"
npx expo start --dev-client -c
```

Expected in Metro terminal:
- shows `Using development build`
- do not switch to Expo Go (`s`)

### Mobile flow checks

1. Login as agent (`agent@acme.local` / `Passw0rd!`).
Expected: lands on tabs with no red screen.

2. Go to Properties tab.
Expected: listings load; create/edit controls visible for agent.

3. Tap `Create New Listing`; enter title/address/description/price; tap `Save as Draft`.
Expected: draft appears in list with `DRAFT` badge.

4. Open that draft property.
Expected: `Listing Actions` card has `Edit Listing` and `Publish Listing`.

5. Edit details and save.
Expected: `Listing updated` message and updated values in header card.

6. Tap `Publish Listing`.
Expected: `Listing published`; status changes to `LIVE`.

7. Login as buyer (`buyer@acme.local` / `Passw0rd!`) and open the same listing.
Expected: buyer can see listing, bid section, and viewing request section.

8. Submit a valid bid.
Expected: success toast/message, no crash, bid snapshot updates immediately (no manual refresh required).

9. Submit the same amount again (not higher than highest).
Expected: validation error is shown and bid is not accepted.

10. Request viewing.
Expected: request submits with success message.

11. Open messages from property and send message.
Expected: message appears in thread; threads list includes property.

12. Agent lifecycle controls on live listing:
Expected: `Sale Agreed` is visible; `Complete` is not visible until listing is under offer.

13. Tap `Sale Agreed`.
Expected: confirmation dialog appears; after confirm, status becomes `UNDER_OFFER`.

14. On `UNDER_OFFER` listing, tap `Complete`.
Expected: confirmation dialog appears; after confirm, status becomes `SOLD`.

15. Verify delete permissions:
Expected: AGENT cannot delete listing; TENANT_ADMIN can delete listing.

16. Minimum-offer confidentiality:
Expected: AGENT/TENANT_ADMIN can see `Minimum offer`; BUYER never sees this field in listing screens.

## 4. Real-Device QA (Physical iPhone)

Goal: confirm no simulator-only false positives and no runtime crash on actual device.

Preconditions:
- iPhone and dev machine on same Wi-Fi.
- API running on host and reachable from phone.
- `apps/mobile/.env`:
  - `EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000`
- Dev client installed on device.

Run:
```bash
cd "/Users/davidcasey/Documents/Codex /Estate Agent CRM/apps/mobile"
npx expo start --dev-client --tunnel -c
```

### Real-device flow A: Buyer bid submit (first priority)

1. Login as buyer.
2. Open a LIVE listing.
3. Submit bid above current highest (and meeting hidden minimum if no bids).
4. Immediately check UI after submit.

Expected:
- No red screen / no crash.
- Submit button disables during request (no double-submit).
- Success message appears.
- Bid snapshot/history updates without manual refresh.

### Real-device flow B: Agent lifecycle

1. Login as agent.
2. Open LIVE listing -> tap `Sale Agreed` and confirm.
3. Verify status becomes `UNDER_OFFER`.
4. Tap `Complete` and confirm.
5. Verify status becomes `SOLD`.

Expected:
- Confirmation dialog shown before action.
- Valid transition only (`LIVE -> UNDER_OFFER -> SOLD`).
- Invalid actions blocked with clear error.

### Real-device flow C: Admin permissions

1. Login as admin.
2. Open property and delete one listing.
3. Login as agent and verify delete is not allowed.
4. Login as buyer and verify delete/status controls are not available.

Expected:
- Admin delete succeeds.
- Agent/buyer delete blocked by UI and API role guards.

## 5. Admin Manual QA (Next.js)

Run:
```bash
pnpm --filter @estate/admin dev
```

Checks:
1. Open app and login.
2. Visit routes: `/properties`, `/appointments`, `/bids`, `/users`, `/branding`, `/settings`, `/audit`, `/buyers`, `/super-admin`.
3. Confirm each page renders and API-backed lists load without crashing.
4. In `/users`:
  - create an AGENT user,
  - deactivate and reactivate a BUYER user.
5. In `/settings`:
  - toggle test mode,
  - edit email template subjects,
  - save and reload page to confirm persistence.
6. In `/properties`:
  - run lifecycle actions (`Publish`, `Sale Agreed`, `Complete`, `Delete`) with confirmation dialogs.
7. In `/appointments`:
  - run `Approve`, `Decline`, `Complete`, and `Cancel`.
8. In `/bids`:
  - load bids for a property,
  - accept an offer,
  - close bidding,
  - export CSV.

## 6. Regression Focus

- No red-screen errors for `RCTSinglelineTextInputView`/`RCTMultilineTextInputView` during listing edit flow.
- No `dispatchCommand` crash after successful bid submit.
- Draft publish does not return generic `Internal server error` for normal agent-owned drafts.
- Buyer cannot bid on non-live properties.
- Buyer bid rules:
  - if no bids exist, bid must meet hidden minimum offer (if configured),
  - if bids exist, bid must exceed current highest offer.
- Lifecycle is enforced as `LIVE -> UNDER_OFFER -> SOLD`, with delete restricted to `TENANT_ADMIN`.

## 7. Final Release Sanity Pass (Seeded Clean Data)

1. Reset to seeded baseline:
```bash
docker compose up -d
pnpm --filter @estate/db db:push
pnpm db:seed
```
2. Run quality gates:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
3. Execute deterministic API smoke in section `2`.
4. Execute:
  - real-device flow A (buyer bid),
  - real-device flow B (agent lifecycle),
  - real-device flow C (admin guards).
5. Mark release candidate only if all steps pass with no crash and no 5xx on core flows.

## 8. API Integration Test Gate

Run:
```bash
pnpm --filter @estate/api test
```

Must cover and pass:
- `POST /properties/:id/bids` behavior (minimum-offer + highest-bid rules).
- `PUT /properties/:id` lifecycle transitions (`LIVE -> UNDER_OFFER -> SOLD`).
- Role guards for status transitions and delete.
