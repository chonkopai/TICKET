# Table sale-type guidance

Implemented 8 November 2026 in the integrated hall builder.

- A single table/category mismatch now opens a small popover next to the selected table. It explains that the table currently sells by individual seats or as a whole table and which selling type the chosen category needs.
- Both selection orders work: category first, then table; or table first, then incompatible category. An actionable incompatible category can be clicked to explain the mismatch, but cannot assign that price.
- **Изменить тип продажи** switches to Layout, selects the corresponding parent table, opens the inspector and scrolls/focuses the existing selling-type control. A purple border and a short instruction make the setting visible. This works when an individual seat initiated the mismatch, too.
- Opening the setting does not change the selling type or prices. The existing selling-type change still requires confirmation. The border clears when the type changes or the user leaves that table/step. Returning to Pricing retains the selected category and requires the normal Apply confirmation.
- Close, Escape and outside dismissal keep pricing unchanged. Standing-ticket categories, seating blocks, mixed/group selections, inactive categories and unavailable inventory do not receive an inappropriate table-conversion shortcut.

Validation: 34 pricing/canonical-adapter tests passed, including both sale-type directions, individual-seat scope, invalid scopes and excluded inventory. Web TypeScript and the isolated optimized Next webpack production build passed. Browser checks covered both selection orders, Escape without price changes, focused/scrolled target selection, an explicit selling-type change, highlight removal, and returning to the normal pricing confirmation. At 390 × 844, the highlighted control was entirely visible inside the inspector, with no horizontal page overflow. All mutations used an isolated fixture; the user's draft was not edited.

Evidence:

- `seat-to-table.png`: incompatible whole-table category on a table selling seats.
- `layout-highlight.png`: desktop shortcut target.
- `table-to-seat-mobile.png`: the opposite mismatch on mobile.
- `layout-highlight-mobile.png`: outlined control inside the mobile inspector.

No staging deployment or ngrok restart was performed.
