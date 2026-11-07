# Event creation v2 — Batches 1–3

Implemented 2 October 2026. These batches establish contracts, expand the schema and provide a lossless backfill. Wizard endpoints/UI, uploads, translation provider integration and consumer cutover belong to subsequent batches. Nothing was deployed.

## Batch 1: shared contracts

`packages/shared-types/src/event-creation-v2.ts` distinguishes incomplete version-2 drafts from server-context publish validation. It provides Unicode grapheme limits, partial locales, field metadata/currentness, three exclusive sale modes with retained inactive forms, supported-currency capabilities, exact decimal-to-minor parsing and checked totals, five positioned assets with independent roles/crops, DST gap/fold resolution and versioned purchase/refund snapshots. Historical null/partial/deposit snapshots remain unchanged.

The [data contract](data-contract.md) defines final authority, stable resource relations, compatibility projections, revision/error semantics, browser capabilities, expiry/recovery and migration boundaries. Shared package tests: **27 passed**, including 15 focused v2 cases. A locked-only hall cannot pass publication as sellable inventory.

## Batch 2: additive database and compatibility

Four new forward migrations expand the Event and add localized event/resource/tariff content, durable drafts, publish intents, typed assets, event media links, archival snapshots and backfill checkpoints. Existing Event/resource/financial IDs, legacy text/date/deposit fields, seat locks, hold indexes and financial constraints remain.

Migration transactions have a two-second lock timeout. Expansion uses NOT VALID checks/FKs on existing tables; the separate validation migration uses a bounded three-minute statement timeout. New indexes are on newly created empty tables; no large existing table index rebuild occurs. The two subsequent forward repairs address a generic trigger record-field issue found in rehearsal and serialize card assignment against asset-kind changes. Applied migration files/checksum rows were never rewritten.

PostgreSQL checks enforce supported locale codes, revisions, draft ownership/claim state, intent/result consumption, ready-media metadata, slot uniqueness, scoped event/asset links, image cards and singleton roles. Deferred publication checks validate ready roles and complete source content, including the prior owner when content moves. Complete publication still needs the application validation/locks in Batch 9.

`EVENT_CONTENT_V2_ENABLED` defaults **false**. Organizer detail and public detail compatibility reads can project a complete reconciled source row into the legacy DTO. Dirty/review/legacy events stay on the existing readers even with the flag enabled. New transactional content writes are gated, check the Event revision under lock, preserve omitted fields, mirror still-required source/complete-target legacy columns, and mark changed target metadata stale. Partial targets are stored without fabricated legacy completeness. Caller authorization remains mandatory; no existing guard was removed and no new endpoint was exposed.

SQL legacy invalidators mark old event/translation/inventory/hall edits dirty. The flag is **not a catalog/checkout cutover switch**: search/cards, normalized target selection and sale resources must switch coherently in Batches 6/7/10 before enabling rollout. Deploy the expansion before deploying the regenerated application client, since default-off readers still select the additive Event columns.

Fresh migrations and a pg_dump/pg_restore copy both passed, with **zero differences** across columns, checks/FKs, indexes, triggers, stored-function definitions and enum values. Evidence: [migration rehearsal](batch-2-migration-rehearsal.json), [25 rollback-only invariant checks](batch-2-expansion-checks.json), [compatibility tests](../../packages/database/tests/event-v2-compat.spec.ts).

The initial applied migration checksum remains `b5a3e80e…`, while the checkout file is `76944616…`. Git history and newline/trim variants did not recover the applied artifact. Final schema equivalence establishes this rehearsal's functional equivalence; it does **not** establish that artifact's provenance. Retain both hashes and recover the original deployment artifact before production rollout. No `migrate resolve` or history edit was used.

## Batch 3: lossless, bounded backfill

`packages/database/tools/event-v2-backfill.mjs` defaults to a PostgreSQL repeatable-read **read-only** preview. Apply is restricted to isolated local rehearsal database names. Work uses UUID keyset batches, an advisory checkpoint lock, per-event/resource/content locks and atomic per-batch checkpoint commits. Bounds are explicit; interrupted/failed batches roll back and resume from the last committed cursor. Omit `--resume` for a fresh convergence/reconciliation scan, including dirty records before the prior cursor.

