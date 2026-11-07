# Event creation v2 — cutover, observation and rollback

Prepared 3 October 2026. This runbook records the authorized isolated rehearsal and the remaining deployment gates. No production target, release, maintenance controls or observation window has been supplied; production cutover and schema contraction have not occurred.

## Verified rehearsal targets

The configured `localhost:5432/event_platform` was inventoried read-only and remains unchanged. Never point migration, seed, fixture, cleanup or rehearsal commands at it.

| Role | Database |
| --- | --- |
| Original isolated seeded copy | `event_platform_v2_fresh_1790941250928` |
| Original isolated representative legacy copy | `event_platform_v2_legacy_1790941250928` |
| Restored seeded copy | `event_platform_v2_fresh_1791011626432` |
| Restored representative legacy copy | `event_platform_v2_legacy_1791011626433` |

Original private connection directory: `/var/folders/qy/1gyrjms16fdd00mj8hr14_b80000gn/T/ticket-v2-rehearsal-1NggLH`.

Verified private backup/restore directory: `/var/folders/qy/1gyrjms16fdd00mj8hr14_b80000gn/T/ticket-v2-restore-fhoI9x`. It contains two custom-format dumps, private connections, a manifest, `media-backup` and `media-restored`. The directory is mode 700; dumps, connections and manifest are mode 600. Keep these files private and outside Git. Temporary local files are rehearsal evidence, not durable production backups.

The [restore evidence](batch-12-restore-rehearsal.json) matches all rows in all 54 public tables of each database, including migration history, financial records, accepted snapshots, drafts and inventory. Source digests before/after the backup match. All 12 media files (33,002 bytes) match byte-for-byte; two ready published assets resolve from restored storage. This includes unpublished/orphan test assets; external legacy URLs were not fetched or verified.

## Reproduce local checks

Run from the repository root. The checked-in package manager is pnpm 11.19.0. Its bootstrap failed in this environment, so the successful checks used the installed pnpm 11.24.0 with `pnpm_config_pm_on_fail=ignore` to skip the version switch. Dependency integrity checks were not disabled. Use the pinned version when its bootstrap is available.

```sh
export V2_ORIGINAL_DIR=/var/folders/qy/1gyrjms16fdd00mj8hr14_b80000gn/T/ticket-v2-rehearsal-1NggLH
export V2_RESTORED_DIR=/var/folders/qy/1gyrjms16fdd00mj8hr14_b80000gn/T/ticket-v2-restore-fhoI9x
export pnpm_config_pm_on_fail=ignore
export MEDIA_FFMPEG_PATH=/private/tmp/ticket-v2-codecs/ffmpeg
export MEDIA_FFPROBE_PATH=/private/tmp/ticket-v2-codecs/ffprobe
pnpm lint
pnpm typecheck --env-mode=loose --force
node --env-file=.env packages/database/tools/run-v2-command.mjs "$V2_ORIGINAL_DIR" fresh pnpm test --env-mode=loose --force
pnpm build --env-mode=loose --force
pnpm --filter @event-platform/database prisma:validate
node --env-file=.env packages/database/tools/run-v2-command.mjs "$V2_ORIGINAL_DIR" fresh pnpm --filter @event-platform/database db:seed
node --env-file=.env packages/database/tools/run-v2-command.mjs "$V2_ORIGINAL_DIR" fresh pnpm db:verify
node --env-file=.env packages/database/tools/run-v2-migrations.mjs "$V2_RESTORED_DIR" /private/tmp/v2-migrations.json
node --env-file=.env packages/database/tools/verify-v2-locks.mjs "$V2_RESTORED_DIR" /private/tmp/v2-locks.json
node --env-file=.env packages/database/tools/reconcile-v2-backfill.mjs "$V2_RESTORED_DIR" /private/tmp/v2-reconciliation.json
node --env-file=.env packages/database/tools/verify-v2-cutover.mjs "$V2_RESTORED_DIR" fresh /private/tmp/v2-observation-fresh.json
node --env-file=.env packages/database/tools/verify-v2-cutover.mjs "$V2_RESTORED_DIR" legacy /private/tmp/v2-observation-legacy.json
node --env-file=.env packages/database/tools/inspect-v2-contraction.mjs "$V2_RESTORED_DIR" /private/tmp/v2-deletion-inventory.json
```

