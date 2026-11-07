# Confirmed pricing assignments

Implemented 8 November 2026 in the integrated hall builder.

- Layout contains geometry, capacity and sale-mode controls. Object, row and individual-seat category inputs have been removed from this stage.
- In Pricing, users can select a category before an object, or select objects before a category. Neither action changes inventory prices. A small top-layer popover appears beside the clicked object or selected group, with the category, price per sale unit, selected quantity, resulting subtotal, Cancel and Apply.
- Cancel, Escape, outside clicks, focus leaving the popover, changing stages and changing the hall dismiss the pending assignment. Apply is the only assignment action for existing categories. A selected category remains available for further confirmed assignments.
- Shift-click builds a group without opening successive confirmations. Clicking a category then proposes the group assignment. Mixed sale units and incompatible or inactive categories are blocked without partial assignment. Per-category edit controls remain available, including for disabled categories.
- The right inspector shows the actual assigned categories, selection amount and hall revenue. The duplicate category card and distant Apply button are removed. Row and individual-seat selection remain available here and directly on the canvas.
- Creating a compatible active category with selected inventory offers **Создать и назначить**. Category creation and assignment are one undoable operation. Without a compatible selection it offers **Создать категорию** and explains that nothing will be assigned. Editing an existing category updates all linked inventory.
- Full object assignments replace child category exceptions while preserving unavailable seats. Individual-seat and row assignments stay within their selected scope. Whole tables count once; standing zones use their admission capacity.
- The bulk-price shortcut remains available with an explicit quantity/sale-unit summary and confirmation button. It uses the same atomic assignment and Undo behavior.
- Assignment feedback includes Undo. Old Undo notifications clear when a form opens, so they cannot cover its submit button. Pricing errors in Review now return to Pricing, while geometry errors return to Layout.

Verification:

- 57 focused tests passed: 17 pricing, 15 canonical adapter, 10 boundary, 7 table geometry, 3 library and 5 public/buyer presentation tests.
- Web TypeScript and the isolated optimized Next webpack production build passed.
- Browser checks in an isolated fixture covered both selection orders, Cancel, Escape, outside dismissal, Apply, immediate Undo, groups, mixed-unit blocking, one-seat creation/assignment, whole-table and standing creation/assignment, nested dialog focus, object-list navigation, review routing, clearing a seat selection, and the retained bulk-price shortcut with Undo.
- Mobile verification at 390 × 844 confirmed no horizontal page overflow, visible Cancel/Apply controls, a popover inside the viewport and a 44 px Apply touch target.
- Screenshots: `confirm-desktop.png`, `confirm-mobile.png`. They show the real integrated editor in an isolated native-dialog fixture; the user's event draft was not edited.

No staging deployment or ngrok restart was performed.
