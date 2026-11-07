# TICKET hall-builder prototype

An isolated, interactive implementation of [the hall simplification plan](../../docs/hall-simplification/PLAN.md). This is the first frontend testing milestone: it does not modify the production editor, connect to production APIs, or publish an event.

## Open and run

The generated **`hall-prototype.html`** is a self-contained HTML artifact with React, application code, icons and styles embedded. It requires no CDN, API or database. Open it in a modern browser; if local-file storage is restricted, use the local server below. Browser storage is scoped to the origin, so a file and the localhost preview have separate drafts.

From the repository root, using the existing repository dependencies:

```sh
node prototypes/hall-builder/scripts/dev.mjs
```

Open **http://127.0.0.1:4173**. Use `PORT=4174` to choose another port. This server listens only on loopback. Stop with Ctrl+C.

After editing the prototype, rebuild and reload the browser:

```sh
node prototypes/hall-builder/scripts/build.mjs
```

This updates both `dist/index.html` and `hall-prototype.html`. The preview server reads the rebuilt file on each request; it does not watch source files. No monorepo or Docker build is needed.

For a separately copied prototype folder, run `npm install` inside it first. Its dependencies are declared in `package.json`. In this checkout the build falls back to the existing React and esbuild installations.

Run the model checks from the repository root:

```sh
node --test prototypes/hall-builder/tests/*.test.mjs
```

## Staging visual design

The prototype now uses the current staging website's Inter/system font stack, 14px controls, 18px inspector headings, 12px helper text, primary `#6320ee`, shared surface/text/border colours and the corresponding dark theme. Controls use the site's rounded 12px buttons and inputs. Mobile labels wrap within fixed-width toolbar items.

`src/site-theme.css` snapshots the exact light/dark variables from `apps/web/src/components/theme.css`. `src/site-icons.jsx` reuses paths from the staging `StudioIcon`, shared `AccountIcon` and theme toggle, including their 1.8px rounded strokes and filled material icons. Remaining prototype-only symbols follow the same stroke style. These are local copies so the standalone HTML still runs independently of the production app.

The visual update preserves the current local draft, saved category colours, geometry and inventory. Checked the new styling against the live staging hall editor and main catalog, including desktop, mobile, add-table modal and dark mode. Screenshots: `screenshots/staging-desktop.jpg`, `screenshots/staging-mobile.jpg` and `screenshots/staging-dark.jpg`.

## Suggested review session

1. On the entry page, try a saved hall preview or the **Смешанный зал** starter. Saved halls become independent copies; replacing an open scheme is confirmed and undoable.
2. Add **Блок рядов → Нарисовать область** and drag across the canvas. The preview fits as many rows and seats as the schematic spacing permits. After creation, changing spacing or resizing preserves the count and existing seat identities. Explicit **Заполнить заново** regenerates the block after confirmation.
3. Select **Ряды** to shorten one row, or **Места** to move one seat. A seat's offsets stay attached to its parent. Numbering, reverse direction and curved rows are in advanced options.
4. Add either table shape. Chairs are included immediately. Try whole-table/per-seat modes, open-sided round seating, rectangular side presets/custom counts, chair spacing, rotation, and a twelve-table batch. The batch preview displays the actual grid and gaps; one undo removes the entire insertion.
5. Draw a **Стоячая зона**, set its capacity, resize it, and split it. Splitting conserves the quota; duplicating explicitly confirms the extra independent quota. Geometry alone never determines standing capacity.
6. In **Цены**, create a category or apply one price to compatible resources. Seats, whole tables and admissions have separate price units. Whole-table children have no individual price control. Switching sale mode clears incompatible prices after confirmation.
7. In **Проверка**, select a chair, a whole table and standing-ticket quantities. The basket demonstrates their distinct units and totals. Resolve reported issues before finishing.
8. Save a hall or selected block, reuse it, export/import the prototype JSON, reload, and try undo/redo. On a phone use the object list and numeric fields instead of precise dragging.

## Implemented prototype behavior

- Five editable starters; saved-hall thumbnails, search, recent/name sorting, pagination, rename, archive, restore and independent reuse.
- Three editor steps, labeled tools, responsive inspector, mobile object list, keyboard controls and light/dark themes.
- Rectangular seating blocks with rows, child seats, aisles, numbering, curvature, per-row overrides and per-seat offsets.
- Round and rectangular tables, complete chairs, sale mode, arrangement presets, orbit movement, custom rectangular sides and batch placement.
- Rectangle/custom-polygon standing zones, capacity, quota-preserving split, confirmed independent duplication and buyer quantities.
- Stages, obstacles, individual seats, entrances/exits, near-wall entrance snapping, room dimensions, precision rulers, measuring, grid snap and pan/zoom.
- Selection, Shift/marquee selection, movement, resizing, rotation, alignment/distribution, copy/paste, duplicate, pinning, withholding inventory and 150-command in-memory undo history.
- Unit-specific price categories, inherited row/seat defaults, per-seat exceptions, zero/missing prices, activation, deletion with replacement, potential revenue and mixed-capacity summaries.
- Local autosave with retry/export on failure, navigation/reload flush, JSON import validation, duplicate-category repair and cross-tab draft conflict choices. Undo history is session-local; the current scheme, library and blocks survive reload.

