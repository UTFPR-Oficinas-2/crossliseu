# Deploying Crossliseu to the VPS

Crossliseu is served at **https://ediasv.dev/crossliseu/**. Other portfolio projects can live under other paths of the same domain (or on other domains) on the same VPS.

```
                         ┌──────────────────────── VPS (Ubuntu 26.04) ─────────────────────────┐
 browser / ESP32         │                                                                      │
 ───── HTTPS ──────────► │  NGINX (on the host, ports 80/443, HTTPS via certbot)               │
                         │    ediasv.dev/crossliseu/api/*  ──► 127.0.0.1:8011  api container   │
                         │    ediasv.dev/crossliseu/*      ──► 127.0.0.1:8010  web container   │
                         │    ediasv.dev/<next-project>/*  ──► 127.0.0.1:8020  ...              │
                         │                                     postgres container (no port)    │
                         └──────────────────────────────────────────────────────────────────────┘
```

* **Host NGINX** is the only thing listening on the internet. It looks at the path and forwards the request to the right container.
* **Containers** only listen on `127.0.0.1`, so nobody can reach them (or the database) directly.
* NGINX strips the `/crossliseu` and `/crossliseu/api` prefixes, so Nest still sees `/users`, `/matches`, and so on.

**Port plan:** each project gets a block of 10 ports. Crossliseu uses `8010` for web and `8011` for the API. The next project uses `8020`, `8021`, and so on.

| File | Where it goes on the VPS | Purpose |
| --- | --- | --- |
| `compose.prod.yml` | `/opt/crossliseu/` (via git clone) | Production containers |
| `nginx/ediasv.dev.conf` | `/etc/nginx/sites-available/ediasv.dev` | The domain itself, shared by all projects |
| `nginx/crossliseu.conf` | `/etc/nginx/snippets/ediasv.dev/crossliseu.conf` | Crossliseu's routes |
| `nginx/websocket-map.conf` | `/etc/nginx/conf.d/websocket-map.conf` | WebSocket helper, shared |
| `apps/web/nginx.conf` | inside the web image | Serves the Vue build |

---

## Stage 1: First setup and manual deploy

### 1.1 DNS

