# Event creation and event information: architecture audit

Investigated on 2 October 2026 against checkout `e3563b9`. This is a source-code investigation, not a production database audit or a browser-based visual verification. No application code, schema, database contents, or existing untracked tests were changed during the investigation.

The executable redesign brief is in [the implementation prompt](/Users/bekarys/TICKET/docs/event-creation-v2-implementation-prompt.md). Statements below describe the current code; decisions in that prompt describe the proposed replacement.

## Current creation flow

1. [navbar.tsx](/Users/bekarys/TICKET/apps/web/src/components/navbar.tsx) sends an anonymous “Create an event” click to login with an account-profile return path. Organizers go to `/organizer/events/new`; authenticated guests go to their profile.
2. [new/page.tsx](/Users/bekarys/TICKET/apps/web/src/app/organizer/events/new/page.tsx) renders `EventForm`. [event-form.tsx](/Users/bekarys/TICKET/apps/web/src/app/organizer/events/_components/event-form.tsx) wraps its editor in `ProtectedRoute`. The wrapper checks the browser session and displays a login-required panel for visitors.
3. The wizard has **six** steps: basics; description/poster; rules and terms; payment policy; tickets/hall; review. Saving the first step calls authenticated event creation and redirects to `/organizer/events/:id/edit?step=2`.
4. Source text is saved in `sessionStorage`, with server autosave after a draft exists. The language editor uses a separate translation state/cache. This is not an anonymous durable draft system, and selected `File` objects are not recoverable through JSON/sessionStorage.
5. [sales-resources.tsx](/Users/bekarys/TICKET/apps/web/src/app/organizer/events/_components/sales-resources.tsx) manages tickets and hall resources after an event ID exists. The [hall studio](/Users/bekarys/TICKET/apps/web/src/app/organizer/venue-builder/_components/hall-studio.tsx) is also protected and loads an owned event and venue layout. Removing the creation page’s auth wrapper alone would therefore leave ticket, upload, translation, and hall actions unusable.
6. Publish calls the server and redirects to `/organizer/events?published=1`, not the event’s creation editor.

## Backend and persistence

The stack is Next.js/React, NestJS, PostgreSQL/Prisma, shared TypeScript/Zod contracts, and a Telegram bot. Exact installed conventions matter: [web/AGENTS.md](/Users/bekarys/TICKET/apps/web/AGENTS.md) requires reading the installed Next.js guides before application-code changes.

| Area | Current architecture | Consequence for the redesign |
| --- | --- | --- |
| API access | [EventsController](/Users/bekarys/TICKET/apps/api/src/events/events.controller.ts) is class-wide JWT- and organizer/admin-role protected | Anonymous creation requires a separate capability-scoped draft API; do not remove guards from existing organizer endpoints |
| Event creation | [EventsService](/Users/bekarys/TICKET/apps/api/src/events/events.service.ts) creates a draft with required title, location and start fields, and writes audit/outbox rows transactionally | Step 1 cannot immediately create an ordinary `Event` with the current required columns |
| Publication | Locks the `Event` row, validates required source content, validates deposits for deposit events, changes status, and writes audit/outbox; repeated publish is idempotent | Retain the locking, lifecycle and audit guarantees; replace completeness validation with the three new ticket modes and media/localization rules |
| Identity | Sign-up creates a guest. [becomeOrganizer](/Users/bekarys/TICKET/apps/api/src/auth/auth.service.ts) respects `ORGANIZER_REQUIRES_APPROVAL` | Logging in after Publish does not automatically make the user eligible to publish. Continuation must handle role enrollment and the approval policy |
| Event content | [schema.prisma](/Users/bekarys/TICKET/packages/database/prisma/schema.prisma) stores source text directly on `Event` and other languages in `EventTranslation` | Normalize all languages into one content model after an additive transition; avoid keeping two permanent sources of truth |
| Schedule | `date` and `time` are separate PostgreSQL fields, plus an IANA timezone; public serialization derives `startsAt` | There is no end time. Existing records must not receive invented ends |
| Media | `posterUrl` and `galleryUrls: String[]`; [object storage](/Users/bekarys/TICKET/apps/api/src/events/object-storage.ts) is poster/image-specific | No typed media roles, ordering, crops, video processing, or draft media ownership exist |
| Ticket inventory | `TicketType`, reservations, issued tickets, and order links; hall seats also map to ticket types | Preserve resource IDs and inventory integrity during normalization |
| Hall inventory | `VenueLayout`, tables, rows, seats, allocations, holds and group passes; layout revisions and structural locks | Adapt editor persistence instead of rebuilding the seat/hold engine |
| Currency | Ordinary types have a currency, but [hall persistence](/Users/bekarys/TICKET/apps/api/src/venue/hall-editor.persistence.ts) writes `KZT`; the hall UI formats prices with `₸` | An event currency dropdown must change server persistence, contracts, editor labels and checkout validation together |
| Deposits | Event mode/terms/display flag, ticket/table/row amounts, layout JSON objects, `Deposit`, checkout snapshots and `OrderType.deposit` | Removal touches financial history and backend consumers, not just form components |

