# Event creation v2 — Batches 11–13

3 October 2026. User authorization: implement Batches 11–13 and use the existing isolated databases for staging rehearsals. The configured source database was only read. No production deployment or storage contraction occurred.

| Batch | Result |
| --- | --- |
| 11 — Remove active obsolete code | Implemented; local regression gate passes. |
| 12 — Verify and stage cutover | Isolated staging, restore, pending-order, concurrency and reconciliation checks pass; deployment and live providers remain unverified. |
| 13 — Contract and finish | Read-only preflight, dependency/deletion inventory and ordered migration/recovery plan prepared. Actual contraction is gated by unresolved records and deployed-consumer/observation proof. |

## Current behavior and removed code

The six-step organizer form, duplicated language editor, old sales/resource managers and unused duplicate public browser are deleted. Current events use the revisioned two-step editor. Legacy events open a localized review page with management, preview and new-event links; they cannot resume the obsolete creation workflow. Old Event create/update/publish, poster-only and translation write routes return authenticated `410 EVENT_CREATION_V2_REQUIRED` tombstones without invoking a writer. Obsolete Event write DTOs/types, translation writer/provider and wizard copy were removed. Shared image validation remains for legitimate organizer/campaign image uploads.

Current resource and checkout DTOs reject deposit fields, including zero. Raw hall inputs reject nested deposit keys before schema normalization. New ticket/table/row resources have zero legacy deposit values; old resource writes cannot bypass the normalized revisioned editor. Legacy deposit events cannot originate new API/UI/bot sales or reopen sales. The public checkout shows “Sales paused”; its hall remains viewable with purchase selection disabled. Retired deposit filters and current deposit-price calculations/creation branches were removed. Seeds now describe full-price payment and never create Deposit records.

Historical records remain readable and refundable. Catalog fallback presentation is scoped through the historical deposit helper; immutable checkout snapshot readers, delivered tickets/QR, pending-payment settlement, cancellation/refunds, management analytics and CSV keep original amounts, terms and identities. No current application `Deposit.create`/`upsert` path remains. Direct historical fixture inserts exist only in regression/staging setup. Updating a pre-existing Deposit's settlement/cancellation status remains necessary to service old orders.

## Remaining consumer audit

| Remaining reference | Reason for retention / contraction requirement |
| --- | --- |
| Prisma Event/EventTranslation legacy fields, SQL projection/locking triggers and enum defaults | Historical/public fallback and compatibility projection still depend on them. Replace callers/dependencies before any forward DROP. |
| `Deposit`, resource deposit columns and `OrderType` | Original accepted transactions, resource mapping, analytics and refunds remain dependent on this history. No lossless replacement mapping is proven. |
| Legacy purchase JSON, quick-status/delivery/account views and bot payment formatters | Read accepted historical purchases at original money/terms; these are not new deposit pricing inputs. |
| Legacy hall layout JSON/defaults, backfill/archive and catalog adapters | Preserve geometry/resource IDs and historical records. External current hall writes reject deposit keys; normalized editor publication uses canonical prices. |
| SQL/JSON/external deployed consumers | Local source/catalog inspection cannot prove all running deployments and external integrations have switched. Deployment inventory/observation remains required. |

The [deletion inventory](batch-13-deletion-inventory.json) records candidate columns and concrete function/trigger/constraint/enum definitions. Compatibility storage and adapters are retained deliberately; Batch 13 is not marked complete.

## Validation and staging evidence

**354 distinct automated tests pass:** 252 API tests in 53 files, 32 shared contracts, six configuration, 15 bot, five database compatibility, 12 backfill-planner tests and 32 standalone browser/auth/proxy/countdown/hall checks. Removed obsolete writer tests account for the lower total than Batch 10. Tests include current deposit-input rejection and restored historical deposit replay, signed development payment, admission/QR, exact-once refund and snapshot preservation.