In the panel where you bought `ediasv.dev`, create these records pointing to the VPS public IP (shown in Hostinger's hPanel):

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `<VPS IPv4>` |
| A | `www` | `<VPS IPv4>` |

Check propagation from your own computer with `ping ediasv.dev`. It can take from a few minutes up to an hour.

### 1.2 Base server setup (run as root the first time)

```bash
ssh root@<VPS IP>

apt update && apt upgrade -y

# A normal user for yourself (replace "eduardo")
adduser eduardo
usermod -aG sudo eduardo
# Copy your SSH key so you can log in as this user
rsync --archive --chown=eduardo:eduardo ~/.ssh /home/eduardo

# Firewall: only SSH, HTTP and HTTPS are open
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw enable
```

If Hostinger's hPanel also has a firewall for the VPS, make sure ports 22, 80 and 443 are allowed there too.

From now on, log in as `ssh eduardo@<VPS IP>` and use `sudo`.

### 1.3 Install Docker, NGINX and certbot

```bash
# Docker Engine + Compose plugin (official script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # log out and back in afterwards
# If the script doesn't support 26.04 yet, use Ubuntu's packages instead:
#   sudo apt install -y docker.io docker-compose-v2

sudo apt install -y nginx certbot python3-certbot-nginx git

docker --version && docker compose version && nginx -v
```

### 1.4 Get the code and configure secrets

```bash
sudo mkdir -p /opt/crossliseu && sudo chown $USER: /opt/crossliseu
git clone https://github.com/UTFPR-Oficinas-2/crossliseu.git /opt/crossliseu
cd /opt/crossliseu

cp .env.example .env
nano .env
```

Fill in `.env`. Generate passwords and secrets with `openssl rand -base64 32`.

```ini
POSTGRES_DB=crossliseu
POSTGRES_USER=crossliseu
POSTGRES_PASSWORD=<long random value>
POSTGRES_PORT=5432
POSTGRES_HOST=postgres        # ignored in prod (compose.prod.yml sets it), kept for clarity
SECRET=<long random value>
ADMIN_USERNAME=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

Then run `chmod 600 .env`. This file never goes to git.

### 1.5 Build and start the containers

```bash
cd /opt/crossliseu
docker compose -f compose.prod.yml up -d --build      # builds on the VPS (takes a few minutes)
docker compose -f compose.prod.yml run --rm api npx typeorm migration:run -d dist/database/data-source.js
docker compose -f compose.prod.yml ps                 # all three should be "running"/"healthy"

curl -I http://127.0.0.1:8010/      # web → 200
curl -I http://127.0.0.1:8011/users # api → 401 (it answered; you're just not logged in)
```

### 1.6 Configure NGINX and HTTPS

```bash
cd /opt/crossliseu/deploy/nginx
sudo cp websocket-map.conf /etc/nginx/conf.d/websocket-map.conf
sudo cp ediasv.dev.conf    /etc/nginx/sites-available/ediasv.dev
sudo mkdir -p /etc/nginx/snippets/ediasv.dev
sudo cp crossliseu.conf    /etc/nginx/snippets/ediasv.dev/crossliseu.conf

sudo ln -s /etc/nginx/sites-available/ediasv.dev /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx

# HTTPS certificate (also sets up the HTTP→HTTPS redirect and auto-renewal)
sudo certbot --nginx -d ediasv.dev -d www.ediasv.dev
sudo certbot renew --dry-run
```

Open **https://ediasv.dev/crossliseu/**.

### 1.7 Manual update (until Stage 2 is in place)

```bash
cd /opt/crossliseu
git pull
docker compose -f compose.prod.yml up -d --build
docker compose -f compose.prod.yml run --rm api npx typeorm migration:run -d dist/database/data-source.js
```

### Everyday commands

```bash
docker compose -f compose.prod.yml ps                  # status
docker compose -f compose.prod.yml logs -f api         # follow API logs
docker compose -f compose.prod.yml restart api
docker compose -f compose.prod.yml down                # stop (database data is kept in a volume)
sudo tail -f /var/log/nginx/error.log
```

> Tip: `alias dcp='docker compose -f /opt/crossliseu/compose.prod.yml'` in `~/.bashrc`.

---

## Stage 2: Automatic deploy on every push to `main`

`.github/workflows/deploy.yml` does this on every push to `main`:

1. It runs the CI checks (same as Stage 3).
2. It builds the `api` and `web` images on GitHub's machines and pushes them to GHCR as `ghcr.io/utfpr-oficinas-2/crossliseu-{api,web}`, tagged `latest` and with the commit SHA.
3. It SSHes into the VPS. There it updates the repo (so `compose.prod.yml` and the NGINX files stay in sync), pulls the new images, runs migrations and restarts the containers.

Because the VPS no longer builds anything, it keeps all its CPU and RAM for running the app.

### 2.1 A dedicated deploy user on the VPS

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo chown -R deploy: /opt/crossliseu

# Key pair used ONLY by GitHub Actions
sudo -u deploy ssh-keygen -t ed25519 -N "" -f /home/deploy/.ssh/github_actions -C "github-actions"
sudo -u deploy sh -c 'cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
sudo cat /home/deploy/.ssh/github_actions     # copy this PRIVATE key for the next step
```

### 2.2 GitHub secrets

In the repo, go to **Settings → Environments → New environment** and name it `production`. Add these secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | the VPS IP |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | the full private key printed above, including the `BEGIN`/`END` lines |
| `VPS_PORT` | *(optional)* only if SSH isn't on port 22 |

After that, delete the private key from the VPS: `sudo rm /home/deploy/.ssh/github_actions`. Keep the `.pub` file.

### 2.3 Let the VPS pull images from GHCR

After the first successful run of the **Deploy** workflow, the two packages show up under the organization's **Packages** tab. Pick one of these:

* **Public images (simplest).** Open each package, go to **Package settings → Change visibility → Public**. The code is already public, so nothing new is exposed.
* **Private images.** Create a GitHub *classic* token with only `read:packages`, then on the VPS run:
  `sudo -u deploy docker login ghcr.io -u <your-github-user>`, pasting the token as the password.

> Pushing packages to the `UTFPR-Oficinas-2` org needs an org owner to allow it. Check under **Org Settings → Packages** and **Org Settings → Actions → Workflow permissions**. If the first run fails at "Build & push", that's the likely cause.

### 2.4 Rolling back

Every image is also tagged with its commit SHA:

```bash
cd /opt/crossliseu
IMAGE_TAG=<old commit sha> docker compose -f compose.prod.yml up -d api web
```

You can also re-run an older Deploy run from the Actions tab.

---

## Stage 3: Only passing code reaches `main`

`.github/workflows/ci.yml` runs on every pull request to `main`:

| Check name | What it does |
| --- | --- |
| `API` | `npm ci`, oxlint, `nest build`, vitest |
| `Web` | `npm ci`, `vue-tsc` type-check, oxlint + eslint (no `--fix`), vitest, production build |
| `Docker build (api)` / `Docker build (web)` | Builds the production images (catches Dockerfile breakage) |

To make the checks **required**:

1. Open a PR with these files first, so each check has run at least once. GitHub only lists checks it has already seen.
2. Go to **Settings → Rules → Rulesets → New branch ruleset**.
   * Name: `protect main`. Enforcement: **Active**. Target: **Include default branch**.
   * Enable **Restrict deletions** and **Block force pushes**.
   * Enable **Require a pull request before merging**. Approvals can be 0 or 1, whatever the team prefers.
   * Enable **Require status checks to pass** and add `API`, `Web`, `Docker build (api)` and `Docker build (web)`. Also tick **Require branches to be up to date before merging**.
3. Save. From now on nobody can push straight to `main`, and the merge button stays grey until the checks are green. Each merge then triggers Stage 2.

---

## Known gaps / next steps

* **API e2e test** (`apps/api/test/app.e2e-spec.ts`) still expects the starter `GET / → "Hello World!"` and needs a database, so CI doesn't run it yet. Once it's fixed, add a Postgres service to the `API` job and run `npm run test:e2e`.
* **API URL in the frontend:** call the API with the relative path `/crossliseu/api/...`, for example `const API = import.meta.env.VITE_API_URL ?? '/crossliseu/api'`. In local dev, a Vite `server.proxy` can map the same path to `localhost:3000`.
* **Cookies:** all projects share the `ediasv.dev` origin. If auth uses cookies, set `Path=/crossliseu` and a project-specific cookie name.
* **Admin seed:** `npm run seed:admin` runs from TypeScript sources with ts-node, which aren't in the production image. Either compile the seed into `dist/`, or run it once from a dev container pointed at the prod database.
* **R2 CORS:** allow the origin `https://ediasv.dev` on the bucket.
* **Backups:** add a daily `pg_dump` cron job, for example
  `docker compose -f compose.prod.yml exec -T postgres pg_dump -U crossliseu crossliseu | gzip > ~/backups/crossliseu-$(date +%F).sql.gz`.
* **RabbitMQ and the CV worker** will become two more services in `compose.prod.yml`. Neither needs NGINX routes. Give the worker `cpus`/`mem_limit` so video analysis can't starve live matches.

## Adding another project to ediasv.dev

1. Run its containers bound to `127.0.0.1:80X0` (and further ports as needed).
2. Create `/etc/nginx/snippets/ediasv.dev/<project>.conf` with `location /<project>/ { proxy_pass http://127.0.0.1:80X0/; ... }`, using `crossliseu.conf` as a template.
3. Run `sudo nginx -t && sudo systemctl reload nginx`. No new certificate is needed, because the domain is the same.

For a **different domain** (or a subdomain like `blog.ediasv.dev`), add a DNS record. Then create a new file in `sites-available/` with its own `server_name`, link it into `sites-enabled/`, and run `sudo certbot --nginx -d that.domain`.
