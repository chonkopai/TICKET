# Update the Azure VM with the current application changes

Prepared 8 November 2026. This follows the GitHub → `~/TICKET` → Docker Compose method recorded in the earlier “Fix admin page frontend issues” chat and in `deploy/README.md`.

The current local branch is `main`. The pending work includes the hall builder, event creation/buyer integration, API changes and backend bug fixes. Use the full API/bot/web update. In this stack, `build web` builds **one shared image containing the web app, API, bot and migration files**; the service name does not mean a frontend-only build.

These instructions have not been executed against the VM. Finish any other fix chats and their verification before committing the snapshot. No new migration files are currently present in the local changes, but the VM's applied migration state has not been inspected. `migrate deploy` checks and applies any pending repository migrations.

## 1. On the Mac: review, commit and push

Run in the same local checkout where the fixes were made:

```bash
cd /Users/bekarys/TICKET
git branch --show-current
git status --short
git diff --check
```

The branch should be `main`. Stage the application, shared code, deployment files and documentation, including new files. The generated Next declaration file stays unstaged:

```bash
git add -A -- apps packages deploy docs compose.demo.yml Dockerfile.demo .dockerignore .env.example README.md package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json AUDIT_CHECKLIST.md ':(exclude)apps/web/next-env.d.ts'
git diff --cached --stat
git diff --cached
```

Review the staged patch before committing. `.env.example` is a configuration template. Actual `.env`/`.env.demo`, credentials and generated runtime files must not be committed. Local prototype/preview directories are not required by the deployed application.

```bash
git commit -m "Update hall builder and fix application bugs"
git push origin main
git rev-parse HEAD
```

Record that commit hash. If push is rejected, resolve the upstream changes before deploying; do not force-push over them.

## 2. On the VM: check the checkout and preserve release information

Connect using your existing SSH command for `azureuser@ticket-demo-vm`. Run the remaining sections in the **same VM terminal session** so the backup variables remain available.

```bash
cd ~/TICKET
git branch --show-current
git status --short
sudo docker compose --env-file .env.demo -f compose.demo.yml ps
```

The branch should be `main`, with no uncommitted checkout changes. If there are changes, reconcile them before pulling. Keep the VM's existing `.env.demo`; never replace it with the Mac's ngrok/local `.env` or reset it from the example.

Create a private backup directory and record the old checkout/configuration. Tag each currently running application image before the build replaces its tag. This records the actual running images, which may differ from the Git checkout or from each other:

```bash
umask 077
TICKET_UPDATE_STAMP=$(date +%Y%m%d-%H%M%S)
TICKET_UPDATE_BACKUP="$HOME/ticketron-backups/$TICKET_UPDATE_STAMP"
mkdir -p "$TICKET_UPDATE_BACKUP"
chmod 700 "$TICKET_UPDATE_BACKUP"
git rev-parse HEAD > "$TICKET_UPDATE_BACKUP/previous-checkout.txt"
cp .env.demo compose.demo.yml "$TICKET_UPDATE_BACKUP/"
cp -R deploy "$TICKET_UPDATE_BACKUP/deploy"

for TICKET_SERVICE in api bot web; do
  TICKET_CONTAINER=$(sudo docker compose --env-file .env.demo -f compose.demo.yml ps -q "$TICKET_SERVICE")
  test -n "$TICKET_CONTAINER" || break
  TICKET_IMAGE=$(sudo docker inspect --format '{{.Image}}' "$TICKET_CONTAINER")
  sudo docker image tag "$TICKET_IMAGE" "ticketron-rollback:$TICKET_UPDATE_STAMP-$TICKET_SERVICE"
done
```

If a service is absent or an image-tagging command fails, investigate before continuing. Preserve the private backup outside the VM as well, using your existing protected backup destination.

## 3. Pull and build while the old application is still running

```bash
git pull --ff-only origin main
git log -1 --oneline
git rev-parse HEAD
sudo docker compose --env-file .env.demo -f compose.demo.yml config --quiet
sudo docker compose --env-file .env.demo -f compose.demo.yml build web
```

The VM's full commit hash must match the hash recorded after the Mac push. Stop if any command fails. A failed build at this stage leaves the existing application containers running.

