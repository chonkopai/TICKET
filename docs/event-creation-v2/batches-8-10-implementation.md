# Event creation v2 — Batches 8–10

Completed 3 October 2026, with local and isolated database evidence. These batches are implemented; production deployment and live provider verification remain outside this authorization.

## Batch 8 — Two-step creation and owned editing

All creation entry points now open `/events/create`; the old organizer creation route redirects there while preserving interface language. Visitors can complete Tickets and Details without logging in. Durable autosave, recovery, media slots/roles/crops, counters, locale tabs, conditional inventory/refund fields and anonymous hall navigation use the existing draft aggregate. Navigation, Preview and Publish flush pending saves. Publish reports localized validation errors before opening authentication.

Details contains explicit start/end date and time controls, country/category/city/age and IANA timezone. Partial values remain valid drafts; publication requires a coherent interval, handles daylight-saving ambiguity explicitly and rejects nonexistent local times. Native date/time input events were verified in the browser, including an overnight interval.

The shared preview uses an accessible native dialog, actual uploaded media, the public framing component and normalized description/refund text. Escape closes it and returns focus to Preview. Framing wrappers keep measured media containers relative while positioning backgrounds and wide-card media correctly. Fixed bottom controls have sufficient mobile clearance. New events use a protected owned-edit adapter with separate revisioned editing drafts; structural inventory and financial changes remain locked.

## Batch 9 — Authenticated publication

An explicit Origin/CSRF-checked request validates publication and creates a short-lived intent for the exact draft revision and content hash. It binds to the signed browser scope. Existing drafts without the new browser cookie acquire that binding on the protected intent mutation. URLs contain only draft/intent IDs and locale values; they contain no capability or CSRF secrets.

The continuation uses the existing safe auth return path shared by password login, verified registration, Google and Telegram. After session establishment it calls a protected publication POST. Reading the continuation or adding a query flag cannot publish. The server locks the draft, intent and authenticated identity, checks organizer eligibility, enrolls eligible guests, persists normalized content/media/inventory, creates the published event and audit/outbox, and consumes the intent in one transaction. Failed final persistence rolls everything back. Consumed-intent replay returns the same event, including after a lost response; retries obtain fresh owned CSRF. The client shares repeated continuation calls and clears the consumed creation pointer so the next Create starts a new draft.

Success opens the same event's protected two-step editor with a publication confirmation. Approval blocks, expired/stale intents, wrong accounts/browsers, failed authentication and cancelled auth preserve the draft. Editing compares the published event revision and immutable sale structure, writes localized content/media/details atomically, and advances the refund policy revision when its promise changes.

## Batch 10 — Presentation, purchase promises and historical readers

New wizard events explicitly carry `creationVersion=2`, independently of the default-off rollout flag for legacy events. Their public/list/search/preview/seat serializers read the normalized aggregate and fail closed if reconciliation is required. Locale selection uses one complete, current locale for the whole event and sale content; incomplete/stale targets fall back to the labelled source. Search results are checked against the text actually displayed. Optional stale resource descriptions and media captions are hidden. Public cards/background/gallery use actual asset roles, order, crops and bounded public streams. New presentation has one description, explicit refund availability and real start/end/timezone; fabricated gallery/program content is removed. Controlled legacy reads retain historical behavior.

All four checkout paths store a validated version-2 accepted snapshot before creating an order. It freezes displayed locale, title/location/schedule, stable selected resource IDs and names, exact integer unit/total amounts and currency, seat labels, refund availability/conditions/revision and acceptance time. Checkout rejects a changed policy or a locale that no longer matches the displayed presentation. Free registration issues active QR admission without a provider charge and opens the ticket directly. Paid general, seats, whole tables and combined hall carts retain transactional inventory locks and idempotent settlement.

One version boundary projects new snapshots into existing account, quick/payment status, delivery, ticket/Wallet/bot and management readers while preserving unversioned historical JSON. QR tokens and existing financial records are unchanged. Resource names and seat labels come from the accepted promise across subsequent event edits. Buyer cancellation honors an accepted No-refund policy; free cancellation remains available. Organizer exceptions retain their explicit reason and record an immutable accepted refund snapshot including policy revision, actual payment amount and currency. RefundRequest's added snapshot is nullable, preserving historical rows. Notifications use actual UTC schedules and changed published fields; audits/outbox stay transactional. Existing analytics/export amounts continue to come from canonical Order/Payment records.

## Verification

**359 distinct automated tests pass.** Targeted reruns are not added to that total.

