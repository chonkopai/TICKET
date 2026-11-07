# B1–B3 backend fixes — 2026-11-08

## Fixing plan

1. **B1 — public checkout eligibility.** Exclude internal admission types from generic ticket checkout and reject them again after the inventory lock. Cover authenticated, verified anonymous and cart paths; retain ordinary free registration and legitimate whole-table admissions.
2. **B2 — event lifecycle enforcement.** Resolve settlement's event membership from database relations, take shared event row locks, and reread status. Individual/group scanning uses the same event lock before its authoritative reread. Cancelled/completed events reject admission and QR retrieval. Record incoming money after cancellation as paid but requiring review; release the pending checkout without issuing admissions. Do not rewrite existing paid/refunded history.
3. **B3 — current table ownership.** Staff refund completion takes the table lock before rereading the booking. Release a booked table only for a still-confirmed booking belonging to the refunded order. Scope hold release/expiry to its associated orders; support legacy pending bookings without a hold relation while excluding historical paid bookings.
4. **Verification.** Add isolated PostgreSQL regressions for the original failures and controlled cancellation/resale interleavings. Run affected booking, payment, refund, table, scanning and anonymous-flow tests, source/build typechecks and focused lint. Verify that the new tests fail against a temporary copy of the pre-fix sources, without reverting the real working tree.

## Implementation

- Generic ticket checkout excludes `isInternal`; the reservation service validates it after its ticket-type lock.
- `events/event-lifecycle-lock.ts` coordinates settlement/scanning with organizer and staff event changes using `FOR SHARE`. Order event membership includes tickets, reservations, tables, allocations and historical deposits. Multiple events lock in sorted order.
- Success callbacks for unavailable events preserve the paid payment attempt and enqueue one `payment.review_required` event with reason `event_not_published`. Pending reservations, table holds and admissions are released/cancelled. Callback replay remains idempotent.
- Both individual and group admission reread event state after their event lock. QR/Wallet endpoints reject non-published events. Existing paid purchases remain financially intact.
- Staff table refunds now use order → table lock order and read booking state after locking. A cancelled historical booking does not release a replacement booking's table.
- Hold cleanup selects the affected order IDs before changing booking status. Bare holds no longer cancel another paid booking's group pass. Existing legacy pending-booking cleanup remains supported.

## Verification results

- **125 tests passed in 14 API suites**, including 16 new PostgreSQL lifecycle regressions, the prior cancellation regressions, checkout/cart/numbered seating, payment callbacks, organizer refunds, staff table refunds, scanning, table holds, anonymous checkout/claims, publication and normalized sale persistence.
- Controlled PostgreSQL interleavings cover cancellation committing while direct settlement, webhook settlement, individual scans and group scans wait; a separate table-lock barrier covers a replacement sale committing before staff refund completion. No timing sleeps are used.
- A temporary copy restored only the six affected pre-fix source/fixture files while preserving the real working tree. **13 of 15 comparable regression cases failed before the fixes; the other two positive controls passed.** The additional concurrent-resale test was excluded from that pre-fix run because it observes the newly introduced booking read before the table lock. All 16 cases pass with the fixes.
- API source and build TypeScript checks passed. Focused lint and `git diff --check` passed.
- All 55 migrations applied successfully to fresh PostgreSQL 17 test databases. Tests used a new container with temporary storage, explicit disposable URLs, a nonexistent `ENV_FILE`, and inert provider credentials. No existing database or external integration was used.
- Initial cleanup failures exposed the append-only staff-audit constraint; the suite now retains those audit/account fixtures until the disposable database is destroyed. Earlier leftover fixtures were discarded by resetting only the test database before the final clean run. A legacy-hold regression also led to preserving pending bookings without `tableHoldId`.
- The existing pg concurrent-query deprecation warning remains. No deployment, schema migration change, production upgrade test or live-data inspection/repair was performed.

## Re-running safely

Provision and migrate a **new disposable** PostgreSQL database named `ticketron_audit` on `127.0.0.1`; do not substitute an ordinary development database. From `apps/api`, run with both URLs explicitly pointing to that database:

```sh
ENV_FILE=/private/tmp/ticketron-no-env \
DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/ticketron_audit?schema=public' \
AUDIT_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/ticketron_audit?schema=public' \
./node_modules/.bin/vitest run src/booking/lifecycle-security-regression.spec.ts
```

Staff audit/account fixture rows are intentionally append-only and disappear when the disposable database is removed. The publication suites use their separate `event_platform_v2_fresh_<digits>` database guard and `EVENT_CREATION_DB_TEST=true`.

Existing records affected by the original defects have not been inspected or repaired. No new database migration is required for these application fixes.
