# Organizer redesign preparation

Prepared 7 October 2026. Both references were loaded through Figma `get_design_context`, with full React reference context and screenshots, and checked against the current organizer pages and API contracts. The initial preparation changed documentation only. Implementation is now complete; see [implementation notes and verification](implementation.md).

## Design direction

The references define information hierarchy and layout. **Keep the existing TICKET top bar, global font, shared theme colors, and existing matching icons.** Do not introduce an organizer-specific replacement navbar, a copied Figma palette, another font, or duplicate icon exports. This is the user's explicit constraint from the account redesign and applies here too.

Use the corrected account workspace as the visual precedent: a centered page, rounded sidebar/card surfaces, existing heading weights, rounded fields/buttons, and the shared light/dark tokens. Translate the references into responsive React components rather than copying their fixed widths and absolute positioning. Organizer navigation belongs below the existing navbar. Put “Go to guest profile” in the workspace, keeping the top bar intact.

## Loaded references

| Reference | Destination | Saved context | Screenshot |
| --- | --- | --- | --- |
| [44:809 — Organizer workspace](https://www.figma.com/design/VzPNROmtRkXWv9XIdt81ho/Untitled?node-id=44-809&m=dev) | `/organizer/events` | [Full context](figma-44-809.md) | [Reference](screenshots/44-809.png) |
| [44:977 — Organizer profile](https://www.figma.com/design/VzPNROmtRkXWv9XIdt81ho/Untitled?node-id=44-977&m=dev) | `/organizer/profile` | [Full context](figma-44-977.md) | [Reference](screenshots/44-977.png) |

The reference screenshots are saved locally. Asset URLs embedded in the archived reference code expire after seven days. They are not application dependencies. The sample Ed Sheeran poster, names, event IDs, dates, totals, and contact states are examples; implementation must use API data. Existing matching icons take priority over the reference exports. No reference assets were added to the application.

## Reference-to-code mapping

| Reference section | Existing source/data | Implementation adaptation |
| --- | --- | --- |
| Persistent organizer identity/navigation | Session user, organizer profile, dashboard | Shared shell for these two pages, identity/photo fallback, active Events/Profile links, real event count, contact-completion hint, guest-account link, help and logout |
| Events heading + create action | `apps/web/src/app/organizer/events/page.tsx`, `localeUrl` | Heading above organization summary; create links to `/events/create` with locale |
| Organization summary | `OrganizerProfile` + session Telegram state | Compact identity strip and edit-profile link; use persisted organization name and photo |
| Four metric cards | `OrganizerDashboard` | Total events, published, drafts, paid revenue; occupancy and archive detail remain available |
| Status filters + sorting | `OrganizerEventStatusGroup`, `OrganizerEventSort`, `SelectPicker` | Preserve four status groups, three sort values and pagination; use existing picker and site-styled controls |
| Event rows | `OrganizerWorkspaceEvent` | Compact desktop rows with dynamic poster, status/ID, date/time/address, admission mode, sales, revenue and actions; stack into cards on mobile |
| List footer | Paginated list + dashboard | Show accurate visible/page/total counts; label sales totals according to their scope and units |
| Quick-create prompt | Current create-event link | Move after the list; use existing accent surface and button treatment |
| Basic organization information | `apps/web/src/app/organizer/profile/page.tsx` | First form section: photo upload, organization name and representative name |
| Guest contacts and visibility | `OrganizerProfile` | Second section: email, phone, address, native checkbox and explanatory text |
| “What guests see” guidance | Form values + `showContactInfo` | Dynamic preview of unsaved selections; clearly distinguish preview from saved public state |
| Login distinction / back links | Existing localized copy + account routes | Link to `/account?tab=profile` and `/organizer/events`; contacts are separate from verified identities |

## Existing API contracts

No new endpoint is needed for the main layout.

| Method and endpoint | Contract and use |
| --- | --- |
| `GET /me/organizer-profile` | `OrganizerProfile`: organizationName, name, email, phone, photoUrl, address, showContactInfo |
| `PATCH /me/organizer-profile` | Existing form fields; blank optional contacts become null; retain save/error/session updates |
| `POST /me/organizer-profile/photo` | Multipart field `photo`; response `{ photoUrl }`; JPEG/PNG/WebP up to 5 MB; existing immediate persistence |
| `GET /api/organizer/events/dashboard/summary` | Total/published/draft/completed/cancelled counts, settledRevenue, currency, soldAdmissions and totalAdmissions |
| `GET /api/organizer/events` | `page`, `limit`, `statusGroup`, `sort`; response items/page/limit/total/hasNext |
| `DELETE /api/organizer/events/:id` | Preserve draft deletion confirmation and refresh |
| `POST /api/organizer/events/:id/reopen` | Preserve completed-event republishing and loading state; deposit events retain their existing restriction |

Checked sources: `packages/shared-types/src/account.ts`, `apps/api/src/events/events.service.ts`, `apps/api/src/auth/account.service.ts`, `account.dto.ts`, `me.controller.ts`, `organizer-photo.service.ts`, and `apps/api/src/public-events/public-events.service.ts`.

Important data rules:

- Money is in minor units and must be divided by 100 for formatting. Dashboard currency is null when no single currency can be represented, including mixed currencies; do not force the reference's KZT symbol or show a fabricated combined revenue. Use an unavailable total with explanatory copy while retaining valid per-event amounts.
- The dashboard provides total, published and draft counts; archive count is completed + cancelled. Use dashboard counts for filters and sidebar rather than the current page length. Keep missing counts in a loading state.
- Sales modes are ordinary tickets, seats, and whole tables. Preserve remaining quantity and included-seat information; whole-table quantities must not be mislabeled as ordinary tickets. Guard zero capacity before calculating progress.
- Organization name is always public. `showContactInfo` controls public representative name, photo, email, phone and address. The server already applies this policy.
- Organizer contacts and photo are stored on the shared user account; organization name/address/visibility are on the organizer profile. Contact updates do not verify or change login identities. Keep session displays in sync after successful saves/uploads.
- Photo upload is saved immediately, independently of the form save. Cancel/back navigation must not imply it reverses a completed photo upload.
- Server organizer endpoints enforce organizer/admin roles. Preserve authentication handling and surface denied access without inventing successful data.

## Reuse and file plan

Keep `components/navbar.tsx`, `header-search.tsx`, `catalog-location-picker.tsx`, `option-picker.tsx`, `theme-toggle.tsx`, and the existing font/theme definitions intact. Reuse `SelectPicker`, locale helpers/provider, `ProtectedRoute`, session/API utilities, and suitable `PageShell`/loading/error primitives.

The corrected account workspace provides reusable sidebar, card, field, and action patterns in `components/account.css` and `account-icon.tsx`. Share or extract neutral workspace primitives where useful rather than copying a second palette. Existing calendar/upload/eye/lock/plus/check assets are available in `public/event-creation/`; prefer the site's established icon component or existing inline icon when it matches. Any genuinely missing symbol should follow the same currentColor/stroke/size conventions.

Expected application work when implementation is requested:

1. Add a shared organizer workspace shell used only by `/organizer/events` and `/organizer/profile`. Avoid a broad organizer layout that also changes event management, previews, scanner, analytics, or venue builder.
2. Adapt `apps/web/src/app/organizer/events/page.tsx` to the four metrics and compact responsive rows, preserving create/preview/edit/manage/delete/reopen and pagination. Extract localized organizer workspace copy from its current inline `COPY` if needed.
3. Adapt `apps/web/src/app/organizer/profile/page.tsx` into grouped fields plus guidance. Extend `apps/web/src/lib/organizer-profile-copy.ts` for section headings, visibility states, contact-completion hints and navigation in ru/kk/en.
4. Add only scoped workspace layout styles if existing primitives cannot express the arrangement. All colors and fonts inherit the site theme.
5. Load profile, dashboard and event list independently, retain successful data if another request fails, and protect against stale filter/sort responses. Keep draft mutations scoped to their relevant states.

Retain existing unrelated working-tree edits, particularly the already-modified organizer events page and management/analytics code. No application source was changed during preparation.

## Validation plan

- Confirm the original shared navbar remains identical and account/organizer colors and font inherit root tokens in both themes.
- Check both pages on desktop, 1024, 768 and 390 px, with readable long titles/addresses and ru/kk/en copy; no document overflow. Rows become mobile cards without hiding essential metrics/actions.
- Events: loaded/empty/error states; independent resource failures; four status groups and three sorts; page reset on filter/sort; total counts; mixed/no currency; all three sales modes; zero/sold-out capacity; missing poster/photo.
- Actions: create, preview, manage, continue draft, confirmed deletion, cancel deletion, eligible reopen, and the post-publication success message. Preserve locale in navigation.
- Profile: initial load/retry, edits/save/cancel, validation limits, clear optional fields, photo format/size/failure/success, session identity update, and immediate-upload semantics.
- Privacy: saved visibility on/off matches public event data; the live form preview uses current field values; identity methods remain unchanged by contact save.
- Accessibility: active navigation, labeled fields, keyboard-operable filters/picker/checkbox/actions, status/error announcements, focus treatment, and appropriate table/list semantics.
- Run web type checking, focused lint and meaningful browser regressions with mocked APIs. Provider/payment flows outside these two pages remain outside this redesign's scope.

## Preparation status

Implemented and verified: both full contexts and screenshots are archived, and the completed adaptation and browser evidence are recorded in [implementation.md](implementation.md). Mobile and dark arrangements will be adaptations because neither reference supplies those states. No external help destination is configured in the inspected account implementation; reuse its functional guidance pattern or a verified existing support destination rather than adding a dead link. These details do not block the layout work.
