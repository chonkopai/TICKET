# Event creation v2 — Batch 0 baseline and impact

Completed 2 October 2026 (Asia/Hong_Kong), checkout `e3563b9f094101832ee9cac9860147f4bd7d564d`.

**Batch 0 gate passes for the authorized local target:** affected consumers and migration risks are recorded below, with actual database evidence separated from source findings. This does not resolve the exceptions, authorize deployment, or establish production readiness. Batch 1 has not started.

## Scope and preserved work

Read the [architecture audit](../event-creation-v2-architecture-audit.md), the supplied implementation brief (also saved locally at `docs/event-creation-v2-implementation-prompt.md`, ignored by the existing repository rules), and `docs/design-reference/event-media-upload-reference.png`. Rechecked HEAD, ignored/non-ignored `AGENTS.md` files and the working tree. The only applicable instruction file is `apps/web/AGENTS.md`: installed Next.js guides must be read before future web application changes. This batch makes no web application changes.

The initial working tree contained these untracked user files; their contents were preserved:

- `apps/web/src/app/(auth)/_lib/public-auth.spec.ts`
- `apps/web/src/proxy.spec.ts`
- `docs/event-creation-v2-architecture-audit.md`

The reference has six equal square tiles, outlined white plus placeholders, dark circular remove buttons, Main/position badges and drag guidance. The implementation brief intentionally changes this to five unique upload positions plus a separate larger preview. No responsive/browser verification was performed in this investigation.

## Source inspection: affected consumers

Paths below are relative to the repository. These findings were rechecked against the current checkout, rather than assumed from the earlier audit.

