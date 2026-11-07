# Event preview loading crash

The event editor's shared preview initialized as soon as the iframe document existed, even when its head or body was still unavailable. This caused `Cannot read properties of null (reading 'replaceChildren')`.

The preview now waits for a document that has finished loading and has both elements. Its stylesheet observer also skips documents that are no longer current or have lost their head/body during navigation. The existing iframe load listener initializes the preview when it is ready.

Validation on 2026-10-12:

- An isolated browser fixture using the actual component reproduced the original missing-head exception and a related missing-body exception before the change.
- With the fix, four browser cases passed: missing head, missing body, loading document, and already loaded document. Each checked rendering after readiness, stylesheet synchronization, phone viewport switching, iframe reload, and observer cleanup under React StrictMode.
- All five existing draft preview tests passed.
- Web TypeScript check and focused lint passed; `git diff --check` passed.
- The selected organizer event edit page opened successfully after a fresh reload, with the live preview visible. No event fields were changed or saved.

Screenshot: [Editor with working preview](preview-loading-fixed.jpg).

This validates the local workspace and its ngrok development page. It does not deploy the fix to the separate staging environment.
