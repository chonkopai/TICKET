# Event creation v2 — Batches 4–7

Implemented 3 October 2026 (Asia/Hong_Kong). Work is in the existing checkout; the three pre-existing untracked auth/proxy/audit files were preserved. Database mutations used only the named fresh and restored v2 rehearsal databases. No source migration, production deployment or external publication was performed.

## Batch 4: durable drafts

The creation API supports anonymous create/read/partial update/validate/delete, authenticated claim, bounded expiry and revision conflicts. Capabilities are random 256-bit secrets stored as server hashes and Secure HttpOnly SameSite=Lax cookies scoped to `/api/creation-drafts`. The cookie never enters JSON, query strings or local storage. Mutations check the exact configured Origin, fetch-site context, draft-bound CSRF and the current revision under a row lock. Wrong/guessed capability and ownership failures are uniform 404s; authorized expiry is explicit. Claim revokes the anonymous capability and binds subsequent CSRF to the authenticated session family.

The public same-origin transport streams through a Next route handler. Draft/media endpoints bypass the page proxy so a video upload is not copied into Next's small default proxy buffer. Optional authentication shares refresh handling with the established session transport. Browser autosave serializes revisions, retains edits made during requests, keeps an ID/text recovery record without secrets, and stops on conflicts. Explicit reload preserves the recovery backup. Refresh offers restoration without silently applying it; a changed server revision requires reviewing the backup first. Malformed or incompatible records are ignored. No anonymous Event/Organizer placeholders are created.

Eight service and two real HTTP tests cover incomplete roundtrips, cancelled-auth recovery, ownership/CSRF, expired/revoked capabilities, foreign media and simultaneous tabs. Seven autosave tests also cover pending translation edits, changed-back text, explicit backup restoration and invalid backup records.

## Batch 5: private media and framing

Five exact-position slots support JPEG/PNG/WebP images and MP4/WebM video, replacement/retry/removal, progress and durable processing states. Reservation and total-byte/count decisions share the draft row lock, including concurrent requests for the last slot. The first image becomes Main and Background; videos cannot become Main. Reordering swaps slot positions without changing roles. Removing a role asset selects a remaining suitable asset. Captions are independently localized.

Raw uploads stream into a private directory with limits, checksums, MIME/signature checks and atomic storage. Sharp decodes, applies orientation and strips metadata into WebP derivatives. FFprobe validates video streams, dimensions/container/duration; FFmpeg produces a safe MP4, poster and actual derivative dimensions. Gallery audio is retained behind user controls; background playback is muted/inline with pause, reduced-motion/data and failure fallback. Missing codecs produce a failed state rather than fabricated readiness.

The UI has two columns on narrow screens and three on desktop, dark round remove controls, separate Main/Background badges, exact-position plus slots, accessible arrow moves and long-press touch dragging. Card 8:5, actual featured-image frame, desktop background and mobile background previews share `mediaFrame` through the exported `FramedMedia` component. Crop values do not alter original bytes. The normalized public consumers will import the same framing component in Batch 10; no new live publication is claimed before Batch 9.

Cleanup rechecks draft, publishing/event links, legacy and purchase/snapshot references under locks, marks an asset as collecting before filesystem deletion, and refuses new attachment to collecting assets. A database trigger atomically retains every asset linked by EventMedia, including after later unlinking. Recovery grace protects assets from expired/deleted drafts. Private storage is mounted in demo compose; the runtime image installs FFmpeg.

Eight real codec/storage tests cover exact two/four/five slot counts, concurrent sixth rejection, role/order/crop retention, actual image decoding/orientation, MP4/WebM processing, video duration/missing processor failures, scoped media and archived published retention. The browser uploaded into slot 3, moved it into slot 2 and retained both roles after refresh and hall navigation. The five slots were verified as two columns at 360px and three at the default desktop viewport.

## Batch 6: selected sale mode and existing hall

Free, general-ticket and hall forms are exclusive for sale but persist separately in the draft. General ticket types and hall tariffs have stable IDs, localized names/descriptions, exact integer minor-unit prices and finite capacities. Only active resources used by actual saleable objects satisfy hall publication requirements; an unused positive tariff cannot make zero-price seating valid. Currency choices come from the configured payment adapter: the development mock declares KZT/USD/EUR; an unsupported production adapter declares none. Changing currency explicitly relabels unchanged minor amounts; templates reject implicit conversion to another event currency.

Free registration creates a zero-value Order and active QR ticket without any Payment attempt or provider link. Free cancellation releases capacity and does not request a monetary refund. Paid refund conditions are required by the publication contract when enabled; explicit No clears localized conditions. Switching into free preserves inactive paid policy text while showing only the free cancellation summary.

