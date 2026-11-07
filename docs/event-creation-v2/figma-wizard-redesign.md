# Event creation design rebuild

Verified on 4 October 2026 (Asia/Hong_Kong) at https://sulphate-shown-subtract.ngrok-free.dev/events/create.

The event creation workspace now uses the Figma reference's lavender background, white cards, purple accents, Inter typography and locally downloaded SVG assets. Existing draft persistence, protected editing, translation review, media processing, crop rendering, hall navigation and publication continuation remain connected to the same clients and APIs.

## Design decisions

- Replace the tickets-first, two-step layout with one workspace. Media appears in the left column on desktop; information, scheduling, venue and tickets remain visible in the right column. Phone layouts stack the cards.
- Combine scheduling and venue information in one “Дата и место” card, retaining the compact desktop start/end/timezone row and all required location fields.
- Keep content language and source language visible together. Required source-language fields have markers; optional translations retain their review tools.
- Add a four-section checklist whose links focus the relevant cards. Publication availability comes from the shared API publication schema, including currency capabilities and processed media. Server publication validation and organizer policy remain authoritative.
- Show capacity for free registration, pricing and currency for paid tickets, and hall configuration for seated tickets. Selecting paid general admission creates the first editable ticket row when none exists. Switching modes preserves each mode's existing settings.
- Collapse crop settings after a file is present. Keep cover/background roles, replacement, removal, caption editing, pointer reordering and keyboard reorder buttons available. The initial drop zone also accepts a dropped file.
- Keep a fixed save/action bar with distinct saving, saved and save-failure states. Free registration does not show monetary refund choices.
- Use an ordinary editable description field without a decorative formatting toolbar, matching the current content contract.
- Clearing category or country restores the unselected value. Clearing age restriction restores the unselected value rather than choosing 0+.
- Retain input-event handling for native date/time controls; ngrok testing caught and corrected a regression when using change events.

## Validation

| Check | Result |
| --- | --- |
| Web type check | Passed |
| Production web build, including TypeScript | Passed |
| Repository lint | Passed with the existing unused ArrowIcon warning in the homepage |
| Readiness, autosave and publication-client tests | 17 passed |
| ngrok desktop rendering | Passed at 1470px; no horizontal overflow |
| ngrok phone rendering | Passed at 390px; no horizontal overflow |
| RU, EN and KK interface labels | Verified, including phone layouts |
| Source content and manual English content | Source text retained when switching content languages |
| JPG upload | Uploaded a repository reference image through the native Chrome file picker; processed, displayed and assigned to cover/background |
| Media crop and reorder | Adjusted focal position; moved the image between slots and back while keeping its roles |
| Draft persistence | Saved text, schedule and ticket configuration; dates/times retained after a reload |
| Schedule validation | Ending before the start displayed an inline error and blocked readiness |
| Ticket formats | Verified free capacity, paid price/capacity, and seated configuration visibility |
| Currency change | Confirmation appeared; cancellation retained KZT and existing price |
| Mode preservation | Paid ticket price 2500.00 and capacity 50 survived switching to other modes and back |
| Hall editor navigation | Opened the existing hall studio and returned to the same draft |
| Preview dialog | Verified event title, programme, schedule, venue, media and ticket text; closed successfully |
| Publication readiness | Complete fixture reached 5/5 and enabled publication; incomplete/processing cases covered by tests |
| Rendered assets | All observed icons and uploaded images loaded; icon geometry matched intrinsic SVG dimensions |
| Browser console on final page | No errors or warnings returned |

The checks used a separate named test draft, `c2e08a47-0ebd-411f-803c-2db9e36a8d9a`, titled “Проверка нового дизайна TICKET”. It remains an unpublished draft. The original user draft, `c3ed7fec-2546-4954-9534-1b3881f9f00f`, was retained and reopened after testing. No test event was published. Browser viewport overrides were reset.

The browser extension could not upload through its file-chooser API because file URL access was disabled. The native OS picker completed the upload without changing extension permissions. The in-app browser's initial ngrok connection failed, so verification used the existing Chrome connection.

Node/tsx's direct test launcher was incompatible with the workspace package's import-only exports and sandbox IPC. The same tests were bundled as ESM with the installed esbuild and run using Node's test runner.

## Evidence

- [Desktop viewport](browser-evidence/redesign/ngrok-desktop-viewport.jpg)
- [Full desktop page](browser-evidence/redesign/ngrok-desktop.jpg)
- [Phone page](browser-evidence/redesign/ngrok-mobile.jpg)

## Dropdown follow-up

Country selection now uses a searchable menu with consistent inset chevrons, keyboard navigation, selected-state highlighting, and the four main destinations first. Kazakhstan includes its 17 regional centres and three major cities; Uzbekistan includes regional centres and popular destinations; Russia includes major cities; UAE includes the emirate capitals and Al Ain. Each city menu keeps manual entry first, and all other countries use the counted text field. Existing city text survives a country or interface-language change.