| Area | Concrete consumers / contracts | Current behavior and migration consequence |
| --- | --- | --- |
| Creation entry points | `apps/web/src/components/navbar.tsx`; `apps/web/src/app/organizer/events/page.tsx`; `organizer/events/new/page.tsx`; `organizer/events/[id]/edit/page.tsx` | Desktop/mobile navbar shares role-dependent login/profile/new-event destinations; dashboard quick-start and empty-state links use the old new-event route. All must route into the public draft editor in Batch 8. Owned edit remains protected. |
| Wizard / persistence | `apps/web/src/app/organizer/events/_components/event-form.tsx`, `sales-resources.tsx`, `ticket-types-manager.tsx`, `event-language-editor.tsx` | Six steps inside `ProtectedRoute`. First save creates an ordinary owned Event; text recovery uses `ticket-event-source-draft:*` sessionStorage. Poster Files cannot survive serialized recovery. Publish returns to `/organizer/events?published=1`. Separate language and source state need one draft adapter and revision-aware flush. |
| Browser transport / localization | `apps/web/src/app/(auth)/_lib/api.ts`, `public-auth.ts`, `session.ts`; `apps/web/src/proxy.ts`; `apps/web/next.config.ts`; `apps/web/src/lib/locale.ts` | `apiRequest` requires a session, sends Bearer tokens and refreshes them; `publicAuthRequest` also targets the configured API origin. Neither is an anonymous draft-cookie transport. Current rewrites/proxy bypass `/api`, `/auth`, `/me`, `/orders`, `/media` etc.; add a same-origin draft transport consistently. Existing `safeReturnPath` rejects cross-origin paths, backslashes and control characters; continuation needs an additional allowlist and a protected publication POST. |
| Verified identity / role enrollment | `apps/api/src/auth/{auth,identity-auth,google-auth,verification,token,telegram-link}.service.ts`, `auth.controller.ts`, `auth.guards.ts`; web `(auth)/login/page.tsx` and auth components | Verified contact identity, purpose-bound grants, Google/Telegram verification and refresh-family checks remain authoritative. New registrations are guests. `AuthService.becomeOrganizer` returns current organizers/admins, rejects guests when approval is enabled, otherwise updates their role. Backend authentication reads the current database role; browser `updateSessionUser` must also run after enrollment. No publish-intent continuation exists. |
| Owned event write / lifecycle | `apps/api/src/events/events.controller.ts`, `events.dto.ts`, `events.service.ts`, `events.presenter.ts` | Controller has class-wide JWT and organizer/admin guards. Create/update writes source columns and audit/outbox. Publication uses an Event row lock, completeness/deposit validation and idempotent repeat publication. Incomplete visitors need a separate aggregate/API, not guard removal or placeholder Event/organizer rows. Existing presenter omits `galleryUrls`; account for this compatibility gap during media switching. |
| Public serialization / search | `apps/api/src/public-events/{public-events.service,public-events.dto,public-events.controller}.ts`; `apps/web/src/lib/public-events.ts`; shared `events.ts` | List/search/summary/detail/preview read legacy Event text, EventTranslation, poster, gallery, date/time, payment mode, tickets and tables. Search can match a target translation that is not the version actually displayed; normalize displayed-version selection and search together. Ticket/table localization uses hardcoded label dictionaries, not stable localized inventory content. |
| Public renderers / social metadata | `apps/web/src/app/page.tsx`; `apps/web/src/components/{public-events-browser,guest-event-card,ui}.tsx`; `apps/web/src/app/events/page.tsx`; `apps/web/src/app/events/[id]/{page,event-client,event-copy,checkout-panel}.tsx`; organizer preview page | Ordinary cards use 1.6 aspect ratio; featured cards use `center 25%`; public hero/gallery/social metadata use `posterUrl`. Gallery caps legacy gallery at two assets and fills with reference photos. Program rendering supplies fallback entries. Deposit badges, filters and checkout text are spread across these surfaces. Shared role-specific media/crop renderers must replace all of them. |
| Hall persistence / JSON | `apps/api/src/venue/{venue.service,venue.dto,venue.presenter,hall-editor.persistence}.ts`; `apps/web/src/app/organizer/venue-builder/_components/{hall-studio,hall-state}.tsx/ts`; shared `venue.ts`, `hall-editor.ts` | `VenueLayout.layoutJson` has legacy v1 and v2 projections with optional editor objects/tariffs. Tariffs have stable UUID/name/color/price; descriptions/locales/currency are absent. Objects retain deposit values. Hall persistence hardcodes KZT for tables/rows/seat and zone TicketTypes; UI uses ₸ and decimal multiplication. Preserve object/inventory IDs, undo/geometry/revision behavior and all history/structure locks while introducing a draft adapter and explicit currency. |
| Inventory / holds | `apps/api/src/ticket-types/ticket-types.service.ts`; `tables/tables.service.ts`; `seats/seats.service.ts`; `booking/booking.service.ts`; `venue/hall-editor.persistence.ts` | Ticket inventory and sales-window checks, seat/table advisory locks, layout revisions, reservation expiry and history-based edit restrictions govern sales. Seat types, zone types and internal whole-table admission types must not be misclassified as ordinary general-admission types. Existing hall writes check foreign object IDs before upserts and reject any purchase/allocation history. Whole-table GroupPass behavior must survive. |
| Checkout snapshots / totals | `apps/api/src/booking/{booking.service,booking.dto,checkout-email.service}.ts`; `apps/api/src/orders/anonymous.service.ts`; shared `booking.ts`, `quick.ts` | Ticket/table/seat/cart paths freeze event/item labels, schedule, price, currency, cancellation/deposit terms in unversioned `Order.checkoutSnapshot`. Ordinary price arithmetic multiplies JS numbers; cart/seat paths sum numbers. Deposit mode changes actual charge amounts and writes Deposit records. Introduce versioned snapshots and checked minor-unit totals without changing existing orders or pending terms. |
| Free purchase distinction | `apps/api/src/orders/anonymous.service.ts:132`, `anonymous.service.spec.ts:231`; `apps/api/src/payments/payment.service.ts:28` | Anonymous zero-amount checkout settles internally before provider/payment creation; the existing DB regression asserts no Payment/Deposit. Authenticated `PaymentService.createLink` creates an attempt before checking zero amount. Reusing anonymous behavior alone does not prove all free-registration flows avoid attempts. Batch 6/10 must verify both paths. |
| Payments / callbacks / refunds | `apps/api/src/payments/payment.service.ts`; `apps/api/src/booking/{booking.service,refund.service,payment-provider,checkout-cleanup.service}.ts` | Provider requests occur outside transactions; callbacks validate signatures/amount/currency and deduplicate; settlement locks orders/resources and appends domain events. Refund quote uses actual paid Payment/Order/Deposit history and provider idempotency, releases inventory and invalidates pass/ticket scanning. Preserve exceptional organizer-approved refunds. Current adapter interface exposes no supported-currency capability; only the mock adapter is configured in BookingModule. |
| Buyer history / quick / delivery | `apps/api/src/auth/account.service.ts`; `apps/api/src/my-events/my-events.service.ts`; `apps/api/src/orders/{anonymous,quick-delivery,ticket-email-delivery}.service.ts`; web `account`, `quick`, `quick/status`, `delivery`, `payment/status`; shared `account.ts`, `my-events.ts`, `quick.ts` | History readers mix live event content, typed snapshot assertions and defensive JSON parsing; legacy null/partial snapshots already occur. Frozen destinations and anonymous purchase claim are distinct from creation-draft claims. Delivery reads old payment modes and snapshot date/time/text; retain historical parsers and capabilities. |
| QR / Wallet / bot | `apps/api/src/tickets/tickets.service.ts`; `apps/api/src/wallet/apple-wallet-pass-generator.ts`; `apps/api/src/bot/bot.service.ts`; `apps/bot/src/{api-client,bot,presentation}.ts`; shared `tickets.ts`, `telegram.ts` | Ticket/group-pass IDs, QR secrets, ownership, refunds and use-state remain intact. Bot renders deposit/full-payment amounts and public-event serializers. Wallet consumes issued ticket/event information through ticket services. These need normalized content reads and historical financial semantics, not reissued inventory. |
| Management / analytics / CSV | `apps/api/src/events/events.service.ts`; shared `event-management.ts`; organizer summary/purchases/analytics routes and copy | Management traverses tickets/reservations/allocations/bookings/deposits; analytics separates currency and incomplete settlement/refund history; CSV reads current and frozen data. Migration must preserve these links and meaningful totals, with unresolved legacy events on compatibility paths. |
| Notifications / outbox / export | `apps/api/src/domain-events/domain-events.service.ts`; `apps/api/src/events/{event-notifications,transactional-notifications,marketing-campaign}.service.ts`; `apps/api/src/orders/ticket-email-delivery.service.ts`; bot delivery | Committed lifecycle/payment outbox drives reminders, updates and ticket delivery. Changed-field sets include program/rules/terms/date/time/venue fields. New normalized writes must preserve equivalent behavior and append once. Backfill must not generate historical paid delivery or duplicate publication jobs. |
| Media storage / cleanup | `apps/api/src/events/{object-storage,local-object-storage.service,media.controller,events.service}.ts` | Storage is public `/media/posters/:key`, buffered JPEG/PNG/WebP, magic-byte checks, no decoded-dimension/video pipeline or draft ownership. Replacement removes old objects after commit without the new cross-reference/history model. Private typed draft assets, streaming/quota checks, derivatives/posters and reference-rechecked cleanup are new work. |
| Translation provider | `apps/api/src/events/{event-translations.service,event-translation-content}.ts`; `packages/config/src/index.ts`; `.env.example` | Google v2 uses source hash, manual preservation and late source/manual rechecks; complete content only, whole-object metadata, no ticket/tariff translation. API key is read directly from environment rather than validated config; timeout is present, scoped draft quotas/retry/field caching are absent. Provider responses are not passed through manual-save length validation. No live credential/provider check was performed. |
| Fixtures / tooling / deployment | `packages/database/{seed,verify-seed}.ts`, `src/{seed-data,demo-translations}.ts`; API/database specs; `turbo.json`; `deploy/README.md`, compose files | Seeds/verification assume legacy content, payment modes and seeded IDs. Root test runs database-mutating fixtures against `.env` unless explicitly isolated. Rollout must update these without rewriting applied migrations or seeding an existing target. Deployment/restore evidence remains future work. |

