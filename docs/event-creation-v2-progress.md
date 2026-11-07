# Event creation v2 — durable progress

Updated 3 October 2026 (Asia/Hong_Kong). Baseline checkout: `e3563b9f094101832ee9cac9860147f4bd7d564d`.

This is the one progress file to update for subsequent batches. The implementation brief is saved locally as `docs/event-creation-v2-implementation-prompt.md` (ignored by existing rules). The user authorized **Batches 1–13**, with isolated databases for staging rehearsals, then explicitly authorized clearing ngrok's disposable event/purchase data while keeping accounts and activating the new flows locally. Azure remains untouched pending user acceptance. Earlier source-preservation reports describe their historical batch checkpoints; the authorized ngrok reset below supersedes that runtime/database state.

## Ngrok activation and authorized reset

[Activation, validation and recovery report](event-creation-v2/ngrok-preview-reset.md). The existing ngrok tunnel now serves the new wizard, protected editor and public event information page using a clean 48-migration database and all 18 original accounts. Original 43 events and their disposable purchases/resources were removed after database/media restore verification; account tables and unrelated operational records were preserved. Only named smoke fixtures were cleaned up, retaining the tester's new draft. Real ngrok browser publication/edit/public rendering and HTTPS free/paid/seated checkout, signed mock settlement, QR and repeat-safe refunds passed. Nineteen targeted regressions, all typecheck/build tasks and lint pass. Services remain running. Azure, live provider verification and Batch 13 storage contraction remain pending.

| Batch | Status | Gate / evidence |
| --- | --- | --- |
| 0 — Confirm baseline and impact | Complete; local gate passed | [Source/consumer/risk/baseline report](event-creation-v2/batch-0-baseline-and-impact.md); [actual read-only local inventory](event-creation-v2/batch-0-local-inventory.json); [repeatable inventory tool](../packages/database/tools/event-creation-v2-inventory.mjs). |
| 1 — Shared contracts | Complete; gate passed | [Data contract](event-creation-v2/data-contract.md); incomplete/publish schemas, graphemes, money, locales, schedule/media/history contracts; 27 shared tests pass. |
| 2 — Expand database | Complete; isolated gate passed | Fresh/restored migrations and schema equivalence pass; 25 rollback-only SQL invariant checks. Default-off reads, gated dual writes and old-writer invalidation. Initial checksum provenance remains recorded/unknown; history unchanged. |
| 3 — Backfill/reconcile | Complete; isolated gate passed | [Implementation/evidence/exception plans](event-creation-v2/batches-1-3-implementation.md); dry-run, 10-event apply, 33-event resume and 43-event repeat converge with zero writes or money deltas. 43 originals archived; all remain review. |
| 4 — Durable anonymous drafts | Complete; local gate passed | Capability-scoped API, Secure HttpOnly cookies, Origin/CSRF, revision autosave/recovery, authenticated claim/revocation and bounded expiry. Eight service, two real HTTP and seven browser autosave tests pass; API/web types pass. |
| 5 — Media/crops | Complete; local gate passed | Eight real codec/storage/slot/cleanup tests; browser upload into slot 3, keyboard move to slot 2 and refresh retain both roles. Five-slot responsive grid, shared framing, private streams and retention guard. |
| 6 — Modes/hall/currency | Complete; local gate passed | Seven canonical sale/checkout tests, existing venue/seat/history locks, Unicode/inactive tariff roundtrips and USD templates; anonymous hall browser roundtrip preserves media/roles. |
| 7 — Locales/provider | Complete; local gate passed; live smoke unavailable | Nineteen tests cover all six pairs, source/target races, consent, quotas/cache, review/staleness and overlength proposals. Browser partial-locale refresh passes. Configured Google key is empty; manual editing works. |
| 8 — Two-step wizard | Complete; local gate passed | Public CTAs, two-step draft/owned adapters, save/preview validation, schedule controls and responsive/focus browser checks pass. |
| 9 — Auth/claim/publish | Complete; local gate passed; live providers unverified | Exact-revision/browser-bound intent, shared auth continuation, atomic guest enrollment/publication, retries/replay and preserved drafts; password browser smoke passes. |
| 10 — Public/purchasing | Complete; local gate passed; live providers unverified | Normalized presentation/search/media and accepted purchase/refund snapshots; free/general/hall/cart, legacy history and delivery regressions pass. |
| 11 — Obsolete active code | Complete; local gate passed | Retired writers/editors removed, deposit input/origination closed; historical settlement/refund/QR regressions pass. |
| 12 — Verify/stage | Isolated staging complete; deployment pending | Full checks, database/media restore, pending-order recovery, final reconciliation and concurrency pass; runbook prepared. Live providers/deployment unverified. |
| 13 — Contract | Preflight/inventory prepared; contraction gated | Legacy readers/mappings and deployed-consumer/observation gates unmet. No DROP migration added or executed. |

