# Simplified hall creation: complete feature audit and proposed behavior

Date: 2026-11-06. Status: product proposal; no application changes or deployment.

This replaces the earlier rows-focused proposal. Rows, round tables, rectangular tables, standing areas, and mixed halls are all first-release requirements. “Useful to 95%” is a design hypothesis to test, not usage evidence.

## 1. Scope and evidence

Reviewed the current shared editor and geometry helpers, the event-draft adapter, saved-layout service, canonical hall schemas, persistence, creation ticket-mode entry, and buyer hall selection. The Claude artifact was inspected in the preceding planning turn; its three-step organization is useful, but its simplified inventory model should not replace the current booking model.

Main source files:

- `apps/web/src/app/organizer/venue-builder/_components/hall-studio.tsx`
- `apps/web/src/app/organizer/venue-builder/_components/hall-state.ts`
- `apps/web/src/app/events/create/hall/studio.tsx`
- `apps/web/src/lib/draft-hall-adapter.ts`
- `apps/web/src/components/event-creation/ticket-modes.tsx`
- `packages/shared-types/src/hall-editor.ts`
- `packages/shared-types/src/hall-v3.ts`
- `packages/shared-types/src/event-creation-v2.ts`
- `apps/api/src/venue/venue.service.ts`
- `apps/api/src/venue/hall-editor.persistence.ts`
- `apps/api/src/creation-drafts/creation-sale.persistence.ts`
- `apps/web/src/app/events/[id]/event-client.tsx`

### Findings that affect the design

1. Both table shapes are created without seats. The organizer must add chairs separately.
2. Drawing a row creates three seats regardless of the line length; fitting seat count to a region is new functionality.
3. Resizing a table/row can detach excess seats into standalone seats. This preserves records but can change what the organizer thinks they are selling.
4. Moving row seats can trigger automatic rearrangement. Persistent individual spacing needs a real override model.
5. Round-table chairs support movement along an orbit and even redistribution. These capabilities should survive simplification.
6. Round-table capacity and manual-seat movement use different geometric calculations; the new UI must expose one coherent result backed by common validation, not label these constants as real-world safety standards.
7. A standing zone is already a sellable capacity-backed resource: drawing, capacity, tariff, buyer quantity selection, and checkout must be designed together.
8. Standing-zone creation currently requires polygon vertices and starts at zero capacity.
9. The current `locked` property prevents manipulation and participates in sale availability. Movement locking and withholding inventory need separate meanings and a compatibility migration.
10. The “Слои & Зоны” tab currently houses room settings, tariffs, and validation; it is not a useful representation of those tasks.
11. Saved halls exist in the organizer backend, but the new draft adapter returns an empty list and disables the template control.
12. Selecting a template in the old toolbar appends copied objects; applying a complete template through the service is a different replacement operation. The new interface must distinguish reuse, replacement, and inserting a fragment.
13. Buyer preview is available through the older editor route but hidden in the new draft route.
14. Current summary seat counts do not include standing capacity; revenue calculation does not consistently exclude disabled objects. People, individually sold seats, entire tables, and standing admission units need separate accounting.
15. Direct object prices exist in the older inspector; the canonical draft route uses tariffs and strips direct prices/deposits. The new editor should have one category-based pricing experience, with explicit legacy conversion.
16. Much of the editor remains hardcoded in Russian although the wrapper and tariff content are partly localized. Interface language and event-content language must remain distinct.

## 2. Overall flow

Entry: **Выбрать сохранённый зал** or **Создать схему**.

New schemes can start from **Ряды**, **Столы**, **Стоячая зона**, **Смешанная схема**, or **Пустая схема**. These only prefill editable objects; they must not restrict which other objects can be added.

Editor steps: **Расстановка → Цены → Проверка**. Basic incomplete work can be saved and navigation between steps remains possible. Blocking issues prevent final completion/publication at the appropriate event-level gate, not every intermediate edit.

The layout toolbar has five labeled actions: **Блок рядов**, **Круглый стол**, **Прямоугольный стол**, **Стоячая зона**, **Сцена**. **Вход / выход**, **Препятствие / подпись**, measurement, and unusual geometry live under **Ещё**. Cursor/select is the default interaction, not a mode the user must repeatedly choose.

Settings appear for the selected object in a docked desktop panel or mobile bottom sheet. Ordinary properties are visible; geometry and rare settings are collapsed under **Точные настройки**. No global switch should be required to edit a price, seat count, or standing capacity.

## 3. Complete feature disposition

Legend: **Keep** preserves the capability; **Change** replaces its behavior/UI; **Move** keeps it outside the default workspace; **Remove UI** removes redundant display, not stored data. **New** identifies functionality that does not exist today.

### A. Entry, saved halls, and navigation

