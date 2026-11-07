# Ngrok preview reset — 3 October 2026

The existing [ngrok site](https://sulphate-shown-subtract.ngrok-free.dev) now serves the v2 creation wizard, owned editor and public event information page. [Create an event](https://sulphate-shown-subtract.ngrok-free.dev/events/create?lang=en) is ready for user testing. API, web and bot remain running locally. Azure was not accessed, reset, deployed or pushed.

## Data and runtime

The user explicitly authorized removing all disposable event/purchase records while keeping accounts. The original local database contained 43 events, 36 orders, 26 payments, six deposits and 72 tickets. Those rows and their event/resource relations were removed after a verified backup. Both original and active ngrok databases now have zero events, orders, payments, deposits and tickets. All 18 original user rows are unchanged; the initial copy also verified all 11 account/identity/session tables exactly against the restored backup.

Ngrok uses `event_platform_ngrok_v2_1791032405079`, built from all 48 checked-in migrations without running the legacy demo seed. The older `event_platform` database retains its 38 migration records. No schema contraction was performed. The existing ngrok tunnel still points to localhost port 3000; API and bot run on ports 3001 and 3002.

The ignored local `.env` points to the new database, enables `EVENT_CONTENT_V2_ENABLED`, and retains development/mock payments and demo mode. Persistent media directories are `/Users/bekarys/TICKET/var/ngrok-v2/posters` and `/Users/bekarys/TICKET/var/ngrok-v2/draft-media`. Working ffmpeg/ffprobe binaries are in `/Users/bekarys/TICKET/var/ngrok-v2/codecs` and configured explicitly. Account photo references were retained; no account used a local poster file.

Automatic approval review rejected the first proposed old-source cleanup because blanket non-account-table truncation was too broad. The executed replacement uses row deletion with explicit event/purchase relationships and exact ID references. A rollback-only rehearsal on the restored backup passed first. All account tables, migrations, Telegram inbox rows, unrelated audit/outbox/webhook records, the reusable venue template and unassigned anonymous sessions were preserved. Only two backed-up local files referenced by deleted events were removed.

My two verification accounts, six events, twelve drafts, seven orders, six media assets and their outbox records were removed afterward. Cleanup preserved the tester's new draft; a second blank anonymous draft belongs to the creation page left open as the deliverable. Future tester-created records must not be cleared wholesale.

## Verification and fixes

Real browser interactions over ngrok covered anonymous drafting, a slot-2 image processed with Main/Background roles, overnight scheduling, password-login publication continuation, protected editing, saving an edit and viewing the changed public information page. The public homepage now loads an empty event list normally.

HTTPS API journeys covered paid general tickets and paid seated cart checkout in USD, immutable accepted snapshots, signed mock payment callbacks, active tickets/QR, repeat-safe full refunds and free registration/cancellation. The running metadata-free API rejected removed deposit input and invalid quantity with HTTP 400. No real payment was charged and no email/SMS/Telegram verification or ticket message was sent by these tests.

Three runtime defects found during activation were fixed:

- The owned editor now calls `/api/organizer/events/:id`; its former URL collided with the web page on the shared ngrok origin.
- Both payment controllers declare injected dependencies explicitly, so the tsx development loader can resolve them.
- Checkout and cancellation routes use explicit DTO validation, consistent with routes that cannot rely on emitted parameter metadata.

Validation: 19 targeted API regressions passed in the separate rehearsal database, including the new Nest dependency-injection regression; all nine typecheck tasks and six production-build tasks passed. Lint passed with the existing unused `ArrowIcon` warning. Whitespace and reset-tool syntax checks passed. Production web output was generated separately from the running preview and moved under the ignored backup directory. This adds activation evidence to the earlier batch suite; it does not imply live provider coverage.

Evidence: [backup and narrowed reset](ngrok-reset-evidence.json), [HTTPS smoke](ngrok-v2-smoke.json), [fixture cleanup](ngrok-smoke-cleanup.json), [final state](ngrok-final-state.json), [public page screenshot](browser-evidence/ngrok-v2-public.png), [ready wizard screenshot](browser-evidence/ngrok-v2-ready.png).

## Backup, restart and recovery

The private backup directory is `/Users/bekarys/TICKET/var/ngrok-reset-1791032405079` (mode 700). It holds `original.dump`, the original `.env`, private connection metadata, copied poster/media files, restore verification, private fixture metadata and validation/runtime logs. Credential-bearing files have mode 600 and are ignored by Git. Every row in all 40 original tables and both local media files matched the restored backup. The temporary database used to verify that backup was removed; the dump and media copies remain.

For a normal local restart from the repository root, use `pnpm_config_pm_on_fail=ignore pnpm dev` with the current `.env`, and retain/restart the existing ngrok tunnel to port 3000. Do not run the legacy seed against the new preview database. `preview.pid` and `preview.log` in the private directory identify the launched development process and its output.

Recovery must preserve new tester work first: stop the preview, back up the active database and media, then restore `original.dump` into a separately named local recovery database using `pg_restore --no-owner --no-privileges --exit-on-error`. Verify its row fingerprints against the private original report and restore backed-up poster files to the old configured directory. Review the original environment and compatible application revision before switching runtime configuration. This is a data recovery procedure, not a claim that an old application release was deployed. Never overwrite the new database or restore the original environment blindly after testing has begun.

## Limits before Azure

Google/Telegram sign-in, email/SMS verification, real payment charging, signed Wallet delivery and live translation still need provider-specific verification. The translation key is empty; manual multilingual content remains available. Paid checkout verification used the mock provider and a correctly signed simulated callback.

This ngrok activation does not complete Batch 13's storage contraction or Azure cutover/consumer observation. Compatible legacy storage is still present. After user acceptance, Azure needs its own verified database/media backup, explicit reset scope, migrations/configuration/codecs, deployment and smoke checks. No Azure action is authorized by this local reset.
