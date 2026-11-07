# Account redesign adapted to TICKET

Updated 7 October 2026. The Figma references guide account organization: sidebar navigation, tickets and orders, profile and login settings, and Telegram/notifications. Presentation follows the existing website design language.

- The original shared navbar is restored, including its wordmark, location picker, pill search, language picker, create-event control, favorites, theme, profile, logout, and mobile menu. There is no account header variant. Navbar, search, and option-picker source match their pre-redesign versions. Existing unrelated location-picker changes are preserved.
- Account styling inherits the global font and shared light/dark theme tokens without a local palette or font override. Cards, fields, buttons, role badges, and headings follow the site's existing rounded surfaces and typography.
- Ticket/calendar paths from the previous account page and heart/user/logout paths from the navbar are reused. Other symbols follow the site's rounded currentColor SVG style. Copied Figma application assets and their screen-specific lookup were removed; archived reference assets remain in this documentation.
- Sidebar links preserve locale, browser history, refresh, and modified clicks. Favorites and payment history remain available. Mobile uses scrollable section navigation and stacked content.
- Tickets retain accurate upcoming/past totals, admissions/attendance, recent orders, payment status, pagination, and organizer chat. Contacts remain separate from verified identities. Email code/resend/completion, Telegram linking, Google linking, password changes, and the existing unavailable SMS state remain intact.
- Notification preferences use keyboard-accessible switches with the site's primary color. Writes are serialized and rolled back on failure. Inbox retry/filter/read/pagination work independently of preferences. Profile, metrics, identities, preferences, events, and orders still load independently.
- Help opens an accessible guidance dialog with working payment-history and sign-in-settings links.

## Verification

Web TypeScript checking, focused lint, and diff whitespace checks passed. The browser regression script passed **83 assertions** with **zero browser runtime errors**, using a fresh Chrome profile and mocked APIs. It checks the shared navbar, inherited font and theme tokens, currentColor icons, headings, overflow, navigation/history, contact save, verification, preference rollback/persistence, inbox retry/filter/read, order chat, totals, isolated failures, help navigation, translations, and mobile/dark layouts.

Desktop, 1024, 768, and 390 px arrangements were checked. Updated screenshots in `browser-evidence/` were visually reviewed. Live email delivery, Google/Telegram providers, and payment providers were not exercised by the mocked run.

See [validation results](implementation-validation.json) and [browser regression script](verify-browser.mjs). To rerun, start the local web server and run `node docs/account-redesign/verify-browser.mjs` with Playwright available. `PLAYWRIGHT_MODULE`, `ACCOUNT_TEST_URL`, and `ACCOUNT_TEST_OUTPUT` configure the package, server, and output directory. The script never writes to a real account.