Workspace lint, typecheck, full opt-in integration suite, production build, Prisma validation and explicit isolated seeded `db:verify` pass. Lint retains one pre-existing unused `ArrowIcon` warning. Checks used installed pnpm 11.24.0 with its version-switch fallback because pinned 11.19.0 bootstrap was unavailable. No dependency integrity checks were disabled. [Validation manifest](batches-11-13-validation.json).

Browser checks on an isolated database confirm the legacy review page, paused legacy deposit sales and current normalized editor with the two steps, non-first-slot Main/Background, source English, USD/free and overnight schedule values. Production compilation passes; browser inspection used the local development HTTP preview. Production HTTPS/cookie requirements remain in place. Temporary preview processes/tab were stopped; the existing user development server was retained.

| Evidence | Result |
| --- | --- |
| [Database/media restore](batch-12-restore-rehearsal.json) | Both database dumps restored to new isolated databases; all 54 tables per database and final source delta match. Twelve local media files match; two published ready assets resolve. |
| [Pending purchase journeys](batch-12-restored-pending-journeys.json) | USD 1,234 version-2 and KZT 1,500 historical deposit orders replay, settle, issue QR and refund once with unchanged accepted snapshots. New deposit origination is rejected. Development provider only. |
| [Restored migrations](batch-12-restored-migrations.json) | No schema differences, including functions/triggers/enums; event counts remain 28/43 during the migration check. |
| [Concurrent writes](batch-12-concurrent-writes.json) | Four rollback-only legacy/content/inventory/media locking probes pass. No probe writes remain. |
| [Final legacy reconciliation](batch-12-final-reconciliation.json) | All 43 archived/review records and original financial/resource content reconcile without money/history changes or invented end times. |
| [Final fresh observation](batch-12-final-observation.json) | Zero monitored money/snapshot/media/inventory anomalies. Final 29 events include the additional explicit browser legacy-review fixture after the 28-event backup/migration snapshot. |
| [Legacy preflight](batch-13-contraction-preflight.json) | Existing three payment/order mismatches and 20 missing snapshots unchanged; no new-format anomalies. Contraction eligibility false. |
| [Source preservation](batches-11-13-source-preservation.json) | All 17 tracked table fingerprints and all 38 original migration records match the preceding read-only source inventory. No source migration/backfill/seed writes. |

The additive `creationVersion` column was initially included in the backfill's original-row fingerprint, so archived originals appeared changed after the Batch 9 expansion. It is now excluded with the other additive v2 fields. Reconciliation passes against the original archived content and exact financial evidence; neither original rows nor archives were rewritten to conceal a mismatch.

Early fixture/codec/guard checks exposed obsolete test setup, incorrect codec environment names and an overly broad normalized-resource guard inside the canonical hall publisher. Those causes were corrected, and the final full checks pass. Canonical hall publication still enforces closed legacy deposit sales; its external legacy write endpoints enforce normalized editor ownership separately.

## Gates, providers and deployment

The [cutover/monitoring/rollback runbook](cutover-runbook.md) records exact isolated commands, backup/restore evidence, pending-order handling and recovery requirements. It distinguishes compatible-current-binary recovery from an unsafe old-binary/flag downgrade and requires restore/replay after contraction.

Actual Batch 13 contraction cannot proceed on this evidence: all 43 representative legacy events still require review and have unknown ends, nine are published deposit events, historical content/media/resource mapping is unresolved, and deployed-consumer absence plus the cutover observation window are unproven. Known three paid mock payment/order differences, 20 missing snapshots and 12 missing normalized links require investigation without rewriting paid amounts or fabricating history. Original migration-artifact provenance also remains unknown. No automatically applied DROP migration was created; historical Deposit/OrderType storage remains.

No live Google/Telegram sign-in, OTP/email/SMS, translation, provider charge, signed Wallet delivery or production deployment is claimed. Translation credentials remain empty. Mock/development payment signatures, local media codecs and browser password login are local evidence only. The complete production cutover, observation and contracted-schema gate remain outstanding.
