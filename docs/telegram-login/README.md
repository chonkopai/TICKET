# Telegram sign-in

The primary Telegram button starts a same-tab OIDC authorization-code flow with PKCE. Telegram
handles approval through its supported clients/browser UI. **Sign in to Telegram with a phone
number** opens the existing official widget. The website never collects Telegram codes or passwords.

Telegram Web handoff and number-free approval depend on Telegram and the user's client. The site
does not detect installed apps or search existing tabs. A failed handoff has an explicit phone
option; a rejected/tampered response never authenticates a user.

## Enable on staging

Staging's existing Telegram login works independently of the new approval-first flow. Its bot
domain registration is not proof that the new callback is authorized, and does not register ngrok.

1. Apply database migrations with the normal release migration step. The additive
   `20261010000000_telegram_oidc_login` migration creates only `TelegramLoginAttempt`.
2. Open BotFather's mini app, select the staging bot, then **Login Widget**. If the legacy
   single-domain field is shown, choose **Switch to OpenID Connect Login**. Add
   `https://staging.ticketron.live` under **Trusted Origins** and
   `https://staging.ticketron.live/login/telegram/callback` under **Redirect URIs**. Keep signing set to
   **RS256**. Obtain the Client ID and Client Secret from this section; they are separate from
   the bot token.
3. Set the API's runtime environment:

   ```ini
   TELEGRAM_OIDC_ENABLED=true
   TELEGRAM_OIDC_CLIENT_ID=<BotFather client ID>
   TELEGRAM_OIDC_CLIENT_SECRET=<BotFather client secret>
   ```

   `WEB_ORIGIN` must be the canonical HTTPS origin without a trailing slash. The callback is
   derived as `${WEB_ORIGIN}/login/telegram/callback`; it cannot be overridden by a browser.
   The demo Compose API loads credentials from `.env.demo`. No OIDC secrets or new public
   values are needed in the web image/build arguments. Build/release the changed application
   using the existing deployment procedure, then enable OIDC after provider registration.
4. Verify the live flow on the supported devices below before declaring it available.
   BotFather describes the OIDC switch as replacing the legacy widget. The current explicit
   phone fallback still uses that widget, so its compatibility after switching remains a
   release prerequisite. If Telegram disables the legacy widget, that fallback needs an
   updated integration; the mocked fallback checks do not establish provider compatibility.

For rollback, set `TELEGRAM_OIDC_ENABLED=false` and restart the API. The button then offers the
legacy widget. Keep the additive table; existing accounts, bot linking, and sessions do not
require a reverse migration.

## Ngrok development

The currently configured development origin is `https://sulphate-shown-subtract.ngrok-free.dev`.
Its Telegram login is not assumed to be registered or working. Leave OIDC disabled there until
you have a separate development bot or have explicitly registered the development origin and
`https://sulphate-shown-subtract.ngrok-free.dev/login/telegram/callback` with the appropriate bot.
Use matching `WEB_ORIGIN` and `NEXT_PUBLIC_API_URL` values for the environment; never direct a
development login to the staging callback. Changing the ngrok hostname requires re-registration.

Do not change the staging bot domain or webhook to make local login work. The phone fallback is
subject to the legacy bot's domain registration too, so it cannot repair an unregistered ngrok
domain. Other site authentication methods remain available.

## Security and identity behavior

- Server-generated state, nonce, and S256 PKCE; a separate random browser proof is held in tab
  session storage and only its hash is persisted. Origin checks and explicit DTO validation
  protect both endpoints. Rate limits are per-process and still require normal edge limits.
- Attempts expire after ten minutes. An atomic database claim precedes the code exchange and
  scrubs the stored verifier. Failed/lost exchanges and callback reloads require a fresh login;
  an attempt is never reopened. Up to 100 expired rows are removed on each new OIDC start.
- Provider calls have time/size limits. ID tokens require RS256, Telegram issuer, configured
  audience, valid lifetime, matching nonce, and a valid numeric profile `id`. OIDC `sub` is not
  used as the existing Telegram ID. Provider tokens are not stored.
- Both methods resolve the same `User.telegramId`, retain edited profile data and roles, and
  issue the existing access/refresh tokens. They do not merge accounts by contacts, verify a
  `ContactIdentity`, or infer a connected bot chat. Existing bot linking/confirmation is retained.