| ID | Current feature | Decision and exact proposed behavior |
|---|---|---|
| A01 | “Создать / изменить зал” in ticket setup | Change to a hall card with thumbnail, mixed-capacity summary, **Изменить схему**, and **Выбрать другой зал**. Empty state offers saved/new choices. |
| A02 | Separate free/general/paid-hall event modes | Keep backend semantics. Clarify the hall-mode description: rows, whole tables, table seats, and standing areas may coexist. For standing-only admission without a visual scheme, offer the existing general-admission route. |
| A03 | Default empty 24 × 16 room | Keep only as internal initial geometry; do not force dimensions as onboarding. Never present the default as measured venue data. |
| A04 | Saved hall list | Change to searchable thumbnail cards, with recent sorting, name, seats, tables by sale mode, standing capacity, and mixed-format badge. Add pagination, loading, empty and failure states. |
| A05 | Templates unavailable in new drafts | Change: provide an authorized draft-compatible saved-hall import path. Do not route anonymous drafts through organizer-only APIs or expose another organizer’s halls. Explain sign-in when personal saved halls require it. |
| A06 | Whole-template replacement via backend | Keep as **Использовать этот зал**; creates an event-local copy. If current work exists, preview replacement and preserve a recoverable draft. |
| A07 | Toolbar template insertion appends objects | Move to **Добавить сохранённый блок**. It inserts at a chosen position and never masquerades as selecting the whole hall. |
| A08 | Save current hall as template | Change to **Сохранить в мои залы**, automatically flushing current edits before saving. Do not require the user to discover a separate Save prerequisite. |
| A09 | Save selection as template | Move to selection actions, **Сохранить как блок**. Include child seats and needed price-category definitions. Normalize bounds and preview insertion. |
| A10 | Template name | Keep; suggest a separate hall name, not automatically the event title. Add rename and archive/remove management in the library. Existing events remain independent. |
| A11 | Duplicate IDs when cloning | Keep fresh instance IDs for imported objects/categories and all parent relationships; copying a hall must not copy bookings, holds, or live availability. |
| A12 | Existing saved prices | Change to explicit **Проверить цены** when applying. Same-currency amounts may be reused deliberately; cross-currency prices are unset until confirmed, never silently relabeled or exchanged. |
| A13 | Back button / logo navigation | Change to one clear **К мероприятию** route that flushes saves, preserves the existing draft and return language, and handles failure without dropping changes. |
| A14 | Save + Done buttons | Change to autosave, retry on failure, and one primary **Далее** / **Готово — к мероприятию**. Manual save can remain in overflow/shortcut, not a competing primary action. |
| A15 | Older-route preview link | Change to an integrated buyer preview available in both draft and older routes. |
| A16 | Organizer profile icon in old header | Remove UI from the focused editor. Keep account navigation on the surrounding organizer workspace. |

### B. Workspace, room, and viewport

| ID | Current feature | Decision and exact proposed behavior |
|---|---|---|
| B01 | Hall title | Keep; editable hall name with event association shown secondarily when useful. |
| B02 | Header dimensions badge | Move to room settings; show it in the header only when **Точные размеры** is enabled. |
| B03 | Room width/depth fields | Keep under **Параметры зала → Точные размеры**. Room shrink previews out-of-bounds objects; never silently scales all inventory. |
| B04 | Dense metric grid | Change to a subtle visual alignment grid. Metric subdivisions appear only in precision mode. |
| B05 | Horizontal/vertical numeric rulers | Move to precision mode; remove from default canvas. |
| B06 | “Ширина зала” canvas banner | Remove UI by default; redundant with room settings and visually overlaps rulers. |
| B07 | “Север зала: 0°” | Remove UI. It is a static orientation label with no useful current user action. Do not add compass controls without a concrete venue use case. |
| B08 | “1 м = … px” and ratio | Remove UI; viewport implementation details do not help ordinary placement. Precision mode shows actual dimensions and measurements, not pixel ratios. |
| B09 | Live cursor X/Y coordinates | Move to precision mode. |
| B10 | Grid snap toggle repeated in header and panel | Change to one **Привязка** option in view settings, enabled by default. Keep temporary Alt bypass for desktop users. |
| B11 | Edge/center alignment guides | Keep automatic, transient guides during movement. They do not need permanent settings in the main panel. |
| B12 | Zoom − / percentage / + | Keep one compact group. Label the percentage as view zoom; it must not imply physical size. |
| B13 | Fit command in several locations | Keep one **Показать всю схему** command; fitting respects the space beside the docked panel. Keep Ctrl/Cmd+0. |
| B14 | Wheel/trackpad pan and zoom | Keep, but establish consistent behavior and a short help tooltip. Prevent accidental page-scroll capture outside the canvas. |
| B15 | Space/middle-mouse pan | Keep optional shortcuts; add an explicit pan control for users without them. |
| B16 | Pinch zoom/touch navigation | Keep; provide mobile navigation mode so a finger drag does not accidentally move an object. |
| B17 | Draggable inspector | Change to docked responsive settings; remove inspector drag/reset controls. These manage the UI instead of the hall. |
| B18 | Inspector close/reopen | Keep a simple collapse control on desktop and dismissible mobile sheet. Selection reopens relevant settings. |
| B19 | “Слои & Зоны” / “Свойства объекта” tabs | Remove UI. Room/view settings get a small menu; prices and checks get their own steps; object properties follow selection. |
| B20 | Empty inspector instructions | Change to contextual starter actions and one short instruction. Do not reserve a large empty panel. |
| B21 | Light/dark theme | Keep through the shared site control or overflow. Ensure category and availability colors remain readable in both themes. |

