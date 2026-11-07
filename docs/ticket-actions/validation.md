# Account ticket actions and content-language currency

Validated on 2026-10-12.

## Behavior

- New drafts default to RUB for Russian content, KZT for Kazakh, and USD for English.
- Explicit content-language selection updates and saves currency alongside pending edits. Existing numeric prices are not converted. Manual currency selection remains available and survives reopening. Editing an existing event retains its protected currency.
- The photo is smaller, using 32% of the desktop card width while keeping the afisha card's exact 16:9 frame and saved crop. The single-line title and status/countdown sit below the photo. Date/time and location occupy two stacked rows on the right, alongside the ticket buttons. Narrow screens stack the content vertically.
- The time row includes the end time when available. End dates are omitted for same-day events and included for overnight/multi-day events, using the event's timezone rather than the browser's timezone. Older events without an end time keep the start-only display.
- Every ticket retains its own download, QR and return controls. The single-ticket registration/type link has been removed; seat information remains. Multiple tickets still display their individual labels and statuses. Returned tickets have disabled controls; a selector is no longer needed.
- Organizer contacts and order chat remain available in a compact footer. The address opens a map in a new tab. Map links use saved coordinates when available and fall back to an address search for older events without a map pin.
- Downloads are complete printable PNG tickets with event title, ticket type, seat, venue, time, timezone, ticket ID and the server-issued QR image. Text is wrapped before calculating the image height.
- Contact details follow the organizer's existing publication preference. Chat links are available only to the buyer of a paid, refunded or cancelled order; existing server authorization remains authoritative.
- Returns use existing accepted purchase terms and cancellation endpoints, require separate confirmation, reuse an idempotency key on retry, invalidate the displayed QR, and refresh account totals, tickets and orders.
- The ticket detail page shares these controls and retains Apple Wallet when configured.

## Verification

- Shared types: 61 tests passed.
- Draft autosave, readiness and publication browser unit tests: 26 tests passed, including language-currency persistence, pending-price preservation, manual overrides and protected currencies.
- Ticket/account API unit tests: 7 passed, including contact privacy, buyer-only chat paths, ticket ownership query, QR invalidation, unavailable tickets and coordinate propagation in both account events and ticket details. Map URL unit tests: 2 passed, including exact pins, zero coordinates and legacy address fallback.
- Web and API type checks passed; changed-file lint and diff whitespace checks passed.
- Isolated browser fixture rendered the actual event-card, ticket-action, content-language and ticket-mode components. Checked all three automatic currencies and a saved manual override, downloaded and visually inspected the ticket PNG, displayed QR/contacts/directions and confirmed a simulated return with an idempotency key. The revised card was checked with two tickets, including an already returned ticket, full-width controls, and a coordinate map link with a new-tab target.
- The live account card was checked with its existing ticket: header contacts, QR display and return terms opened successfully. No real return was confirmed and no message was sent.
- Checked light/dark themes and 390px mobile width; document width matched the viewport with no horizontal overflow.
- Schedule formatting: 4 unit tests passed, covering same-day/overnight endings, UTC midnight versus the event-local date, and absent/invalid endings in all three site languages. Account API unit test passed with end-time and null fallback assertions. Web/API type checks, changed-file lint and whitespace checks passed.
- Latest live verification shows `20:00–23:00`, no registration link, and the status badge before the countdown. The photo frame measured 16:9 on desktop and mobile. An isolated overnight fixture displayed both dates; its 390px layout had no horizontal overflow.
- The smaller live desktop photo measured approximately 281×158px, retaining 16:9, with the title below its bottom edge. The live mobile account stayed signed in in a temporary tab and showed no horizontal overflow. Web type check, changed-file lint and whitespace checks passed after this layout revision.

## Scope of browser verification

The live account has one ticket. Its separate order-history request still displays an existing server error. The current event has no published organizer contacts; the contacts panel correctly shows that state. The live address uses address-search fallback. Exact-coordinate links and a completed return were checked with isolated fixtures. Existing chat routing and authorization were verified without sending a message. The temporary preview server and fixtures are outside the application and are not shipped.