`rg` searches covered TypeScript/TSX and migration SQL for legacy text/media/money fields and `checkoutSnapshot`, `layoutJson`, enum references, constraints, indexes, functions and triggers. Generated clients/build outputs were excluded as derived consumers.

## SQL and JSON safeguards inspected

The schema has source text on Event, target EventTranslation rows keyed by `(eventId, locale)`, optional VenueLayout event ownership, and no creation draft, publish intent, typed media or authoritative localized ticket/tariff tables. Event has separate PostgreSQL date/time and timezone, with no end field or event settlement currency.

Prisma is not the complete constraint definition. Preserve forward-migration SQL including:

- Initial inventory/money checks, VenueLayout owner check, QR uniqueness, and `Booking_one_live_per_table_key` for pending/confirmed bookings.
- `20260903090000_ticketing_engine`: positive reservation quantities/expiry and reservation indexes; application transactions enforce stock alongside checks/indexes.
- `20260903100000_venue_constructor_holds`: `TableHold_one_active_per_table_key`, request-key/expiry and Table hold-field checks.
- `20260903230000_guest_checkout_payment_policy`: deposit/display checks, order snapshots/acceptance and idempotency keys.
- `20260904020000_payment_attempts_webhooks`: provider request/payment uniqueness and webhook-event uniqueness.
- `20260909100000_numbered_seating`: `SeatAllocation_live_seat_key` covers active **and consumed** allocations; GroupPass order/token uniqueness.
- `20260910010000_numeric_seat_numbers`: positive seat numbers and per-parent number uniqueness replace label uniqueness.
- `20260916090000_hall_editor`: changes exact-one seat parent to **at-most-one**, allows zero-seat tables, adds TicketType venueObjectId uniqueness. Do not accidentally restore the earlier checks.
- `20260924010000_refund_requests`: one request per order, request-key uniqueness, restrictive history FKs.
- `20260928040000_ticket_email_delivery`: `OutboxEvent_ticket_email_requested_once` and delivery order/capability uniqueness.
- `20260929050000_event_localizations`: content locale compound primary key.

