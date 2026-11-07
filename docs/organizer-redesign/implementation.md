# Organizer redesign implementation

Implemented 7 October 2026. Both organizer pages use the supplied references for layout while retaining TICKET's established design language and original shared navbar.

## Result

- A shared organizer sidebar provides identity, live event count, Events/Profile navigation, saved contact status, guest-account navigation, help guidance, and logout. It is used only by `/organizer/events` and `/organizer/profile`; event management, analytics, previews, scanner, and venue-builder pages keep their existing layouts.
- The event workspace includes its heading/create action, compact organization summary, four live metrics, existing status filters/sort picker, compact desktop event rows, pagination and quick-create prompt. Mobile rows become cards with sales, revenue and actions visible.
- Create, preview, continue draft, manage, confirmed delete and eligible reopen retain their existing endpoints and preserve locale. Deposit events keep their existing republish restriction. The publication notice and query cleanup remain functional.
- Profile settings are grouped into basic information and guest contacts, with a live visibility preview and a separate login-method explanation. The preview follows unsaved values and clearly says when changes become public. Organization name remains always visible; representative details follow `showContactInfo`.
- Contact saves retain validation and update session contact/identity displays without modifying verified login methods. Photo uploads retain JPEG/PNG/WebP and 5 MB limits, persist immediately, preserve unsaved text fields, and are explained separately from save/cancel behavior. Overlapping save/upload requests are prevented.
- Profile, dashboard and event-list requests load independently. Resource errors retain successful data elsewhere and have independent retries. Stale filter responses cannot replace a newer selection. Draft delete/reopen writes are serialized.
- Money uses the API's minor units and currency. Null aggregate currency is shown as an unavailable total, while valid per-event amounts remain visible. Sales distinguish tickets, seats and tables, retain included-seat information, and guard zero capacity. Footer sales are explicitly scoped to the current page.
- Fonts and all surface/control colors inherit the site's global theme tokens. Existing account card/field/button/sidebar patterns are composed, existing matching icon shapes and event-creation assets are reused, and no Figma sample photos or replacement navbar were introduced. Russian, Kazakh and English copy is provided.

## Files

| File | Purpose |
| --- | --- |
| `apps/web/src/components/organizer-workspace.tsx` | Shared shell, profile/dashboard resource context, avatar/icon reuse, independent errors, help and logout |
| `apps/web/src/components/organizer-workspace.css` | Scoped organizer layouts, desktop rows and responsive profile/event arrangements |
| `apps/web/src/app/organizer/events/page.tsx` | Metrics, organization summary, filters, sorting, rows, pagination and preserved mutations |
| `apps/web/src/app/organizer/profile/page.tsx` | Grouped contact form, immediate upload, save/session updates, privacy control and live preview |
| `apps/web/src/lib/organizer-events-copy.ts` | Existing event workspace copy extracted from the page |
| `apps/web/src/lib/organizer-workspace-copy.ts` | New layout/guidance/preview copy in three locales |
| `apps/web/src/components/account-icon.tsx` | Additional shared plus/edit/eye/money symbols using existing site icon conventions |
| `apps/web/src/app/globals.css` | Adds the scoped organizer stylesheet import |

The original navbar, header search, location picker and option picker were not changed by this implementation. Existing unrelated working-tree edits were preserved; the organizer events implementation was based on its current working version rather than resetting it to Git HEAD.

## Verification

Web TypeScript checking, focused lint and whitespace checks passed. The original navbar/header-search/option-picker have no Git diff. Installed executables were invoked directly because the pnpm version-resolution entry point was unavailable earlier in this environment.

The [browser regression script](verify-browser.mjs) passed **105 assertions** with **zero browser runtime or hydration/pattern errors**, using a fresh Chrome profile and mocked organizer APIs. It checks shared navbar/font/theme inheritance, existing SVG assets and geometry, desktop/1024/768/390 px overflow, publication notice, real-data posters/fallbacks, locale-preserving actions, save failure/retry, privacy preview/save, session updates, immediate upload and draft preservation, invalid image rejection, cancellation, pagination, status filters, delete confirmation, eligible reopen, table included seats, zero capacity, sorting, stale responses, independent errors/retries, mixed currency, help, dark mode, and ru/kk/en layouts.

Updated screenshots were visually reviewed against the references and the existing site language. Screenshots use mocked data. Public visibility was mapped to the existing server presentation policy; no live public/private data was changed. Real production uploads, payment providers and external messaging providers were not exercised.

See [validation results](implementation-validation.json). Browser evidence includes [events desktop](browser-evidence/events-desktop.png), [profile desktop](browser-evidence/profile-desktop.png), [mobile event rows](browser-evidence/events-mobile-rows.png), [mobile profile fields](browser-evidence/profile-mobile-fields.png), and [dark profile](browser-evidence/profile-dark-desktop.png).

To rerun against a local development server, run `node docs/organizer-redesign/verify-browser.mjs` with Playwright installed or set `PLAYWRIGHT_MODULE` to the bundled package path. `ORGANIZER_TEST_URL` and `ORGANIZER_TEST_OUTPUT` select the server and output directory. The script mocks APIs and never writes to a real account.
