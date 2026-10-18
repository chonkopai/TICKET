# Inline guest checkout and ticket receipts — 18 October 2026

Implemented:
- Name, email verification/delivery and Telegram delivery now live inside the event's existing booking panel. Ticket/seat/table selection, quantities and consent are retained in that panel.
- Existing `/quick` links redirect back to the event with the chosen tickets, quantity, table or seats preserved. They no longer render a second purchase form.
- Guest sessions are created lazily when verifying email or requesting Telegram delivery. Telegram confirmation is checked automatically; it does not sign the customer into the website.
- Once checkout is submitted, the original request and idempotency key are frozen and survive reloads. The public event restores the original selection and exposes an explicit recovery action. Selection changes cannot silently create a different order while the previous result is unknown.
- Free purchases settle immediately without a payment attempt. Paid purchases redirect to the payment link; unconfirmed orders show a waiting state with no ticket QR.
- The redesigned receipt includes event date/time/timezone, address/map link, buyer, order date/timezone, order ID, individual ticket price and unique series/number, visible QR image, PDF download, one-use/privacy warning, refund conditions, same-email resend, account saving and order chat.
- Each number derives from that ticket's complete UUID with the `TKT` series, so multiple tickets in one order have different stable numbers without changing admission identity or requiring a migration.
- Email receipts include the same accepted purchase details, a CID-embedded QR image, and one self-contained PDF attachment per eligible ticket. Existing durable delivery, resend limits, recipient verification and capability authorization remain.
- The deployment image installs DejaVu fonts for Cyrillic PDF rendering. Rebuild web/API/bot image before deploying; no database migration is needed for these changes.

Validation:
- API checkout/document/provider tests: 25 passed. Includes an existing registered Telegram recipient retaining prior tickets while buying two more free tickets without login, email-only free settlement, no zero-value payment attempt, single email outbox event, stable unique receipt numbers, authorization/idempotency and signed paid flows.
- Shared receipt tests: 3 passed. Preview regression tests: 5 passed.
- Web/API type checks, focused lint and whitespace checks passed.
- PDF: rendered with Poppler and visually inspected; its lossless QR image decodes to the original admission token. Unicode labels, warning, identifiers and date/timezone verified. Sample contains only test data.
- Isolated browser verification using the actual components under React StrictMode and an in-memory API: email OTP in the event panel; Telegram confirmation without login; free direct confirmation; paid redirect; no QR before payment; full ticket after mock approval; successful PDF browser download; lost response followed by reload and exact body/key recovery.
- Receipt, inline form and email preview checked at desktop and 390px mobile widths. Receipt dark mode checked. No mobile horizontal overflow. Email uses UTF-8 and displays the QR inline.
- No real customer orders, actual payments or actual emails were created/sent during verification. The displayed screenshots are clearly labelled test data.

Provider attachment contract checked against Resend's official CID documentation:
https://resend.com/changelog/embed-images-using-cid

Changes are local; staging has not been updated in this turn.
