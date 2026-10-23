# Administration validation — 23 October 2026

## Environment and boundaries

Browser journeys exercised the real Next frontend, Nest API, PostgreSQL and private
filesystem storage together: `http://localhost:3400` for the public site,
`http://admin.localhost:3400/admin` for staff, API on port 3401. PostgreSQL 17 ran in
the dedicated local `ticket-admin-test-db` container on `127.0.0.1:55439`.
Ngrok and the deployed staging site were not used to validate these changes.

All identities, business documents, purchases and money used here were disposable
test fixtures. Payment/refund and outbound email/Telegram adapters were fake/mock;
no real customer messages, charges, refunds or transfers were initiated. The browser
fixture is guarded to local test databases and requires an explicit test password.
No default production credentials are included. Environment files, secret values,
MFA/recovery material and raw database dumps are not in this evidence directory.

Initial launches using the default environment or restricted sandbox failed schema
or local-network checks. These attempts are excluded from passing counts.
Subsequent runs set an explicit `ENV_FILE` and disposable `DATABASE_URL`; database
suites were rerun with local network access. Staff integration runs separately from
the public catalogue regression because its immutable audit/test fixtures persist.

## Automated results

| Check | Result | Scope |
| --- | --- | --- |
| Staff integration + security | **24 passed** | 21 real-DB/Nest tests and three pure encryption/cookie/config tests. |
| Regular API regression | **294 passed, 89 skipped** | 66 files passed; opt-in integration suites reported separately below. |
| Expanded API, event-creation DB enabled | **349 passed, 2 failed, 32 skipped** | Both failures are video fixtures invoking missing `ffmpeg` (`ENOENT`), not administration assertions. |
| Web tests | **101 passed** | 28 bundled Node test files, including admin host/proxy and existing public UI helpers. |
| Shared types | **76 passed** | Schema, snapshot and domain contract tests. |
| Config | **8 passed** | Existing configuration suite. |
| Database | **5 passed + 12 passed** | Database/QR tests and Node backfill-plan helpers; isolated fixtures, no development seed. |
| TypeScript | **Passed** | Config, shared types, database, API, web and bot. |
| Lint | **Passed** | `oxlint apps packages`; no diagnostics. |
| API build | **Passed** | `tsc -p apps/api/tsconfig.build.json`. |
| Production web build | **Passed** | Next 16.3.4, webpack, inert HTTPS preview API configuration; admin/BFF routes included. |
| Prisma schema | **Passed** | `prisma validate`. |
| Compose/Caddy | **Passed** | Configuration-only validation; isolated no-network Caddy container; no deployment. Caddy reports only its formatting advisory. |
| Diff whitespace | **Passed** | `git diff --check`. |

Counts overlap between regular/expanded API runs; they must not be added together.
The 32 expanded skips include separately run staff tests and opt-in backfill
workflows. PostgreSQL tests emit an existing pg concurrent-query deprecation warning.

The two blocked video cases in `creation-drafts/draft-media.spec.ts` are:

- “decodes MP4/WebM, generates posters and forbids video as Main”.
- “rejects decoded video duration limits and reports absent processors honestly”.

They require FFmpeg/ffprobe on the test host. The current deployment Dockerfile
installs them, but the older local `ticketron-demo:verify` image does not. No newly
built deployment image or live VM substituted for these missing checks.

## Security and operational coverage

The staff suite verifies public/legacy-admin token rejection, gateway and CSRF,
Support-versus-Moderator authorization, last-Moderator safety, invitation expiration
and single use, mandatory/encrypted MFA, one-use recovery codes, password recovery,
session expiry, role/credential changes, MFA replacement and immediate revocation.

Support tests cover independent customer/organizer cases, sender spoofing rejection,
private internal notes, closed-case reopening, anonymous validated order capability,
attachment ownership, paginated linked order-chat inspection and access auditing.
Verification tests preserve versions/change requests/resubmission, protect documents
from Support and other users, reject forged/active documents, and remove public
approval after revocation. Public results omit private registration/documents.

Order tests cover full and identifiable partial refunds, original QR preservation,
concurrent and repeated requests, used/legacy bundle limits, provider failure and
ambiguous processing, duplicate/delayed payment callbacks and refund reservation
against scans/cancellation. Email and Telegram resend tests use fake transports with
the actual durable delivery services, stable keys and original QR tokens. Direct
sales restrictions are tested while existing purchases/support remain accessible.

Finance tests separate currencies and mock money, preserve unknown historical fees,
account for refunds in their actual completion period, deduplicate external payout
records, audit reversals, protect CSV cells and reject audit updates/deletes.

## Browser evidence

These are actual local frontend/backend/database screens, not fixture-only UI
mockups. Sessions used disposable identities, real sign-in and mandatory MFA.
Staff invitation/reset delivery was verified automatically with a fake email
transport, not by sending email from the browser.