No user-defined trigger/function creation was found in migration source. Live PostgreSQL confirms **zero non-internal triggers on the inventoried tables**; FK/internal triggers remain. Application advisory/row locks are not database triggers and must also be preserved.

JSON read/write surfaces requiring versioned compatibility: VenueLayout projections/editor/tariffs/objects; Order checkout snapshots (including cart items); guest-contact and anonymous checkout cached responses; idempotency responses; webhook metadata/raw bodies; notification/broadcast payloads; audit metadata and outbox payloads. Never mass-rewrite frozen payment/snapshot JSON to resemble new creation contracts.

## Actual database evidence — local only

The user explicitly selected the configured `localhost:5432/event_platform` target. [Inventory tool](../../packages/database/tools/event-creation-v2-inventory.mjs) connects with server `default_transaction_read_only=on`, starts **REPEATABLE READ READ ONLY**, uses statement/lock/idle timeouts, asserts identity/read-only state, and ends with ROLLBACK. No app services, cleanup workers, provider calls, migrations or seeds run during inventory.

[Machine-readable evidence](batch-0-local-inventory.json) records the final snapshot at **2 October 2026, 18:08:17 Asia/Hong_Kong** (`2026-10-02T10:08:17.457Z`), PostgreSQL **17.11**. It exports counts, IDs, amounts, catalog definitions and hashes; no raw user contact data, auth/QR/capability tokens, localized content, credential values or raw snapshots. Legacy media URLs were not fetched.

