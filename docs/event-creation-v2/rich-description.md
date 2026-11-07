# Description formatting

The full description now has a WYSIWYG toolbar for H1, H2, bold, italic, bulleted lists, numbered lists and links. Button states follow the selection; undo/redo and keyboard shortcuts use Tiptap's ProseMirror history. The link dialog preserves the selection and validates HTTP, HTTPS and mailto addresses. Labels and errors are localized in Russian, English and Kazakh. The editor and dialog follow the platform theme.

Descriptions remain in the existing string field, with an explicit envelope identifying formatted content. Existing plain text, including literal angle brackets, remains literal. No database migration is required. Sanitization allows only supported formatting and link attributes, strips scripts/styles/media/event handlers, and rejects unsafe URLs. Safe links open with noopener/noreferrer. The same renderer is used by the draft preview, published v2 event pages and organizer preview; translation review/proposals also understand formatted descriptions. The existing 10,000-grapheme storage limit includes markup; the visible counter counts the text, and over-limit edits are rejected with an error without losing accepted content.

Google translation requests separate plain text and HTML batches while preserving input order and the rich-text envelope. HTML entities remain encoded inside formatted provider responses. Telegram converts formatted descriptions to readable plain text before applying its existing summary length limit. No messages were sent and no event was published during verification.

## Verification

- Ngrok in-app browser: H1/H2, bold/italic, both lists, invalid and valid links, save/reload persistence, formatted preview, undo, excessive-length rejection without data loss, mobile toolbar/dialog fit, dark-theme rendering, and no hydration errors.
- Four web tests cover legacy literal text, supported formatting/public rendering, malicious HTML and URLs, and the existing storage limit.
- Provider transport tests cover mixed formatted/plain translations, HTML entities, ordering, retries, chunk limits, timeout and invalid responses. Live translation is not configured on the preview environment.
- Seven Telegram presentation tests passed, including formatted descriptions; no Telegram calls were made.
- Web/API/bot typechecks passed. Web production build passed. Lint retains the existing homepage ArrowIcon warning.
- A separate unpublished draft was used. The original draft was restored with its unchanged Russian description. Temporary viewport/theme settings were restored.

Evidence: [Editor](browser-evidence/redesign/ngrok-description-formatting.jpg), [rendered preview](browser-evidence/redesign/ngrok-description-preview.jpg).

Implementation references: [Tiptap React integration](https://tiptap.dev/docs/editor/getting-started/install/react), [sanitize-html](https://github.com/apostrophecms/sanitize-html), [Google HTML translation](https://docs.cloud.google.com/translate/docs/basic/translating-text).
