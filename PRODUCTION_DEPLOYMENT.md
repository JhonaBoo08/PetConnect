# PetConnect: free web deployment and ZIP handoff

This guide takes the **whole project** from a ZIP to a new GitHub repository and a public HTTPS website with real Firebase Authentication, MySQL data, the Express API, and persistent pet photos. Follow the steps in order. Replace every `YOUR_...` placeholder. Commands labelled **Windows PowerShell** run on the recipient's computer; commands labelled **VM Ubuntu shell** run after SSH into the server.

**Scope and cost:** This is a small web deployment on one Oracle Cloud **Always Free** Ampere VM (Ubuntu, MySQL 8, API, static Expo web, photos), Firebase **Spark** for email/password, a free DuckDNS subdomain, and Caddy HTTPS. The website, signed QR recovery pages, browser camera/GPS (with permission), owner/clinic workflows, and in-app alerts can be used without paying for hosting within these services' current free limits. **Native App Store/Play Store release and background phone push are separate and are not part of this free web route.** The web app explicitly disables Expo remote push; in-app alerts still work. Maps on web use the project's web recovery-map view.

As checked on 2026-09-28, the Oracle Always Free A1 allowance is 2 OCPUs and 12 GB RAM in the home region; Firebase Spark email/password is limited to 3,000 daily active users, with 150 password-reset emails per day. Oracle may have no free Ampere capacity in the chosen home region, may reclaim an idle Always Free VM, and requires a payment card for most signups. A $0 deployment therefore **cannot be guaranteed** for every recipient or guaranteed to stay available. Do not choose a paid shape, database, load balancer, domain, or billing upgrade to complete this guide. If no free Ampere VM is available, pause and try another availability domain or later. Never use trial credits for a resource you expect to remain free.

## 1. Sender: make the ZIP

From the current project root on Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\make-handoff.ps1
```

The command prints the ZIP path and file count. It includes the current tracked **and untracked source** (important because much of this project is not yet committed), but excludes dependencies, local `.env` files, service-account files, Git history, local databases, uploads, backups, test logs, and build output. It lists excluded paths. **Open `HANDOFF_MANIFEST.txt` inside the ZIP and review its files before sending.** Do not send a manual ZIP of the whole working folder.

Before sending, open a copy of the ZIP and confirm it contains `README.md`, `HANDOFF_SETUP.md`, `PRODUCTION_DEPLOYMENT.md`, `package-lock.json`, `backend/api/package-lock.json`, `frontend/package-lock.json`, `sql/schema.sql`, `sql/migrations/`, `.github/workflows/backend.yml`, and all `backend/api/src/` and `frontend/src/` source. Confirm it contains **no** `.env` except `.env.example`, `node_modules`, `uploads`, `backups`, `.git`, private key, or `.relai-*` test artifact. This ZIP is source code only; the recipient creates new accounts and new data.

## 2. Recipient: import into your own GitHub repository

Install Git and Node.js **22.13+** on your computer. Extract the ZIP to a folder named `PetConnect`. In that folder, open Windows PowerShell:

```powershell
git init
git branch -M main
git status --short
git check-ignore backend/api/.env frontend/.env.local
```

The two `git check-ignore` paths should print both paths. Create an **empty** GitHub repository (do not add a README, license, or `.gitignore` in the GitHub form). In the local folder:

```powershell
git add .
git status --short
git diff --cached --name-only
git commit -m "Import PetConnect source"
git remote add origin https://github.com/YOUR_GITHUB_USER/YOUR_REPO.git
git push -u origin main
```

Before `git commit`, inspect the staged paths: no real `.env`, account JSON, ZIP, uploads, backups, or local artifacts. If you see one, run `git restore --staged -- "PATH"` and remove it from the source folder; do not push it. GitHub login may open in your browser or require a credential manager. The recipient owns this new repository. Keep it **private** until the source ZIP has been reviewed; for the simplest VM clone, make the reviewed source repository public. A private repository can instead use a read-only deploy key as shown below. GitHub Actions in `.github/workflows/backend.yml` runs after the first push; check the **Actions** tab. CI failing means investigate before launch.

The backend must be deployed from the **whole repository**, since it imports `shared/` and `sql/`. Do not create a repo from only `frontend/` or `backend/api/`.

## 3. Recipient: local check before hosting

Install MySQL 8 and Java 21 on the development computer if you want the complete integration test. Use a disposable local database. From the extracted repo:

```powershell
npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
Copy-Item backend/api/.env.example backend/api/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Edit `backend/api/.env` for local MySQL. The template uses the local Firebase Auth emulator. Start MySQL, then run:

