# One 16:9 crop per image

The creation uploader now shows the recommended 16:9 format, five 16:9 thumbnails, and one selected-image preview. Images of any proportions start at the smallest centered cover scale: exact 16:9 sources remain uncropped. Dragging changes the visible region; zoom buttons range from 100% to 500%. Movement and zoom-out keep the frame filled. Arrow keys also reposition the crop. An enlarge button opens the same editor in a larger dialog, including in dark mode.

Sliders, separate format tabs, and left/right reorder buttons are removed. Cover/background selection, replacement, removal, and pointer reordering remain available. Thumbnails show each image's saved crop. Preview loading keeps a 16:9 placeholder rather than briefly showing another selected image.

Dragging previews locally and commits on release, preventing repeated full-draft validation and autosave while the pointer moves. The existing autosave/recovery system saves crop changes with revision checks. Crops are keyed by asset ID, so selecting another image or reordering slots does not transfer crop settings. Removing/replacing an asset removes its crop; a new upload starts centered.

## Storage and rendering

Draft media includes `assetCrops`, with one `{ focalX, focalY, zoom }` per asset. Publication writes that single object to each `EventMedia.crops` JSON field. Original files and full-image safe display derivatives are preserved; crop metadata never overwrites them. No database migration is needed.

Published reconstruction reads both the new single object and historical role-shaped crops. Existing published records use their card crop, or desktop background crop for an image used exclusively as a background. Existing drafts without per-asset crops start centered. Legacy draft role fields remain accepted for compatibility but are no longer edited or used by the uploader.

Public response role fields remain compatible and contain the same image crop. Public cards, favorites, guest cards, galleries, event backgrounds, organizer previews and draft previews use the shared renderer. Featured images also use a 16:9 frame. Event backgrounds fill the screen width while retaining a 16:9 frame; mobile details remain below the image. Videos retain their existing public player behavior; creation framing uses their poster without downloading the video to edit its crop.

## Verification

- Shared geometry/draft-contract tests: 23 passed. Includes portrait, wide and exact 16:9 sources, extreme movement, zoom-out boundaries, independent crops, reorder/removal and legacy reads.
- Publication/reconstruction tests: 3 passed. Different per-image crops survive published reconstruction; publication stores one crop per image without modifying original storage fields.
- Public media HTTP tests: 3 passed. Original uploads remain private; only safe published derivatives are served.
- Web autosave tests: 8 passed. Includes edits to two images while a save is in flight.
- API type check and final web production build passed.
- Lint passed with the existing unused `ArrowIcon` warning.
- Ngrok separate draft: uploaded two reference photos, selected thumbnails, zoomed, dragged with actual pointer input, saved, reloaded, and reordered. Crops remained independent (125% and 150%) and the final drag position survived another reload. Original display dimensions stayed 512 × 279.
- Ngrok phone viewport: 390 × 844 CSS pixels. Enlarged crop frame measured 320 × 180, zoom buttons approximately 44 × 44. Zoom-out stopped at 100% without gaps. Background and gallery frames retained 16:9 and reused the appropriate per-image crop.
- Light and dark desktop dialogs checked. Temporary viewport and theme changes restored. The original user draft's media and saved crop settings were not modified.
- The live catalog has no published events. Populated published-page visual testing was unavailable; those paths were covered by publication/reconstruction tests, shared framing checks and production compilation. No test event was published.

Evidence: `browser-evidence/redesign/ngrok-single-crop-uploader.jpg`, `ngrok-single-crop-desktop.jpg`, `ngrok-single-crop-mobile.jpg`, `ngrok-single-crop-dark.jpg`.

The web autosave test file uses Node's test runner. It was bundled as ESM with the existing esbuild dependency into `/tmp/ticket-media-crop-tests.mjs` and run with `node --test` because the web package has no test script and its ESM-only workspace dependencies cannot be required by the default tsx CommonJS runner.