### C. Selecting, editing, and shared object properties

| ID | Current feature | Decision and exact proposed behavior |
|---|---|---|
| C01 | Cursor tool | Keep as the automatic default after adding an object; do not require repeated tool switching. |
| C02 | Icon-only tool rail and hover descriptions | Change to labeled object actions, visible descriptions on first use, and compact icons only when space requires them. |
| C03 | Click placement / drag tool onto canvas | Keep both optional. Primary Add creates a complete useful object; batch tools support drawing an area. |
| C04 | Click selection | Keep. Parent block/table is the default editing scope; explicit **Места** / row labels expose children. Preview mode has different buyer interactions. |
| C05 | Shift multi-select and drag rectangle | Keep; add a visible selection count and properties that apply to the whole selection, rather than editing only its first object. |
| C06 | Move selected objects | Keep direct dragging, alignment guides and group-relative placement. Child chairs move with their table/block. |
| C07 | Arrow-key nudging / Shift larger nudge | Keep optional; do not intercept input fields or treat shortcuts as the only editing method. |
| C08 | Resize handles | Keep. Preview effects; do not detach seats, reduce capacity, or change a table’s sales semantics as a side effect. |
| C09 | Rotation handle / numeric angle | Keep handle with useful snapping; numeric angle moves to precision settings. Group rotation preserves child offsets. |
| C10 | Table rotation snapping near 10-degree increments | Keep as an assistive behavior; show snap feedback and allow precision override. |
| C11 | Automatic size snapping to preset dimensions | Keep only where predictable; show the resulting dimension. It must not silently alter seat count. |
| C12 | Name field / pencil / double-click rename | Keep one visible name field and optional inline rename. Remove duplicate controls that merely focus the same field. |
| C13 | Raw X/Y fields | Move to precision settings. Coordinates of attached chairs should be parent-relative or read-only, not misleading independent world coordinates. |
| C14 | Width / height / diameter | Keep contextual sizing. Label floor-plane “height” as **Глубина**; circle uses diameter. Nontechnical sizes may use handles/presets. |
| C15 | Copy, paste, duplicate | Keep shortcuts plus **Дублировать**. Regenerate IDs and parent links; assign unique table/row labels; preview collisions. |
| C16 | Duplicate offsets by fixed distance | Change to placing a copy in the next available nearby position, with placement preview when no clear space exists. |
| C17 | Delete object and child seats | Keep; one undoable operation includes children. Confirm impactful bulk deletion, not every chair deletion. Existing sale-history restrictions remain. |
| C18 | Top alignment / horizontal center / vertical center | Move to **Расположить**; show text labels. Multi-selection supports align/distribute relative to selection as well as room. |
| C19 | “Отразить поворот” | Move to precision actions, label **Зеркально изменить угол** if retaining its current meaning. Do not claim this mirrors the entire geometry. A true mirror must transform all children and polygon points. |
| C20 | “Блок” | Change into two independent actions: **Закрепить положение** and **Не продавать**. Preserve legacy unavailable states during migration. A pinned table can still be sold. |
| C21 | Object status says “свободно” when unlocked | Change to **В продаже / Не продаётся** for organizer setup. “Свободно” is buyer-time availability, not a geometry flag. |
| C22 | Arbitrary color / colorOverride | Keep category color as the default for sellable resources. Custom decorative color belongs to stage/labels or advanced styling, with a visible **Сбросить цвет** when overriding legacy styles. |
| C23 | zIndex/layer order | Keep automatic order: section backgrounds, objects, seats, labels. Preserve existing values. Put any manual forward/back actions under **Расположить**, not a new always-visible layer tree. |
| C24 | Undo/redo, 150-command history | Keep current depth. One drag, seating-count change, spacing slider gesture, import, batch insertion, or price application is one logical action. Expose undo on mobile too. |
| C25 | Escape / Enter shortcuts | Keep Escape cancel/deselect; Enter completes explicit drawing forms. Pair every polygon/rename shortcut with visible buttons. |

### D. Rows, seating blocks, and standalone seats