## Screenshots

- [Current live ticket card](tickets-small-photo-live.jpg)
- [Current mobile ticket card](tickets-small-photo-mobile.jpg)
- [Overnight event on mobile](tickets-schedule-crop-mobile.jpg)
- [Dark mobile ticket card](tickets-schedule-crop-dark-mobile.jpg)
- [Desktop ticket cards](tickets-stacked-desktop.jpg)
- [Mobile ticket cards](tickets-stacked-mobile.jpg)
- [Dark mobile ticket cards](tickets-stacked-dark-mobile.jpg)

## Floating ticket dialogs and return labels

Validated on 2026-10-12:

- QR and return conditions open as centered native modal dialogs with the site's surface, border, accent, and backdrop styling. The event card height remains unchanged. Contacts and directions keep their inline panels.
- Verified Escape/Close behavior, focus restoration, focus within the modal, background scroll locking, and React StrictMode effect replay. Escape remains blocked while a return is processing.
- Verified a simulated return with an idempotency key, a successful return message, and disabled ticket/QR/return controls afterward. No real return was submitted.
- Labels now say “Возвращён” / “Returned” / “Қайтарылған” for returned tickets, including free registrations whose internal status is cancelled. Cancelled events remain distinct. Partial returns retain the participation state of remaining tickets/bookings.
- Three status-label regression tests, web type check, focused lint and diff checks passed.
- Desktop and 390px mobile dialogs fit the viewport; the mobile return dialog was checked in the dark theme. The existing returned ticket on the live account page shows “Возвращён” after reload.

Screenshots:

- [Floating QR dialog](qr-floating-dialog.jpg)
- [Floating return dialog](return-floating-dialog.jpg)
- [Mobile QR dialog](qr-floating-dialog-mobile.jpg)
- [Dark mobile return dialog](return-floating-dialog-dark-mobile.jpg)
- [Simulated returned ticket](returned-ticket-status.jpg)
- [Live returned ticket](returned-ticket-live.jpg)

## Event-end expiry

Validated on 2026-10-12:

- Upcoming/past lists use the event end timestamp, including overnight events. Events remain current while in progress. Legacy events without a valid end keep the existing start-time cutoff.
- At the exact cutoff, unused tickets display “Недоступен” / “Unavailable” / “Қолжетімсіз” and their entry controls disable. Attended and returned history retain their distinct labels. No ticket/payment status is rewritten to implement expiry.
- Open cards and QR/return dialogs update at the cutoff and on tab visibility changes. An open QR image is removed when the event ends. Account lists, tab totals and active-admission totals refresh at the next displayed event cutoff; normal background polling remains in place.
- Account active-admission counts exclude ended tickets and group passes. Ticket details include the event end timestamp. QR/Wallet retrieval and individual/group admission reject ended events on the server, including previously downloaded codes.
- Shared expiry tests: 3 passed. Account/ticket API unit tests: 12 passed. Guest participation-label tests: 4 passed. Existing account, my-events and ticket integration tests: 13 passed; numbered-seating/group admission integration tests: 4 passed.
- Shared, API and web type checks, focused lint, and whitespace checks passed. The local database integration tests needed normal local network access outside the sandbox; their isolated fixtures were cleaned up by the suites.
- Isolated browser verification used the actual card/actions components under React StrictMode: ongoing tickets stayed usable, ended tickets displayed unavailable, and a QR dialog lost its QR automatically after a ten-second test event ended. Mobile width was 390px with no horizontal overflow and no browser errors. No real event schedule or guest ticket was modified.

Screenshots:

- [Ongoing ticket](ticket-in-progress.jpg)
- [Ended unused ticket](ticket-ended-unavailable.jpg)
- [Open QR dialog after expiry](qr-expired-while-open.jpg)
- [Ended ticket on mobile](ticket-ended-mobile.jpg)
