# Shared sign-in across tabs

Validated on 2026-10-12.

The login previously lived in sessionStorage, which is isolated per tab. Sessions now use same-origin localStorage. Existing tab sessions migrate on first read. An explicit shared sign-out marker prevents stale legacy tabs from restoring a signed-out account.

Navbar, protected pages, organizer workspace, location preferences and checkout listen for cross-tab session changes. Protected content remounts when the account changes. Token renewal uses a browser-wide lock and re-reads current tokens, preserving another tab's successful renewal and preventing delayed responses from restoring a signed-out session.

Verification:

- 6 session tests passed: migration, a new tab with empty tab storage, shared sign-out, user updates, subscriptions, malformed storage and restricted-storage fallback.
- 5 refresh tests passed: concurrent requests, browser-lock waiting, stale responses, sign-out during renewal and account changes.
- 5 publication continuation and 9 Telegram login regression tests passed.
- Web type check and changed-file lint passed; no diff whitespace errors.
- Reloaded the existing signed-in main page to migrate its login, then opened a live event in a separate new browser tab. Both showed Bekarys Suyum. No tokens were inspected or copied by the browser test; no purchases, messages or sign-out actions were performed.

[Live event tab showing the shared account](session-cross-tab.jpg)
