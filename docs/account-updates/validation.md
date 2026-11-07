# Account updates

Implemented organizer enable-and-open behavior, consolidated profile settings, conditional Email/Phone linking, the shared header notification popover, a return-to-events sidebar link, and two support contact choices. Payment history also exposes both contact choices. All new copy is available in Russian, Kazakh, and English; styles use existing site theme tokens, icon conventions, cards, and dropdowns.

The first Email/Phone identity requires OTP verification followed by password setup when the account has no password. Subsequent contact identities reuse the same account password. The existing API already enforces these requirements; the client now exposes the phone verification flow as well as email.

Default-city saves update only `defaultCity`, then synchronize the catalog location. The removed personal-contact form no longer requests or changes profile email/phone.

Website support is intentionally a disabled chat placeholder, ready for the later support backend. Organizer contact opens the existing order-specific conversation for paid, cancelled, or refunded orders.

## Validation

- Web TypeScript check: passed.
- Focused lint: 12 files, 0 errors, 0 warnings.
- Git whitespace check: passed.
- Existing verification/contact tests: 3 passed; 7 database integration tests skipped because no isolated verification database was configured.
- Account database suite: setup and cleanup failed with Prisma database errors; its five tests did not execute successfully.
- Live browser: profile no longer repeats personal-contact fields; login methods appear first; phone linking appears only after choosing Phone and closes correctly; the city menu lists catalog cities; both support choices appear in Help and payment history; website support shows the disabled chat shell; the header bell opens an independent window with refresh/filter/full-inbox controls.
- Responsive browser check: mobile contact choices stack, the bell remains immediately before the user icon, and the notification window fits the page. The temporary viewport was reset.
- Organizer redirect was verified in code; the signed-in browser account was already an organizer, so no real account role was changed for testing.

## Service limitations

The verification sender currently supports email only. Phone linking is OTP-gated but requires an SMS provider before it can deliver real codes. Existing orders and notifications requests returned server errors in the live browser before these changes; subsequent checks also encountered fetch failures. Popover and organizer-order success states therefore could not be verified with live data. No real messages, passwords, or account preferences were submitted during browser checks.

Screenshot: [support-desktop.jpg](support-desktop.jpg).
