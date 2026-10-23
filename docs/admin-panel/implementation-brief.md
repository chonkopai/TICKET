# Implementation prompt: small TICKET administration system

Implement the following system in the existing TICKET repository. Complete the backend, database migrations, admin interface, public-site changes, tests, and deployment configuration. Deliver working functionality and clear verification evidence, rather than stopping at a plan or UI mockup.

## Product scope

TICKET is a small ticketing platform. Keep the administration system simple: two staff roles, six main sections, searchable tables, useful detail pages, and straightforward workflows. Reuse established application patterns and dependencies. Avoid adding microservices, a configurable permissions engine, an enterprise CRM, automatic bank transfers, or additional staff roles.

Six sections:

1. Support — Поддержка.
2. Customers and organizers — Пользователи, with two tabs.
3. Events — Мероприятия.
4. Orders and tickets — Заказы и билеты.
5. Finance — Финансы.
6. Activity log — Журнал действий.

Place small summary counters on these pages. Put staff management and account security in a compact settings area; a separate statistics dashboard is unnecessary.

## Inspect the repository first

Read applicable AGENTS.md instructions and inspect the current checkout before editing. Preserve existing uncommitted work. The existing stack includes Next.js/React, NestJS, Prisma/PostgreSQL, Redis, a Telegram bot, shared types, and Docker Compose deployment.

Relevant starting points include:

- `apps/web/src/app/(auth)/account/support-panel.tsx`: platform support is currently a placeholder; customer–organizer order chat already exists separately.
- `apps/web/src/app/organizer/profile/page.tsx` and organizer workspace components.
- `apps/api/src/auth/`, including existing authentication, password hashing, verified contacts, sessions, and role checks.
- `apps/api/src/booking/refund.service.ts`, payment-provider contracts, order settlement, ticket delivery, and outbox workers.
- `packages/database/prisma/schema.prisma` and `packages/shared-types/src/`.
- `compose.demo.yml`, `deploy/README.md`, and `deploy/Caddyfile.demo`.

Existing public account roles include `guest`, `organizer`, and `admin`. Inspect every use of the existing `admin` role before integrating staff access. Public organizer/customer authentication and privileged staff authentication must remain separate. Existing records must retain their IDs, purchases, accepted terms, and history.

## 1. Staff roles, login, and security

Use exactly two staff roles:

| Capability | Support | Moderator |
| --- | --- | --- |
| Read and answer platform-support conversations | Yes | Yes |
| Read relevant customer/organizer profiles, orders, and tickets | Yes | Yes |
| Resend tickets; cancel eligible orders; issue eligible refunds | Yes | Yes |
| View organizer verification documents; approve/reject verification | No | Yes |
| Block/unblock customers, organizers, or events | No | Yes |
| Manage event publication and moderation decisions | No | Yes |
| View platform finance, record payouts, and change commission settings | No | Yes |
| View the full activity log and manage staff | No | Yes |

Support may see the refund and payment information needed for the order they are handling. Private organizer documents and platform-wide financial reports require Moderator access. Support actions must still be recorded in the audit log.

Provide `admin.ticketron.live` and `staging-admin.ticketron.live`, with independent environment configuration and a documented local preview URL. Admin host routing must be enforced server-side. A separate hostname alone does not authorize a request.

Create a separate staff login and invitation-acceptance/signup flow. Moderators invite staff by email and choose one of the two roles. Invitations expire, are single-use, and store hashed tokens. Provide a documented one-time CLI/bootstrap procedure for the first Moderator. Do not ship a default password or a public endpoint that grants staff access. Existing public registration must never create staff privileges.

Include:

- Password hashing using the established secure implementation.
- Mandatory staff two-factor authentication, using a maintained TOTP implementation or an already-integrated equivalent. Include enrollment, verification, hashed recovery codes, and recovery behavior. Protect MFA secrets at rest.
- Password recovery through verified staff email with expiring, single-use tokens. Missing email configuration must produce a truthful unavailable state.
- Staff sessions isolated from customer sessions, with secure HttpOnly cookies, explicit expiry, CSRF protection where cookies authorize mutations, and sign-in rate limits.
- Session listing/logout and immediate revocation when staff are disabled, their role changes, or their credentials are reset. Authorization checks must observe revocation immediately.
- Moderator staff invitations, disabling, and role changes. Prevent disabling/demoting the last active Moderator or locking the whole team out.
- Server-side permission checks on every privileged API and protected attachment request. Public-account tokens, including legacy public `admin` tokens, must not automatically authorize the new staff APIs.