Announcement maps exactly to summary. Description retains its original paragraph and merges program/rules/attendance/extra/historical-deposit sections with RU/ENG/KAZ labels. Refund conditions retain legacy cancellation text but refund availability remains unknown. Overlength strings are retained and flagged, never sliced. Source/target legacy text, translation origin/hash, resource text and complete hall JSON are archived before normalization. Target translations are conservatively stale pending review because old whole-object hashes cannot certify new per-field mappings.

Stable TicketType/Table/VenueRow content and 42 original tariff UUIDs are populated. Existing resource charge prices/currencies, quantities, statuses, IDs and hall JSON are untouched. Nullable resource `tariffId` links and geometry text overrides await the revision/lock-aware Batch 6 adapter rather than guessing historical mappings. A standalone template's one Table has no event/source locale: it remains unchanged and is excluded from event content backfill. That explains 39 Tables versus 38 TableContent rows.

Only the application-owned `/media/posters/<UUID>.(jpg|jpeg|png|webp)` namespace is a trusted candidate. Original order/holes are retained, duplicate references are reported, and an image poster candidate receives both roles. Candidates remain `legacy`, without invented decoded dimensions/storage readiness. External/unknown references are archived and reported; no URLs were fetched. Later changed references/roles or editor-managed media require review; backfill never deletes processed assets or overwrites crops/roles.

Editor-managed rows, mismatched content hashes and reconciled aggregates are protected. Legacy updates may refresh only unchanged legacy-managed projections; every new original fingerprint gets a separate immutable archival row. Newer edits survive reprocessing.

Rehearsal applied ten events, resumed the remaining 33, then scanned all 43 again: **zero proposed content/tariff/media writes**. Financial/history/inventory hashes and exact totals by currency/status match before and after every apply. All originals equal their archived source/target/resource/hall/seat values. All FKs/checks validate. Evidence: [first batch](batch-3-first-batch.json), [resume](batch-3-resumed.json), [repeat](batch-3-repeat.json), [reconciliation](batch-3-reconciliation.json), [14 rollback-only mapping/write checks](batch-3-backfill-checks.json), [four two-connection lock checks](batches-2-3-lock-checks.json). Pure mapping tests: **12 passed**.

Restored-copy results:

| Relation | Count |
| --- | ---: |
| Event / immutable original archive | 43 / 43 |
| EventContent (43 source + 50 target) | 93 |
| TicketType / TicketTypeContent | 1,199 / 1,199 |
| Table / TableContent | 39 / 38 |
| VenueRow / VenueRowContent | 54 / 54 |
| Seat / VenueLayout | 1,193 / 20 |
| HallTariff / HallTariffContent | 42 / 42 |
| Typed legacy asset candidates / EventMedia | 3 / 3 |

All 43 events remain **review**, with zero invented ends. The normalized rollout remains disabled; established legacy purchasing/history paths are retained. Completing a backfill gate means proving preservation/convergence and documenting resolution, not silently declaring these aggregates publish-ready.

## Explicit exception resolution plans

The [reconciliation report](batch-3-reconciliation.json) lists affected event IDs. Categories overlap.

