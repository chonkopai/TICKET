# Evently

Evently is an event-management platform with a public event catalog, an organizer dashboard,
ticket and table booking flows, QR tickets, Telegram integration, and a shared backend.

The repository is a TypeScript monorepo managed with pnpm and Turborepo.

## Technology

- Web: Next.js and React
- API: NestJS
- Telegram bot: grammY and Express
- Database: PostgreSQL, Prisma ORM
- Cache/infrastructure: Redis
- Validation and shared contracts: Zod and TypeScript
- Local infrastructure: Docker Compose

## Repository structure

```text
apps/
  web/             Public website and organizer/guest interfaces
  api/             REST API and application services
  bot/             Telegram bot and webhook server
packages/
  config/          Shared environment validation
  database/        Prisma schema, migrations, seed and shared client
  shared-types/    DTOs, shared schemas and Russian UI strings
```

All three applications use the same PostgreSQL database through the API and shared domain
services. An event created by an organizer is therefore available to the public website and bot
after it is published.

## Requirements

- Node.js 24.15 or newer
- pnpm 11.19
- Docker with Docker Compose
- Telegram bot token and username for Telegram login and live bot checks

## Local setup

From the repository root:

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Replace placeholder secrets in `.env` before starting the applications. Generate independent
secrets, for example with `openssl rand -hex 32`. Never commit `.env`, certificates, private keys,
or provider credentials.

Local services:

- Website: http://localhost:3000
- API health check: http://localhost:3001/health
- Bot health check: http://localhost:3002/health
- Telegram webhook: `POST http://localhost:3002/telegram/webhook`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Check that the API and seeded database are available:

```bash
curl --fail --show-error http://localhost:3001/health
pnpm db:verify
```

Stop the infrastructure with:

```bash
docker compose down
```

Database contents are kept in Docker volumes. Use `docker compose down -v` only when you
intentionally want to delete the local PostgreSQL and Redis data.

## Telegram login and webhook

Telegram Login requires a public HTTPS domain registered for the bot through BotFather. For local
development, expose port 3000 through an HTTPS tunnel and set these values in `.env` without a
trailing slash:

```ini
NEXT_PUBLIC_API_URL=https://your-public-domain.example
WEB_ORIGIN=https://your-public-domain.example
API_BASE_URL=http://localhost:3001
```

Keep `API_BASE_URL` local: the bot calls the API directly, while the Next.js application proxies
browser requests to the API and `/telegram/webhook` to the bot service.

Set `TELEGRAM_WEBHOOK_SECRET` to a separate random value, then register the public webhook:

```bash
pnpm --filter @event-platform/bot exec tsx src/register-webhook.ts
```

Webhook and polling consumers must not run at the same time.

## Available functionality

- Telegram-based login, access/refresh sessions and guest/organizer/admin roles
- Public home page, event catalog, search, filters, favorites and recently viewed events
- Organizer event wizard, draft preview, publishing lifecycle and poster management
- Ticket types, authoritative inventory, secure QR codes and optional Apple Wallet passes
- Venue layout editor and PostgreSQL-protected table holds
- Logged-in and anonymous ticket/table checkout
- Deposit or full-payment policy selected by the organizer
- Signed development-payment callbacks and idempotent order finalization
- Guest account, My Events, ticket details and cancellation flows
- Telegram guest/organizer commands, event search and ticket delivery
- Transactional outbox and audit records for important state changes

## Development payment provider

The default `PAYMENT_PROVIDER_NAME=mock` adapter is for local development only. It uses signed
server-side callbacks and must never be enabled in production. A production payment gateway,
webhook verification rules and refund implementation must be configured before launch.

The following integrations also require client/provider credentials before production use:

- Apple Wallet certificates
- production object storage
- SMS and push delivery
- production hosting, domain and monitoring

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @event-platform/database prisma:validate
pnpm db:verify
```

Start Docker and apply migrations before database verification. If port 3000, 3001, 3002, 5432,
or 6379 is already occupied, stop the existing process or change the corresponding configuration
before starting the project.

## Working with intermediate updates

The shared integration branch is `main`. Pull before reviewing a new update:

```bash
git switch main
git pull --ff-only
pnpm install
pnpm db:migrate
```

Run `pnpm build` after pulling. If `.env.example` changes, add the new variables to the local
`.env` without copying real credentials into Git.