## 2. Support inbox

Build a real platform-support service shared by the public website and admin panel. Keep it distinct from existing customer–organizer order conversations.

Both customers and organizers can start a conversation with TICKET and continue it later. Include a subject, messages, attachments, timestamps, unread state, an assigned staff member, and three statuses: New / In progress / Closed. A reply can reopen a closed conversation. Add simple search and status/assignee filters, without a configurable workflow system.

Staff can link a conversation to an existing event, order, or ticket after checking access. Show a compact context panel so they can inspect the purchase, resend the ticket, or open the refund action. Support internal notes must be stored and authorized separately from public replies and must never appear in public responses or notifications.

Use clear sender labels: customer/organizer, Support, or Moderator. Customers must not be able to impersonate staff through message payloads. Store message history durably and paginate it. Short polling is sufficient; use existing real-time infrastructure only if it materially simplifies the implementation.

Integrate anonymous purchasers through the existing validated order-access capability where available. An anonymous receipt user can access only their own order-linked support conversation. An order number, email address, or Telegram ID alone must not grant access. Logged-in users must only see their own conversations.

Allow staff to inspect an existing customer–organizer order chat when necessary for a support case. Associate that inspection with the case and record access. Clearly distinguish staff messages from the original participants; preserve existing chat ownership rules.

## 3. Public website and organizer verification

Implement the complete organizer-facing experience on the main TICKET website, alongside the admin screens.

### Entry points and support

- Replace the disabled platform-support placeholder in the customer account with the working support inbox/composer.
- Add a visible “Поддержка TICKET” entry to the organizer workspace, with unread indication.
- Add “Проверка организатора” to the organizer profile/workspace navigation or account menu. A concise dashboard card should explain the current verification status and offer the next action.
- Keep these actions discoverable from the main website's signed-in navigation. Document upload belongs inside the organizer's private workspace.

### Verification request

An organizer can enter their legal/business name, entity type, registration country, applicable business identifier, contact details, and upload supporting documents. Include ИП and ООО options with a simple “Other” option for supported international organizers. Do not impose one country's identifier format on every country.

Support PDF, JPEG, and PNG documents, with a documented limit such as 10 MB per file and five files per submission. Validate extension, actual file type/signature, size, and count server-side; use safe generated filenames. Verification documents require private persistent storage, protected downloads, and access checks. They must never be served through public poster/media URLs or exposed in public event responses. Document the actual file protections and any scanning limitations honestly.

Use a small status model: Not submitted / Pending review / Changes requested / Verified / Rejected. Preserve submission versions, reviewed documents, reviewer, timestamps, and reasons. Permit correction/resubmission and prevent duplicate active submissions.

A Moderator can open a request, view its documents, request changes, approve, reject, or revoke verification. Reasons are required for requesting changes, rejection, and revocation. The organizer receives an in-site update and can discuss the request in a linked support conversation. Submitted documents should remain in the protected verification record; reference them securely from the case.

Significant changes to the approved legal identity/documents require another review and must not silently retain an invalid approval. Verification is separate from organizer account access and event publication permission.

### Verified badges

Create one reusable, accessible verified-organizer badge, displayed beside the organizer name wherever that name appears publicly: event details, public organizer information, and homepage/catalogue cards that already display organizer names. Also show it in organizer/account areas and the staff organizer list. Add a short localized tooltip explaining that the organizer's submitted details were reviewed.

The badge must come from server-controlled verification data. It must not be editable by the organizer, inferred from having a Telegram account, embedded in a display name, or attached to an event title/customer name. Approval, revocation, and suspension must update public displays without stale approval persisting in caches. Public responses expose the badge state and safe organizer details, never verification documents or private registration data.

## 4. Customers and organizers

Provide paginated customer and organizer tabs searchable by name, email, phone, and ID. Include guest purchases in order searches and link them only through established verified identities. Avoid creating duplicate or merged accounts just to simplify administration.

Customer details show contact information, registration date, account status, orders/tickets, support conversations, and a compact timeline of relevant actions.