| Suite | Passed |
| --- | ---: |
| API, including opt-in isolated PostgreSQL, HTTP, media codecs and publication/purchase/refund integration | 257 |
| Shared contracts and historical snapshot reader | 32 |
| Configuration | 6 |
| Bot | 15 |
| Database compatibility | 5 |
| Backfill planner | 12 |
| Browser autosave/publication/auth-return/proxy/countdown/hall geometry/state | 32 |

After the complete API run, the affected publication, My Events and email-delivery suites were rerun: all 21 tests passed. Coverage includes all three publication modes, simultaneous publication/replay/lost response, rollback on outbox failure, ownership/CSRF/Origin restrictions, coherent translated search, protected edits, accepted No-refund promises and organizer exceptions, last free registration contention, exact USD purchases, normalized hall seats/whole tables/combined carts, payment retry, cancellation and historical purchase regressions. Existing auth suites exercise verified registration, verification failure/replay/expiry, password login and session revocation; the shared continuation allowlist is checked in RU/EN/KK.

Package/API/bot builds and web typechecking pass. Next.js production webpack build passes with 19 generated static pages and the dynamic creation, continuation, editor and public routes. Prisma schema validation, isolated seeded database verification and whitespace checks pass. Lint passes with the existing unused `ArrowIcon` warning. The installed pnpm launcher attempted an unavailable pinned runtime; checks used installed package binaries without weakening signature verification. Sandbox-blocked local database/HTTP test attempts were rerun with authorized local access; final runs have no failures or skipped API tests. The existing pg query deprecation warning remains.

## Browser evidence

A disposable verified local guest completed password login from Publish. The continuation enrolled the guest and published the existing anonymous draft once, then opened event `e973a107-4a67-4a16-9ffe-e2cc3a91df54` in the protected editor. The source event has EN content, a partial KK title, one image in slot 2 carrying Main/Background roles, USD free inventory and an overnight Asia/Almaty schedule. This is test content, not a real advertised event.

- Creation/editor/public views were checked at 360, 390, 768 and 1440 viewport settings for overflow and sticky-control clearance; mobile backgrounds use 9:16 and desktop 16:9. Preview Escape/focus restoration passed. Wide-card positioning was checked after the final wrapper fix.
- The live browser used the ordinary password sign-in UI, automatic publication continuation, public event, protected editor and next fresh Create. Signing out and opening `/organizer/events/new?lang=kk` redirected to the anonymous two-step wizard.
- The KK public interface displayed a visible English fallback label, with coherent source event and Registration text. Free registration issued active QR tickets; Open ticket reached the account ticket with the frozen title/resource name. Two disposable zero-charge registrations remain on the browser fixture after the confirmation-copy fix.
- Screenshots: [published editor](browser-evidence/batches-8-10-published-editor.jpg), [preview](browser-evidence/batches-8-10-preview-desktop.jpg), [public desktop](browser-evidence/batches-8-10-public-desktop.jpg), [public mobile](browser-evidence/batches-8-10-public-mobile.jpg). Earlier preview screenshots precede the final end-date text enhancement.

## Database preservation and remaining gates

Two additive forward migrations implement publication/editing provenance and accepted refund snapshots. They were applied only to the isolated fresh/restored databases. [Final migration rehearsal](batches-8-10-migration-rehearsal.json) reports zero schema differences across columns, constraints, indexes, triggers, functions and enums. Repeating migrations changes no event counts: fresh 26→26, restored 43→43. The fresh copy's additional event is the intentional browser publication fixture; it previously contained 25 seeded events.

[Read-only source comparison](batches-8-10-source-preservation.json) confirms all 17 tracked table fingerprints and all 38 original migration records still match Batch 0. `localhost:5432/event_platform` remains unmigrated. Original checksum provenance and legacy deposit/hybrid/currency/content/media exceptions remain recorded in the durable progress file. The three pre-existing untracked user files were preserved.

Live Google/Telegram provider login, signup email/SMS delivery, Google translation, payment-provider charging and signed Wallet delivery were not claimed. Browser smoke used a disposable pre-verified account; provider failure and auth registration logic have automated coverage, but real provider credentials/staging are required for live evidence. Outbound email/SMS were disabled for preview. Live translation remains unavailable because the configured key is empty. No deployment or external messages occurred.

Legacy editing/writing compatibility and historical deposit storage remain for Batch 11; staging, production inventory, restore/rollback and cutover evidence belong to Batch 12; contraction requires Batch 13's observed deployment evidence. Temporary preview servers and the agent-created browser tab were stopped, the viewport override reset, and the existing development server preserved.