| Observation | Actual local evidence | Resolution required before dependent migration/cutover |
| --- | --- | --- |
| Applied migrations | 38 files and 38 applied records; 37 matching file checksums, one mismatch | Initial migration `20260902023000_init_core_schema`: database checksum `b5a3e80e1a58060f7b602ff38ca525a017c58b0558265c8e4c9634a53127d448`, checkout checksum `76944616492dc609a034202c947e664b84594811cdc341c3698d62c08d9e6f1a`. Investigate original applied artifact/schema drift before Batch 2 legacy rehearsal. Do not edit the applied file or checksum record to suppress this. |
| Constraints / indexes | 84 catalog constraints, all validated; 104 indexes, all valid/ready | Preserve definitions, FKs and partial predicates in additive migrations; these counts do not prove full source/schema equivalence. |
| Event lifecycle | 43 events: 15 draft, 24 published, 3 cancelled, 1 completed; all source `ru`; 50 translation rows | Source/target text must converge into one content model while keeping every ID. |
| Unknown ends / media | 43 unknown ends; 15 missing poster references | Keep ends null. Missing media needs explicit organizer review or controlled legacy presentation; do not fabricate roles/assets. |
| Legacy uploads | 78 references unique within their event: 3 managed-looking local poster paths, 75 external/unknown; none over five | All are untyped: decoded readiness/ownership/crops/duration are unknown, including local paths. Preserve trusted references; separately inspect storage without fetching arbitrary URLs. |
| Content limits / completeness | No overlength findings in scanned source/target fields, resource text, hall tariff/object text or conservative description merge. Four source events lack both summary and description (8 field findings) | Preserve source text/provenance; do not silently invent summary/description. Optional locale completeness is separately handled in Batch 1/7. New captions/refund text do not exist yet. |
| Deposit events | 21 deposit-mode events, including 9 published | Inventory affected live resources/orders; keep controlled compatibility sales until an explicit financial transition preserves past promises. No new-deposit write path after Batch 11. |
| Mixed currency | One event: `155d51d8-3b42-46bb-bf3c-a0b2b53be252` | Resolve canonical settlement currency with organizer/business input before new pricing; never relabel old paid amounts. |
| Hybrid modes | 8 candidates with non-internal, non-venueObject ordinary ticket types plus hall resources | Classify actual general/zone/seat/table behavior before selecting mode; keep stable resource IDs and existing history. Candidate query excludes internal/seat-linked/venueObject ticket types. |
| Capacity | One candidate: `edbb2b2e-01f4-4ae9-a619-ac69508f7c74` | Inspect zero-capacity resource semantics; do not guess a finite capacity or delete a structurally locked resource. |
| Active sales / holds | 1,132 active non-internal TicketTypes (includes hall seats/zones). No unexpired active TicketReservations/TableHolds, no pending Orders; one expired reservation still has active status | Status alone does not prove stock is currently buyable; inventory rows include prices, sold/capacity and live reserved counts. Read-only scan does not clean stale holds. Repeat before rollout. |
| Historical allocated seats | 51 active allocations linked to paid orders, 3 consumed allocations linked to paid orders, 4 released | Paid/consumed allocations remain structural/history locks even with no live pending holds. |
| Historical tickets / table passes | 72 tickets: 59 active, 12 cancelled, 1 refunded; 3 expired bookings; 1 cancelled GroupPass | Preserve every ID, QR identity and status; no recreation or cascade deletion. |
| Historical snapshots | 36 orders; 20 have null snapshots, 4 objects lack mode/kind, all snapshot versions absent. 12 orders have no normalized event/resource links; no contradictory snapshot/event links found | Preserve null/partial provenance and defensive readers. Investigate unmapped orders; do not invent event links or accepted refund conditions. |
| Payment discrepancies | Three paid mock Payments are 40,000 KZT minor units each while corresponding paid Orders are 50,000 each | Orders `e282d0a9-e889-476d-ad06-0e473cd83258`, `403c430f-174b-40ae-870e-e52f59414f58`, `af239be3-5364-4936-a76f-70d5c784944e`. Investigate actual history; do not assume fixture provenance or adjust either side. Preserve separately in reconciliation. |
| Other financial checks | No duplicate paid attempts; no deposit/order mismatch; no present snapshot amount/currency mismatch; no RefundRequest rows | Absence of RefundRequests does not mean no refunds: Order/Payment/Ticket already contain refunded states. |
| Hall JSON | 20 layouts: three v1, fifteen v2, two without a version. Fourteen contain deposit keys; one v2 lacks editor objects/tariffs | Template and legacy projected layouts must remain readable; no blanket v2-editor assumption. Version migration preserves raw provenance and stable mappings. |

These observations are **local development data**, not production statistics. Seed-like IDs/provider labels are present but are not proof that every discrepancy is disposable fixture data.

### Frozen money baseline

All sums below are integer minor units, grouped by currency/status. Do not add different currencies together, and do not equate sums of payment attempts with order revenue.

| Table / grouping | Count | Currency | Amount (minor units) |
| --- | ---: | --- | ---: |
| Order: ticket / paid | 17 | KZT | 181854000 |
| Order: ticket / paid | 1 | USD | 50 |
| Order: ticket / refunded | 7 | KZT | 460000 |
| Order: ticket / cancelled | 8 | KZT | 4000000 |
| Order: table / cancelled | 3 | KZT | 34000000 |
| Payment: mock / paid | 6 | KZT | 270000 |
| Payment: seed / paid | 4 | KZT | 181500000 |
| Payment: mock / pending | 10 | KZT | 8000000 |
| Payment: mock / refunded | 6 | KZT | 450000 |
| Deposit: cancelled | 6 | KZT | 32400000 |

Pending Payment rows remain even though no Order is pending; status/history must be interpreted together. Fingerprints in JSON cover content/layout/inventory and Order, Payment, Deposit, RefundRequest, Ticket, Booking, reservations, allocations, GroupPass and TableHold, hashing ordered per-row database digests without exposing raw rows. Order, Payment, Deposit, Ticket, Booking and SeatAllocation fingerprints were compared between the earlier and final inventory snapshots and matched. They establish a comparison baseline, not a backup or a claim that historical inconsistencies are reconciled.