Organizer details additionally show business information, protected verification records, verification status, events created, tickets sold, moderation reasons, and violation history. Provide approve/reject/revoke verification and block/unblock actions for Moderators. Record dated warnings and moderation actions as the violation history; a configurable scoring system is unnecessary.

Define block behavior explicitly and enforce it in backend flows. A blocked organizer cannot create, publish, edit around restrictions, or sell through direct API calls. Blocking a customer must prevent the restricted actions and revoke affected sessions. Preserve existing purchases and provide a safe, restricted route to ticket retrieval and support. Hiding/blocking an event stops new sales while keeping order history and authorized purchaser access available. A block must not automatically issue refunds or erase records.

## 5. Events

Build a paginated event list with title/ID, organizer, date, publication/moderation status, verification badge, and tickets sold. Add search and basic date/status/organizer filters.

Moderators can inspect an event, approve/reject a submitted publication where review is enabled, hide/unhide it, pause sales, or cancel it. Keep organizer verification and event moderation separate. Preserve the established publishing policy through an explicit configuration/default; introducing the panel must not silently place every existing event into a new approval queue.

Require reasons for moderation changes. Before cancellation, show affected orders/tickets, stop new sales, allow the Moderator to notify affected buyers through established delivery channels, and expose the resulting refund work. Track actual notification/refund outcomes. Keep the original purchase terms and historical event details.

## 6. Orders and tickets

Search by order number, displayed ticket number, customer, organizer, and event. Cover both registered and guest purchases, including free admissions and historical deposits/group passes supported by the application.

Show buyer, event/items, purchase date, amount/currency, provider reference, payment state, ticket/admission state, delivery state, and whether/when the ticket was used. Link to the relevant support case and event. Mask unnecessary contact data in list views.

Support and Moderators can resend an existing ticket, cancel an eligible order, and request full or partial refunds with a reason and a confirmation showing the exact effect. Reuse the existing payment/refund/ticket-delivery services and accepted policy snapshots. Support actions follow applicable eligibility rules; any Moderator override must be explicit and audited.

Implement partial refunds through supported, identifiable order items/admissions and their original charged amounts. Define how seats, group passes, deposits, discounts, commission, and previously used tickets affect eligibility. Preserve the unchanged portions of an order and invalidate/refund only the affected admissions. Inspect the existing single-refund model/provider contract and extend it safely where needed. Never emulate a partial refund by merely editing a local payment status. If a provider lacks a capability, present that limitation clearly.

Use database transactions/locking and stable idempotency keys for financial actions. Repeated clicks, retries, concurrent staff requests, and duplicate provider callbacks must not create duplicate refunds or exceed the remaining refundable amount. Provider acceptance, pending, failure, and uncertain outcomes must be represented truthfully; a request is not automatically a completed refund.

Resending keeps the original ticket ID/QR and records the attempt. Deduplicate retries of the same delivery request and rate-limit repeated deliberate resends. If existing replacement functionality is exposed, invalidate the previous QR before issuing a replacement. Add only a compact scan/delivery history using actual recorded facts; do not invent missing historical scans or delivery outcomes.

## 7. Finance

Moderator-only finance needs simple date/event/organizer filters, summary totals, a transaction table, and CSV export:

- Paid sales, provider fees where known, platform commission, refunds, and disputes where the payment integration supplies them.
- Amount payable to each organizer, payouts already recorded, and outstanding balance.
- Manual payout records with organizer, amount/currency, date, reference, and staff actor. Clearly label these as recorded external payouts; this release does not initiate bank transfers.

Use real settled payment/refund facts, integer minor units, explicit currencies, and immutable references. Separate currency totals. Any optional converted display total must state its rate/date and must not become the settlement amount. Show differences or missing financial data explicitly.

Inspect whether commission terms already exist. If needed, provide a simple Moderator-controlled default and organizer override, snapshot the applicable terms for new purchases, and define the fee basis for refunds. Do not retroactively invent commission/provider fees for historical orders. Historical unknowns need a visible reconciliation state. Prevent duplicate payout records and provide an audited correction/reversal path instead of deleting payment history. Show gross organizer entitlement, applicable deductions, and recorded payouts so the outstanding figure is explainable.

Keep demo/mock payments clearly identified and separate from real financial totals. A dashboard must not imply that mock provider amounts represent money received.