The anonymous hall route uses the existing geometry/undo/revision editor through a capability-scoped adapter and returns to the same draft/language/step. Protected owned routes remain protected. New stored hall JSON v3 contains geometry/annotations/style references, while tariff prices and localized sale content live in normalized records; current deposit and duplicate pricing fields are absent from that JSON. Transient v2 projections keep existing protected editor/seat/checkout consumers working. Canonical owned roundtrips and template cloning preserve Unicode labels, incomplete prices, inactive tariffs and event currency. New canonical structures obey draft/history locks; controlled v1 legacy editing retains its existing behavior.

Checkout now handles a standalone seat without assuming a parent row. Charge totals use checked bounds before order/reservation creation. Existing historical deposit paths remain in place. Seven canonical sale tests cover all modes, USD amounts, free QR/cancellation, published/held/history locks, ownership, Unicode/template roundtrips, inactive blank tariffs and overflow rollback. Existing venue/seat/booking suites, including the 2,000-seat case, pass. Browser evidence shows a saved one-seat USD 25.50 VIP hall, and its existing image/roles survive the roundtrip.

## Batch 7: partial locales and real provider integration

RU/ENG/KAZ tabs edit ru/en/kk without changing the source language captured at creation. Missing target fields stay blank. Shared modes, prices, capacity, geometry, crops and slot roles remain shared. Both steps expose translation actions and counts; event text, refund conditions, free/general ticket names/descriptions, hall tariff names/descriptions and captions are collected by stable field keys.

The existing event editor and new drafts share Google Basic v2 transport with validated server-only configuration, bounded timeout/retries, a source-hash language-pair cache and owner/signed-browser request/character quotas. External calls stay outside transactions. Default actions fill missing targets; explicit consent is required to replace existing text. Final application checks the draft revision plus source/target text and field revisions under the lock. Even an unrelated concurrent server edit conservatively requires retry. Manual edits made on the requesting page are preserved while the request runs, including array-based ticket fields and changes back to their original value.

Server-owned metadata records origin, source hash, revision, review and field-level staleness. Shared changes do not stale text. Review acknowledges the current source hash. Overlength results remain full editable proposals; applying an edited proposal rechecks source/target revisions and length. Typing/paste/API writes use shared grapheme limits and IME-aware counters. Optional incomplete locales do not block complete-source publication.

Nineteen translation tests cover all six pairs, both-step field collection, explicit replacement, late source/manual edits, field staleness/review, proposals, authorization, cache, scoped quotas, retries, timeouts, invalid responses and sanitized failures. The browser verified blank target fields, manual Kazakh text, shared USD values and persistence after refresh. **Live smoke: not run, because the configured key is empty.** The interface honestly reports this and permits manual entry. See [provider/runtime setup](translation-provider-setup.md) for official references and live verification prerequisites.

## Verification and remaining scope

| Check | Result |
| --- | --- |
| Full API suite, opt-in DB tests enabled | 237 passed; 50 files; isolated fresh database |
| Shared contracts | 29 passed |
| Config / bot / database packages | 6 / 15 / 5 passed |
| Backfill planner | 12 passed |
| Browser autosave / existing auth / existing proxy / existing hall state | 7 / 1 / 11 / 3 passed |
| Total distinct automated tests | 326 passed |
| API/bot/shared/config/database/web type and build checks | Pass |
| Next production build | Pass, separate `.next-v2-preview` output |
| Lint / diff whitespace | Pass; one existing `ArrowIcon` unused warning |
| Prisma validation / seeded db:verify | Pass; verify uses isolated fresh database |
| Additive migrations, fresh vs restored | Zero schema differences; event counts remain 25 / 43 |
| Source database | Read-only: all 17 fingerprints and 38 migration records unchanged |

The pnpm launcher could not verify/download the pinned 11.19.0 release because registry fetches failed. Verification used the already installed package binaries for the same package scripts; signature verification was not disabled. An initial Next build inherited development mode and failed in `_global-error` prerender. The production-mode rerun passed. A browser-test bundling issue with Next's CommonJS internals was fixed by resolving Next as an external installed runtime. These were runner/environment corrections, not suppressed product failures.

Four new additive migrations cover media lifecycle, permanent media retention, translation cache and inactive hall tariffs. Their final fresh/restored catalog comparison is in [migration evidence](batch-2-migration-rehearsal.json). Source preservation is in [the read-only comparison](batches-4-7-source-preservation.json).

Batch 8 remains pending: full wizard classification/schedule/conditional layout, entry CTA switching and comprehensive responsive/accessibility polish. Batch 9 will connect verified authentication/claim to the atomic idempotent publisher. Batch 10 will switch normalized public consumers and live rendering. No source migration, old-column contraction, deployment, external publication or live provider success is claimed by this report. Temporary agent preview servers/tabs were stopped; the pre-existing development server was preserved.
