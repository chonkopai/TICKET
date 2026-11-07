# Hall selection inside event creation

Implemented 7 November 2026.

The ticket section now opens a compact “Мои залы” dialog rather than navigating away from the event form. Its first actions are Create hall and Upload file, followed by search and saved halls with thumbnails, names, capacity and room dimensions. The selected saved hall is marked.

Create hall opens a larger dialog over the blurred event page with exactly four choices: rows, tables, standing area, and empty hall. Selecting a choice opens the existing full editor in the same modal flow. The editor starts immediately, including for an empty hall. All geometry, pricing, import/export, saved blocks, undo/redo, review and previous-editor options remain available.

“Сохранить и выбрать” saves a reusable library copy, then saves the hall into the event draft through its existing revisioned autosave client. The event form displays its name, thumbnail, room dimensions, individual seats, whole tables, standing capacity and price categories. Incomplete prices can be saved while publication validation continues to require valid inventory and tariffs.

Working edits are separate from the event’s selected hall until explicitly saved and selected. Returning to the picker preserves unfinished work on this device and offers Continue creating. Reusing a saved hall clones its inventory identifiers. Different-currency imports and saved halls clear prices before use instead of reinterpreting amounts; saved source halls remain intact.

Organizer/admin libraries use the existing authenticated, owner-scoped venue template API. Guests use a device library; signed-in accounts without organizer-library access use a device library scoped to their account. The picker identifies device storage. Guest halls do not automatically synchronize between devices or migrate into an organizer account. No server authorization rules were changed.

The old draft hall URL redirects into event creation with the picker open. An explicit `editor=classic` URL still opens the previous editor. Existing drafts, saved halls and event prices are preserved when simply opening or closing the new picker.

## Verification

- Web TypeScript check and optimized Next.js webpack build passed.
- 22 focused tests passed: 14 adapter regressions, 3 new library/conversion tests, and 5 public presentation tests. Coverage includes independent identifiers, currency handling, device persistence and isolation, canonical publication geometry, nullable prices, and buyer rendering for rows, whole tables and standing admission.
- Browser save/select/reopen/reload, existing-hall reuse, unfinished edit recovery and valid/invalid JSON imports passed in an isolated fixture using the real editor, field component, library helpers and DraftAutosave with a test transport. This avoided modifying the user’s draft or library.
- The connected ngrok event page was checked for the picker, the four preset choices, event backdrop blur, and responsive layout.
- Mobile editor header and footer fit within the modal. Native dialogs provide focus containment; closing restores focus to the event form.

Screenshots in this folder show the real event page’s picker and preset dialogs, plus the isolated fixture’s populated picker and embedded editor. The existing buyer projection and publication pipeline consume the selected canonical event hall. No event was published, no staging deployment was performed, and the ngrok tunnel was left running.
