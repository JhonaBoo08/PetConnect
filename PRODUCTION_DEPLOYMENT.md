# PetConnect production deployment

PetConnect keeps local development and production deliberately separate. `npm run dev` continues to use the Firebase Auth emulator, local MySQL, Expo development routing, and local uploads. Production uses explicit HTTPS endpoints, a real Firebase project, production MySQL credentials, stable recovery secrets, durable media storage, and release checks.

The tracked files under `deploy/` are templates only. Real credentials belong in ignored files or `/etc/petconnect`, never in Git.

## 1. Supported deployment shapes

### Single Ubuntu server

This is the simplest complete deployment:

- Caddy serves the exported web app and terminates HTTPS.
- The Node API listens only on port 3000 behind Caddy.
- MySQL 8 runs on the same server and the API connects through the local Unix socket.
- Pet/finder media uses `/var/lib/petconnect/uploads`.
- systemd runs the API and a scheduled backup job.

This avoids exposing MySQL to the network and keeps all current PetConnect functionality.

### Split / ephemeral application hosting

PetConnect also supports a separate static frontend, API host, managed MySQL, and Cloudinary media storage.

For this shape:

- remote MySQL must use verified TLS with a CA;
- the API host must have stable production secrets;
- `UPLOAD_STORAGE_PROVIDER=cloudinary` is required when application disk is ephemeral;
- database backups do **not** by themselves back up Cloudinary assets, so configure a provider-side media backup/export policy as well.

The application feature set is the same in both shapes.

## 2. Server prerequisites

For the single-server path provide:

- Ubuntu LTS
- a public domain/subdomain
- Node.js 22+
- MySQL 8 plus the `mysql` and `mysqldump` CLIs
- Caddy
- Git
- durable space for `/var/lib/petconnect/uploads`
- durable space for `/var/lib/petconnect/backups`
- a protected off-host backup destination

Do not expose MySQL port 3306 or API port 3000 publicly. Only ports 80/443 should be Internet-facing.

## 3. Create the service account and install source

```bash
sudo useradd --system --user-group --home-dir /var/lib/petconnect --shell /usr/sbin/nologin petconnect
sudo install -d -m 0755 /opt/petconnect /var/lib/petconnect
sudo install -d -o petconnect -g petconnect -m 0750 /var/lib/petconnect/uploads
sudo install -d -o root -g root -m 0700 /var/lib/petconnect/backups
sudo install -d -o root -g petconnect -m 0750 /etc/petconnect
sudo chown "$USER":"$USER" /opt/petconnect

git clone <YOUR_REPOSITORY_URL> /opt/petconnect
cd /opt/petconnect

npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
npm run build:backend
```

Source may stay owned by the deploy user. The `petconnect` runtime user only needs read/execute access to the application plus write access to the durable upload directory.

## 4. MySQL users and connection

Create two database users:

- `petconnect_app`: runtime privileges only, normally `SELECT, INSERT, UPDATE, DELETE`;
- `petconnect_migrator`: schema/migration privileges, used only by deployment and backup/restore tooling.

Use long random passwords and never place them in source control.

For MySQL on the **same server**, use:

```env
MYSQL_SOCKET_PATH=/var/run/mysqld/mysqld.sock
MYSQL_SSL=false
```

The socket stays local to the machine and is not a network connection.

For **remote/managed MySQL**, do not configure `MYSQL_SOCKET_PATH`. Use:

```env
MYSQL_HOST=<DATABASE_HOSTNAME>
MYSQL_PORT=3306
MYSQL_SSL=true
MYSQL_SSL_CA_PATH=/etc/petconnect/mysql-ca.pem
```

Remote production MySQL is rejected unless peer-verified TLS is enabled. The CA can also be supplied with `MYSQL_SSL_CA`.

Create the production database with `utf8mb4`.

## 5. Firebase production project

Create an operator-owned Firebase project and:

1. enable Email/Password Authentication;
2. create a Web app and record its public Web SDK configuration;
3. provision Firebase Admin service-account credentials for the API;
4. add the deployed web hostname to Firebase Authorized domains.

Store the Admin JSON outside the repository:

```text
/etc/petconnect/firebase-admin.json
```

Never place Admin JSON/private keys in `EXPO_PUBLIC_*` variables.

## 6. Create deployment configuration

Use the tracked templates as starting points:

```bash
cd /opt/petconnect
sudo cp deploy/api.env.example /etc/petconnect/api.env
sudo cp deploy/db-maintenance.env.example /etc/petconnect/db-maintenance.env
sudo cp deploy/frontend.env.example /etc/petconnect/frontend.env
```

Edit every placeholder. Generate independent random values for the recovery/finder secrets; for example:

```bash
openssl rand -base64 48
```

Do not reuse the same secret for multiple settings.

### API requirements

The API configuration must include:

- `NODE_ENV=production`;
- production MySQL runtime credentials;
- either a local `MYSQL_SOCKET_PATH` or verified TLS for remote MySQL;
- the real Firebase project and Admin credentials;
- exact HTTPS `CORS_ALLOWED_ORIGINS`;
- an HTTPS `PUBLIC_APP_BASE_URL` that is also present in `CORS_ALLOWED_ORIGINS`;
- stable recovery/finder secrets;
- a real finder OTP provider;
- durable upload configuration;
- correct proxy-hop configuration.

For the tracked single-server template, local durable media is:

```env
UPLOAD_STORAGE_PROVIDER=local
UPLOAD_LOCAL_DURABLE=true
UPLOAD_DIR=/var/lib/petconnect/uploads
```

For an ephemeral application server, use the Cloudinary block in `deploy/api.env.example` instead.

Do not set `FIREBASE_AUTH_EMULATOR_HOST` in production.

### Finder SMS verification

Production supports either:

- `FINDER_OTP_PROVIDER=webhook` with an HTTPS webhook; or
- `FINDER_OTP_PROVIDER=smsgate` with SMS Gateway credentials.

The console provider and exposed OTP codes are rejected in production.

### File permissions

```bash
sudo chown root:petconnect   /etc/petconnect/api.env   /etc/petconnect/firebase-admin.json
sudo chmod 0640   /etc/petconnect/api.env   /etc/petconnect/firebase-admin.json

sudo chown root:root /etc/petconnect/db-maintenance.env
sudo chmod 0600 /etc/petconnect/db-maintenance.env

# Frontend values are public bundle configuration, not server secrets.
sudo chown root:root /etc/petconnect/frontend.env
sudo chmod 0644 /etc/petconnect/frontend.env

sudo -u petconnect test -r /etc/petconnect/firebase-admin.json
sudo -u petconnect test -w /var/lib/petconnect/uploads
```

If remote MySQL uses `MYSQL_SSL_CA_PATH`, make that CA file readable by the API runtime and migration process without making any private client key public.

## 7. Run deployment preflight

First run the source-only deployment safety check:

```bash
cd /opt/petconnect
npm run test:production-readiness
```

Then validate the real production configuration **without printing secret values**:

```bash
sudo -u petconnect /usr/bin/npm run production:preflight --   --api-env /etc/petconnect/api.env   --frontend-env /etc/petconnect/frontend.env
```

After the database schema exists, run the connectivity probe:

```bash
sudo -u petconnect /usr/bin/npm run production:probe --   --api-env /etc/petconnect/api.env   --frontend-env /etc/petconnect/frontend.env
```

The probe checks production configuration, Firebase project consistency between frontend/backend, local media permissions when applicable, MySQL connectivity, and critical schema tables.

## 8. Bootstrap or migrate the database

First deployment:

```bash
cd /opt/petconnect
sudo bash -c 'set -a; . /etc/petconnect/db-maintenance.env; set +a; npm run db:bootstrap; npm run db:status'
```

Existing production database:

```bash
cd /opt/petconnect
sudo bash -c 'set -a; . /etc/petconnect/db-maintenance.env; set +a; npm run db:backup; npm run db:migrate; npm run db:status'
```

Migrations are checksum tracked. Never edit a migration that may already have run in production.

## 9. Build the production web app

Do not use the development Expo environment for a production export.

```bash
cd /opt/petconnect
npm run web:export:production -- /etc/petconnect/frontend.env
test -f frontend/dist/index.html
```

The production exporter rejects emulator values, localhost/private API addresses, incomplete Firebase configuration, and server-side secrets.

Rebuild whenever an `EXPO_PUBLIC_*` value changes.

## 10. Install the API systemd service

Use the tracked hardened unit:

```bash
sudo cp /opt/petconnect/deploy/petconnect.service /etc/systemd/system/petconnect.service
sudo systemctl daemon-reload
sudo systemctl enable --now petconnect.service
```

Check it locally:

```bash
sudo systemctl status petconnect.service
curl -fsS http://127.0.0.1:3000/v1/health
curl -fsS http://127.0.0.1:3000/v1/ready
```

`/v1/ready` checks the database and, when local media storage is selected, read/write access to the durable upload directory.

## 11. Install HTTPS/static hosting

For the single-server path, start from `deploy/Caddyfile.example`:

```bash
sudo cp /opt/petconnect/deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo editor /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Replace `pets.example.com` first.

The template preserves camera/location-capable web behavior while adding HTTPS, HSTS, safe referrer/content-type headers, immutable Expo asset caching, API proxying, and SPA route fallback.

## 12. Backups

### Local media storage

`db:backup` creates one integrity-manifested backup set containing:

- a MySQL dump;
- local uploaded media;
- migration checksums;
- hashes/sizes for backed-up files.

The tracked timer uses `BACKUP_ROOT=/var/lib/petconnect/backups`, briefly stops the API for an application-consistent database/media backup, and restarts it even if the backup command fails.

Install it:

```bash
sudo cp deploy/petconnect-backup.service /etc/systemd/system/
sudo cp deploy/petconnect-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now petconnect-backup.timer
sudo systemctl list-timers petconnect-backup.timer
```

Test one backup before relying on the timer:

```bash
sudo systemctl start petconnect-backup.service
sudo journalctl -u petconnect-backup.service --since "10 minutes ago"
sudo systemctl status petconnect.service
```

Copy completed backup sets to protected storage **outside this server**. A backup on the same VM is not disaster recovery.

Periodically restore into a disposable database and separate upload directory.

### Cloudinary media storage

The PetConnect database backup preserves Cloudinary references, but `db:backup` does not download every remote Cloudinary asset. When Cloudinary is used, configure a Cloudinary/provider-side asset backup/export/retention strategy in addition to PetConnect database backups.

## 13. CI and release gate

Before production rollout, the target commit should pass:

```bash
npm run release:verify
```

This covers dependency policy, TypeScript/build checks, linting, frontend tests, source deployment safety, Expo Doctor, browser E2E, Android/iOS source exports, and the isolated backend suite.

Do not point the test suite at production data.

## 14. Updating production

Before an update:

1. verify the target commit passed CI;
2. create and copy an off-host backup;
3. record the currently deployed Git commit.

Then:

```bash
cd /opt/petconnect
git pull --ff-only

npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
npm run build:backend

sudo -u petconnect /usr/bin/npm run production:preflight --   --api-env /etc/petconnect/api.env   --frontend-env /etc/petconnect/frontend.env

npm run web:export:production -- /etc/petconnect/frontend.env

sudo bash -c 'set -a; . /etc/petconnect/db-maintenance.env; set +a; cd /opt/petconnect; npm run db:migrate; npm run db:status'

sudo systemctl restart petconnect.service
```

Then run the public smoke test:

```bash
npm run production:smoke --   --web-url https://pets.example.com   --api-url https://pets.example.com
```

For split hosting, pass the separate HTTPS API origin to `--api-url`.

For a code rollback, checkout the previously recorded tested commit, reinstall/build, and restart. Do not casually reverse database migrations; use a validated backup when a data/schema rollback is actually required.

## 15. Production monitoring

Monitor:

- `systemctl status petconnect`;
- `journalctl -u petconnect`;
- `/v1/health` and `/v1/ready`;
- MySQL availability and storage;
- upload/media storage availability;
- disk usage;
- backup timer/service success;
- off-host backup copies;
- TLS/domain renewal;
- notification and push failures.

PetConnect logs structured request/error events and redacts recovery tokens and sensitive finder query values. Never copy passwords, Firebase Admin JSON, recovery/finder secrets, access tokens, private keys, or real user records into logs/issues/chats.

## 16. Native Android/iOS production

Real store distribution still requires operator-owned external configuration:

- Expo/EAS project and `EXPO_PUBLIC_EAS_PROJECT_ID`;
- production `EXPO_PUBLIC_*` values in the EAS production environment;
- Android/iOS signing credentials;
- FCM for Android remote push;
- APNs for iOS remote push;
- Google Play / App Store Connect accounts.

Before store release, test signed builds on physical devices for:

- sign-in/session persistence/password reset;
- camera and QR scanning;
- image picker/camera uploads;
- foreground location;
- public recovery links;
- lost/sighting/reunion workflows;
- notification delivery;
- clinic workflows.

Source export success alone is not proof that store signing or remote push is configured.

## 17. Final acceptance

Before real user data is allowed, verify with dedicated test accounts:

- owner create/sign-in/sign-out/password reset/session persistence;
- multiple pets with correct per-pet edit/ID/health/recovery actions;
- recovery tag creation, scan, replacement, lost/revoke behavior and short-code fallback;
- app-less finder recovery in a normal mobile browser;
- no-tag nearby matching and sightings;
- privacy settings and microchip privacy;
- lost report → sighting → notification → reunited;
- clinic role/authorization and health workflows;
- uploads and media cleanup;
- finder SMS verification through the real provider;
- backup creation and a restore drill;
- HTTPS, CORS, health/readiness and structured logs;
- signed native builds and push if native distribution is part of launch.

Stop rollout and fix any applicable failed check before using production data.