The mixed starter has **84 individually sold seats + 2 whole tables including 16 guests + 120 standing admissions = 220 guests**. Its potential revenue is **860,000 KZT**.

## Follow-up fixes

- The hall settings icon/dialog has been removed. Width, depth, currency, snapping and precision controls are visible directly in the canvas toolbar. Dimensions commit on blur or Enter, Escape cancels an unfinished input, and currency changes still require confirmation before prices are cleared. On phones this row scrolls horizontally.
- Rectangular sides use the existing editor rule `floor(side length / 0.45m)`. Per-side buttons and typed counts respect the limit, preset arrangements distribute seats only over eligible sides, and shrinking cannot discard chairs. Older oversized layouts keep every chair and show an actionable warning until repaired.
- Saved blocks previously copied the entire hall category list on every insertion. They now save/import only referenced definitions and reuse exact matches. Existing duplicates are consolidated with object/row/chair references remapped; distinct prices, sale units, activity, colours or metadata remain separate. Cross-currency insertion clears only the incoming prices.
- Browser regression checks confirmed direct settings/undo, currency cancel, capped buttons and manual input, saved-block insertion without category growth, and phone layout. The user's existing draft retained all object/seat IDs and its 208-guest capacity. Screenshots: `screenshots/inline-settings-categories.jpg`, `screenshots/table-side-limits.jpg`, `screenshots/inline-settings-mobile.jpg`.

## Figma usability update · 7 November 2026

