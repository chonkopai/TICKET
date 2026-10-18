# Organizer order messages and campaign fixes

Implemented locally, not deployed to staging.

- Guest messages and organizer replies to registered buyers create an in-app notification inside the same transaction as the message; retries reuse the message and notification.
- Notification links open the specific conversation. Reading a conversation clears its message notifications and unread count. Anonymous buyers continue to receive replies on their order status page without signing in.
- The organizer order table has separate ticket quantity and order messages columns. Unread counts refresh every 10 seconds while visible; the notification bell refreshes every 15 seconds. Mobile cards expose the same information.
- Dedicated organizer chat is available from each order and its notification.
- Empty successful responses for an absent refund request are treated as null; malformed nonempty JSON still fails.
- Draft campaign images can be removed. Ownership, draft status and concurrent image changes are checked; the message remains.
- Zero-recipient explanations clarify why Telegram broadcasts and consent-based marketing cannot be sent. Delivery channels and marketing consent requirements are unchanged.

Validation: 24 API integration tests passed on a disposable migrated local database (chat authorization, anonymous reply, notification idempotency, read counts, campaign consent/delivery, image removal and management orders). Six browser client regression tests passed, including absent refund responses. API/web typechecks, focused lint and diff whitespace checks passed.

Visual QA used actual components with isolated mock API responses, labelled test data: desktop table, navigation to dedicated chat, organizer reply and campaign image deletion. Mobile order cards at 390px have no horizontal overflow. Screenshots in this directory are test fixtures, not live customer data. No actual Telegram messages, emails, payments or broadcasts were sent during verification.
