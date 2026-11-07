# Table proportions and adaptive rulers

Implemented 7 November 2026 in the integrated hall builder.

- Ruler marks follow each hall dimension using 1/2/5 steps. A 10 × 5 m room has 2 m horizontal marks and 1 m vertical marks; a 30 m side retains 5 m marks.
- Chairs retain a 45 × 45 cm footprint. Automatic table seating now places chair centres 35 cm from the table edge, leaving a 12.5 cm gap to the chair front. Previously the default centre offset was 70 cm.
- New round tables default to a 1.6 m diameter and eight seats. Rectangular tables default to 2.4 × 0.9 m; the add form starts with six seats and supports eight along the two long sides.
- Capacity uses 60 cm of tabletop edge per diner, rather than chair width or an expanded chair orbit. Circular tables use their circumference; the free-side arrangement uses 75% of it. Rectangular limits apply to each active side. Moving chairs farther away does not increase the seat cap.
- The size inspector shows actual table dimensions, explains the count limit and exposes the actual chair-front gap. “Обычное расстояние до стола” restores natural spacing. Individual chair edits remain available.
- The diameter field now changes both circular dimensions, so reducing a round table works correctly. Resizing cannot silently remove seats or worsen an over-capacity layout.
- On editor initialization, the former automatic 70 cm offset is reduced for active, unpinned tables whose chairs have no manual shifts or angles. Other custom offsets and manually positioned chairs remain unchanged. Dimensions, IDs, prices and existing over-capacity inventory are preserved. Older overfilled tables are flagged and can be repaired by increasing size or explicitly reducing count.

The 60 cm dining frontage is a design baseline informed by [IKEA’s dining table sizing guidance](https://www.ikea.com/ch/en/customer-service/knowledge/articles/3gbc7ffd-5023-4c02-bfeb-50d51e204d4g.html). The default chair clearance is a modeling choice. Table dimensions and clearance remain editable to match the actual furniture.

Validation: 29 focused tests, web TypeScript, optimized Next.js webpack build, and an isolated browser fixture reproducing the 10 × 5 m hall with a 1.1 m table and five chairs. Browser checks confirmed the natural gap, disabled sixth seat at 1.1 m, sixth seat enabled at 1.2 m, blocked shrinking with six seats, and the free-side add preset reducing its initial count to six. User event inventory was not edited during verification.

See `small-hall-desktop.png`. Reopen an already-running editor to apply initialization changes to its old automatic spacing. The local app and ngrok tunnel remain running; no staging deployment was performed.
