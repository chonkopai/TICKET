# Public event booking panel

Validated on 2026-10-12.

The booking panel now uses the site's white/lavender surfaces, purple accent, rounded cards and existing line icons. Ticket types have Add buttons and inline quantity controls. The order summary separates item prices from the total; free registration is labelled “Бесплатно” instead of repeating zero-value prices. Refund conditions expand on demand, email delivery uses a compact switch and a single recipient address, and the main checkout action occupies the full width. Desktop panels use 400px when space allows and stack naturally on phones.

Workflow references were [Eventbrite's checkout guide](https://www.eventbrite.com/help/en-us/articles/333111/www.eventbrite.com/) and [Ticketmaster's seat-selection guide](https://help.ticketmaster.com/hc/en-us/articles/9786899270545-What-is-the-interactive-seat-map-and-how-do-I-use-it). The visual styling follows TICKET's existing design rather than reproducing those brands.

## Verification

- Web type check, focused lint and whitespace checks passed.
- All five existing draft-preview tests passed, including free tickets, seating projection and localized preview labels.
- The live event page rendered the new panel without browser errors. Only a local ticket selection was made; consent was not accepted and no real checkout or email request was submitted.
- An isolated browser fixture used the actual checkout and email components under React StrictMode. Mocked requests verified free registration, paid mixed-ticket checkout, combined zone/table/seat checkout, guest checkout links, email verification and success links. Request bodies retained consent, content language, recipient grants and idempotency keys.
- Checked the ten-ticket quantity limit, keyboard focus after adding/removing a ticket, and selection clearing. Clearing the selection also clears pending email delivery, so it cannot leave checkout blocked by a hidden verification form.
- Checked sold-out state and Russian, English and Kazakh labels. Mobile document width matched the 390px viewport, including the long Kazakh headings. Light and dark themes were visually checked.
- The full guest checkout page retains its existing email presentation; the compact variant is used by this event panel.

## Screenshots

- [Live event panel](checkout-live-desktop.jpg)
- [Paid-ticket desktop panel](checkout-paid-desktop.jpg)
- [Free registration and email delivery on mobile](checkout-free-mobile.jpg)
- [Dark mobile paid-ticket panel](checkout-paid-dark-mobile.jpg)

The temporary test server and fixtures live outside the repository and were stopped after verification.