| ID | Current feature | Decision and exact proposed behavior |
|---|---|---|
| D01 | Draw one row as a line | Replace primary flow with drawing a seating block. Retain **Один ряд** inside block options for irregular venues. |
| D02 | Always three seats on new row | Change to live fitting using the chosen seat footprint, spacing, margins and exclusions. Direct row/seat counts remain available. |
| D03 | Row count absent as group control | New: selected block has **Рядов**, **Мест в ряду**, and total sellable seats. |
| D04 | Add/remove last seat with ± and row-end + | Keep count controls in row/block context; row-end + is optional detailed editing. Removal previews which seats are affected and respects custom/unavailable inventory. |
| D05 | Seat spacing calculated from row length | Change to explicit seat spacing and row spacing, each independent of seat count. Show counts during geometry changes. |
| D06 | Row width resizing preserves at least seat footprint | Keep physical minimum validation. A change that does not fit offers more space or fewer seats; never silently detaches seats. |
| D07 | Single-seat tool | Move to **Дополнительно → Отдельное место**. Keep for special isolated chairs and existing layouts. |
| D08 | Automatic seat attachment near a table | Change to explicit highlighted **Прикрепить к столу** on drop; normal dragging must not silently change the ticket’s parent/sales type. |
| D09 | Moving row seat triggers redistribution/detachment | Change: **Изменить отдельные места** stores local overrides. Add explicit **Отсоединить** when needed. Moving a parent preserves overrides. |
| D10 | Row direction left-to-right / reverse | Keep under **Нумерация**, show arrows and a small preview. |
| D11 | First seat number | Keep under **Нумерация**. Add section and first-row numbering at block level; changing counts does not silently renumber unrelated blocks. |
| D12 | Table/row child numbering recalculated | Change so geometry-only movement preserves displayed numbers and stable IDs. Offer an explicit renumber action in drafts. |
| D13 | Curved row toggle and signed curvature | Keep under **Форма рядов** with straight/arc preview and visual curvature control; exact signed value stays advanced. |
| D14 | Parent navigation from a chair | Keep as a breadcrumb: **Партер → Ряд 4 → Место 8** or **Стол 3 → Место 2**. |
| D15 | Fixed 0.45 m seat footprint and geometry capacity checks | Keep current supported constraints until deliberately changed across client/server. Do not describe them as certified venue spacing standards. |
| D16 | No first-class aisle tool | New: central/side passage controls that preserve logical row identities and show lost seat count. Irregular passages remain precision editing. |
| D17 | No distinction between initial fill and later edits | New: initial drag previews generated capacity; later resize preserves count. **Заполнить заново** explicitly regenerates, with an impact preview if overrides will change. |
| D18 | Sections mostly implied by row names | New: named non-sellable seating blocks/sections such as Партер/Балкон; price categories are separate. A block is an editing group over stable rows/seats. |

### E. Round and rectangular tables with chairs

| ID | Current feature | Decision and exact proposed behavior |
|---|---|---|
| E01 | Separate round/rectangular tools | Keep both prominent labeled actions. They are equally supported in the first release. |
| E02 | Newly added table has no seats | Change: Add opens/uses **Форма + Мест + Что продаём** and creates a complete table with automatically arranged chairs. Remember the last-used configuration. |
| E03 | Round diameter with equal width/height | Keep uniform-circle behavior. Choose a supported starting size from seat count, or enter actual diameter in precision settings. |
| E04 | Rectangular width/depth | Keep handles and actual dimensions in precision settings; common arrangement presets are the primary control. |
| E05 | Rectangular “add chair top/bottom/right/left” buttons | Replace default with pictorial presets: **С двух сторон**, **Со всех сторон**, **С трёх сторон**, **Настроить стороны**. Preserve individual per-side counts in the last option. |
| E06 | Generic total-chair ± uses first available rectangular side | Change to selected arrangement distributing count predictably; show the final per-side preview. Never fill one unexpected side merely because it has capacity. |
| E07 | Round automatic even seating | Keep as the default. Add a simple **Оставить сторону сцены свободной** arrangement; exact orbit editing remains available. |
| E08 | Drag chair around round-table orbit | Keep in **Настроить места** with guide and collision feedback. Preserve the chair identity, number and manual angle. |
| E09 | Reset round chairs evenly / auto-arrange duplicate actions | Consolidate into **Распределить равномерно**, with a preview/reset warning if manual positions exist. |
| E10 | Chair offset from edge | Move to **Расстояния → От стола до стульев**, with visual preview. Numeric metres stay precision settings. |
| E11 | Chair-count limits and collision prevention | Keep, unify validation and explanations. Offer **Увеличить стол** or **Уменьшить число мест** when exact dimensions cannot fit the requested count. |
| E12 | Resizing can detach excess chairs | Change: prevent the incompatible resize or preview an explicit count reduction. Never create accidental independently sellable chairs. |
| E13 | Whole-table vs per-seat sale | Keep as a primary business setting: **Стол целиком** / **Отдельные места**. Show unit and buyer preview immediately. |
| E14 | Prices on chairs of a whole table | Hide individual seat price/category controls. Those chairs represent included capacity, not separate items. Switching modes requires deliberate price reassignment. |
| E15 | Per-seat table category | Keep table-level default category inherited by chairs. Permit selected-chair overrides when needed; visibly label the exception. |
| E16 | Collapsible list of table seats with numbers and prices | Keep under **Места за столом**; whole-table mode shows included seat count rather than misleading repeated per-chair prices. Selecting a list row highlights that chair. |
| E17 | Table number/name | Keep readable unique labels; new and duplicated tables get the next unused table number across both shapes. Number is not the price-category name. |
| E18 | Table size + tariff tooltip/floating badge | Change default badge to **Стол 4 · 8 мест · целиком** or **по местам**. Exact dimensions appear only in precision mode/size adjustment. |
| E19 | Only individual duplicate placement | New: **Добавить несколько столов** with quantity, arrangement, gaps and live total; also draw an area to preview a table grid. Commit only on Apply. |
| E20 | Mixed table shapes and modes | Keep in the same hall. Batch edits must identify affected tables, chairs and sale units. Use per-mode categories to avoid confusing per-table and per-seat amounts. |

