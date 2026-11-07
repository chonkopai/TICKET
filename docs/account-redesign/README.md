# Account redesign — implementation brief

Prepared on 7 October 2026 from all three supplied Figma nodes and the current working tree. The initial preparation captured design context, preserved reference assets, and mapped the implementation. The redesign has since been implemented; see [implementation.md](implementation.md) for the result and verification evidence.

## Reference screens

These are three sections of the same account workspace, rather than alternative designs to choose between.

| Screen | Figma node | Existing destination | Captured state | Reference |
| --- | --- | --- | --- | --- |
| Билеты и заказы | [39:1909](https://www.figma.com/design/VzPNROmtRkXWv9XIdt81ho/Untitled?node-id=39-1909&m=dev) | `/account`, `/account?tab=tickets` | Organizer; zero tickets, events, and orders | [Screenshot](screenshots/39-1909.png), [design context](figma-39-1909.md) |
| Личные данные и настройки | [39:2031](https://www.figma.com/design/VzPNROmtRkXWv9XIdt81ho/Untitled?node-id=39-2031&m=dev) | `/account?tab=profile` | Contact details empty; email identity linked; other methods unlinked | [Screenshot](screenshots/39-2031.png), [design context](figma-39-2031.md) |
| Telegram-бот и уведомления | [39:2198](https://www.figma.com/design/VzPNROmtRkXWv9XIdt81ho/Untitled?node-id=39-2198&m=dev) | `/account?tab=notifications` | Bot unlinked; delivery/reminders on; marketing off; inbox server error | [Screenshot](screenshots/39-2198.png), [design context](figma-39-2198.md) |

Screenshots are 1440 × 1000 for tickets/notifications and 1440 × 1084 for settings. All three initial `get_design_context` calls returned full reference code and screenshots; none was sparse. No Code Connect mappings were returned. Screenshot files are visual comparison targets and must not become application UI assets.

## Shared desktop layout and visual tokens

At 1440 px: header 72 px high; sidebar 264 px wide; content starts at x=304, with 40 px horizontal padding, 38 px top padding, and 28 px between major sections. Content width is 1096 px. The account workspace has a 928 px minimum height beneath the header; the settings screen grows with its content.

The white sidebar contains a 48 px avatar, identity/role/contact status, organizer access card, divider, five account section links, and utilities aligned toward the bottom. Navigation rows are 44 px high, have 18 px icons, 10 px inner horizontal padding, and 5 px vertical gaps. Active rows use a pale purple background and purple semibold text. The organizer banner moves into this sidebar card.

| Purpose | Figma value | Existing application token |
| --- | --- | --- |
| Workspace background | `#f8f9fb` | `--ticket-bg` currently `#f9f9ff` |
| Surface | `#ffffff` | `--ticket-surface` matches |
| Raised/secondary surface | `#f5f5f8` | `--ticket-raised` currently `#f1eef8` |
| Primary/accent | `#7135ea` | `--ticket-primary`, `--ticket-accent` currently `#6320ee` |
| Active/soft purple | `#f1ebfc` | `--ticket-accent-soft` currently `#f2ecfe` |
| Primary text | `#24222c` | `--ticket-text` currently `#151c27` |
| Muted text | `#73717e` | `--ticket-muted` currently `#625d70` |
| Dim text | `#a2a0ab` | `--ticket-dim` currently `#756c85` |
| Borders | `#e8e7ed`, 1 px | `--ticket-border` currently `#e6e2ee` |
| Connected status | `#287652` | `--ticket-success` currently `#047857` |
| Error icon background | `#fff4f3` | `--ticket-danger-soft` currently `#fff1f3` |

Use account-scoped light token overrides to reproduce these values and map dark mode to existing theme tokens. Avoid changing the global palette across unrelated screens. Cards have 12 px radii; fields/buttons/nav items have 8 px radii; fields are 44 px high and action buttons 42 px high. Card content padding is usually 24 px; summary cards use 20 px. The designs use Inter, with 30 px regular page titles, 18 px semibold section headings, 14 px page descriptions, and 11–13 px supporting/UI text.

Reuse the local `TICKET Inter` font declared in `globals.css`, including its Cyrillic and extended subsets. The current global font stack names Inter but only `.ticket-auth` explicitly selects the locally registered family; the account workspace should explicitly select it too.

## Mapping to the current application

Stack: Next.js 16.3.4 App Router, React 19.2.8, TypeScript, Tailwind CSS 4, and existing CSS theme variables. No component or icon library is declared in `apps/web/package.json`. Before writing application code, follow `apps/web/AGENTS.md` and read the relevant installed Next.js guide under `node_modules/next/dist/docs/`.

| File/component | Reuse and planned change |
| --- | --- |
| `apps/web/src/app/(auth)/account/page.tsx` | Retain `ProtectedRoute`, session refresh, mutations, polling, pagination, locale handling, and five tab values. Replace the wide identity card/horizontal tabs with a shared sidebar/content shell. |
| `apps/web/src/components/ui.tsx` / `PageShell` | Its centered max-width/padding cannot express the edge-to-edge account sidebar. Use an account-specific wrapper without changing other `PageShell` consumers. |
| `apps/web/src/components/navbar.tsx` | Reuse session, location, search, locale, creation, favorites, theme, and logout behavior. Add an account-route variant to match the reference header without changing catalog/event headers. |
| `apps/web/src/components/catalog-location-picker.tsx`, `header-search.tsx`, `option-picker.tsx` | Compose existing controls rather than replacing them with static Figma text. Tokyo is sample location data. |
| `apps/web/src/components/guest-event-card.tsx` | Retain populated event/ticket/booking behavior. Its populated appearance is not specified by these empty-state references. |
| `apps/web/src/components/favorites-content.tsx` | Retain the existing embedded favorites panel within the new shell. No favorites content redesign was supplied. |
| `apps/web/src/app/(auth)/account/login-methods-panel.tsx` | Restyle its four identity statuses and verification flow; preserve email code, resend cooldown, completion/password steps, Google link, Telegram polling/confirmation, and password changes. |
| `apps/web/src/app/(auth)/account/notifications-panel.tsx` | Separate full-width Telegram card from preferences/inbox columns; preserve filtering, pagination, read actions, polling/backoff, and stale-response protection. |
| `apps/web/src/lib/account-copy.ts`, `login-methods-copy.ts`, `notifications-copy.ts`, `components/navbar-copy.ts` | Add missing headings, empty-state help, contact guidance, and error copy consistently for Russian, Kazakh, and English. |

Suggested new local components: `AccountShell`, `AccountSidebar`, `AccountHeading`, `AccountSummary`, `AccountOrdersPreview`, and reusable account card/empty-state primitives. Keep presentation components separate from the existing request/verification logic. Use links for destinations and controls for actions.

Preserve `/account?tab=tickets|favorites|profile|notifications|payments`. Currently the query is read once on mount and clicking a tab changes only React state; implement URL/history synchronization so section links, refresh, and browser back/forward agree. Use `localeUrl` for destinations, including the logo, favorites, organizer, event discovery, and sign-out redirect. A header bell should lead to the notifications section.

## Tickets and orders — 39:1909

The main content has a section heading, two equal summary cards separated by 20 px, an upcoming/past tabbed card, an orders card, and a support link. Summary values come from `/me/dashboard`; keep loading distinct from a real zero. The ticket empty state uses the supplied ticket symbol, explanatory text, and a primary event discovery link to the catalog.

The design adds a “Мои заказы” preview to the tickets section. Currently `/me/orders` loads only when `tab === "payments"`; load a small order preview while tickets is active and retain the paginated payments panel. Share request/cache state where useful, but keep the preview independent of the payment-history pagination. The payment-history link selects `payments`.

Upcoming and past counts are event-list totals, not admission counts. `/me/events` returns the total for only the requested status. To display both counts accurately, fetch totals for both filters or extend the contract deliberately; never reuse `activeAdmissions` or the current page length. Reset event pagination when changing status.

## Personal data and settings — 39:2031

The top row contains a flexible personal-data form, a 20 px gap, and a 300 px guidance card. The form has phone/email in two columns, a city selector with explanatory text, and save action. Profile contact fields remain optional and use `PATCH /me` with trimmed empty values becoming `null`.

Move organizer access into the shared sidebar. Replace the old form-adjacent role panel with the contact-versus-login guidance card. A linked login email comes from `/me/identities.email.address`, while profile email comes from `/me.email`; do not copy one into the other. Pull the same identity state into both the guidance card and method cards to keep them consistent.

The lower full-width card contains four equal method cards (Email, Phone, Telegram, Google), then a divider and contact connection area. The reference verification form is 484 px wide with a 32 px gap to guidance. Adapt to available width. Method actions should open/select their corresponding existing flows. The mock name, initials, email, role, counts, and connection states must remain dynamic.

## Telegram and notifications — 39:2198

The full-width connection banner has a purple icon tile, connection heading/status, description, and right-aligned connect button. Beneath it, preferences are 414 px wide, followed by a 24 px gap and flexible inbox. The inbox has a 76 px toolbar and a 446 px minimum total height in the reference error state.

Render ticket delivery, reminders, and marketing as accessible switches using the existing preference fields. Their reference defaults match `AccountService` defaults, but UI must read persisted values. Use the exported on/off switch artwork inside an actual keyboard-operable control; a static image alone is not a switch. Serialize or otherwise protect overlapping preference mutations so an older response cannot overwrite a later toggle.

Render the supplied server-error layout only after inbox failure. Error, initial loading, empty, populated, and background-refresh states are separate. Retry reloads the inbox; an inbox failure must not reset saved preferences. Preserve the unread filter, unread count, read actions, and pagination. Critical event changes remain separate from optional reminders.

## Existing contracts to retain

| Behavior | API / source |
| --- | --- |
| Profile and session | `GET/PATCH /me`; `AuthUser`; `getSession`, `updateSessionUser` |
| Metrics | `GET /me/dashboard`; `AccountDashboard.activeAdmissions`, `.attendedEvents` |
| Events/tickets | `GET /me/events?status=upcoming|past&page=…&limit=10&locale=…`; `GuestEventList` |
| Order preview and payments | `GET /me/orders?page=…&limit=…`; `AccountOrderList` |
| Login statuses | `GET /me/identities`; `LinkedMethodsResponse` |
| Email connection | `POST /me/identities/request-code`, `/verify-code`, `/complete` |
| Telegram identity/bot flow | `POST /auth/telegram/link-token`; `POST /me/identities/telegram/status`, `/confirm` |
| Password change | `POST /me/password/change`; clear session and return to login |
| Preferences | `GET/PATCH /me/notification-preferences`; `NotificationPreferences` |
| Inbox | `GET /me/notifications?page=…&limit=10&unreadOnly=…` |
| Mark notification read | `PATCH /me/notifications/:id/read` |
| Organizer access | `POST /me/become-organizer`; organizer/admin link to `/organizer/events` |
| Sign out | Existing `logoutSession()`; handle failure before redirecting |

## Gaps and implementation assumptions

- Phone verification is disabled in `LoginMethodsPanel` and explicitly described as unavailable in current copy. Keep that state honest; the Figma phone action does not authorize inventing a working SMS provider. Profile contact phone can still be saved independently.
- `AccountOrder.receiptUrl` is currently typed as `null`. Preserve receipt-unavailable messaging until the payment contract supplies real documents.
- No mobile or dark reference is supplied. Proposed adaptation: keep the sidebar at wide desktop widths; use a compact identity area and scrollable section navigation on narrow screens; stack summary/form/guidance/notification columns before they overflow. Validate at 1440, 1024, 768, and 390 px and with long Kazakh/English text. These are implementation decisions, not extracted Figma layouts.
- No dedicated support destination was identified in the inspected account/navigation code. Resolve a real support route/contact before making the sidebar help and “Связаться с поддержкой” actions live; do not add dead links or invent an address.
- Preserve guest access to becoming an organizer; the organizer-only example must not turn into an unconditional role label or cabinet link.
- Distinguish `telegramId` (login identity) from `telegramChatId` (bot delivery connection). The current bot action routes users without a Telegram identity to profile; make that handoff explicit in the new flow.
- The current initial `Promise.all` bundles profile, dashboard, and preferences. Isolate their loading/error states so a metrics or preferences failure cannot hide successful profile data. The identity list should likewise fail independently.
- Populated ticket/order/notification screens, verification steps, password changes, favorites, and payments have no full visual references here. Preserve their working behavior and style them consistently rather than inferring additional product changes.

## Asset preparation

[assets-manifest.json](assets-manifest.json) records 72 SVG asset references across 76 layer slots, plus three screenshots. There are 43 distinct SVG contents. All files were downloaded and validated as non-empty SVG/PNG, with SHA-256 hashes and original SVG width/height/viewBox recorded. Byte-for-byte comparison found no exact match among existing application public SVG assets.

Each SVG is retained under `assets/<screen-node>/`; the archived generated reference code uses these local paths. Repeated assets may be deduplicated only when hashes match and every design slot remains mapped. Copy approved assets into an account-specific public directory when implementing, preserve SVG root dimensions, and use the supplied variants for active/inactive and on/off states. Do not substitute generic icons just because their names match. There are no raster content images in these three screens; avatars remain API supplied.

## Implementation order and acceptance checks

1. Add the shared account shell/sidebar and route-scoped navbar treatment, using scoped light tokens, local Inter, and the preserved SVG assets. Keep all five existing sections accessible.
2. Restyle tickets metrics, event tabs/empty states, and add the order preview with accurate counts and independent request state.
3. Restyle profile and contact guidance, then adapt method cards around the existing verification and password workflows.
4. Restyle bot connection, preference switches, inbox/filter, and centered recoverable error state.
5. Finish URL/history synchronization, translations, role/connection states, mobile layout, dark mode, and keyboard/focus behavior.

Compare the three supplied states against saved screenshots at their natural widths/heights using deterministic test data. Verify every asset's mapped layer, callsite, non-empty file, and effective rendered geometry. Exercise real-zero versus loading/error metrics; upcoming/past totals and pagination; populated tickets/bookings/orders; profile save without identity mutation; email code/resend/completion; disabled SMS; Telegram linking/expiry/confirmation; Google linking; password change/session invalidation; preference rollback/concurrency; unread filter/read/retry; role-dependent organizer access; favorites; payments; and sign-out.

Run web typecheck and lint after implementation and meaningful targeted regressions for changed behavior. Preparation itself adds documentation/reference files only, so no application test suite was run. The working tree already contains extensive unrelated edits, including account/page.tsx and account-copy.ts; implementation must build on them without reverting them.
