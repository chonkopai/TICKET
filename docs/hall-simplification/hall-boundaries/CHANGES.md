# Keep hall objects inside the room

Implemented 7 November 2026 in the integrated hall builder.

- Shared boundary enforcement includes the rotated object envelope and every attached chair. It applies to tables, seating blocks, standing zones, stage/obstacles, entrances and individual seats.
- Dragging stops at the wall, with or without grid snapping. Group dragging uses one snapped translation and one boundary correction, preserving relative positions. Pinned members stay fixed.
- Keyboard nudges, numeric X/Y fields, undo/redo, duplication and fragment insertion use the same constraint. Copies and new groups are moved inside together; an oversized insertion is rejected atomically and the configuration stays open.
- Rotation, resizing, row/seat shifts and chair-spacing changes that would cross a wall are rejected instead of unexpectedly moving the parent table. Live gestures retain the last valid preview.
- Drawn creation areas are limited to the hall. Shrinking the hall is rejected if it would strand existing objects outside; room growth remains available to repair an older oversized layout.
- A 1 cm precision allowance prevents centimetre-rounded saved coordinates from crossing the boundary on reopening. A single standing zone may still cover the whole room.
- Unchanged older geometry and price/name edits remain recoverable. Moving a previously outside object places it inside if it fits; objects or selections larger than the room must be resized or the room enlarged. No inventory is silently removed.

Validation: 40 focused tests passed, including 10 boundary tests and an added canonical save/reopen test for rotated tables and attached chairs. Web TypeScript and the optimized webpack production build passed. Browser checks in an isolated 10 × 5 m fixture covered dragging beyond both corners, snapping disabled, keyboard movement at the wall, negative numeric X, rejected rotation, and DOM measurement confirming all actual furniture remains inside. Rotation/resize handles are editor controls and may appear outside the floor outline.

See `table-stops-at-wall.png`. User event inventory was not modified during verification. The dev app and ngrok tunnel remain running; no staging deployment was performed.