### F. Standing areas, stages, entrances and decorative objects

| ID | Current feature | Decision and exact proposed behavior |
|---|---|---|
| F01 | “Полигон зоны” tool | Change primary name to **Стоячая зона**. Default is a draggable rectangle; **Изменить форму** enables polygon editing. |
| F02 | Click vertices and close polygon / Enter | Keep under custom shape with visible **Завершить** and **Отмена**. Show closure affordance; do not require knowing Enter or clicking near the first point. |
| F03 | Move/delete vertices, double-click adds point, right-click removes | Keep in explicit shape-edit mode. Add selected-point **Добавить / Удалить** actions for touch and keyboard use. Validate shapes. |
| F04 | Capacity field starts at zero | Keep manual capacity, but start unfilled and ask **Сколько билетов можно продать в этой зоне?**. Draft can save unfinished; completion clearly flags missing capacity. |
| F05 | Zone physical area in m² | Move to precision details. Do not infer crowd capacity from drawn size or resize ticket inventory automatically. |
| F06 | Resize/rotate zone geometry | Keep; preserve explicit ticket capacity. Resizing shows the current capacity and asks for review when appropriate. |
| F07 | Zone opacity slider | Remove from ordinary controls; choose an accessible default. Preserve existing values and put optional styling under advanced appearance. |
| F08 | Zone name and tariff | Keep primary **Название + Вместимость + Цена за вход**. One category per zone in first release; name/label must clearly identify the area to buyers. |
| F09 | Zone ticket quantity selection in buyer UI | Keep: click/tap zone, choose quantity; never generate fake seat numbers. Share the same capacity/availability as checkout. |
| F10 | Multiple standing zones | Keep independent quotas per zone. Duplicating a zone previews the newly added capacity; it is not a second drawing of the same stock. |
| F11 | Several tariff types sharing a single standing quota | New, optional later: early-bird/standard prices must share one zone inventory pool. Until supported, do not fake it with overlapping independently counted zones. |
| F12 | Standing mixed with tables/rows | Keep first-release support. Seat/table footprints and standing sellable areas must not overlap accidentally; geometric annotations must not create additional stock. |
| F13 | Stage / prop tool | Keep **Сцена** primary; **Препятствие / объект** under More. Both non-sellable. Existing generic props remain supported. |
| F14 | Default stage subtitle and dimensions printed on stage | Change to a short editable label; stop printing technical dimensions and boilerplate subtitle on the buyer diagram. Keep optional secondary text if the schema supports it. |
| F15 | Prop description editable only outside canonical draft | Preserve legacy text. Decide and implement canonical annotation/secondary-text support before displaying an editable field; never promise persistence for a stripped description. |
| F16 | Stage dimensions / rotation / color | Keep handles, optional color and precision settings. Stage is not required to finish a hall. |
| F17 | Entrance/exit placement and wall snapping | Keep as More → **Вход / выход**, automatically attach to wall with type labels/arrows. Separate from aisles inside seating blocks. |
| F18 | Entrance type in/out/both | Keep a small three-choice control. Size in precision settings. No capacity or price controls. |
| F19 | Ruler two-point measurement | Move to **Точные размеры → Измерить**. Keep clear/cancel and measurement value only while active. |

### G. Pricing, currency, color, summaries and validation

