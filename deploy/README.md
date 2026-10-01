# Demo deployment on the Azure VM

This stack is for testing with mock payments. It does not charge customers. Keep the existing `docker-compose.yml` for local development; use `compose.demo.yml` on the VM.

The VM needs Docker Engine and Compose, outbound access to GitHub/Docker Hub/npm, and inbound TCP 80/443 when HTTPS is enabled. Name.com manages DNS for `ticketron.live`. Keep the existing Resend mail records.

## Install the release

On the VM:

```sh
git clone https://github.com/chonkopai/TICKET.git
cd TICKET
cp deploy/demo.env.example .env.demo
chmod 600 .env.demo
nano .env.demo
```

Set `SITE_DOMAIN=staging.ticketron.live` for the first run. Replace every `replace-with-...` value. Generate a different hex value for each secret with `openssl rand -hex 32`. Use a real Telegram bot token and username; the API and bot require them to start. Add the optional Resend and Google values only when configured for the staging domain. Never commit `.env.demo` or put credentials in a Docker build argument.

Build and start the application:

```sh
docker compose --env-file .env.demo -f compose.demo.yml build web
docker compose --env-file .env.demo -f compose.demo.yml up -d postgres redis
docker compose --env-file .env.demo -f compose.demo.yml run --rm migrate
docker compose --env-file .env.demo -f compose.demo.yml up -d api bot web
docker compose --env-file .env.demo -f compose.demo.yml ps
```

Check that the web container can reach the API through the configured rewrite:

```sh
docker compose --env-file .env.demo -f compose.demo.yml exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e);process.exit(1)})"
```

This should print `200`. Do not run the development seed against a database containing data. The first deployment starts with an empty event catalog unless you deliberately import data.

## Enable HTTPS

After the app checks pass, add an A record named `staging` at Name.com pointing to the VM's public IP, `20.164.17.32`, and allow inbound TCP 80/443 in the VM's Azure network security group. Then start Caddy:

```sh
docker compose --env-file .env.demo -f compose.demo.yml up -d caddy
curl -I https://staging.ticketron.live
```

Caddy obtains and renews the HTTPS certificate. The demo sends a `noindex` header, but the URL is public; share it only with testers and do not enter real payment details. Google sign-in needs `https://staging.ticketron.live` in the Google OAuth client's authorized JavaScript origins. The Telegram bot domain and webhook must also point to the staging URL before those features can work; do not reuse a bot that is still receiving updates through another webhook.

Mock checkout remains pending until the VM operator applies a signed callback. For a test order only, run:

```sh
docker compose --env-file .env.demo -f compose.demo.yml exec api node dist/payments/dev-callback.js ORDER_ID payment.succeeded
```

Replace `ORDER_ID` with the test order's ID. This issues a test ticket without a real charge. The callback command is unavailable outside explicit demo mode.

When staging works, rebuild with `SITE_DOMAIN=ticketron.live`, update the app and Caddy, then add the apex A record and `www` record at Name.com. Preserve the mail records. Do not use `docker compose down -v` on the VM: it deletes the database, Redis, poster, and Caddy certificate volumes.