Applied the useful decisions from the [layout frame](https://www.figma.com/design/DQN7MUh7QH6ghrjzeVBJH0/Untitled?node-id=9-5050) and [pricing frame](https://www.figma.com/design/DQN7MUh7QH6ghrjzeVBJH0/Untitled?node-id=9-5532), using the existing staging theme and icon components:

- One compact hall toolbar: combined dimensions, currency, snapping and precision; explicit Select/Pan controls above the canvas; zoom/fit stays at the bottom. Precision shows metre rulers when enabled. Autosave sits below the hall name.
- Quiet white hall floor and selection outlines that preserve category colours. Pricing has a legend with category names as well as colours.
- The object list groups priced tables, exposes unpriced objects and missing capacities, and expands a group when its selected table moves into it. The mobile object dialog includes search. Selecting an item frames it on the canvas.
- The inspector presents identity, Object/Rows/Seats tabs, then basic properties. Advanced geometry, all table sale modes and arrangements, standing capacity/shape/splitting, withholding, pinning, saved blocks, library, history and import/export remain available.
- Category cards separate the name, amount and sale unit. Pricing shows the selection scope, inherited assignment status, partial assignments, incompatible-unit explanations and a subtotal. Already assigned categories cannot be redundantly applied. Categories without an amount have a direct price-edit action.
- Explicit whole-block assignment replaces row/seat price exceptions; row assignment replaces only that row's exceptions; seat assignment changes only that seat. Disabled objects/chairs remain unavailable. Replacing an inactive category explains the inventory that returns to sale. Each application is one undo action.
- **Без цены → Показать на схеме** highlights the actual missing-price seats/tables/zones, frames them and provides previous/next navigation. The price finder stays accessible on phones. The numbered seat picker allows precise selection without tapping small chairs.
- Totals and finder use one sale-inventory calculation: chairs individually, whole tables once, standing admissions by capacity. Zero is a valid price. Disabled/inactive inventory is excluded; missing or incompatible amounts are excluded from revenue and reported as incomplete.

The current localhost draft was preserved: **8 parent objects, 88 attached chairs, 208 guests, 710,000 KZT and 11 unpriced sale units**. Browser checks covered inherited no-op detection, row/seat scope and subtotals, incompatible units, whole-table and individual-seat assignment/undo, finder navigation, searchable object selection, precision controls, responsive layout and dark mode. Screenshots: `screenshots/usability-pricing.jpg`, `screenshots/usability-unpriced.jpg`, `screenshots/usability-mobile.jpg`, `screenshots/usability-dark.jpg`.

The new UI is isolated in `src/workspace-ui.jsx`; selection pricing, scoped assignment and framing helpers are in `src/pricing.mjs`. `src/model.mjs` remains the inventory source. No production application or backend changes are needed to try this version.

## Category colour follow-up

Category selection chooses the category to apply; the canvas keeps its assigned colours until **Применить**. An admission category cannot be assigned to numbered seats, and whole tables retain their own sale unit. Incompatible cards now show **Не для выбранного**, with a clear reason and compatible-category shortcuts in the inspector. New categories default to the selected inventory's sale unit when the selection is homogeneous.

The category form offers 18 presets, a native custom colour picker and validated six-digit HEX input. The original six colours and all saved category colours are preserved. Saving a colour edit immediately updates objects/rows/chairs already assigned to that category. Browser checks verified custom assignment, preset editing, phone layout and undo restoring the original identities, geometry, colours and capacity. Screenshot: `screenshots/expanded-category-colours.jpg`.

## Cleaner canvas and opening zoom

Removed the passive top-left mode caption and bottom cursor/instruction hint. Desktop zoom/fit controls now float at the bottom right; phones keep a compact control row so controls and the pricing legend do not cover seats. Opening a hall frames its objects more closely, with all object envelopes retained; an empty hall still shows the full room. The existing Fit button still restores the whole-room view. The overview is a view-only change and never alters positions, seat identities or capacity. Verified the closer opening view, zoom-in, fit, both editor steps and phone layout; 35 model checks pass. Screenshot: `screenshots/clean-canvas-larger-zoom.jpg`.

## Reused logic and implementation boundaries

`src/model.mjs` adapts the production rotation, curved-row sagitta/radius construction and rectangular-chair interpolation from `packages/shared-types/src/hall-editor.ts`. It uses a small independent model to make frontend changes fast. It is **not** a production hall-v3 replacement or a migration adapter. Schematic geometry uses 40 units per metre and an 18-unit chair footprint; these are editor constraints, not venue-safety calculations.

`src/app.jsx` owns the interface, gestures, local persistence and buyer simulation. `src/styles.css` owns responsive presentation. Change these source files and rebuild; do not hand-edit the generated HTML.

Prototype limits are enforced before committing additions: 2,000 chairs, 100 rows, 500 tables, 100 categories and 3,000 combined objects/rows/chairs. JSON import additionally validates identities, row-child relationships, category references, types, finite dimensions and shape point ranges.

## Deliberate differences from the complete plan

See [PLAN-COVERAGE.md](PLAN-COVERAGE.md) for the acceptance-scenario audit. Remaining production work includes authenticated saved-hall APIs, event/draft routing, actual checkout and live availability, sold/held-resource restrictions, canonical/legacy adapters and full localization.

Some advanced editor refinements also remain: exact polygon intersection/topology validation, footprint-accurate overlap analysis, true pinch navigation, contextual edge/center alignment snapping, collision-aware placement for duplicate/fragments, impact previews for count reductions, and full accessibility review. Current overlap checks use rotated group bounding boxes and can be conservative. New table counts can require enlarging a table; review flags chair collisions and incompatible shrinking is rejected.

The prototype supports Russian UI and KZT/RUB/USD. Currency changes clear amounts after confirmation; no exchange rates are applied. There is no event-level paid/free policy here. Historical fields and production layouts must be handled by the future adapters, not imported into this prototype as though they already conform.

Storage keys are `ticket:hall-prototype:v1`, `ticket:hall-prototype:library:v1` and `ticket:hall-prototype:fragments:v1`. No account data or existing production storage is read. Export JSON before clearing browser data or moving to a different origin.

## Verification

- 34 Node model tests passed (26 existing checks plus eight pricing/navigation regressions): stable identities, attached-seat overrides, counts, fitting, resize rejection, mixed accounting, inactive-category inheritance, table pricing, standing quota conservation, cloning, orbit constraints, custom sides, batch spacing invalid imports, per-side table limits, safe legacy-overflow repair and category reuse during fragment insertion.
- Browser checks passed at 1169 × 743 and 390 × 844: row count + undo, drawing over an existing block, twelve-table batch + undo, table sale-mode confirmation, whole-table/standing keyboard selection, admission quantities, mobile object-list editing and immediate-reload persistence.
- No browser console errors/warnings were observed in the tested flows.
- `hall-prototype.html` builds successfully as one inline bundle. The automated browser permits HTTP(S) only, so direct `file://` execution could not be automated; runtime checks used the local server.
- Screenshots: `screenshots/desktop.jpg`, `screenshots/mobile.jpg`, `screenshots/saved-halls.jpg`, `screenshots/buyer-preview.jpg`.