| ID | Current feature | Decision and exact proposed behavior |
|---|---|---|
| G01 | Tariffs embedded in room inspector | Move to **Цены**. Start with **Одна цена** or **Несколько категорий**. A one-price action creates/assigns a category internally. |
| G02 | Tariff name/description | Keep name primary, description optional. Retain source-language limits and multilingual content. Use **Категория цены**, not unexplained internal terminology. |
| G03 | Color palette | Keep automatic color with optional change; show name and price as well, so color alone is not required to understand the scheme. |
| G04 | Tariff amount | Keep currency-aware money input with explicit **за место / за стол / за вход** context. Missing and zero are different states. Preserve current event-level paid-mode positive-price rule unless deliberately changed separately. |
| G05 | Assign tariff to object | Keep; apply to selection by block/row/table/chair/zone. Compatible parent defaults inherit; exceptions are visible. |
| G06 | Legacy direct price and inherit reset | Change to category-based pricing. Import explicit legacy overrides as equivalent private categories, preserving exact totals. Replace technical inheritance text with **Как у ряда/стола**. |
| G07 | Clear tariff / “Без тарифа” | Keep as **Цена не назначена** for sellable inventory. Keep unavailable objects clearly excluded; they need not be forced through normal sellable pricing checks. |
| G08 | Delete tariff disabled while assigned | Change to **Переназначить и удалить** with affected-resource count and a replacement picker. No silent reassignment. |
| G09 | Tariff seat count | Change to typed summary: individually sold seats, whole tables, standing admissions; never report whole tables as independently priced child seats. |
| G10 | Header tables/seats/tariffs counters | Change to a small context-aware summary; show **Места по билетам**, **Столы целиком**, **Входных билетов**, and optional physical guest capacity. Category count belongs to Prices. |
| G11 | Revenue at sellout | Move to Prices/Review. Exclude non-sellable stock and multiply by the correct unit. Name it **Потенциальная выручка**, not earned revenue; show incomplete when prices are missing. |
| G12 | Active/inactive categories in canonical data | Preserve. Expose **Не продавать по этой категории** in pricing settings and show impacted resources. Do not lose active states on import, regeneration or undo. |
| G13 | Currency from event / draft | Keep one event currency. Changes require explicit price review; use the supported exponent/formatting. Do not add a second independent hall-currency control. |
| G14 | Deposits present in legacy types | Do not reintroduce in new UX; current sale policy rejects deposit input. Preserve historical records without promising unsupported new deposit sales. |
| G15 | Warning list in room tab | Move to **Проверка** with inline hints during editing. Clicking an issue selects, pans to and opens the appropriate control. |
| G16 | Out-of-bounds and overlap highlights | Keep; distinguish actual sellable collisions from allowed background annotations. Include stage/obstacle intersections and footprint-aware table/chair checks. |
| G17 | Missing prices, zero zone capacity, duplicate labels | Keep with structured, mode-aware messages; also check category activity, duplicate row/seat addresses, orphan seats, zero-seat tables and invalid shapes. |
| G18 | “Замечаний нет” for empty/incomplete scheme | Change to stage-specific status. Empty layout is not “ready”; lack of current geometry warnings is not proof of pricing/readiness. |
| G19 | Decorative stage or entrances as checklist requirements | Do not require them. Gate on sellable inventory and data integrity, not optional orientation objects. |
| G20 | Buyer preview colors/labels/selection | Keep actual buyer renderer; row seats, table seats, whole tables and standing quantities each demonstrate their real selection and price unit. |

### H. Saving, compatibility, mobile and accessibility

| ID | Current feature | Decision and exact proposed behavior |
|---|---|---|
| H01 | 1.5-second autosave | Keep debounced saving after meaningful edits, not every pointer movement. Save statuses are **Сохраняем / Сохранено / Не сохранено — повторить**. |
| H02 | Save status repeated in header and floating strip, live seconds counter | Consolidate into one accessible status. Remove constantly changing “seconds ago” from the main workspace. |
| H03 | Finish saves latest state | Keep; **Готово** waits for successful flush and returns to the same event draft. Saving a hall is not publishing an event. |
| H04 | Dirty-navigation warning | Keep protection; add recoverable local draft and clear retry. Do not lose work on failed validation/network requests. |
| H05 | Stale revision disables editing and reload warning | Keep revision checks. Preserve a recovery copy and explain **Зал изменён в другом окне**; show reload/recovery choices. Do not silently overwrite. |
| H06 | Draft-only structural editing | Keep current restrictions in client and server. A geometry redesign must not unlock removal/renumbering of held or sold resources. |
| H07 | Stable object IDs, parent links and category links | Keep. New block generators maintain individual seat IDs; create fresh IDs only for genuinely new seats or independent copies. |
| H08 | Older layouts / v2 editor / canonical v3 adapter | Keep compatibility with explicit conversion tests for tables, standing quotas, prices, labels, disabled states and custom geometry. Switching interface must not change inventory. |
| H09 | Source-content locale and interface locale | Keep distinct. Localize every tool, error, property and summary; edit tariff content in the event’s selected content language, not implicitly the UI language. |
| H10 | Limits: 3,000 objects, 2,000 seats, 500 tables, 100 rows, 100 categories; vertex and room limits | Keep current supported limits until intentionally redesigned. Generators preview limits and stop before committing an invalid layout. Do not promise unlimited hall capacity. |
| H11 | Mobile fixed large canvas and settings below it | Change to full available canvas plus bottom sheet; persistent primary action, accessible undo, and object list/number controls. Avoid forcing long page scrolls between canvas and inspector. |
| H12 | Tool keyboard shortcuts and SVG application interaction | Keep shortcuts with discoverable help. Add named object list, keyboard selection, form-based count/position changes and non-drag alternatives. Do not require mouse-only drawing. |
| H13 | Import/save errors and loading states | Keep with scoped retries; failure loading templates must not prevent editing an already loaded hall. Invalid partial shapes stay as recoverable draft work, not a falsely saved complete hall. |
| H14 | Data fields not exposed in the new default UI | Preserve through read/save, duplication, undo and legacy conversion. Do not delete rare-feature data merely because its control moves to Advanced. |

## 4. Complete primary workflows

### 4.1 Rows / партер

