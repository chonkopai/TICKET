# Staging frontend polish — October 24, 2026

Implemented the eleven browser comments:

- Removed the desktop header support shortcut; account and organizer support remain available in their workspaces.
- Restyled the city suggestion and centered it beneath the location control on desktop.
- Moved time-of-day options into the existing catalog filter panel and added sunrise, sun, sunset, and moon icons. Mobile and tablet use a dedicated row within that panel.
- Added card spacing, typography, and a centered illustrated empty state to platform support.
- Support-order and payment-history contact buttons open one shared chat window. Desktop supports dragging, keyboard movement, and interaction with the page behind it. Mobile uses an overlay, locks background interaction and scrolling, and keeps focus inside the dialog.
- Chat notifications provide a Reply button opening that same window for either guest or organizer messages.
- Restyled verification fields, spacing, status header, and file upload. Removed the redundant initial application button when the form is already visible.
- Selecting Other reveals a required entity description. It is validated and saved with the application and included in its support conversation for moderators.
- Organizer events and profile headings now stack and align to the left.
- Replaced the create-event calendar icon with a ticket-and-plus icon.

## Validation

- Production Next.js webpack build and frontend TypeScript check passed in an isolated snapshot containing only the files in this release.
- API production TypeScript build passed after regenerating Prisma and rebuilding the database package.
- Shared-types tests: 80 passed, including four new entity-description tests.
- Staff security tests: 3 passed.
- Prisma schema validation and client generation passed.
- Repository lint and git diff whitespace checks passed.
- Headless Chrome against the local frontend with mocked API fixtures: catalog filter placement and query changes, city-suggestion alignment, support empty state, chat opening from support/payments/notifications, sending, dragging, mobile modal behavior, organizer headings, conditional verification field, mobile/tablet filter separation, page overflow, latest-message scrolling, earlier-message position preservation, and notification focus restoration checks passed against the production build with no browser exceptions.
- Desktop, mobile, and dark-theme screenshots visually inspected. Screenshots use sample data; they are not evidence of a staging deployment or live message delivery.

## Code review

Fixed two issues before release: long conversations now open at the latest message and follow sent messages while preserving the reading position when earlier messages load; closing a chat opened from the header notification popover returns focus to the persistent notification button. Organizer replies also use the correct dialog label.

### Build correction

The first release spread an optional entity description into Prisma create data. A clean database-package rebuild exposed the `exactOptionalPropertyTypes` mismatch that stale local database declarations had hidden. The API now explicitly stores absent descriptions as null; supplied descriptions remain unchanged. Validation must build the database package before building the API.

## Deployment

Not deployed by this change. Apply the additive migration `20261024090000_verification_entity_details` before releasing the updated API and web containers. Existing applications retain a null entity description. A new Other submission must include a description. No staging data was modified during UI testing.

## Screenshots

- [Catalog desktop](catalog-desktop.png), [catalog mobile, dark theme](catalog-mobile.png)
- [Platform support](support-desktop.png)
- [Verification](verification-desktop.png)
- [Organizer events](events-desktop.png), [organizer profile](profile-desktop.png)
- [Chat desktop](chat-desktop.png), [chat mobile](chat-mobile.png), [chat dark theme](chat-dark.png)