## Batch 0 changes and checks

Read the audit/reference, traced creation/auth/public/hall/money and downstream TS/SQL/JSON consumers, and preserved the three pre-existing untracked user files. Added a read-only inventory tool and evidence/report; no app code or database writes.

Authorized target: `localhost:5432/event_platform`, PostgreSQL 17.11. Final database snapshot: 2 October 2026 **18:08:17** (Asia/Hong_Kong), repeatable-read/read-only. This is local evidence only; no production/restored-copy findings are claimed.

Lint (one existing warning), typecheck, build and Prisma validation passed. Selected package/API and standalone checks: **102 passed, 1 opt-in database test skipped**. Full `pnpm test`, database integration and `db:verify` were not run against the inventoried database because they mutate fixtures; use a separately identified seeded test database. Runner/environment issues and successful reruns are documented in the batch report.

## Recorded unresolved risks

- Applied initial migration checksum differs from checkout. Fresh/restored final schema equivalence now passes, including functions/enums; original deployment-artifact provenance remains unknown. Recover it before production rollout; never rewrite applied migrations/checksums.
- Local legacy data: 9 published deposit events, 8 hybrid candidates, one mixed-currency event and one missing-capacity candidate. Keep affected legacy resources on controlled paths until resolved.
- Three paid mock Payments differ from their paid Orders (40,000 vs 50,000 KZT minor units each); 20 Orders lack snapshots and 12 lack normalized event/resource links. Preserve amounts/provenance and investigate before financial reconciliation/cutover.
- All 43 legacy ends are unknown; 15 events lack poster references. All 78 media references are untyped, 75 external/unknown. Four sources lack summary/description. No values were invented or URLs fetched.
- No pending Orders or unexpired active ticket/table holds at snapshot, but paid active/consumed seat allocations and historical inventory still lock structure. Repeat inventory before rollout.
- Full seeded database regression and isolated restored-copy backfill/rollback checks now pass. Production inventory, media inspection, live translation/provider, staged deployment/cutover and production restore/rollback evidence remain outstanding for their dependent gates.

Batch 0's gate requires recording consumers/risks and distinguishing evidence sources; it does **not** require silently repairing legacy data. That recording gate is satisfied. These exceptions remain prerequisites for later dependent gates.

## Batches 1–3 completion

[Detailed report and explicit exception plans](event-creation-v2/batches-1-3-implementation.md). Shared schemas and four additive forward migrations are implemented. Compatibility defaults off; unresolved events remain on established reads/sales paths. Backfill preserves originals, stable IDs, geometry, charges and history, protects newer edits and commits checkpoints atomically under bounded locks.

Validation: **257 full-suite tests passed** with optional DB integration enabled, plus **43 targeted rollback-only SQL/mapping/dual-write/lock checks**. Lint (one existing warning), typecheck, build, Prisma validation and isolated seeded db:verify pass. Restored results: 43 archived/review events, 93 localized event rows, 1,199 ticket content rows, 38 table content rows, 54 row content rows, 42 tariff/content rows and three legacy typed media candidates. Repeat proposes zero content/tariff/media writes; exact financial/history/inventory evidence is unchanged.

The source database was not migrated/backfilled: final read-only fingerprints for all 17 tracked tables and its 38 migration records match Batch 0. New migrations remain pending there. Only `event_platform_v2_fresh_1790941250928` and `event_platform_v2_legacy_1790941250928` were mutated. No deployment or live provider claim. Batches 4–7 are complete with local evidence; no deployment has been performed.


## Batches 4–7 completion

[Implementation, gates and validation report](event-creation-v2/batches-4-7-implementation.md). Durable scoped drafts, real private media processing/framing, selected-mode inventory/free QR checkout, the existing hall draft adapter, and partial locales/Google v2 integration are implemented. Four additional forward migrations pass on both isolated databases; fresh/restored schema catalogs match and event counts remain 25/43.

