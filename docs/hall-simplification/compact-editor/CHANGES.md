# Compact integrated hall editor

Implemented against the connected hall builder on 7 November 2026.

## Requested changes

| Comments | Result |
| --- | --- |
| 1, 2, 3, 6, 7 | One 64px desktop header. The builder caption sits under the logo, hall name beside it, workflow steps in the center, and undo/redo/menu/next actions on the right. The separate workflow bar is removed. |
| 4 | Removed the text “К мероприятию” button. The small back arrow beside the hall name retains return navigation. |
| 5 | Removed the hall theme switch. The existing application ThemeProvider supplies the event page’s theme. |
| 8 | A blank hall starts with one unpriced “Стандарт” category. Its unit follows the first sellable object when the default is still unused and unpriced. Single-type starters retain only their relevant category; the mixed starter retains its three necessary sale units. Existing layouts and prices are preserved. |
| 9, 10 | The real saving/saved/error status appears in the bottom bar, replacing the generic autosave sentence. |
| 11, 12, 13 | The add-object panel is 540px instead of 770px, beside the desktop sidebar, with a border/shadow and no blur or blocking backdrop. Header, intro, form controls and spacing are compact. Preview, batch creation and drawing options remain available. Mobile uses a compact modal with scrolling and focus containment. |
| 14, 16 | Removed the Object/Seats tabs. Chairs open their settings directly from the canvas or the inspector’s seat list. A prominent “К настройкам стола” / “К настройкам блока” button returns to the parent. Individual rows remain available from row numbers and the row selector. |
| 15 | Number-field plus/minus buttons fill the control’s inner height, with full-button hover, pressed and keyboard-focus states. |

On phones, the workflow occupies a second row within the same header. Undo/redo remain available in the actions menu.

## Verification

- Web TypeScript check passed.
- Optimized Next.js production build passed with webpack. The sandboxed Turbopack verification stalled and was stopped; the successful build used a separate output directory.
- All 14 builder/canonical adapter tests passed, including the new fresh-category regression check.
- All 35 existing geometry and pricing tests passed against the integrated model and pricing modules.
- Desktop browser checks covered direct seat selection, chair offset edits, return to parent settings, whole-table selection in pricing, full-height steppers, and interacting with the background while the floating add panel remains open.
- A blank hall showed exactly one unpriced category; adding a whole table changed its unused default category to the table unit.
- At 390 × 844, the page had no horizontal overflow; header and footer fit the viewport, the add form remained usable, and undo/redo were present in the menu.
- Dark theme was inherited without a hall theme switch.
- Reloaded the connected ngrok editor and verified the merged 64px header, footer save status and unblurred 540px add panel without modifying draft inventory.

Evidence: `connected-editor-desktop.png`, `seat-return-desktop.png`, `add-panel-desktop.png`, `add-panel-mobile.png`, `inherited-dark-theme.png`.

These changes are local and visible through the existing ngrok tunnel. No staging deployment or tunnel restart was performed.