Currency selection presents USD, RUB and KZT with localized labels and symbols. The development adapter now advertises RUB at two minor-unit digits. Existing EUR capability remains available to preserve saved drafts, while new menu selections are limited to the requested three currencies. Currency relabel confirmation and cancellation remain unchanged.

Verified on ngrok using the existing unpublished test draft: country search; all four city lists; English/Kazakh city labels; manual entry; preservation across country changes; keyboard selection; RUB confirmation, unchanged 2500.00 amount, persistence after reload, and cancellation; 390px mobile menu fit above the action bar without horizontal overflow. The fixture was returned to Kazakhstan/Almaty, KZT and free registration. Web/API type checks and the production web build passed; lint retained the existing homepage ArrowIcon warning; three new development currency tests passed.

City-reference sources: [Kazakhstan government](https://www.gov.kz/article/19305?lang=en), [Uzbekistan regional profiles](https://invest.gov.uz/en/reason/atlas), [Rosstat city data](https://rosstat.gov.ru/storage/mediabank/Rossia_2025.pdf), [UAE emirates](https://u.ae/en/about-the-uae/the-seven-emirates). These are curated suggestions, not an exhaustive directory.

- [Country menu on mobile](browser-evidence/redesign/ngrok-country-dropdown-mobile.jpg)
- [Currency menu](browser-evidence/redesign/ngrok-currency-dropdown.jpg)

## Timezone follow-up

The timezone field now uses a searchable menu with GMT offsets and localized popular city groups, including “GMT+08:00 · Пекин, Гонконг, Макао”. Search accepts city names in Russian, English and Kazakh, GMT offsets such as “GMT +8”, and IANA timezone IDs. The closed field uses a compact city label; the menu shows the full group. The list includes the runtime's supported IANA timezones and preserves valid legacy IDs.

Presentation follows [Microsoft's timezone list](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/default-time-zones?view=windows-11) and [Zoom's scheduling guidance](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063717). Offsets come from Intl timezone rules for the event date rather than the reference's static offset table. Kazakhstan displays GMT+05:00; seasonal, half-hour and quarter-hour offsets are supported. Schedule persistence still stores IANA IDs and clears stale daylight-saving ambiguity choices when changing zones.

Verified on ngrok at 1423px and 390px: city and GMT search, keyboard selection, save/reload persistence, unchanged entered local time, selected-option scrolling, menu fit, no mobile horizontal overflow, and country-search regression. The separate unpublished test draft was restored to Asia/Almaty. Four timezone tests and the final production web build passed; lint retained the existing homepage ArrowIcon warning. Temporary viewport overrides were reset.

- [Desktop timezone menu](browser-evidence/redesign/ngrok-timezone-dropdown.jpg)
- [Mobile timezone menu](browser-evidence/redesign/ngrok-timezone-mobile.jpg)

## Media simplification

Removed the optional caption/alternative-text input from media settings in all three interface languages, and removed visible captions from the event gallery and draft preview. Existing stored text remains compatible and can still supply image alternative text; no database migration or data deletion was needed. This supersedes the caption-editing behavior described in the original redesign checks.

Verified the expanded media settings on ngrok: no caption input, all three crop sliders present, preview opens without caption elements. Web typecheck passed; repository lint passed with the existing homepage ArrowIcon warning.

- [Media settings without the caption field](browser-evidence/redesign/ngrok-media-without-caption.jpg)

## Sidebar scrolling

The checklist and privacy note now share one sticky wrapper, with a fixed 20px gap. The sidebar stretches to the form height so both remain visible while the media card scrolls away. Short desktop viewports use normal scrolling; phone layouts retain the existing compact checklist control.

Verified on ngrok in the in-app browser at the schedule and ticket sections: the note stays below the checklist and above the fixed footer. Phone breakpoint verification found no horizontal overflow, the desktop status group remains hidden, and the compact checklist control remains visible. Temporary viewport overrides were reset. Web typecheck passed. Chrome's ngrok visit notice failed to render, so verification used the user's working in-app browser session.

- [Checklist and privacy note after scrolling](browser-evidence/redesign/ngrok-sidebar-scroll.jpg)

## Media action placement

Moved the selected-media controls between the large preview and thumbnail list. The role buttons now read «Обложка карточки» and «Фон страницы», with corresponding English and Kazakh labels. Replace/retry and delete use current-color SVG icons with localized accessible names and hover titles. Existing media mutation handlers and selected/disabled states remain intact.

Verified on ngrok: desktop controls fit on one row, thumbnail selection updates the cover pressed state, the phone layout has no horizontal overflow, and both icons remain readable in dark mode. Restored light mode and the original viewport after verification. Web typecheck and lint passed; lint retains the existing homepage ArrowIcon warning. No uploaded media or draft content was changed.

- [Updated media controls](browser-evidence/redesign/ngrok-media-controls.jpg)