## 8. Audit and small operational essentials

Record staff actor/role, timestamp, action, target, reason, relevant before/after values, and linked case for sensitive actions. Cover refunds, cancellation, resend attempts, verification/document access, blocks/unblocks, publication decisions, payout records/corrections, commission changes, staff invitations/role changes, and access revocation.

Use an append-only model for staff actions; ordinary staff cannot edit/delete entries. Keep secrets, passwords, OTPs, recovery codes, session tokens, document contents, and full payment credentials out of logs. Record failed privileged actions where useful. Audit writes and mutations must remain consistent, with external-operation outcomes recorded separately.

Add a small actionable list within existing pages for paid orders missing tickets, failed delivery, stuck refunds, and payment-status mismatches. Offer safe supported retries with idempotency. Include basic CSV exports with permission checks and spreadsheet-formula injection protection.

## 9. Implementation and deployment requirements

- Use additive forward migrations and relevant indexes. Preserve users, tickets, QR tokens, orders, accepted snapshots, and payment/audit history. No resets, production seeds, checksum rewrites, or automatic staff promotion from existing public roles.
- Keep private support/verification uploads on a persistent protected volume or the already-configured private storage. Extend backup/restore instructions for it.
- Configure admin host routing, API/BFF forwarding, session isolation, upload access, required environment values, and Caddy/Compose examples. Preserve customer-site routing, staging Telegram callbacks, existing bot webhook, and mail records.
- Reuse the current UI style and Russian/Kazakh/English localization conventions. Russian is the primary acceptance language. Tables, conversations, dialogs, badges, and upload forms must be usable on desktop and phone, keyboard accessible, and include loading/empty/error states.
- Validate every API payload and ownership/role boundary. Use explicit errors and real persisted data. Mock responses belong only in isolated test fixtures.
- Keep business logic in backend services; hiding frontend buttons is insufficient authorization.
- Work through the implementation in manageable stages and keep a concise progress/validation document. Continue within the agreed scope without repeatedly asking for routine implementation choices.
- Prepare the deployable changes and run all available checks. Do not push, deploy, change DNS, alter a live bot, send real customer messages, or initiate real payments/refunds unless the user separately authorizes those actions. Use disposable test records and fake provider adapters for verification.

## 10. Acceptance and delivery

Provide automated coverage and browser evidence for these journeys:

1. A Moderator invites Support; invitation signup, MFA, password recovery, logout, and immediate session revocation work. Public users cannot create/access staff accounts or APIs. Support cannot call Moderator actions directly.
2. A customer and an organizer independently contact TICKET. Staff reply; each participant sees only their own conversations and no internal notes. Order-linked anonymous support enforces its access capability. Attachments enforce ownership.
3. An organizer uploads documents, submits verification, receives a change request, resubmits, is approved, and sees the badge beside their name in the correct public locations. Revocation removes the badge. Other users and Support cannot retrieve the documents.
4. Staff find registered/guest purchases by supported identifiers, inspect delivery/admission state, and resend the original ticket. Duplicate delivery requests are handled safely.
5. Full and supported partial refunds handle eligible/used tickets, retries, concurrent actions, provider failures, ambiguous outcomes, and duplicate callbacks without over-refunding or corrupting inventory.
6. Moderator blocks/unblocks an organizer/event and direct API calls respect the restriction. Existing purchasers retain authorized ticket/support access. Cancellation pauses sales and exposes notification/refund outcomes.
7. Finance uses actual transactions, separates currencies/mock money, computes explainable organizer balances, records a manual payout once, exports safely, and audits corrections.
8. Required staff actions appear in the protected log with accurate actors/reasons and no secrets.

Run appropriate unit, authorization, disposable-database migration/integration, typecheck, lint, build, and browser checks. Rehearse new migrations against an existing-data copy where available. Test the actual frontend/backend together when possible; explicitly distinguish fixture-based UI checks from database-backed and live-provider verification. Docker/ngrok unavailability must not become a blanket reason to skip available checks. State any concrete external blockers and remaining integration tests honestly.

Deliver a concise implementation summary, changed areas, migration/environment/bootstrap instructions, exact checks and outcomes, screenshots, and any provider limitations. All controls and badges described as completed must be backed by real authorization and persisted state.
