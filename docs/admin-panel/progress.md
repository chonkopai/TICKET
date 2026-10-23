# Administration progress

Implementation and local verification completed on 23 October 2026, with the
notification-setting fix prepared for the authorized Git release on 24 October.
No VM deployment, DNS changes, live bot changes, real customer messaging or real
financial operations were performed during implementation and local verification.

| Stage | Outcome |
| --- | --- |
| Repository inspection | Existing identities/purchases preserved; staff authentication is independent. |
| Database | Three additive migrations, sales restrictions, commission snapshots, immutable audit; fresh and synthetic historical-copy upgrade rehearsals passed. |
| Staff security | Two roles, invitations/bootstrap, mandatory TOTP, recovery, isolated sessions/CSRF, revocation and last-Moderator protection implemented. |
| Support/verification | Scoped cases, private notes/files, paginated history/order-chat inspection, versioned verification and review implemented. |
| Main website | Customer/anonymous support, organizer support/verification navigation and server-controlled badges implemented. |
| Operations | People/events, orders/tickets, supported full/partial refunds, durable resends, finance/payout records, CSV and audit implemented. |
| Interface | Six sections and team/security settings; Russian primary, Kazakh/English copy; desktop/phone checked. |
| Deployment preparation | Admin hosts/BFF, Compose/Caddy, private volume, environment/bootstrap and backup/restore instructions prepared; configuration validated. |
| Validation | Staff 24/24; regular API 294 passed; web 101/101; shared 76/76; config 8/8; database 5/5 plus 12/12 helpers; types/lint/build passed. Expanded API: 349 passed, two video tests blocked by absent FFmpeg. |

The first test launches read the default environment or lacked sandbox permission
to bind/connect locally; they failed and are not counted as successful verification.
Runners now honor explicit `ENV_FILE`; all new admin journeys and migration
rehearsals used dedicated disposable local databases and fake delivery/providers.

See [validation.md](validation.md) for exact scope, commands, screenshots and limits,
and [README.md](README.md) for deployment/bootstrap instructions. Remaining external
work is real payment-provider integration and separately authorized DNS/TLS,
email/Telegram delivery and VM verification. The repository supplies only a mock
payment adapter; its amounts are labelled as test money.
