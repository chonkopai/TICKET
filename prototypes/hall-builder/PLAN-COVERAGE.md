# Prototype coverage of PLAN.md

This prototype implements the frontend iteration milestone in section 7 of `docs/hall-simplification/PLAN.md`. It is not the production integration milestone. “Working” below means actual browser-local state/geometry, not a static mockup. Server-dependent behavior remains explicitly unimplemented.

## Feature groups

| Plan group | Working in this prototype | Remaining differences |
|---|---|---|
| A · Entry and saved halls | Starters, thumbnails, search/sort/pages, preview, independent copies, save/rename/archive/restore, fragments, undoable replacement | Local library instead of authorized APIs; no event association/return route; reuse does not ask a separate same-currency price consent question |
| B · Workspace | Editable name, inline dimensions/currency/snap/precision toolbar, optional rulers, quiet grid, snap + Alt bypass, zoom/fit, explicit/middle-button pan, docked/responsive settings, collapse, theme | Movement crosshairs are not true edge/center alignment guides; no Space-pan or pinch recognizer; mobile panel shares canvas space rather than overlaying its center |
| C · Shared editing | Parent/child selection, multi-selection, drag, arrows, resize/rotate, names, precision positions, copy/paste, delete, partial alignment/distribution, pin vs unavailable, history | No toolbar drag-to-place; fixed duplicate offset; limited arrange commands; 5° rotation snapping; no mirrored-angle action or manual layers/legacy styling import; impact previews for destructive count changes are incomplete |
| D · Rows | Region fill, counts, independent row/seat spacing, row overrides, persistent child offsets, numbering, curves, aisles, standalone seats, explicit regeneration, named blocks | No explicit attach/detach workflow; regeneration warns but has no before/after impact overlay; aisle controls add space rather than automatically removing seats for a fixed envelope |
| E · Tables | Both shapes with chairs, per-seat/whole-table units, arrangements/custom sides with length-based caps, round chair orbit, reset, distances, shrink rejection, seat lists, unique new table numbers, batches | No remembered last-used configuration; increasing seat count can require manual enlargement; no collision-aware duplication preview; geometry constraints are prototype-owned until client/server unification |
| F · Standing and landmarks | Rectangular draw/add, custom vertices, explicit capacity, geometry-independent quota, split, duplicate-capacity confirmation, buyer quantities, mixed hall, stage/obstacle, entrances/arrows/wall proximity snap, ruler | Polygon self-intersection/closure validation and selected-vertex numeric controls remain; no shared quota across tariff types; no canonical annotation/secondary-text adapter |
| G · Pricing and review | Category step, unit-aware prices, parent inheritance/child overrides, zero vs unset, reassignment on deletion, activity, typed totals, potential revenue, currency reset, issue list, buyer simulation | No multilingual descriptions or legacy direct-price conversion; currency is a stand-in for event currency; category affected counts incomplete; issue clicks select but do not pan; conservative bounding boxes; buyer renderer is a simulation rather than production checkout |
| H · Persistence and access | Local debounce/flush, retry and JSON recovery, cross-tab conflict choices, stable IDs, resource limits, mobile numeric/list controls, focus-trapped dialogs and shortcuts | No server revision/auth/lifecycle enforcement; no offline sync queue; no sold/held protection; no hall-v2/v3 adapters; Russian only; no full screen-reader/color-vision/assistive-device audit; legacy unknown fields are not guaranteed |

Removed default UI follows the plan: no “Север зала”, pixel-to-metre ratio, overlapping width banner, inspector drag controls, combined “Слои & Зоны” tab or technical object coordinates in ordinary editing.

## Acceptance scenarios from section 8

| # | Status | Evidence / boundary |
|---|---|---|
| 1 | Working locally | Draw/fill, row/seat spacing, aisles, row shortening, child offsets, reload and undo; stable IDs covered by tests |
| 2 | Working locally | Complete round table, open-side arrangement, constrained chair orbit, parent rotation and preserved chair IDs |
| 3 | Working locally | Rectangular presets/custom side counts; attached chairs and identity-preserving movement |
| 4 | Working locally | Batch grid preview, gaps, unique table numbering; browser-tested 12-table insertion and one undo. Existing-object collisions are checked after insertion |
| 5 | Working locally | Invalid shrink returns no mutation; chairs never become detached inventory |
| 6 | Working locally | Confirm sale-mode change, clear categories, unit-specific assignment and buyer selection; no production sale conversion |
| 7 | Working locally | Explicit capacity, geometry-only resizing, admission quantity basket; no checkout reservation |
| 8 | Working locally | Split conserves capacity; duplication confirms an independent additional quota |
| 9 | Working locally | Tested mixed counts, revenue, pinned/unavailable resources and category overrides |
| 10 | Partial | Pin and withholding separate; prototype JSON preserves them. Legacy unavailable-state conversion not implemented |
| 11 | Partial | Local independent hall copies, fresh IDs/categories and cross-currency clearing; no bookings/holds exist in prototype |
| 12 | Partial | Save/insert fragments with fresh object IDs and remapped/reused category definitions; insertion uses a fixed offset, with no chosen-position preview |
| 13 | Partial | Current prototype curves, vertices, names and child price overrides persist. Legacy annotation/direct-price adapters not implemented |
| 14 | Partial | Local storage failures expose retry/export; beforeunload/pagehide flush; cross-tab conflicts retain in-memory work. No remote network-save simulation or server revision control |
| 15 | Partial | Responsive mobile object-list/count editing and keyboard buyer selection tested. Russian only; full localization and assistive audits remain |
| 16 | Production integration | Held/sold-resource protection requires the current authoritative server lifecycle; this prototype does not connect to it |
| 17 | Production integration | All three units demonstrated in a local basket. Actual checkout combinations and allocation rules require integration tests |
| 18 | Partial | Generators reject over-limit commits; import enforces structural/resource limits. Large-scale pointer performance and all boundary combinations need further profiling |

## Next implementation boundary

Use this prototype to agree on the flow and interactions first. Integrate the accepted presentation into the current editor behind a feature flag, keeping its server-side booking protections and canonical schemas. Adapt row blocks as groups over stable seat records; connect the saved-hall service and real buyer renderer; add canonical/legacy round-trip and mixed-checkout integration tests before staging rollout.
