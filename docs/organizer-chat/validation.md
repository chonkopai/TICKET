# Organizer/customer chat repair — 12 October 2026

Customer chat used `/api/me/...`, which was not forwarded by Next.js. On staging, an unauthenticated read returned HTML 404 for `/api/me/.../chat` and JSON 401 for the correctly forwarded `/me/.../chat`. The customer transport now uses `/me/...`; organizer and anonymous transports retain their existing configured proxies.

Organizers can initiate and reply in the order conversation from Event management → Orders → Open. Access requires the event owner and the order's actual customer (account or live anonymous checkout session). Payment status no longer blocks chat: customers can ask for help with pending or failed payments, and retain conversations after returns. Customer order history and support links follow the same rule. Cross-event and unrelated-customer access remains rejected.

The UI polls every 10 seconds, exposes a retry action on refresh errors, clears recovered loading errors, and resets conversation/draft state when changing orders. Anonymous customers' own messages align consistently with signed-in customers.

Validation:
- Customer, organizer and anonymous transport regression tests: 3 passed, covering list, send, pagination, read, authorization headers and no-store loading.
- Notification/chat API integration suite: 9 passed, including organizer-initiated two-way messages across all five payment statuses, unrelated-customer/organizer rejection, idempotency, anonymous replies and reading.
- Web and API type checks, focused lint, whitespace checks passed.
- Actual ngrok customer conversation reloaded successfully with no 404. No message sent to real customers.
- Isolated React StrictMode UI with in-memory API: customer message appeared automatically for organizer; organizer reply appeared automatically for customer; changing customers cleared the prior draft and messages; simulated connection loss displayed retry controls and retry recovered the organizer conversation.

Evidence: `customer-chat-loaded.jpg` (actual development site), `two-way-chat-verified.jpg` (clearly labelled test data).

Deployment: changes are local. No staging server connection is configured in this workspace, and no staging deployment was performed. Staging needs the rebuilt web and API release; no database migration is needed for these changes.
