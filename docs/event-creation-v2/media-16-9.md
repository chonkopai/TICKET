# Event media at 16:9

Catalog card images, public event galleries (including legacy image URLs), public event backgrounds, organizer previews, draft previews, and the creation editor's card and background crop previews now use 16:9 frames. The card crop label is updated in RU, EN, and KK.

Public event backgrounds span the viewport width. Existing cover framing scales the source to fill the frame and crops overflow around the saved focal point; original uploads are preserved. Existing focal positions and zoom adjustments remain usable. No database migration or image reupload is required.

On small screens, event title and metadata sit below the background image to preserve the exact image ratio. On desktop, details remain overlaid. Share and favorite actions remain inside the image frame.

## Verification

- Web type checking passed.
- Repository lint passed with the existing unused `ArrowIcon` warning in the home page.
- Existing shared cover-framing test passed, including focal-point extremes without gaps.
- Ngrok: the existing draft's loaded desktop background measured 1100 × 618.75; gallery frames measured approximately 342.67 × 192.75. All ratios are 16:9.
- Ngrok: mobile emulation measured the background at approximately 395.33 × 222.37 and gallery frames at 167.67 × 94.31. The dialog had no horizontal overflow. Event details remained readable below the image.
- Creation editor card, desktop background, and phone background previews checked without modifying the draft's images or saved crop settings.
- The live catalog currently has no published events, and the existing seed event URL returned “event not found.” Published catalog/public event pages could therefore not be checked with populated data. Those renderers were verified in source and by type checking; no event was published to create test data.

Evidence: `browser-evidence/redesign/ngrok-16-9-desktop.jpg`, `ngrok-16-9-mobile.jpg`, and `ngrok-16-9-gallery.jpg`.