| Exception | Recorded finding | Required resolution before affected consumer cutover |
| --- | --- | --- |
| Active deposit mode | 9 published events; another 12 legacy deposit events | Keep existing sale/history arithmetic and frozen terms. Organizer decides whether future deposit sales close or migrate to full-payment inventory. Complete or safely expire pending purchases first. Sold/held resources keep their prices, balances, reservations and refund promises; do not reclassify their orders. Batch 11 cannot remove active deposit code until this is resolved. |
| Hybrid modes | 8 events, including deposit overlap | Organizer selects one future v2 mode. Retain sold/held resources and historical resource IDs on compatibility paths; create separate future inventory where a structural lock forbids conversion. Never silently disable or merge an existing inventory pool. |
| Mixed currencies | Event `155d51d8-3b42-46bb-bf3c-a0b2b53be252` | Obtain organizer settlement-currency decision and adapter support. Keep charged/sold/held prices in original currencies; no exchange conversion or relabelling of historical amounts. Replace only eligible unsold future resources with explicitly confirmed amounts. |
| Capacity ambiguity | Event `edbb2b2e-01f4-4ae9-a619-ac69508f7c74`; one ambiguous free-inventory mapping | Organizer supplies finite future capacity after reconciling sold/held quantities. Do not infer capacity from zero, collapse multiple free types or release active allocations. |
| Schedule/refund choices | 43 unknown ends and 43 unconfirmed refund choices | Organizer supplies explicit local end date/time and refund Yes/No/conditions. Resolve any DST fold explicitly. Preserve existing cancellation/deposit promises in historical readers/snapshots; do not backfill a new accepted policy into old orders. |
| Media/content/translation/hall mappings | 75 unknown/external references, three unverified local candidates; 40 events without a trusted card; missing source/resource text; all legacy target translations need currentness review | Resolve storage provenance and decode trusted objects through Batch 5; organizer supplies missing/valid media and text. Confirm target translations and geometry text/tariff overrides through Batches 6/7. Keep raw originals and all overlength content until edited explicitly. |
| Historical money/snapshots/links | Three paid mock Payments are 40,000 KZT versus their Orders' 50,000 KZT; 20 null snapshots, 12 Orders without normalized resource links | Investigate original provider/payment attempts and test-fixture provenance; preserve both charged values. Orders: `e282d0a9-e889-476d-ad06-0e473cd83258`, `403c430f-174b-40ae-870e-e52f59414f58`, `af239be3-5364-4936-a76f-70d5c784944e`. Recover links from recorded original identifiers where provable; retain missing/partial legacy snapshot parsing. Do not manufacture snapshots, event IDs, refund promises or corrected amounts. |

## Checks, source preservation and operations

Full `pnpm test --env-mode=loose --force` passed on the seeded isolated fresh database: **257 tests** (27 shared, 5 config, 5 database Vitest, 12 backfill Node tests, 15 bot, 193 API). Google-auth/verification/delivery opt-in database tests were enabled. Web has no root test task; unchanged web code was checked by typecheck/build. The full API suite verifies existing purchasing, refunds, auth, QR, hall revision/holds, history, delivery, analytics and public readers. Provider tests are mocked; no live translation/payment provider evidence is claimed.

`pnpm lint`, `pnpm typecheck`, `pnpm build`, Prisma validation and seeded `db:verify` passed. Lint retains one existing `ArrowIcon` warning. Existing adapter-backed integration tests emit a pg query concurrency deprecation warning; no failed/skipped test was reported. [Seed/test/verify logs](regression-logs/tests.log) and [step results](batches-1-3-regressions.json) are retained. An initial seed runner PATH issue was corrected to use package-local tsx; the actual seeded run then passed.

The configured source `localhost:5432/event_platform` was read/dumped only. A final read-only inventory has unchanged fingerprints for all **17** tracked tables and still **38** migration records: [source preservation](batches-1-3-source-preservation.json). Four new migrations are pending on that source; do not start the regenerated client there before migration. Pre-existing user test/audit files were preserved.

Isolated databases retained for review:

- `event_platform_v2_fresh_1790941250928`: migrated then seeded for regression tests.
- `event_platform_v2_legacy_1790941250928`: restored 43-event copy, migrated/backfilled/reconciled.

The private dump and credential-bearing connection manifest stay in the mode-700 rehearsal temporary directory, outside the repository. Evidence JSON/logs contain no connection credentials. Do not commit the private dump/manifest. Cleanup may drop only the two named isolated databases and their private temporary directory after review; never use the source name.

Repeatable operations (after shared/database build; replace `<private-rehearsal-directory>` with the retained directory):

```sh
node packages/database/tools/event-v2-backfill.mjs --rehearsal <private-rehearsal-directory> --batch-size 10 --max-batches 10 --output /private/tmp/v2-preview.json
node packages/database/tools/event-v2-backfill.mjs --rehearsal <private-rehearsal-directory> --apply --batch-size 10 --max-batches 1 --output /private/tmp/v2-first-batch.json
node packages/database/tools/event-v2-backfill.mjs --rehearsal <private-rehearsal-directory> --apply --resume --batch-size 10 --max-batches 10 --output /private/tmp/v2-resume.json
```

No production apply/cutover, UI rebuild, live provider smoke test or legacy contraction has been performed. Batch 4 is the next implementation batch.
