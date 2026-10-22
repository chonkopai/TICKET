# Browser feedback updates — 22 October 2026

Implemented locally on top of the existing uncommitted purchase-linking and catalogue changes. Not committed, pushed, deployed, or applied to a remote database.

## Implemented

1. Desktop and mobile account/login links open a separate tab and preserve the selected language. Authentication continues in that tab; the existing shared session handles sign-in across tabs.
2. New visitors keep All countries selected. Approximate IP location becomes a small confirmation beside the navbar picker, rather than automatically changing the catalogue. Failed lookups leave the selection unchanged. Dismissal is remembered for the detected city and signed-in identity during the browser session.
3. Account preferences save country, city, and display currency together. Cities follow the selected country and include published locations. Historical saved city aliases resolve their actual country instead of being forced into Kazakhstan. A different detected city offers Yes or continuing in the selected city. Currency display follows account preferences when valid conversion rates are available; checkout currency is unchanged.
4. Recovery returns localized unregistered-email or unregistered-phone feedback before checking delivery-provider availability. Existing credential rate limits remain. Phone registration stays unavailable; recovery can report an unknown phone without attempting SMS delivery.
5. OIDC already requests `telegram:bot_access`; verified successful login now records the private-chat recipient. The legacy widget already requests write access; its authenticated `write_access_allowed` webhook now records permission without a separate /start. Explicit Telegram account linking already records the chat. Returning to the account refreshes its connection status. Permission is required; associating an identity alone does not manufacture messaging consent.
6–7. Requested ticket/payment and picks/offers labels, with corresponding English and Kazakh copy.
8. Removed both support cards from payment history. Support remains in its own tab.
9. Added children, adults/18+, cinema, exhibitions/museums, and tours/recreation to the shared category schema, database enum, creation/edit labels, and catalogue.
10. Added toggleable morning/day/evening/night filters with URL state, clear-all behavior, and API filtering. Ranges use the event's local advertised start time: 06:00–11:59, 12:00–17:59, 18:00–23:59, and 00:00–05:59. Existing matching-first catalogue behavior labels nonmatching events as Other events.
11–12. Catalogue order is categories, heading, dates, time periods, promotion, remaining filters.

## Validation

- 55 API tests passed in eight focused files; one pre-existing database integration test skipped because its explicit opt-in flag was unset.
- 76 shared-types tests passed across twelve files, including the new period-boundary tests.
- Seven bot tests passed, including handling the actual messaging-permission service update without /start.
- Three catalogue-location tests passed, including lookup failures, saved selection persistence, and country resolution for Moscow/Astana/Dubai aliases.
- Web, API, and bot TypeScript checks passed. Shared types and Prisma client generated successfully; Prisma schema validation, focused lint, and Git whitespace checks passed.
- Actual frontend ran locally against a temporary fixture-only API, without Docker/ngrok or customer records. Confirmed a separate login tab, country/city/currency save feedback, Telegram connected state, exact notification labels, support-free payment history, both unregistered-contact messages, and time-filter URL state/toggling.
- Catalogue measured 390px document width at a 390px viewport. Screenshot artifacts contain isolated test data; catalogue is intentionally empty in the fixture.

## Remaining deployment validation

The included `20261022090000_regional_preferences_and_categories` migration adds two nullable User fields and five enum values. It must be applied before deploying the updated API. No database-backed integration run or live Telegram permission/message-delivery test was performed. External IP lookup behavior is covered with controlled responses and failure tests; the real detected-city prompt was not exercised end to end in this environment.