## Baseline checks

| Check | Result / scope |
| --- | --- |
| `pnpm lint` | Pass; existing unused `ArrowIcon` warning at `apps/web/src/app/page.tsx:453`. |
| `pnpm typecheck` | Pass: 9 tasks including dependencies and all six package checks. |
| `pnpm --filter @event-platform/database prisma:validate` | Pass against source schema; no migration applied. |
| `pnpm build` | Pass: all 6 package builds; config/shared builds cached, API/database/bot/web executed. Next.js 16.3.4 compiled and generated pages. This is build evidence, not browser-flow verification. |
| `pnpm --filter @event-platform/shared-types --filter @event-platform/config --filter @event-platform/bot test` | Pass: shared 12, config 5, bot 15 tests (32 total). |
| Selected mocked API suites | Pass: 9 files, 38 tests; 1 opt-in Google database test skipped. Suites: events controller/DTO/translation, public-events controller, booking DTO, auth guards/tokens/Google/Telegram-link. |
| Standalone auth safe-return and proxy tests | Pass: 12 tests, including the two pre-existing untracked specs. |
| Standalone media-free hall, geometry and display currency/rates tests | Pass: 11 tests using native Node test runner; remote rates use test stubs. |
| Countdown | Pass: 4 tests after bundling into an ESM temporary runner. |
| Root `tests/hall-state.spec.ts` | Pass: 5 tests with a temporary Vitest include config; the normal shared package config does not discover it. |
| Full `pnpm test`, database integration suites, `pnpm db:verify` | Not run on this target: API/database specs create/delete rows and some require explicit seeded fixture IDs. No separate seeded test database was selected. This batch preserves read-only target access and does not claim complete integration coverage. |
| Browser/accessibility/provider/restore checks | Not run; belong to later batches. No live Google Translation, sign-in, mail, payment, video processing, restore or rollback claim. |

Total executed assertions: **102 passed, 1 intentionally skipped**. Package scripts alone omit the standalone web/root test files. The first mixed TSX/Node run failed because an import-only workspace package was resolved as CommonJS and a Vitest spec was sent to Node's runner; rerunning with ESM/native Node or Vitest, as appropriate, passed without source changes.

Initial sandboxed pnpm invocations failed pinned-version registry verification; network-authorized reruns verified pnpm 11.19.0 and passed. Additional sandbox test invocations stalled and were interrupted before execution, then rerun with network access. The inventory's first automatic approval review timed out before execution; its permitted retry completed. These environment/runner failures are not omitted or represented as successful initial runs.

Reproduce the mocked API selection:

```sh
pnpm --filter @event-platform/api exec vitest run src/events/events.controller.spec.ts src/events/events.dto.spec.ts src/events/event-translations.service.spec.ts src/public-events/public-events.controller.spec.ts src/booking/booking.dto.spec.ts src/auth/auth.guards.spec.ts src/auth/token.service.spec.ts src/auth/google-auth.service.spec.ts src/auth/telegram-link.service.spec.ts
```

Reproduce read-only inventory after confirming target identity; `.env` stays ignored and credentials are never passed on the command line:

```sh
node --env-file=.env packages/database/tools/event-creation-v2-inventory.mjs --expected-database event_platform --output docs/event-creation-v2/batch-0-local-inventory.json
```

## Handoff and unresolved prerequisites

Batch 1 can define contracts against the recorded consumer graph and exceptions. Source/target ownership and capability boundaries, currency capabilities, schedule ambiguity, media-role invariants and historical snapshot versions are still design/implementation work, not delivered behavior.

Before Batch 2/3 legacy rehearsals, establish the provenance of the initial migration checksum mismatch and an explicitly isolated seeded/restored test database. Before pricing cutover, reconcile the three payment discrepancies and unmapped/null-snapshot orders without rewriting money, and obtain explicit resolutions for deposit/mixed-mode/mixed-currency/capacity/media exceptions. Production inventory, backups/restore, live provider checks and deployment authorization remain outside this local batch.

No application code, applied migration, target database data, or deployment was changed. New artifacts are the inventory tool, local JSON evidence, this report and the [single durable progress file](../event-creation-v2-progress.md).
