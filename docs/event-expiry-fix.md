# Ended-event registration and catalog fix

Verified locally on 6 November 2026. No staging/production deployment or live-data changes.

The public catalog and checkout paths previously checked publication/inventory
status without checking whether the event had ended. The ticket/account screens
already used a time cutoff, so a visitor could register and immediately receive
an unavailable ticket.

The catalog now excludes ended events before counts, pagination, search and
alternative results. Location choices follow the same filter. Canonical timestamps
are filtered in SQL through Prisma; legacy rows without `startsAt` resolve their
local date/time in the event timezone before entering the paginated query.

New ticket, seat, table and cart checkouts (including anonymous carts), ticket
reservations and table holds reject ended events with HTTP 409 `EVENT_ENDED`.
The cutoff follows the existing shared policy: a valid end time, otherwise the
start time. Overnight events remain open until their end. Idempotent replays and
historical payment settlement retain their existing behavior.

Direct event pages remain readable, with registration replaced by a localized
ended-event message. Seat selection also closes. Open pages update at the cutoff;
the home catalog refetches at the next displayed event's cutoff and when a stale
hidden tab becomes visible. Preview checkout remains read-only.

## Verification

All database tests used a newly created disposable database inside the existing
local test PostgreSQL container. All 55 existing migrations applied successfully;
this fix adds no migration.

- 11 tests: `booking/event-expiry.spec.ts` and
  `public-events/public-events-city-filter.spec.ts`.
- 43 existing tests: booking, public events, catalog priority, tables and ticket types.
- 21 existing anonymous-service tests and 3 anonymous HTTP tests.
- API and web TypeScript checks passed. Web checking required regenerating stale
  Next route types and disabling the stale incremental cache for that run.
- Targeted oxlint and `git diff --check` passed.
- Browser checked against synthetic local event data, including available inventory
  on an ended event: the ended message was shown and no registration control appeared.

The first anonymous HTTP run lacked required environment variables and aborted
during application initialization. A rerun with synthetic test credentials passed.

Example API regression command (use an isolated migrated database and synthetic
configuration in `ENV_FILE`):

```sh
cd apps/api
ENV_FILE=/path/to/private-test.env node node_modules/vitest/vitest.mjs run src/booking/event-expiry.spec.ts src/public-events/public-events-city-filter.spec.ts
```

Release requires updated API and web containers. Git push and VM deployment are
separate from this local verification.
