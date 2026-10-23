# TICKET administration

Two staff roles and six sections share the existing API and PostgreSQL database.
The public website and staff console use separate authentication. This release
includes code and deployment configuration; VM deployment and DNS setup are separate.

## URLs and configuration

| Environment | Public site | Staff site |
| --- | --- | --- |
| Production | `https://ticketron.live` | `https://admin.ticketron.live/admin` |
| Staging | `https://staging.ticketron.live` | `https://staging-admin.ticketron.live/admin` |
| Default local | `http://localhost:3000` | `http://admin.localhost:3000/admin` |
| Browser verification used | `http://localhost:3400` | `http://admin.localhost:3400/admin` |

The staff hostname root redirects to `/admin`. The public hostname returns 404 for
`/admin` and `/staff-api`. The admin hostname rejects public pages and API rewrites.
Next's server BFF forwards only the staff cookie and CSRF header, and adds the
server-only gateway credential and configured origin. Nest additionally checks the
gateway, staff session, current account version/disabled state, MFA and role on
privileged requests. The API port must remain private on deployment. Public JWTs,
including the old public `admin` role, confer no staff access.

Configure independently for each environment:

- `STAFF_ENABLED=true`: API and web runtime. Disabled by default.
- `ADMIN_DOMAIN`: `staging-admin.ticketron.live` or `admin.ticketron.live` in Compose.
- `ADMIN_ORIGIN`: canonical origin including scheme and local port. Compose derives
  it from `ADMIN_DOMAIN` for API and web.
- `STAFF_GATEWAY_SECRET`: independent random secret of at least 32 characters,
  identical on API and web, never a `NEXT_PUBLIC_` variable or build argument.
- `STAFF_MFA_ENCRYPTION_KEY`: independent 32-byte key encoded as 64 hex characters;
  API only. Back it up securely outside the database and uploaded files.
- `PRIVATE_SUPPORT_STORAGE_DIR`: absolute persistent API path in production;
  Compose sets `/data/private-support` and mounts `private_support_data`.
