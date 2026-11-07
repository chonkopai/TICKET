# Catalog and event creation simplification

Implemented on 2026-10-06.

- The applied location chip shares the country/city picker with the navbar. Both controls synchronize after a location change.
- Empty catalog results offer public events from all locations under “Events in other cities”. Cities are interleaved within each loaded page; “Show more” exposes the remaining pages.
- Event creation uses a centered column: main information and classification, media, date/address, and tickets. Languages and the publication checklist sit together at the top.
- The media editor retains its original uploads, crop adjustment, zoom, full-screen preview, role selection, replacement, deletion, and reordering. The large preview sits left of five vertically stacked thumbnails.
- Event content has title, full description, address, and refund conditions. Short description and venue name are retired. The public hero shows the title followed by aligned date/address details.

## Database migration

`20261006010000_retire_event_summary_venue` removes `Event.announcement`, `Event.venueName`, the corresponding `EventTranslation` columns, and `EventContent.summary`/`venueName`. Saved draft content and translation metadata lose those keys. Draft revisions advance so an older browser cannot overwrite the migrated draft with stale state.

Before removal, previous values and complete saved draft aggregates are copied into `event_field_archive.retired_content`. Entries are keyed by entity, ID, and locale. This archive is outside the active public schema. Historical purchase snapshots are retained; their optional venue name remains readable for old receipts.

To inspect archived values, use a read-only query with the relevant event or draft ID:

```sql
SELECT entity, id, locale, values, archived_at
FROM event_field_archive.retired_content
WHERE id = '<event-or-draft-uuid>'::uuid;
```

The migration was rehearsed in a rollback transaction, then applied to the ngrok development database and the isolated fresh test database. The rehearsal verified all six columns were removed, retired draft keys were absent, and financial/history data was unchanged.

## Verification

- Shared types: 50 tests passed; bot: 16 tests passed.
- API isolated regression suite: 277 tests initially passed. The remaining notification test was updated to check address changes and its four-test file passed on rerun.
- Database compatibility: 5 tests passed; backfill planner: 12 tests passed; updated rollback-only backfill verifier: 14 checks passed.
- Browser-unit checks covered creation readiness, autosave/recovery, hero details, and catalog location. The recovery suite passed 11 tests, including an older local backup containing retired fields.
- Web/API/database/bot type checks and lint passed.
- Live ngrok browser checks confirmed the dropdown, other-city fallback, centered creation form, thumbnail rail, zoom adjustment, and address-only hero. Creation and event pages had no horizontal overflow in the mobile viewport.

Screenshots are in `browser-evidence/redesign/`:

- `ngrok-centered-creation-top.png`
- `ngrok-centered-media-desktop.png`
- `ngrok-centered-media-mobile.png`
- `ngrok-catalog-location-menu.png`
- `ngrok-catalog-other-cities.png`
- `ngrok-address-only-event.png`
- `ngrok-address-only-event-mobile.png`
