# Audit finding fixes — 2026-11-08

The five previously reported findings were rechecked against the current working tree. All remained applicable. A4, originally suspected, was reproduced with controlled PostgreSQL transactions. Existing unrelated working-tree changes were preserved.

## Changes

| Finding | Resulting behavior | Main implementation |
| --- | --- | --- |
| A1: ticket email route | `/ticket-email/*` reaches the API through the public web origin, including access and both QR endpoints. | `apps/web/next.config.ts` |
| A2: partially cancelled unpaid checkout | An unpaid multi-ticket checkout cannot be partially cancelled while its payment link retains the original total. An unpaid single-ticket checkout can still be cancelled. Settlement rejects ticket selections that have already changed; incoming success callbacks for such old records require payment review and issue no tickets. | `apps/api/src/booking/booking.service.ts` |
| A3: admitted table resale | A table booking cannot be cancelled once any child ticket is used or refunded. Admission therefore cannot release its consumed allocations or reopen the table. | `apps/api/src/booking/booking.service.ts` |
| A4: stale cancellation state | Order and table locks precede the authoritative cancellation read. Waiting cancellation observes admission, payment settlement and prior cancellation committed by another transaction. | `apps/api/src/booking/booking.service.ts` |
| A5: shared proxy rate bucket | The API trusts only the configured number of proxies; Express resolves the client address before rate limiting. Direct API configuration defaults to zero trusted hops; `.env.example` specifies one for local Next.js and demo Compose specifies two for Caddy plus Next.js. | `apps/api/src/http-proxy.ts`, `apps/api/src/main.ts`, `packages/config/src/index.ts`, `compose.demo.yml` |

The A2 restriction deliberately preserves the original payment amount rather than changing an order behind an already-created provider link. A buyer changing an unpaid multi-ticket selection must let that checkout expire and create a fresh one. Paid-ticket cancellation and single-ticket unpaid cancellation retain their existing behavior.

Proxy trust requires private API ports and a fixed proxy chain. Caddy must discard untrusted incoming forwarding headers. The configured hop count must be reconsidered if an ingress or direct public API route is added. Existing local `.env` files need `API_TRUST_PROXY_HOPS=1` when browsers use Next.js as their sole API proxy. Demo Compose supplies `2` explicitly. Rebuild the web application and restart/redeploy the API to activate configuration changes; no deployment was performed here.

## Evidence

A fresh PostgreSQL 17 container was created with temporary database storage and a dynamically assigned localhost port. All 55 repository migrations applied successfully. Tests used an explicit `ENV_FILE` pointing to a nonexistent file and the disposable database URL. The new integration suite additionally requires `AUDIT_TEST_DATABASE_URL` to equal `DATABASE_URL`, target localhost, and name the `ticketron_audit` database. No normal application database was used.

`apps/api/src/booking/cancellation-regression.spec.ts` verifies:

1. Partial cancellation cannot change an unpaid multi-ticket selection or overstate sold inventory.
2. A single-ticket unpaid cancellation still releases inventory and prevents settlement.
3. A historical partially cancelled selection cannot settle; its success callback is quarantined for review, including duplicate callback handling.
4. Individual admission prevents table cancellation and inventory release.
5. Group admission prevents table cancellation and inventory release.
6. Admission committed while ticket cancellation waits cannot be overwritten.
7. Settlement committed while cancellation waits retains paid history and creates the refund request.
8. Admission committed while table cancellation waits keeps the table booked.
9. A prior booking cancellation committed during the wait cannot cause a table to reopen.
10. Two simultaneous cancellations with distinct request keys decrement sold inventory once.

Interleavings use an actual PostgreSQL order advisory lock and Prisma query hooks to signal completion of the first read. They do not depend on timing sleeps. A temporary copy with only the booking fixes removed failed 8 of the original 9 tests, including the admission overwrite, missing refund flag, reopened table, and negative-inventory constraint failure. All 10 current tests pass with the fixes.

Verification completed:

- 49 API tests across cancellation regressions, existing booking, numbered seating, organizer refunds, scanning, payment service/controller, auth guards, sensitive rate guard and proxy address handling.
- 9 shared environment configuration tests.
- 1 web rewrite regression covering access and both QR route forms.
- API application and build TypeScript checks, web TypeScript check, config TypeScript check, focused lint and `git diff --check`.

The test runs emitted the existing pg concurrent-query deprecation warning. No tests failed. The disposable PostgreSQL container was removed after validation.

To rerun the new database suite, provision a disposable migrated `ticketron_audit` database on `127.0.0.1`, then run from `apps/api` with explicit environment variables:

```sh
ENV_FILE=/private/tmp/ticketron-audit-no-env \
DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/ticketron_audit?schema=public' \
AUDIT_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/ticketron_audit?schema=public' \
./node_modules/.bin/vitest run src/booking/cancellation-regression.spec.ts
```

## Limits

This work fixes the five reported code/configuration issues; it does not complete the broader repository audit. No live records were inspected or repaired. Previously inconsistent paid orders/counters may still require a separately scoped reconciliation. Email-provider delivery, a deployed Caddy/Next/API smoke test, full browser flows, and real payment/refund integrations were not exercised.