1. **Блок рядов** → draw an area, or input rows × seats if already known.
2. During drag show ghost rows, seat count, margins, chosen spacing and passage preview; apply only on release/confirmation.
3. Show **Название**, **Рядов**, **Мест в ряду**, **Между рядами**, **Между местами**, **Проход**. Do not ask for world coordinates.
4. Initial fitting maximizes seats only for the explicitly selected geometry/spacing; it does not estimate permitted venue capacity.
5. After placement, resize preserves count and changes spacing within limits. Explicit **Заполнить заново** previews count/override changes.
6. Select a row by its label, or choose **Отдельные места**. Row-specific counts, offsets and chair positions are persistent exceptions.
7. A center passage creates visual subgroups sharing logical row identity. Numbering can continue across the gap; first row/seat/direction are adjustable.
8. Price a block, rows or selected seats on the Prices step.

### 4.2 Round tables with seats

1. **Круглый стол** → choose seat count from simple presets or type a number; use remembered count only as an editable suggestion.
2. Choose **Стол целиком** or **Отдельные места**. If duplicating, inherit the source choice and show it.
3. Create a complete table and chairs. If actual diameter is known, validate against it; otherwise a supported initial size is an editable schematic starting point.
4. Ordinary settings: **Название/номер**, **Мест**, **Что продаём**, **Рассадка: равномерно / сторона сцены свободна**, **Ценовая категория**.
5. Exact diameter, chair offset and individual orbit positions sit in **Настроить места / размеры**.
6. Moving/rotating/resizing the table preserves chair identity and manual arrangement. An impossible reduction stops with alternatives; chairs never silently detach.
7. **Добавить несколько** creates N matching tables with sequential unused numbers and a layout preview. Draw-to-fill counts the table-plus-chair envelope and passages, not tabletop alone.
8. Buyer preview: whole-table click selects one table with included guest capacity; per-seat click selects individual chairs. Price controls and legend follow that distinction.

### 4.3 Rectangular tables with seats

1. **Прямоугольный стол** → seat count + visual arrangement **две стороны / все стороны / три стороны / настроить стороны**.
2. Show resulting chairs before insertion. In custom mode, expose four numeric side counts with a picture; replace four repetitive add-one-chair buttons.
3. For the selected table show **Название/номер**, **Мест**, **Рассадка**, **Что продаём**, **Категория**. Width/depth and chair offset are optional precision controls.
4. Changing count redistributes according to the selected arrangement. Changing only table orientation does not unexpectedly renumber chairs or alter the layout preset.
5. Custom per-side or individual-chair changes persist when moving the table and when saving/reopening.
6. Bulk add supports quantity or area-fill, table and row gaps, orientation and total guest capacity. Preview collisions and maximum supported count.
7. Whole-table and per-seat pricing follow the same rules as round tables. Do not create a second implementation with different sales semantics.

### 4.4 Standing areas

1. **Стоячая зона** → drag a rectangle; **Изменить форму** is optional custom polygon editing.
2. Ask **Название** and **Вместимость — сколько входных билетов продаём?**. Capacity is an explicit quota, not seat count or automatic area density.
3. Prices step assigns **Цена за вход** through the category. Default first release: one category per zone.
4. Draw no chairs and generate no fake seat IDs/numbers for this stock. Buyer clicks the area and chooses a ticket quantity.
5. Resizing/rotating changes its drawing, not capacity. Changing quota is an explicit inventory operation and respects existing reservations/sales restrictions.
6. Duplicate a zone only as an independent capacity pool, with a clear preview of the extra admission quota. Splitting a zone requires allocating the original quota rather than multiplying it.
7. Several zones may have different prices and quotas. Seated and standing stock coexist in the same hall and share the event currency.
8. Early-bird/standard prices for the same physical area require a future shared-capacity pool; overlapping independent zones are not an acceptable shortcut.
9. Standing-only events without a need for a visual plan can use ordinary general-admission tickets. Do not make drawing mandatory to sell unassigned admission.

### 4.5 Mixed hall and counting example

Example: 120 row seats + four tables sold by seat with six chairs each + two whole tables with eight included chairs each + standing capacity 200.

- Individually sellable seats: 120 + 24 = **144**.
- Whole tables for sale: **2**; included seating capacity **16**.
- Standing admission units: **200**.
- Physical guest capacity represented: **360**.
- Sale units at full occupancy: 144 seats + 2 tables + 200 admissions = **346**, with different unit types; do not show this as “346 seats”.
- Potential revenue: 120 × row-seat price + 24 × table-seat price + 2 × whole-table price + 200 × standing-admission price, excluding withheld stock. More categories sum separately.

The buyer must see the correct unit for every selection. Preserve current checkout restrictions and explicitly test the combinations it accepts; the simplified editor must not imply that an unsupported mixed basket is already purchasable.

## 5. Prices: exact rules