Keep the VM's existing public domain, Telegram credentials/webhook, staff secrets and provider configuration. The updated Compose file supplies `API_TRUST_PROXY_HOPS=2` for Caddy → Next → API. Automatic transactional notifications follow the existing `.env.demo` flag; retain its intended value.

## 4. Make a consistent database/upload backup, then migrate and restart

This section causes a maintenance interruption. Keep the interruption until verification passes. API, bot and web stop to prevent application writes while database and uploaded files are backed up. PostgreSQL, Redis and Caddy remain running.

Capture the existing API container ID before stopping it. `docker cp` can read the stopped container and its mounted `/data` storage, which contains posters, draft media and private support uploads:

```bash
TICKET_API_CONTAINER=$(sudo docker compose --env-file .env.demo -f compose.demo.yml ps -q api)
test -n "$TICKET_API_CONTAINER"
sudo docker compose --env-file .env.demo -f compose.demo.yml stop api bot web

sudo docker compose --env-file .env.demo -f compose.demo.yml exec -T postgres pg_dump -U ticketron -d ticketron -Fc > "$TICKET_UPDATE_BACKUP/database.dump"
test -s "$TICKET_UPDATE_BACKUP/database.dump"
sudo docker compose --env-file .env.demo -f compose.demo.yml exec -T postgres pg_restore --list < "$TICKET_UPDATE_BACKUP/database.dump" > "$TICKET_UPDATE_BACKUP/database-contents.txt"
sudo docker cp "${TICKET_API_CONTAINER}:/data/." - > "$TICKET_UPDATE_BACKUP/uploads.tar"
tar -tf "$TICKET_UPDATE_BACKUP/uploads.tar" > "$TICKET_UPDATE_BACKUP/upload-contents.txt"
```

Run one command at a time and stop on failure. Nonempty archives and readable contents verify that archives were produced; a restore rehearsal is the stronger recovery check. These backups contain private data and secrets and must remain protected.

After both backups succeed:

```bash
sudo docker compose --env-file .env.demo -f compose.demo.yml run --rm migrate
```

Only after migrations succeed:

```bash
sudo docker compose --env-file .env.demo -f compose.demo.yml up -d api bot web
sudo docker compose --env-file .env.demo -f compose.demo.yml ps
```

Do not run a seed, `prisma migrate reset`, `prisma db push`, or `docker compose down -v` against the VM. The update reuses the existing data volumes.

## 5. Verify the deployed release

```bash
sudo docker compose --env-file .env.demo -f compose.demo.yml exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e);process.exit(1)})"
sudo docker compose --env-file .env.demo -f compose.demo.yml logs --tail=100 api bot web
curl -I https://staging.ticketron.live
```

The API health command should print `200`. API and bot should become healthy; web should be running without startup errors. Use the existing site domain if the VM has already moved from staging to production.

Record the deployed checkout and images:

```bash
git rev-parse HEAD > "$TICKET_UPDATE_BACKUP/deployed-checkout.txt"
sudo docker compose --env-file .env.demo -f compose.demo.yml images > "$TICKET_UPDATE_BACKUP/deployed-images.txt"
```

Hard-refresh the website and verify with test data:

1. Event creation → saved halls → create/import → save and select a hall, including its thumbnail.
2. Pricing confirmation, incompatible table selling-type guidance and highlighted Layout control.
3. Buyer hall rendering, seat/whole-table/standing prices, and one intended staging checkout journey.
4. Ended events no longer accept new registration or checkout; existing ticket/account and admin access still work.

A successful health response alone does not verify these user journeys. No ngrok restart, DNS change, Caddy reinstall or Telegram webhook change is part of this update.

## If something fails

- **Pull/build fails before the maintenance stop:** keep the running app and fix the error.
- **Backup fails before migrations:** the existing containers can be resumed with `sudo docker compose --env-file .env.demo -f compose.demo.yml start api bot web`; this starts the existing containers instead of replacing them with the newly built image.
- **Migration or post-migration startup fails:** stop the rollout and retain the error, backups and tagged images. Do not reset the database or automatically downgrade it. Applied schema changes require a compatible recovery release; restoring a backup must account for any later payments/orders/data. Prior tagged images and configuration are recovery inputs, not proof that a downgrade is compatible.

Related repository instructions: `deploy/README.md`, `docs/admin-panel/README.md`, `docs/event-creation-v2/cutover-runbook.md`.
