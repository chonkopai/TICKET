# Hall builder integration

The approved prototype now powers the application's event-draft hall editor and organizer venue builder. This is an application implementation, not an iframe or a replacement deployment. Staging has not been deployed by this change.

## Entry points

- `/events/create/hall?draftId=…`: existing capability-scoped event draft, CSRF protection, draft revision checks and return to the event form.
- `/organizer/venue-builder/[eventId]`: existing authenticated event and venue APIs.
- Add `editor=classic` to either route to use the previous editor. It is also available in the schema menu and on a load/conversion error.

The classic editor treats rows as individual objects. Saving through it removes grouped-editor metadata so subsequent edits cannot silently restore old positions or inherited prices. Canonical row, seat, table and category identities remain intact.

## User workflow

1. Start from rows, tables, standing admission, a mixed layout, an empty hall or a saved personal hall. Starter prices are empty; demo amounts never become event prices automatically.
2. Arrange blocks, individual rows/chairs, round or rectangular tables, standing zones, stage, obstacles and entrances. Drag-to-fill, count/spacing controls, geometry tools, copying, undo/redo, pinning and disabled inventory remain available.
3. Assign categories separately for seats, whole tables and admission. Category color, custom HEX, active state, row/seat overrides, missing-price finder and selection subtotal remain available.
4. Review geometry and try the buyer interaction. Finish waits for saving before returning to the event form; it does not publish the event or create a booking.

The compact bars, inline saved status, floating zoom, simplified inspector, light/dark themes and responsive layout follow the approved prototype. The interface retains the prototype's Russian copy; existing tariff translations and descriptions are preserved.

## Persistence contracts

`apps/web/src/components/hall-builder/venue-adapter.ts` converts the grouped interface into the existing hall geometry and inventory contracts.

- Display units are converted to metres, and major currency amounts to integer minor amounts, once at the boundary. Currently configured payment currencies have two decimal places.
- Grouped seating blocks flatten into existing canonical row and attached-seat records. Surviving rows/chairs keep their IDs through spacing, movement, pricing and reloads.
- Optional versioned builder metadata preserves group layout, explicit versus inherited category assignments, chair offsets, table arrangement, standing shape and pinning. Pinning does not remove inventory from sale.
- Whole tables are priced once. Their included chair count excludes disabled chairs in the grouped editor. Disabled tables are unavailable in persisted inventory.
- Standing quota remains independent of drawn area. Reopening a rectangle preserves its ability to split; splitting conserves its quota. Older polygon coordinates survive metre quantization without invalidating recovery.
- Category activity, sale unit, nullable amounts, zero amounts, custom colors and translated content survive canonical conversion. Unit mismatches are rejected.
- Saved/reused halls receive fresh object, row, chair, group and category IDs. A copy cannot acquire another layout's inventory identity.
- Existing owner checks, sale-history restrictions and optimistic revisions still apply.

Changes use optional JSON fields. No Prisma schema migration is required. Web, API and shared types must be built and deployed together; an older API does not understand the new editor metadata.

## Autosave and recovery

Writes are serialized and use the latest acknowledged server revision. Edits made while saving remain pending. The browser keeps a recovery snapshot immediately when an edit is committed; it is removed only after that exact snapshot is acknowledged.

A revision conflict stops writes and makes the editor read-only. Recovery is offered explicitly after reopening, including a warning when the server base revision has changed. JSON export remains available on a save error. Published events remain read-only.

Personal halls use the organizer-owned server library, including rename, archive and restore. Saving a reusable hall before an Event exists uses the new authenticated `POST /api/organizer/venue-layout-templates` endpoint; the server clones all supplied IDs. Anonymous drafts explain that organizer sign-in is required for this library.

Reusable fragments remain browser-local and are scoped to the account, across its event drafts. Their dialog states this scope. Full saved halls are the cross-device option. Unsupported historical layouts can still be edited in the previous editor; unsupported library entries do not prevent compatible entries from loading.

## Verification

- Shared-types build, web TypeScript check and API TypeScript check passed.
- Next production build passed, including both integrated routes.
- 13 conversion/recovery tests cover all starters, canonical IDs, amounts, units, inheritance, copied groups, legacy positions/numbers, chair arrangements, translations and standing shapes.
- 35 existing prototype model/pricing tests passed against the promoted application modules by redirecting their imports in temporary test copies.
- 29 targeted shared-schema/color tests passed.
- 2 draft-adapter tests passed using the actual draft mutation/revision protocol and injected transport.
- 2 backend tests passed with mocked persistence: disabled/pinned tables, included chairs, canonical units, translations and activity.

The browser check used the actual connected component, draft autosave client, draft adapter, shared validation and conversion modules. Only its network transport/account library were simulated on a separate loopback origin; staging and the user's prototype draft were untouched. It verified:

- name, row count, custom category color and standing quota save/reload;
- whole-table to individual-seat conversion and category assignment;
- chair rearrangement, review validation, preview subtotal and finish/flush;
- library save without duplicate cards, rename, archive, restoration and reuse;
- zero shared chair IDs when reusing a hall, followed by identical IDs after reload;
- published read-only controls and a simulated localized revision-conflict error;
- recovery of unsaved edits after closing, followed by successful saving and reload;
- mobile controls at 390 × 844 with no document horizontal overflow, plus desktop and dark theme rendering.

Screenshots in `integration/` show synthetic QA content, not a deployed staging event.

Database-backed venue, publication, checkout and migration tests have not been run. Before deploying, run them against an isolated test database and smoke-test a real organizer library save and publish/booking flow in staging. No live database was used for this verification.

## Reproducing focused checks

From the repository root, after installing workspace dependencies:

```sh
pnpm --filter @event-platform/shared-types build
node --test apps/web/src/components/hall-builder/venue-adapter.spec.mjs
pnpm --filter @event-platform/api exec vitest run src/venue/hall-builder.persistence.spec.ts
pnpm --filter @event-platform/shared-types exec vitest run src/hall-editor.spec.ts src/hall-colors.spec.ts src/event-creation-v2.spec.ts
pnpm --filter @event-platform/web typecheck
pnpm --filter @event-platform/api typecheck
pnpm --filter @event-platform/web build
```

The Node test for `apps/web/src/lib/draft-hall-adapter.spec.ts` was bundled to ESM with the installed esbuild before execution, because the web package is not declared as ESM while shared-types exposes ESM imports. The fixture uses an injected transport and makes no network calls.