```powershell
npm run db:bootstrap
npm run db:status
npm run release:static
```

For the full local backend suite, first create a **disposable** `petconnect_test` database, then run `npm run test:backend`. These tests truncate test tables; never aim them at production. To view the local app, run `npm run emulators`, `npm --prefix backend/api run dev`, and `npm run web` in three terminals. More local detail is in `HANDOFF_SETUP.md`.

**Do not copy these local `.env` files to the server.** The production Firebase project, password, hostname, and secret are different.

## 4. Create the four free accounts/resources

1. **Oracle Cloud Free Tier:** choose the home region carefully. Create an Ubuntu **24.04 ARM64** instance in a public subnet with an internet gateway in that home region, with shape `VM.Standard.A1.Flex`, **2 OCPUs, 12 GB RAM**, and a **50 GB boot volume**. Check that the shape/image/volume are labelled **Always Free eligible** before creating. Assign a public IPv4 address; download and keep the SSH private key. Do not add a paid boot volume or load balancer.
2. **DuckDNS:** sign in at [duckdns.org](https://www.duckdns.org/), add a free subdomain, and point its IPv4 address to the VM's public IPv4. Write down `YOUR_NAME.duckdns.org`. If the VM's public IP changes, update DuckDNS before testing. You do not need to put the DuckDNS account token on the server for this manual setup.
3. **Firebase:** create a project on **Spark (no cost)**, enable **Authentication → Sign-in method → Email/Password**, and register a **Web app** under Project settings. Copy the Web SDK `apiKey`, `projectId`, `authDomain`, and `appId`. Under Authentication → Settings → Authorized domains, add `YOUR_NAME.duckdns.org`. Under Project settings → Service accounts, generate one Admin SDK private-key JSON and save it on your computer **outside this repo**. Keep Spark; do not enable SMS/phone authentication or paid Identity Platform features.
4. **GitHub:** the repository from step 2 is the server's deployment source. A public source repo can be cloned over HTTPS without credentials. For a private repo, use a **dedicated read-only deploy key** as shown below; do not put a personal access token in a clone URL.

Firebase Web SDK settings are **public configuration** embedded at build time. The **Admin SDK JSON is private** and must never be committed, pasted into AI, or put in `EXPO_PUBLIC_*`.

## 5. VM network and software

In OCI, on the VM's VCN security list/NSG, permit TCP **80 and 443** from `0.0.0.0/0` and TCP **22 only from your current public IP/32**. Do **not** expose 3000 (API) or 3306 (MySQL). From Windows PowerShell, SSH using the downloaded key (use the real key path and public IP):

```powershell
ssh -i C:\PATH\TO\YOUR_OCI_KEY.key ubuntu@YOUR_VM_PUBLIC_IP
```

All commands below run in this **VM Ubuntu shell**. Some OCI Ubuntu images also have an OS firewall; if the site times out even with ingress rules, permit 80/443 on the VM:

```bash
# These rules are for the default OCI iptables image.
sudo apt-get update
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

 Install MySQL, Git, and Node 22 from NodeSource's documented package repository:

```bash
sudo apt-get update
sudo apt-get install -y mysql-server git curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt-get install -y nodejs
node --version
npm --version
mysql --version
sudo systemctl enable --now mysql
```

`node --version` must be 22.13 or newer; `mysql --version` must be MySQL 8.x. If Ubuntu resolves a different database package, stop and install a real MySQL 8 server before proceeding.

Install Caddy with its official Ubuntu package steps:

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

## 6. Database and source on the VM

Generate three different random hex strings and save them privately: one runtime MySQL password, one migration/backup MySQL password, and one recovery signing secret. The recovery secret must stay the **same across future deployments**, or existing pet QR tags stop working.

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Replace the two database password placeholders below with the **first two** generated values. The SQL is run once in the VM shell; avoid copying passwords into screenshots or chat.

```bash
sudo mysql
```

At the `mysql>` prompt:

```sql
CREATE DATABASE IF NOT EXISTS petconnect_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'petconnect_app'@'127.0.0.1' IDENTIFIED BY 'YOUR_RUNTIME_MYSQL_HEX_PASSWORD';
CREATE USER 'petconnect_migrate'@'127.0.0.1' IDENTIFIED BY 'YOUR_MIGRATION_MYSQL_HEX_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON petconnect_db.* TO 'petconnect_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON petconnect_db.* TO 'petconnect_migrate'@'127.0.0.1';
EXIT;
```

The runtime API uses the restricted `petconnect_app` account. Schema migration, backup, and restore commands use the separate `petconnect_migrate` account whose credentials are kept in a root-only file and are never exposed to the systemd API process. Both use `127.0.0.1` over TCP; MySQL stays local to the VM. Prepare directories:

```bash
sudo useradd --system --home-dir /var/lib/petconnect --no-create-home --shell /usr/sbin/nologin petconnect
sudo mkdir -p /opt/petconnect /var/lib/petconnect/uploads /var/lib/petconnect/backups /etc/petconnect
sudo chown ubuntu:ubuntu /opt/petconnect
sudo chown -R petconnect:petconnect /var/lib/petconnect
sudo chmod 750 /var/lib/petconnect /var/lib/petconnect/uploads /var/lib/petconnect/backups
```

**Public repository:** clone the new GitHub repository:

```bash
git clone https://github.com/YOUR_GITHUB_USER/YOUR_REPO.git /opt/petconnect
```

**Private repository instead:** on the VM run `ssh-keygen -t ed25519 -f /home/ubuntu/.ssh/petconnect_deploy -N ""` and `cat /home/ubuntu/.ssh/petconnect_deploy.pub`. In the new GitHub repo, go to **Settings → Deploy keys → Add deploy key**, paste that public key, and leave write access **unchecked**. Then clone:

```bash
GIT_SSH_COMMAND='ssh -i /home/ubuntu/.ssh/petconnect_deploy -o IdentitiesOnly=yes' git clone git@github.com:YOUR_GITHUB_USER/YOUR_REPO.git /opt/petconnect
git -C /opt/petconnect config core.sshCommand 'ssh -i /home/ubuntu/.ssh/petconnect_deploy -o IdentitiesOnly=yes'
```

Check [GitHub's published SSH host fingerprint](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) before accepting the first host-key prompt. Use **one** of the two clone paths, then install and build:

```bash
cd /opt/petconnect
npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
npm --prefix backend/api run build
```

If `git clone` says the directory is not empty, check `/opt/petconnect` and remove only accidental files you just made there; do not delete a prior deployment or user data.

## 7. Production environment and Firebase Admin credential

On **Windows PowerShell**, transfer the Admin JSON outside Git:

```powershell
scp -i C:\PATH\TO\YOUR_OCI_KEY.key C:\PATH\TO\FIREBASE_ADMIN.json ubuntu@YOUR_VM_PUBLIC_IP:/home/ubuntu/firebase-admin.json
```

On the **VM Ubuntu shell**:

```bash
sudo install -o root -g petconnect -m 0640 /home/ubuntu/firebase-admin.json /etc/petconnect/firebase-admin.json
rm /home/ubuntu/firebase-admin.json
sudo install -o root -g petconnect -m 0640 /dev/null /etc/petconnect/api.env
sudo install -o root -g root -m 0600 /dev/null /etc/petconnect/db-maintenance.env
sudo nano /etc/petconnect/api.env
```

Paste this into `/etc/petconnect/api.env`, replacing placeholders. Use the **first** random string for `MYSQL_PASSWORD` and the **third** for `RECOVERY_TOKEN_SECRET`. Use the Web SDK project ID for `FIREBASE_PROJECT_ID`. This file is read by systemd and is **not** in Git.

```env
NODE_ENV=production
PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=petconnect_app
MYSQL_PASSWORD=YOUR_RUNTIME_MYSQL_HEX_PASSWORD
MYSQL_DATABASE=petconnect_db
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
GOOGLE_APPLICATION_CREDENTIALS=/etc/petconnect/firebase-admin.json
CORS_ALLOWED_ORIGINS=https://YOUR_NAME.duckdns.org
PUBLIC_APP_BASE_URL=https://YOUR_NAME.duckdns.org
RECOVERY_TOKEN_SECRET=YOUR_OTHER_LONG_HEX_SECRET
UPLOAD_DIR=/var/lib/petconnect/uploads
TRUST_PROXY_HOPS=1
JSON_BODY_LIMIT=256kb
NOTIFICATION_WORKER_INTERVAL_MS=60000
```

Now put the migration credentials in the root-only maintenance file:

```bash
sudo nano /etc/petconnect/db-maintenance.env
```

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=petconnect_migrate
MYSQL_PASSWORD=YOUR_MIGRATION_MYSQL_HEX_PASSWORD
MYSQL_DATABASE=petconnect_db
NODE_ENV=production
UPLOAD_DIR=/var/lib/petconnect/uploads
```

**Do not set** `FIREBASE_AUTH_EMULATOR_HOST` or `FIREBASE_SERVICE_ACCOUNT_JSON` on this VM. Keep the env syntax plain `KEY=value` without spaces or comments on the same line. Check permissions:

```bash
sudo chmod 640 /etc/petconnect/api.env /etc/petconnect/firebase-admin.json
sudo chmod 600 /etc/petconnect/db-maintenance.env
sudo -u petconnect test -r /etc/petconnect/api.env
sudo -u petconnect test -r /etc/petconnect/firebase-admin.json
test "$(stat -c %a /etc/petconnect/db-maintenance.env)" = "600"
if sudo -u petconnect test -r /etc/petconnect/db-maintenance.env; then
  echo "ERROR: runtime service can read database maintenance credentials" >&2
  exit 1
fi
```

Create the frontend build env. It contains **only the public Web SDK config**, never MySQL or Admin keys:

```bash
nano /opt/petconnect/frontend/.env.local
```

Paste and fill:

```env
EXPO_PUBLIC_FIREBASE_ENV=production
EXPO_PUBLIC_API_BASE_URL=https://YOUR_NAME.duckdns.org
EXPO_PUBLIC_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_API_KEY=YOUR_WEB_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
EXPO_PUBLIC_FIREBASE_APP_ID=YOUR_WEB_APP_ID
```

Use Firebase's **exact** `authDomain` from Web app settings; it need not equal your DuckDNS hostname. The frontend file is ignored by Git. Export the website:

```bash
cd /opt/petconnect
npm run web:export
test -f frontend/dist/index.html
test -f frontend/dist/recover.html
```

If `recover.html` has another generated form under `frontend/dist`, inspect that folder and update the Caddy rewrite in the next step accordingly. Do not launch a missing recovery page.

## 8. Start the API and public HTTPS website

On the VM, create the API's systemd unit:

```bash
sudo nano /etc/systemd/system/petconnect.service
```

Paste:

```ini
[Unit]
Description=PetConnect API
Wants=network-online.target
After=network-online.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=petconnect
Group=petconnect
WorkingDirectory=/opt/petconnect/backend/api
EnvironmentFile=/etc/petconnect/api.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Before the first start, bootstrap/migrate the database using the root-only maintenance credentials. The runtime service itself never receives DDL credentials:

```bash
sudo bash -c 'set -a; . /etc/petconnect/db-maintenance.env; set +a; cd /opt/petconnect; npm run db:bootstrap; npm run db:status'
```

Then enable and test the API. `npm start` now starts Express only; it does **not** perform schema changes:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now petconnect
sudo systemctl status petconnect --no-pager
curl -fsS http://127.0.0.1:3000/v1/ready
```

If the service fails, run `sudo journalctl -u petconnect -n 100 --no-pager`. Correct the first actual error; do not create a second database or replace the signing secret to mask it.

Put this in `/etc/caddy/Caddyfile` with your actual DuckDNS domain:

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddyfile
YOUR_NAME.duckdns.org {
    encode gzip
    @api path /v1/* /uploads/*
    handle @api {
        reverse_proxy 127.0.0.1:3000
    }
    handle {
        root * /opt/petconnect/frontend/dist
        try_files {path} {path}.html {path}/index.html /index.html
        file_server
    }
}
```

Apply and verify HTTPS (Caddy gets a public certificate when DNS and ports 80/443 work):

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
curl -fsS https://YOUR_NAME.duckdns.org/v1/health
curl -fsS https://YOUR_NAME.duckdns.org/v1/ready
curl -I https://YOUR_NAME.duckdns.org/
curl -I https://YOUR_NAME.duckdns.org/recover
```

Both API endpoints must be HTTP 200; `/` and `/recover` must serve a real page over valid HTTPS. If HTTPS fails, check the DuckDNS IP, OCI 80/443 ingress, VM firewall, and `sudo journalctl -u caddy -n 100 --no-pager`. If you get a 502, check the API service and local `/v1/ready`. Never expose 3000 or 3306 just to solve a 502.

## 9. Real user acceptance test — do not skip

Use a real browser at `https://YOUR_NAME.duckdns.org`. Use **test accounts and a test pet** first.

- Create an owner account; sign out, sign in, refresh the browser, and request a password-reset email. Complete the reset using Firebase's email link and sign in with the new password.
- Add a pet, edit it, upload a JPEG/PNG/WebP photo, verify dashboard/profile count and pet profile, then refresh and verify MySQL persistence. Test delete on a **separate** pet.
- Generate a Pet ID QR. Open its link in a private browser/second phone **without signing in**. Check it opens `/recover?token=...`, hides private health data, and follows privacy settings. Rotate the QR and confirm the old link fails and the new one works. Do this **before printing tags**.
- Mark a pet lost with location permission, check the nearby/public view, submit a finder sighting from an unsigned browser, check the owner's Updates feed, and mark it reunited. Browser camera/GPS require HTTPS and user permission; test on the actual intended phone/browser.
- Provision a **test clinic** if clinics are part of this launch. In Firebase Console → Authentication → Users, add a clinic user with email and a temporary password and copy its UID. On the VM create `/home/ubuntu/clinic-input.json` with that same UID/email and `clinicId`, `name`, `address`, `phone`. Do not store it in Git. Install the file for the service user and run:
  ```bash
  sudo install -o root -g petconnect -m 0640 /home/ubuntu/clinic-input.json /etc/petconnect/clinic-input.json
  sudo -u petconnect bash -c 'set -a; . /etc/petconnect/api.env; set +a; cd /opt/petconnect/backend/api; npm run operator -- provision-clinic YOUR_FIREBASE_PROJECT_ID setup-admin /etc/petconnect/clinic-input.json'
  sudo rm /etc/petconnect/clinic-input.json /home/ubuntu/clinic-input.json
  ```
  Sign in as the clinic user and scan the QR **before** the owner creates an appointment: the clinic may identify the pet, but clinical history/actions must be locked. Then request the appointment from the owner account, refresh the clinic patient view, add a health record/vaccination, schedule the requested appointment, and check the owner sees the record/reminder. The operator command sets the clinic role; ordinary Create Account remains owner-only.

Stop the rollout if any applicable check fails. Web **in-app** alerts are supported; background **Expo push** on an installed mobile binary is outside this route. A browser can be used on a phone without publishing a store app.

## 10. Backups, updates, and ownership

The app stores pet rows in MySQL and photo bytes under `/var/lib/petconnect/uploads`; **both** must be backed up as one set. At least weekly and **before each update**, briefly stop API writes on the VM, back up, then start it again **even if backup failed**:

```bash
sudo systemctl stop petconnect
sudo bash -c 'umask 077; set -a; . /etc/petconnect/db-maintenance.env; set +a; cd /opt/petconnect; npm run db:backup -- --output "/var/lib/petconnect/backups/$(date -u +%Y%m%dT%H%M%SZ)"'
sudo systemctl start petconnect
curl -fsS http://127.0.0.1:3000/v1/ready
```

If the backup command failed, do not treat that folder as a valid backup or continue the release. Resolve the failure and repeat.

The command prints the exact backup directory. Make a transfer archive, replacing `YOUR_BACKUP_FOLDER` with that directory's final name:

```bash
sudo tar -czf /home/ubuntu/petconnect-backup.tar.gz -C /var/lib/petconnect/backups YOUR_BACKUP_FOLDER
sudo chown ubuntu:ubuntu /home/ubuntu/petconnect-backup.tar.gz
chmod 600 /home/ubuntu/petconnect-backup.tar.gz
```

On **Windows PowerShell**, copy it to a computer or other storage **outside the VM**:

```powershell
scp -i C:\PATH\TO\YOUR_OCI_KEY.key ubuntu@YOUR_VM_PUBLIC_IP:/home/ubuntu/petconnect-backup.tar.gz C:\PATH\TO\PRIVATE_BACKUPS\
```

Check the local file exists and is nonempty, protect it as sensitive user data, then `rm /home/ubuntu/petconnect-backup.tar.gz` on the VM. Periodically practice a restore on a **separate test installation**, with both a disposable MySQL database and a separate `UPLOAD_DIR`, using `HANDOFF_SETUP.md`'s restore instructions; never test restore against live user data or the production upload folder. A backup left only on an OCI VM is **not** protection against VM loss/reclamation. This manual requires the owner to do the weekly off-host transfer; it does not set up unattended backups.

For a later release, test the new commit in CI and locally, take an off-host backup, then on the VM:

```bash
cd /opt/petconnect
git pull --ff-only
npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
npm --prefix backend/api run build
sudo bash -c 'set -a; . /etc/petconnect/db-maintenance.env; set +a; cd /opt/petconnect; npm run db:migrate; npm run db:status'
npm run web:export
sudo systemctl restart petconnect
curl -fsS https://YOUR_NAME.duckdns.org/v1/ready
```

Keep `/etc/petconnect/`, `/var/lib/petconnect/`, and `frontend/.env.local` outside Git and stable across pulls. Rebuild the web export whenever `EXPO_PUBLIC_*` values change. Recheck the real user flows after each release. If you change the VM or its public IP, update DuckDNS; if you change the site domain, update Firebase Authorized domains, CORS, `PUBLIC_APP_BASE_URL`, and the frontend API URL, then rebuild. Existing QR links contain the old domain.

**Owner checklist:** keep the GitHub, Oracle, DuckDNS, Firebase, and SSH accounts accessible; keep all three generated secrets and the Admin key secure; keep `/etc/petconnect/db-maintenance.env` root-only; renew/rotate credentials if exposed; check `systemctl status`, `journalctl`, `/v1/ready`, disk space, free-tier quota and backups regularly. There is no managed uptime guarantee in this $0 single-VM setup.

## Quick diagnosis

| Symptom | Check |
| --- | --- |
| VM creation says “out of host capacity” | Use another availability domain in the same home region or retry later. Do not select paid resources. |
| HTTPS times out | DuckDNS points to current public IP, OCI 80/443 ingress, VM iptables. |
| Caddy says 502 | `sudo systemctl status petconnect`, `sudo journalctl -u petconnect -n 100 --no-pager`, local `/v1/ready`. |
| `/v1/ready` says 503 | `sudo systemctl status mysql`, `MYSQL_*` values, local DB user privileges. |
| Sign-in fails | Firebase Email/Password enabled, project IDs match, correct Web SDK config, Authorized domain; rebuild web export. |
| QR opens a dead link | `PUBLIC_APP_BASE_URL`, Caddy `/recover`, stable secret, regenerate/rotate test QR after domain change. |
| Photo disappears after restart | `UPLOAD_DIR` points to persistent VM disk, permissions, and photos are included in the off-host backup. |
| Clinic user lands on owner route | Provision with **the same Firebase UID**, then sign out/in for fresh role claims. |

## Optional AI prompts

AI assistance is optional. Paste only **redacted** logs and non-secret settings. Never paste the Admin JSON, MySQL password, recovery secret, SSH key, DuckDNS token, real user information, or backups.

> I have extracted the full PetConnect ZIP into a new GitHub repository. Follow `PRODUCTION_DEPLOYMENT.md` in order for the Oracle Always Free + DuckDNS + Firebase Spark + Caddy free **web** path. Ask me only for non-secret values you need. Give me one command and its expected result at a time. Stop if a service is paid or a command fails. Never put credentials in Git or an `EXPO_PUBLIC_*` variable.

> Diagnose this PetConnect deployment failure from these redacted logs. Name the first failing layer (DNS, HTTPS/Caddy, API, MySQL, Firebase Auth, or web bundle), point to the evidence, give the smallest fix, and give one verification command. Do not suggest a paid service or a rewrite unless the evidence requires it.

## Official references and limits checked 2026-09-28

- [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) and [Free Tier account/capacity](https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm): Ampere 2 OCPU/12 GB equivalent for an Always Free tenancy, 200 GB total free block storage, home-region and capacity conditions, idle-instance reclamation.
- [Firebase Auth no-cost usage](https://firebase.google.com/docs/auth) and [email action limits](https://firebase.google.com/docs/auth/limits): Spark has provider/day and password-reset email limits. [Firebase Admin credentials](https://firebase.google.com/docs/admin/setup).
- [DuckDNS free subdomains](https://www.duckdns.org/about.jsp), [Caddy official Ubuntu install](https://caddyserver.com/docs/install), [Caddy HTTPS requirements](https://caddyserver.com/docs/automatic-https), [Expo static web export](https://docs.expo.dev/router/web/static-rendering/), [NodeSource Node 22 packages](https://github.com/nodesource/distributions/blob/master/DEV_README.md), and [GitHub import](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).

Service limits, policies and UI labels can change. Recheck these linked official pages at setup time.