The command wrapper enforces localhost database names matching `event_platform_v2_(fresh|legacy)_<timestamp>`, overrides all database test URLs and enables opt-in integration checks. The full test suite mutates fixtures: run it on the disposable seeded copy only. Use rollback-only lock probes and read-only reconciliation on the representative legacy copy. `db:seed`/`db:verify` are specifically for the seeded test database.

Standalone checks outside workspace test scripts cover autosave/publication clients, public auth, proxy, countdown and hall geometry/drafting. Their evidence and exact counts are in the [validation manifest](batches-11-13-validation.json). Use the recorded ESM bundling runner for the web TypeScript tests: direct TSX execution treats the web package as CommonJS and cannot resolve its import-only shared package.

## Backup, final delta and pending-order rehearsal

Stop all writers to the selected isolated copies and media directory before taking a backup: API, bot, outbox/cleanup workers, seed/test commands and previews. Do not stop an unrelated user development server. The backup tool refuses changed source digests rather than treating a moving backup as reconciled. It creates new restore databases and never overwrites an existing database.

To run another pending-order rehearsal, use a fresh disposable seeded pair and private media directory. Build the current API/shared/database packages first. The fixture tool imports the built current services, uses only the development payment provider and disables email delivery. The `prepare` action deliberately inserts one historical Deposit fixture directly to model an existing order; no application creation endpoint permits it.

```sh
node --env-file=.env packages/database/tools/run-v2-command.mjs "$V2_ORIGINAL_DIR" fresh node packages/database/tools/stage-v2-pending-orders.mjs prepare /private/tmp/ticket-v2-preview-media /private/tmp/v2-pending-fixture.json /private/tmp/v2-pending-preparation.json
node --env-file=.env packages/database/tools/rehearse-v2-restore.mjs "$V2_ORIGINAL_DIR" /private/tmp/ticket-v2-preview-media /private/tmp/v2-restore.json
```

Read the resulting `privateBackupDirectory`, then set `V2_RESTORED_DIR` to that exact directory. Resolve its physical `/private/var/folders/...` path for the media argument if macOS reports `/var/folders/...`.

```sh
node --env-file=.env packages/database/tools/run-v2-command.mjs "$V2_RESTORED_DIR" fresh node packages/database/tools/stage-v2-pending-orders.mjs resume /private/var/folders/qy/1gyrjms16fdd00mj8hr14_b80000gn/T/ticket-v2-restore-fhoI9x/media-restored /private/tmp/v2-pending-fixture.json /private/tmp/v2-pending-resumed.json
```

Replace the sample restored-media path with the new result when repeating this rehearsal. `resume` consumes the fixture once; it must not be replayed against the already-refunded rehearsal orders.

Verified [pending journeys](batch-12-restored-pending-journeys.json): a version-2 USD order at 1,234 minor units and a historical KZT deposit order at 1,500 minor units survived backup/restore, replayed their original idempotency responses, accepted one signed development payment each, issued admission/QR and refunded exactly once. Accepted snapshots did not change. A new deposit purchase was rejected after restore.

At a real cutover, inventory pending Orders, Payments and holds separately. Preserve original IDs, provider payment IDs, idempotency keys, accepted terms, amounts/currencies and expiry times. Keep webhook/refund/history services compatible with both record formats. Existing idempotent checkout replays remain supported even though new deposit sales are closed. Run bounded existing expiry/release handling; investigate late provider success against expired/cancelled holds before issuing admissions or refunds. A pending Payment attached to a cancelled Order is not automatically a new pending purchase. Never reprice an accepted order from current Event/resource fields.

## Deployment prerequisites and cutover sequence

Deployment is pending, including an authorized target, release artifact, service/job controls and a defined observation duration with an accountable operator. The commands above are isolated rehearsal commands, not production rollout commands. Fill in and review the target-specific commands before authorizing deployment.