| Journey | Evidence |
| --- | --- |
| Organizer contacts TICKET; staff replies and adds a separate private note | [Staff conversation](screenshots/staff-support.jpg), [organizer without internal note](screenshots/organizer-support.jpg) |
| Independent customer conversation on phone layout | [Customer mobile](screenshots/customer-support-mobile.jpg) |
| Organizer uploads a PDF, submits, receives changes, resubmits and is approved | [Pending](screenshots/verification-pending.jpg), [moderator/version history](screenshots/moderator-verification.jpg), [organizer approval](screenshots/organizer-verified.jpg) |
| Public badge approval and revocation | [Approved event](screenshots/public-verified-badge.jpg), [revoked event](screenshots/public-badge-revoked.jpg) |
| Exact partial refund through mock provider | [Confirmation](screenshots/partial-refund-confirmation.jpg), [one refunded and one active admission](screenshots/partial-refund-result.jpg) |
| Separate mock-money financial reporting | [Finance](screenshots/finance-mock.jpg) |
| Responsive staff navigation/conversation | [Staff mobile](screenshots/staff-support-mobile.jpg) |

The browser partial refund returned 200,000 of 400,000 KZT minor units (2,000 of
4,000 KZT), leaving the other admission active. This was a mock; no funds moved.
After the phone check found overflow, navigation/table sizing was corrected; DOM
measurements were viewport 390 px and document width 390 px. Temporary device
overrides were reset. Earlier screenshots precede final minor Russian date/status
formatting corrections; `staff-support.jpg` was refreshed after those corrections.
No screenshots contain production personal documents or secrets.

## Migration rehearsal

1. Applied all **54** migrations to a fresh disposable PostgreSQL database.
2. Created a second database using only the 51 pre-administration migrations.
3. Added synthetic historical users (including legacy public `admin`), a paid
   order/payment, accepted terms/snapshot and an active ticket/QR.
4. Took a real `pg_dump -Fc`, restored it to a new isolated copy, then applied the
   three new forward migrations to that restored copy.
5. Compared IDs, roles, amounts/currencies, payment reference/state, terms timestamp,
   snapshot checksum and QR checksum before/after: **identical**.
6. Confirmed no staff accounts were created/promoted and historical commission
   stayed null. Staff integration against the upgraded copy passed.

This is a dump/restore rehearsal with **synthetic historical data**, not production
personal data. A release operator should repeat backup/restore checks for the actual
VM and private volume before switching traffic.

## Reproduction

Use a fully migrated disposable local database and explicit non-production env
file. Do not substitute the live database or run production seeds.

```sh
# From apps/api; TEST_DATABASE_URL must point to local /ticket_admin_test…
ENV_FILE=/absolute/path/to/test.env DATABASE_URL="$TEST_DATABASE_URL" STAFF_DATABASE_TEST=true node_modules/.bin/vitest run src/staff/staff.integration.spec.ts src/staff/staff-security.spec.ts

# Separate clean disposable database for regular regressions.
ENV_FILE=/absolute/path/to/test.env DATABASE_URL="$REGRESSION_DATABASE_URL" STAFF_DATABASE_TEST=false node_modules/.bin/vitest run

# Optional broader suite; DB name must satisfy the event-creation guard.
ENV_FILE=/absolute/path/to/test.env DATABASE_URL="$EVENT_TEST_DATABASE_URL" EVENT_CREATION_DB_TEST=true STAFF_DATABASE_TEST=false node_modules/.bin/vitest run
```

Web tests use an esbuild ESM bundle because workspace import-only exports and
Next's Node specifiers cannot be loaded by the repository's raw Node test command.
Use [run-web-tests.mjs](run-web-tests.mjs) from repo root:

```sh
node docs/admin-panel/run-web-tests.mjs
node --test apps/web/.next-admin-unit/lib/*.spec.mjs apps/web/.next-admin-unit/proxy.spec.mjs
```

Use existing package `typecheck`, `test`, `build` and Prisma commands for other
checks. Production web build used `TICKET_NEXT_DIST_DIR=.next-admin-final` and
`NEXT_PUBLIC_API_URL=https://preview.ticket.invalid`; this inert URL is not a
deployed backend. The local browser/API environment used HTTP localhost.

## Remaining external verification

- A real payment adapter, partial-refund capabilities/fees/disputes and bank
  reconciliation are not present; mock tests do not establish live settlement correctness.
- Actual invitation/recovery and ticket email/Telegram delivery need configured
  credentials and separately authorized test recipients.
- Admin DNS/TLS and VM deployment, persistent-volume ownership, real backup/restore
  and production host/cookie checks remain release steps. No VM deployment was performed.
- PDF checks are not antivirus or a full sandbox. Storage protections and the
  scanning limitation are in [README.md](README.md).

## Release follow-up — 24 October 2026

Corrected the transactional notification scheduler to respect its enable flag in
production as well as development/test. Compose now reads the flag from `.env.demo`
instead of hardcoding it. Four lifecycle regression cases verify disabled startup,
enabled immediate/periodic execution and shutdown in both production and test modes.
This setting governs automatic scheduling, not Telegram identity/bot linking or
already queued/manual delivery.
The staging environment example enables the scheduler, as requested, for real
Telegram-account testing after deployment. Git publication does not alter the VM.