- First show **Одна цена** and compatible scope. Do not apply a single numeric amount to a mix of whole tables and seats without showing its different units.
- Categories are names/colors/amounts with event-currency formatting and localized optional descriptions.
- A per-seat table can supply its chairs’ default category; selected chairs may override it.
- A whole table is priced once; included chairs have no separately editable sale price. Changing sale mode before sales requires reviewing prices and inventory; after sale history use the existing restricted workflow.
- Standing quota belongs to the zone, not the number of price-category labels drawn over it.
- Missing price is unset, not zero. An intentionally free category remains distinguishable from incomplete pricing; current event-level positive-price constraints stay explicit.
- Category deletion requires reassignment; imported legacy object overrides become explicit categories with equivalent amounts.
- Current unsupported deposits are not added back as a “simplification”.

## 6. State, data and reliability requirements

The organizer edits groups; booking continues to reference stable individual sellable resources. Store generator parameters and manual exceptions alongside the existing canonical geometry, with versioned validation. Do not regenerate IDs from row/column indices on read.

Separate movement-pinned state from sale-unavailable state; migrate legacy values conservatively so previously withheld stock stays withheld. Preserve category activity and all child/parent relations during every operation.

Review the current different spacing/capacity calculations together with the schema and server before exposing new controls. A UI slider must not generate a layout rejected by save/publication. Existing implementation constants are engineering constraints, not guaranteed venue capacity guidance.

Reuse saved halls through capability-appropriate APIs for account-owned or anonymous drafts. Importing is an authorized copy operation, never a way to bypass organizer ownership checks. Currency, source language, categories and fresh IDs must be remapped atomically.

A partial draft can be autosaved even before capacity/prices are complete; **Готово** returns to event setup only after successful persistence. Event publication remains a separate action using the same readiness rules as the buyer preview.

## 7. Delivery plan: all three inventory types are in scope

1. **Contract and compatibility audit:** freeze current row/table/zone sales behavior; define typed capacity summaries, pinned/unavailable migration, group metadata and deterministic generation. Establish legacy round-trip fixtures.
2. **Common shell and saved halls:** new entry, full-hall versus fragment distinction, authorized draft import, docked settings, single save status, responsive controls and room precision menu.
3. **Primary creation tools together:** seating blocks, complete round tables, complete rectangular tables, rectangular standing areas, stage and More tools. Include per-seat/whole-table choice and explicit standing quota now.
4. **Detailed editing and bulk operations:** per-row/chair exceptions, table-side presets, round orbit customization, batch tables, passages, polygon editing, meaningful multiselect, explicit destructive-impact previews.
5. **Prices and review:** category scope/unit rules, typed summaries/revenue, canonical/legacy price conversion, real buyer preview, structured checks, localized content and mobile alternatives.
6. **User validation and rollout:** test novice and returning organizers across theatre, banquet, standing-only and mixed scenarios. Roll out behind a switch that preserves old layouts and their sale restrictions.

The first release cannot be called complete if tables require manually placing every chair, if standing stock is hidden under More, or if a mixed hall works visually but fails its booking semantics.

## 8. Acceptance and regression scenarios

1. Draw a seated block, alter row spacing without altering count, add an aisle, shorten one row, move one chair, save/reopen, and undo/redo without losing overrides or identity.
2. Add a round table with chairs in one operation, leave the stage-facing side free, move one chair around the orbit, rotate the table and preserve numbers/positions.
3. Add a rectangular table with two populated sides; change total count predictably; customize individual side counts and preserve them on movement.
4. Insert twelve tables in a batch; preview gaps/collisions; number uniquely across both shapes; undo the entire insertion once.
5. Attempt an incompatible table shrink: no chair becomes standalone and no inventory changes without explicit approval.
6. Switch a draft table from whole-table to per-seat and review required category changes. Verify buyer selection and pricing units for both modes.
7. Draw and price standing capacity 200; resize the drawing without changing 200; buy quantities in preview without seat numbers.
8. Duplicate or split a standing area with a clear quota result; no accidental multiplication of a shared pool.
9. Build the mixed-capacity example above and verify counts and potential revenue with unavailable stock excluded.
10. Pin a sellable table in place without withholding it; withhold one seat without making its drawing impossible to edit; round-trip legacy disabled stock safely.
11. Reuse a saved mixed hall in a new draft; original hall and other events are unchanged; live allocations are not copied; cross-currency prices require review.
12. Save and insert a fragment without replacing the existing hall; all child links, category references and bounding positions are valid.
13. Preserve curved rows, custom polygon vertices, annotations and legacy price overrides when a user never opens advanced settings.
14. Simulate failed autosave, lost connection and stale revisions; retain recovery data and never report an unsaved layout as saved.
15. Test source/UI language combinations, color-blind readability, keyboard-only selection and mobile non-drag inputs.
16. Protect held/sold seats, table allocations and standing quotas under the same existing server restrictions.
17. Verify the actual checkout-supported combinations of seats, whole tables and standing tickets, not merely the plan’s appearance.
18. Generate near current object/row/seat limits; reject invalid counts before creation without losing existing work.

Suggested usability targets, to validate rather than promise: saved-hall reuse to price review within 30 seconds; an ordinary row, table or standing scheme within three minutes; no coordinates, per-chair placement, or polygon knowledge required in those basic tasks.
