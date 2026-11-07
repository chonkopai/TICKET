# Automatic guest purchase recovery

Implemented locally; not pushed or deployed in this task. No database migration required.

- Guest receipt no longer has the Save purchase section, Telegram login widget, email/phone login link, or explicit claim button.
- Every fresh sign-in links eligible guest orders using the account's persisted Telegram identity or verified ContactIdentity email. Account ticket lists, counters and order history also recover purchases settled after login and purchases belonging to already signed-in users.
- Recovery uses server-side verified checkout identities, including historical sessions whose receipt/access tokens have expired. Browser storage and editable profile email are not ownership evidence.
- Telegram remains the primary recipient when a checkout also has an email delivery address; that separate email recipient cannot take the Telegram buyer's order.
- Order and ticket IDs, QR tokens, accepted checkout snapshot, payment and admission status remain unchanged. Refunded/cancelled orders are recovered as history. Pending/failed orders and another account's orders/tickets are not transferred.
- Recovery serializes account requests and shares order locks with existing explicit claims/payment settlement. Ownership, session claim, audit, outbox and chat association commit atomically and retries produce one claim.

Validation: 43 API tests passed across 9 files using a disposable migrated local database. Eight dedicated recovery tests cover first Telegram sign-in, existing accounts, expired guest links, multiple purchases, concurrent claims, verified email, profile-email spoofing, Telegram/email primary recipient precedence, ownership conflicts, post-login settlement, returned ticket history and rollback after a forced outbox error. Existing anonymous claims, contact authentication, token rotation, account counters/history and guest event lists also pass. Web/API typechecks, focused lint and diff whitespace checks pass.

Visual QA: actual receipt component with isolated test data shows the ticket, QR, download, delivery and order chat while the login section count is zero. No staging data or customer orders were modified.