Validation: **326 distinct automated tests pass**, including the complete 237-test API suite with opt-in database integration, real codecs, 29 shared-contract tests and 22 standalone browser/auth/proxy/hall checks. Package types/builds, Next production build, Prisma validation, lint (one pre-existing warning), whitespace and seeded database verification pass. See the report for runner corrections and the targeted reruns after final changes.

[Read-only source comparison](event-creation-v2/batches-4-7-source-preservation.json): all 17 fingerprints and the original 38 migration records are unchanged. Source migrations remain unapplied. Temporary preview servers/tabs were stopped, preserving the existing development server.

**Live translation smoke was not run: the configured key is empty.** Manual translation remains usable, and [setup instructions](event-creation-v2/translation-provider-setup.md) distinguish mocked tests from live provider evidence. Batches 8–10 were subsequently completed below; Batches 11–13 remain pending.

## Batches 8–10 completion

[Implementation and verification report](event-creation-v2/batches-8-10-implementation.md). The public two-step wizard, protected owned editor, verified auth continuation, atomic/idempotent publication and normalized public/search/media rendering are implemented. All checkout modes preserve immutable accepted content/policy/amount/currency snapshots and versioned historical readers. Paid No-refund cancellation and explicit organizer exceptions are enforced without rewriting history.

Validation: **359 distinct automated tests pass**, including the full 257-test API suite with opt-in database/HTTP/codec integration, 32 shared tests and 32 standalone browser/auth/proxy/countdown/hall checks. Relevant final API changes additionally passed a 21-test targeted rerun. Package types/builds, Next production build, Prisma validation, seeded verification, lint (one existing warning) and whitespace pass. Browser evidence covers normal password-login publication to the same editor, next fresh Create, anonymous legacy-route redirect, partial KK fallback, active zero-charge QR registration, responsive controls and Preview Escape/focus restoration.

[Fresh/restored migration comparison](event-creation-v2/batches-8-10-migration-rehearsal.json) passes with no schema differences or migration event-count changes (26/43; the fresh copy includes one intentional browser publication). [Source preservation](event-creation-v2/batches-8-10-source-preservation.json) confirms all 17 tracked fingerprints and 38 original migration records remain unchanged. Two new forward migrations remain pending on the configured source.

**No live provider/deployment claim.** Signup/verification failures and shared return paths have automated coverage; real Google/Telegram sign-in, signup email/SMS, translation, payment charging and signed Wallet delivery require staging/provider credentials. The configured translation key remains empty. Preview servers/tab were stopped and the existing development server retained. Batches 11–13 remain pending, including obsolete active code removal, staging/rollback/cutover and eventual storage contraction.

## Batches 11–13 local implementation and staging

[Implementation and verification report](event-creation-v2/batches-11-13-implementation.md). Batch 11 removes the obsolete active wizard/write paths and current deposit pricing/origination; existing deposit purchase replay, settlement, admission/QR and exact refunds remain supported. Legacy events open review; legacy deposit sales are paused in API/UI/bot. This supersedes earlier sales-path descriptions while preserving their historical evidence.

Validation: **354 distinct automated tests pass**, including the full 252-test API suite and 32 standalone checks. Lint (one existing warning), types, production build, Prisma validation and explicitly seeded isolated database verification pass. The installed pnpm 11.24.0 fallback was used because pinned 11.19.0 bootstrap was unavailable.

[Restore evidence](event-creation-v2/batch-12-restore-rehearsal.json) matches all 54 tables in each new restored database and all 12 local media files; source final delta matches. [Two pending-order formats](event-creation-v2/batch-12-restored-pending-journeys.json) settled/refunded exactly once using the development provider, preserving USD/KZT amounts and accepted snapshots. Restored schema equivalence, four rollback-only lock probes and final legacy archive/financial reconciliation pass. [Source preservation](event-creation-v2/batches-11-13-source-preservation.json) confirms all 17 fingerprints and 38 original migration records are unchanged.

[Cutover/observation/rollback runbook](event-creation-v2/cutover-runbook.md) and [Batch 13 deletion inventory](event-creation-v2/batch-13-deletion-inventory.json) are prepared. **Actual contraction remains gated**: 43 legacy review events/unknown ends, historical reader/resource/media mapping, known financial exceptions and deployed-consumer/cutover observation proof remain unresolved. No DROP migration, source writes or production deployment. Compatible storage, Deposit and OrderType history are retained. Live providers remain unverified; local browser evidence is recorded and preview processes/tab were stopped.