- Existing `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: verified staff invitation and
  password recovery delivery. Missing configuration returns an unavailable state.
- `EVENT_PUBLICATION_REQUIRES_REVIEW=false`: preserves immediate publication.
  If explicitly enabled, new validated publications receive `pending` moderation,
  are excluded publicly and cannot sell until approved. Existing events keep `clear`.
- Existing API, JWT, Redis, bot, email and storage configuration remains required.

Generate independent secrets with `openssl rand -hex 32`. Do not reuse public
JWT, refresh, bot or OTP secrets. Keep runtime environment files out of Git.
The API rejects reused staff/public secrets and non-HTTPS production admin origins.

## Forward migrations and bootstrap

Read the existing [deployment instructions](../../deploy/README.md) first. The new
forward migrations are `20261022100000_platform_administration`,
`20261022101000_platform_sales_guard`, and
`20261022102000_platform_administration_constraints`. They add tables/columns,
indexes, foreign keys, sale checks, commission snapshots and audit immutability.
They do not reset data, rewrite previous checksums, promote public accounts, or
create staff. Historical commission amounts stay unknown.

After a consistent database/private-volume backup and the separately authorized
release installation, the existing migrate service applies the forward migrations:

```sh
sudo docker compose --env-file .env.demo -f compose.demo.yml run --rm migrate
sudo docker compose --env-file .env.demo -f compose.demo.yml up -d api bot web
```

Create the first Moderator once from the trusted API console, with a hidden,
interactive password prompt:

```sh
sudo docker compose --env-file .env.demo -f compose.demo.yml exec api node dist/staff/bootstrap.js
```

For local development, run `node --env-file=../../.env --import tsx
src/staff/bootstrap.ts` from `apps/api`. The command refuses to bootstrap when any
staff record exists. There is no default password or public staff-granting endpoint.
Sign in at `/admin/login`, enroll an authenticator, verify its code and save the
one-use recovery codes. Then invite the remaining team through Settings.
Invitations expire after 24 hours; recovery links after 30 minutes. Link tokens are
hashed and single-use and are carried in URL fragments, removed by the login UI.

MFA uses maintained `otplib` TOTP with replay prevention and AES-256-GCM encrypted
secrets. Recovery codes are random, hashed, consumed once and audited. A password
reset revokes sessions but retains MFA. Settings can replace the authenticator only
after password and a fresh OTP or unused recovery code; all sessions end and
mandatory enrollment follows. If all factors and recovery codes are lost, a trusted
operator must verify the employee and repair the existing staff record through the
private database console, recording the incident. There is no email-only MFA bypass.
The last active, enrolled Moderator cannot be disabled/demoted in team management.

Sessions have a 10-minute pre-MFA stage and an 8-hour authenticated expiry. Production
uses a host-only Secure HttpOnly SameSite=Strict cookie. Mutations require exact
Origin at the BFF and the session CSRF token at the API. Version/disabled checks
observe revocation on the next request, including protected downloads. Staff can
list and revoke their own sessions. Public blocked accounts lose previous sessions;
a fresh restricted login permits their own ticket retrieval and platform support,
while organizer operations and other mutations stay restricted.

## Main-site workflows

- Customer account → Support → TICKET opens the persisted platform inbox.
- Organizer workspace → **Поддержка TICKET** and **Проверка организатора**. The
  sidebar shows unread replies and a verification status/action card.
- The signed-in main navigation links to platform support. Anonymous receipts use
  their existing validated, expiring quick-order capability, never an order number,
  email address, or Telegram ID alone. Cases and files are scoped to that purchase.
- Support replies, separate internal notes, attachments, assignment and status are
  durable. Closed cases reopen on a reply. Messages are paginated and polled.
  Staff can inspect an order chat only through a linked case, and access is audited.
- Each verification submission is a separate version with private files. Pending
  submissions cannot be duplicated. Changes requested/rejected applications may be
  resubmitted. A new legal submission removes the old badge until reviewed.
- Moderator approval, rejection, change requests and revocation preserve reviewer,
  timestamp, reason, documents and linked discussion. In-site updates are delivered.
- A reusable localized badge uses server verification state beside organizer names
  in public event details, guest ticket contacts, organizer workspace and staff
  lists. Catalogue cards currently do not display organizer names. Public API
  responses omit business identifiers and documents; no-store responses and existing
  event polling refresh approval/revocation/suspension without cached approval.

Blocking an organizer stops creation/edit/publication and new checkout, including
anonymous/direct API paths. Hiding or cancelling an event stops new sales while
existing purchase/support access remains. Blocking does not erase orders or issue
refunds. Cancellation can queue the existing notification workflow; the event detail
shows actual notification/refund outcomes. Refunds are separate confirmed actions.

## Private documents and attachments

PDF, JPEG and PNG only, up to 10 MiB per file and five per verification submission
or message. Both extension and content are checked server-side; images are fully
decoded/re-encoded with pixel bounds. PDF header/EOF are checked and common active
content is rejected. **This is not antivirus scanning or a complete PDF sandbox**;
there is no malware scanner in this release. Staff should use a patched viewer.

Generated storage filenames, directory mode 0700 and file mode 0600 are used.
All downloads require ownership or staff access, use attachment disposition,
no-store and nosniff. Verification files require Moderator access; Support cannot
retrieve them even through a case or guessed download URL. Files are never copied
to poster storage or public event responses. Support internal-note attachments
are excluded from public messages/download authorization. Files and versions are
retained rather than silently deleting history.

## Orders, refunds and finance

Order search covers full UUIDs, the displayed eight-character order suffix, full
`TKT-…` ticket numbers, buyers (registered or anonymous), organizer and event filters.
List contacts are minimized; detail views show the actual payment/admission/delivery
facts. Existing IDs and QR tokens are retained during resend. Email uses the existing
durable email service; Telegram uses the existing ticket notification worker and
saved verified chat. Stable per-request delivery keys and a 10-minute deliberate
resend limit prevent duplicate queues. A queued/accepted/uncertain result is not
presented as confirmed recipient delivery.

Full refunds reuse the provider contract, old purchase terms, inventory and order
locks. Partial refunds select identifiable individual admissions from the v2
charged-item snapshot. Used admissions cannot be refunded. Seats release only the
selected allocation; remaining admissions and QR tokens stay unchanged. Group
passes, whole-table purchases and legacy/deposit bundles require a full unused
purchase refund. Unsupported or unidentifiable partial amounts are refused; a
local payment-status edit never substitutes for a provider refund.

Support follows the accepted refund-availability policy. Moderator exceptions are
explicit and audited. Stable keys, order locks, an active-refund unique index,
remaining-amount checks and scan/cancellation guards reserve the refund safely.
Uncertain provider outcomes remain processing until reconciliation. Completion,
failure and external outcomes are separate audit events. Delayed payment callbacks
cannot resurrect a refunded payment or move its original settlement timestamp.

Finance is Moderator-only. It separates currencies and mock payments; the date
filter uses payment settlement/refund completion dates, including refunds of older
sales. Lifetime balances are shown separately from period figures. Commission terms
are snapshotted on new orders; historical unknowns require reconciliation. Refunded
commission reverses proportionally against the original snapshot with integer
rounding; a complete refund reverses it all. Provider fees and disputes are marked
unavailable when the adapter does not supply them. The explainable balance is gross
sales minus succeeded refunds, net platform commission and recorded external payouts,
**before unknown provider fees**. No converted total becomes a settlement amount.

Payouts record an already completed external transfer; they never initiate a bank
transfer. Reference/request uniqueness deduplicates entries. Corrections reverse a
record with a reason and audit entry instead of deleting history. An external
payment can be recorded even if it exceeds current known entitlement; the resulting
negative balance remains visible for reconciliation. Organizer payouts cannot be
attributed to a particular event, so event-filtered reports do not invent an event
payout/balance. CSV exports protect against spreadsheet-formula injection.

The repository currently configures only the **mock payment adapter**. Real charges,
refunds, provider fees/disputes and bank reconciliation require an actual supported
provider integration and separately authorized live verification. Mock money is
never included in the real-money view. Email/Telegram production delivery and DNS/TLS
still require environment configuration and authorized deployment verification.

## Backup / restore

Back up PostgreSQL, private uploads and the MFA encryption key as one release unit.
Keep backups encrypted, access-controlled and outside public web/media directories.
Use `umask 077`; retain the existing poster/draft-media backup plan as well.

For a consistent small-platform maintenance backup, stop API/bot/web writes first,
then use the existing Compose project (do not use `down -v`):

```sh
umask 077
mkdir -p backups/admin-release
sudo docker compose --env-file .env.demo -f compose.demo.yml stop api bot web
sudo docker compose --env-file .env.demo -f compose.demo.yml exec -T postgres pg_dump -U ticketron -d ticketron -Fc > backups/admin-release/database.dump
sudo docker compose --env-file .env.demo -f compose.demo.yml run --rm --no-deps --entrypoint tar api -C /data -czf - private-support > backups/admin-release/private-support.tgz
sudo docker compose --env-file .env.demo -f compose.demo.yml up -d api bot web
```

Copy the MFA key and relevant runtime configuration through your secure secret
backup process, separately from the archives. Losing the key prevents ordinary TOTP
verification; do not rotate it without a migration/re-enrollment plan.

Rehearse restoration into a **new empty isolated database and private volume** with
matching application code/key: restore the dump using `pg_restore --no-owner
--no-acl`, extract the private archive into `/data` as the API user, apply any pending
forward migrations, and verify protected downloads and staff MFA before switching
traffic. Do not restore over a running database, seed production, delete volumes,
or attempt an automatic destructive down migration.

## Verification

See [validation.md](validation.md) for exact checks, actual browser screenshots,
remaining external checks and the existing-data dump/restore migration rehearsal.
The test-only `apps/api/test/admin-browser-fixture.ts` refuses non-local/non-test
DBs and requires an explicit fixture password; it is not a production bootstrap.