1. Recover the artifact provenance for the initial applied migration whose checksum differs from this checkout. Do not edit applied migration history. Inventory deployed API/web/bot versions, background jobs, exports, scanner/delivery/refund consumers, raw SQL and JSON integrations.
2. Resolve or explicitly freeze affected legacy sales before changing pricing. The representative copy has 43 unresolved events/unknown ends, nine published deposit events, eight hybrid candidates, one mixed-currency candidate and one missing-capacity candidate. Confirm media ownership/availability, translations/content and lossless resource mappings. Keep unknown ends null. New deposit originations are closed by the current API/UI/bot; existing historical purchases remain serviceable.
3. Verify deployment configuration and real provider journeys on the authorized target: HTTPS/cookies/Origin, authentication and claim continuation, translation consent/provider, payment signatures and currencies, private media/codec limits, notification delivery and Wallet signing. Empty credentials or mocked acknowledgements are not evidence of provider success.
4. Quiesce the target's writers using reviewed infrastructure controls. Capture a durable database backup and matching private media backup, inventory in-flight payments/holds and reconcile exact rows plus currency/status totals. Restore both to an independent target and verify all rows/assets. The local Docker tool omits owners/privileges and is not sufficient proof of production permissions, extensions, topology or disaster recovery.
5. Apply only reviewed additive forward migrations, run bounded final-delta backfill under the established row locks, and reconcile source/archive/content/media/inventory/money. Freeze records with unresolved mappings. Resume with a binary proven to read both historical and version-2 records, and perform staged create/auth/publish/edit/read/checkout/QR/refund journeys.
6. Observe the agreed window, record release IDs/configuration and consumer acknowledgements, investigate new exceptions, and repeat reconciliation before proposing contraction. Contraction is a separate deployment gate.

## Monitoring and abort conditions

`verify-v2-cutover.mjs` is read-only and records event/review counts, pending snapshots, exact financial row digests and amounts grouped by currency/status. It reports contraction eligibility as false because database counts cannot prove deployed-consumer absence or completed observation.

The restored fresh observation has zero monitored anomalies. The representative legacy baseline has **three payment/order amount mismatches and 20 missing order snapshots**; preserve and investigate those records rather than rewriting money or fabricating snapshots. Alert on any increase or any newly created exception. The original three paid mock Payments are 40,000 KZT each while their Orders are 50,000 KZT each. Do not net totals from different currencies or count all payment attempts as revenue.

Abort new origination/publication on any new-format Deposit, invalid new event/snapshot amount or currency, missing card asset, unready/wrong-owner media, negative/oversold inventory or unvalidated constraints. Compare pending expiry/late-success outcomes, refunds, QR identities and per-currency ledgers with the frozen baseline. A money delta explained by a recorded staging payment/refund is distinct from an unexplained delta.

At the deployment target, also monitor publish/claim/autosave failure rates, revision conflicts, unexpected 401/403/CSRF errors, transaction lock timeouts, outbox backlog/retries, media-processing/storage failures, signed-payment rejection, delivery failures and scanner/refund errors. Set alert thresholds and service owners before rollout; these runtime metrics are not all measured by the SQL tool. Redact capabilities, tokens, contact data and accepted snapshots from logs. Delivery success requires a real provider acknowledgement.

## Rollback before contraction

Pause new publication/checkout origination through the target's reviewed routing/maintenance controls while retaining compatible webhook/refund/admission/history handlers. Preserve additive schema, all version-2 rows and private media. Use this verified compatible release or another release explicitly tested against both formats. **An old binary plus a feature flag is not a safe rollback once version-2 records exist.** The restored pending journey proves current-binary recovery; it does not certify an unspecified older release.

If recovery requires restoring the backup, obtain authorization for the target and replay every post-backup mutation needed to preserve drafts, published content, inventory and buyer history. Reconcile externally acknowledged payments/refunds against restored Orders/Payments/RefundRequests before reopening sales, using original provider IDs and idempotency semantics. Do not lose a charge by reverting its database record or issue a duplicate charge/refund. Repeat exact financial/media/inventory checks and the staged journeys.

## Contraction and rollback after contraction

Batch 13 remains gated. The [deletion inventory](batch-13-deletion-inventory.json) records 17 candidate Event columns, the catalog's 29 relevant constraints, six functions, 14 triggers and enum dependencies. These are inspection results, not proof that every listed dependency is obsolete. No DROP migration was added or executed.

After deployed-consumer proof, observation, writer freeze and reconciliation, replace dependent functions/triggers/indexes/checks/defaults with a **new forward migration**, then remove redundant text/media/current payment projections only when canonical/archive mappings preserve their meaning. Retire fulfilled compatibility readers/flags after all callers switch. Keep `Deposit`, `OrderType.deposit`, accepted purchase snapshots and original financial/resource history until lossless archive mappings preserve IDs, terms, amounts/currencies/statuses/timestamps and every refund/delivery/scanner/history reader is migrated. Never blindly cast old Orders.

After contraction, rollback means forward repair or an authorized database/media restore **plus complete post-backup replay**. A binary downgrade cannot recreate removed storage. Rehearse the proposed contraction and this recovery path on fresh and representative restored copies before applying it anywhere.