### Translation

[EventTranslationsService](/Users/bekarys/TICKET/apps/api/src/events/event-translations.service.ts) already calls Google Cloud Translation Basic v2 for `ru`, `kk`, and `en`. `.env.example` documents `GOOGLE_TRANSLATE_API_KEY`, but the service reads it directly from `process.env`; it is not part of the inspected validated API env schema.

Existing protections include source hashes, stale-machine-translation detection, preservation of manually edited translations, and checks against source changes during translation. These are useful and should survive. Current translation operates only on an owned persisted event, expects a complete translated event-content object, and does not provide general translation storage for organizer-defined ticket names/descriptions or hall tariff text. The new editor needs partial draft localization and field-level completeness, plus the ticket/tariff scope.

Google documents Russian `ru`, Kazakh `kk`, and English `en` as supported languages. Keep `KAZ` as the UI label and `kk` as the stored/API language code. Sources: [supported languages](https://docs.cloud.google.com/translate/docs/languages), [Basic v2 translate endpoint](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate).

### Payments and refunds

[BookingService](/Users/bekarys/TICKET/apps/api/src/booking/booking.service.ts) chooses deposit versus price, persists purchase terms and amounts in `checkoutSnapshot`, creates deposit rows, handles general tickets/tables/seats/cart purchases, and settles inventory. Existing anonymous checkout has coverage for zero-priced orders settling without `Payment` or `Deposit` rows; reuse and verify that behavior for the new free mode.

[RefundService](/Users/bekarys/TICKET/apps/api/src/booking/refund.service.ts) operates on confirmed payment/order history. Management summaries, analytics, CSV export, ticket delivery, buyer pages and bot messages also consume deposit history. A new “refund available” choice must have defined purchase-time semantics; a Boolean alone cannot implement every free-form refund condition.

Do not rewrite settled `Order.amount`, `Payment.amount`, original snapshots or past terms. Removing the product feature can coexist with a narrowly isolated historical reader until historical storage has been safely archived/migrated and reconciled.

## Current event information and card design

[event-client.tsx](/Users/bekarys/TICKET/apps/web/src/app/events/[id]/event-client.tsx) renders:

- A full-width poster hero, approximately 470–500 px minimum height, dark gradients, large title, announcement, metadata, favorite and share actions.
- A desktop two-column body with about text/gallery on the left and checkout on the right; a full-width interactive hall below when present.
- Program/location sections, followed by rules/conditions accordions and organizer information.
- A gallery with one large image and two small images. It takes the poster plus at most two gallery URLs, and fills missing/broken media with bundled reference photos. This does not implement five ordered uploads or video playback and can display imagery the organizer did not upload.
- Plain text with preserved line breaks; the new single description can retain this safe rendering model.

[page.tsx](/Users/bekarys/TICKET/apps/web/src/app/page.tsx) contains the homepage card implementations. Ordinary cards use `aspect-[1.6]`, two-line titles, venue/date and price. The featured carousel uses wide cards with title and announcement beside an image, currently positioned at `center 25%`. Both read `posterUrl`, so replacing it must include both card renderers, the featured image framing and social metadata in [events/[id]/page.tsx](/Users/bekarys/TICKET/apps/web/src/app/events/[id]/page.tsx).

This code establishes the current visual hierarchy. It does not verify live appearance at particular screen sizes. The user subsequently supplied a media-upload reference on 2 October 2026: a square tile grid with solid outlined plus slots, circular remove controls, a Main badge, numbered positions and drag-reorder guidance. The implementation prompt incorporates that style with five upload slots and a separate larger preview. The screenshot itself shows six equal slots; its slot count does not override the explicit five-upload requirement, and it is not a reference for the entire public event page.

## Safe implementation boundaries

**Replace:** six-step orchestration, payment-policy UI/DTOs, separate old content editors, poster-only management, raw gallery URL storage, hardcoded hall currency, and obsolete current-format deposit pricing branches.

**Preserve and adapt:** ownership guards, identity verification, organizer approval policy, event IDs and lifecycle, hall geometry/revisions, inventory locks and partial unique indexes, orders/payment webhooks/refunds, QR/scanning, audit/outbox, buyer history, delivery and bot integrations.

Before destructive SQL, inventory all existing event-content lengths, missing ends/media/capacities, mixed currencies, active deposit events, pending checkouts and historical money links in the actual target database. Source inspection cannot answer those production-data questions. Use new migrations, bounded backfills, compatibility reads, reconciliation, staged cutover and a later contract migration; do not reset the database or rewrite applied migration files.