- Callback code/state are removed from browser history; callback responses are non-cacheable,
  have no-referrer/noindex protections, and avoid reflecting queries in alternate metadata.
  The session is saved only after backend verification. Cross-browser returns without the
  initiating proof fail with restart/phone options.
- The legacy widget uses isolated callbacks and suppresses stale, duplicate, and unmounted
  results. Abandoned primary requests cannot navigate after the user chooses phone login.

## Validation

Automated unit coverage includes signed-token rejection, state/browser/nonce/expiry checks,
replay/concurrent completions, provider failures, safe redirects, configuration, and browser
workflow recovery. Existing linking, Google, refresh, and bot tests are also regression targets.

The database integration test is opt-in and uses randomized fixtures with targeted cleanup:

```sh
TELEGRAM_OIDC_DB_TEST=true pnpm --filter @event-platform/api exec vitest run src/auth/telegram-oidc.service.spec.ts
```

The mocked browser check exercises the actual frontend and callback/proxy in desktop/mobile,
three languages, and dark mode. With a dev server running:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node docs/telegram-login/verify-browser.mjs
```

For a production server, also set `TELEGRAM_TEST_URL` to its local URL and
`TELEGRAM_TEST_PRODUCTION=true`. This strictly asserts `no-store`; Next development mode
deliberately overrides page cache headers with `no-cache, must-revalidate`.

It writes screenshots and a report to `/private/tmp/ticket-telegram-browser` by default. Mocked
provider/browser evidence does **not** prove native Telegram handoff or Telegram Web support.

Live acceptance remains required on configured staging: iOS Safari with Telegram, Android Chrome
with Telegram, desktop with Telegram Desktop, Telegram Web signed in without a native app, and
a clean browser without an existing Telegram session. Record whether each required phone entry,
verify cancellation/expiration, confirm the original page is restored, and check both new and
existing accounts. No live BotFather changes, webhook changes, or staging deployment are part
of the local implementation.

Provider references: [Telegram Login](https://core.telegram.org/bots/telegram-login),
[approval flow](https://core.telegram.org/api/url-authorization).

## Verification recorded on 10 October 2026

The final local run passed 116 automated tests: 60 API authentication tests (including the real
database concurrency/account-preservation test), 22 frontend workflow/proxy tests, 8 configuration
tests, 10 return-path tests, and 16 bot regressions. An unrelated opt-in Google database test was
skipped. API build, web production build, TypeScript checks, scoped lint, Prisma validation,
and whitespace checks passed. The new migration was applied to the local development database;
staging was not changed.

The mocked browser suite passed against a temporary production server, including real callback
routing and `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex,
nofollow`. Screenshots were reviewed for desktop, 390px mobile, three languages, and dark mode.
The temporary server was stopped afterward. See [verification results](verification.json).

| Behavior | Evidence |
| --- | --- |
| Approval redirect, verified session handling, original page/query/hash restoration | Passed with mocked Telegram and the production frontend |
| Explicit phone option, disabled-provider fallback, cancellation and missing-browser recovery | Passed with mocked Telegram/widget responses |
| Replay/concurrent completion and one account across OIDC/legacy login | Passed against local PostgreSQL with isolated fixtures |
| Callback privacy and mobile/localized presentation | Passed in the production browser check and visual review |
| Native Telegram app handoff and Telegram Web approval | Requires live verification after BotFather registration and credentials |
| Staging activation | Not deployed; the existing staging login is left in place |
| Ngrok live Telegram login | Not enabled or repaired through bot-domain changes; development remains independent of staging |

## First-click fix verified on 11 October 2026

A delayed login-page image reproduced a race in the original production build: clicking before
the initial `pageshow` event started authorization, but that event invalidated the pending
redirect. The login page now resets a pending request only when `pageshow.persisted` indicates
a return from the browser's back/forward cache. It also keeps the Telegram button disabled
after starting navigation so a slow provider response cannot prompt a second attempt.

The production browser suite now covers the delayed initial page load, slow provider navigation,
repeated clicks, and a persisted-page return. The production build, 22 frontend authentication
tests, scoped lint, and whitespace checks passed. Provider responses remain mocked; staging
needs the updated web image before this fix is active there. No additional database migration
or configuration change is required.
