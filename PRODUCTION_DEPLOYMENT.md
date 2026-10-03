# PetConnect production deployment

This guide describes a simple single-server web deployment. It is intentionally provider-neutral: a small Ubuntu VM from a provider such as Oracle Cloud, Hetzner, DigitalOcean, AWS, or another host can work. Free tiers and pricing can change; verify the provider's current terms before relying on one.

This guide does not claim that native App Store/Play Store distribution or background push is complete until the operator supplies the external accounts and signing/push credentials described below.

## 1. Infrastructure

Provide:

- Ubuntu LTS server with a public IP
- domain/subdomain pointed to that server
- Node.js 22+
- MySQL 8
- Caddy or another HTTPS reverse proxy
- Git
- durable disk space for `/var/lib/petconnect/uploads`
- an off-host destination for backups

Do not expose MySQL port 3306 or the internal API port 3000 publicly.

## 2. Clone and install

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
npm --prefix backend/api run build
```

Deploy by normal `git clone` / `git pull --ff-only`. Create the service account once; on subsequent deployments confirm it already exists with `id petconnect`. Keep source owned by the deployer and readable/traversable by `petconnect` and the reverse proxy. Only the upload directory needs runtime write access.

## 3. Production MySQL users

Create separate least-privilege runtime and migration users. The runtime service should not receive schema-changing privileges. Use long random passwords and store them outside Git.

Create an empty application database (for example `petconnect_db`) using `utf8mb4`. Use a privileged/migration account only for `db:bootstrap` and future `db:migrate` operations.

## 4. Firebase

Create an operator-owned Firebase project:

1. enable Email/Password Authentication;
2. create a Web app and record its public Web SDK configuration;
3. create/provision Firebase Admin credentials for the server;
4. add the deployed web origin to Firebase Authorized domains.

Store Admin credentials outside the repository, for example `/etc/petconnect/firebase-admin.json`, readable only by the API service account. Do not put Admin credentials in `EXPO_PUBLIC_*` variables.

## 5. API environment

Create `/etc/petconnect/api.env` with restrictive permissions:

```env
NODE_ENV=production
PORT=3000

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=petconnect_app
MYSQL_PASSWORD=<RUNTIME_DATABASE_PASSWORD>
MYSQL_DATABASE=petconnect_db

FIREBASE_PROJECT_ID=<PRODUCTION_FIREBASE_PROJECT_ID>
GOOGLE_APPLICATION_CREDENTIALS=/etc/petconnect/firebase-admin.json

CORS_ALLOWED_ORIGINS=https://pets.example.com
PUBLIC_APP_BASE_URL=https://pets.example.com
RECOVERY_TOKEN_SECRET=<AT_LEAST_32_RANDOM_BYTES>
UPLOAD_DIR=/var/lib/petconnect/uploads

TRUST_PROXY_HOPS=1
JSON_BODY_LIMIT=256kb
NOTIFICATION_WORKER_INTERVAL_MS=60000

# optional when Expo push enhanced security is enabled
# EXPO_ACCESS_TOKEN=<SERVER_SIDE_TOKEN>
```

Do not set `FIREBASE_AUTH_EMULATOR_HOST` in production.

The API validates production configuration during startup and refuses unsafe defaults such as root/blank database credentials, emulator/demo Firebase configuration, localhost/non-HTTPS public URLs, placeholder recovery secrets, or a relative upload path.

After creating the configuration and Admin credential files, apply their permissions:

```bash
sudo chown root:petconnect /etc/petconnect/api.env /etc/petconnect/firebase-admin.json
sudo chmod 0640 /etc/petconnect/api.env /etc/petconnect/firebase-admin.json
sudo chown root:root /etc/petconnect/db-maintenance.env
sudo chmod 0600 /etc/petconnect/db-maintenance.env
sudo -u petconnect test -r /etc/petconnect/firebase-admin.json
sudo -u petconnect test -w /var/lib/petconnect/uploads
```

Keep database migration credentials in that separate root-only environment file. Include `UPLOAD_DIR=/var/lib/petconnect/uploads` so backups include the same photos used by the service.

## 6. Database bootstrap/migration

For the first deployment:

```bash
cd /opt/petconnect
sudo bash -c 'set -a; . /etc/petconnect/db-maintenance.env; set +a; npm run db:bootstrap; npm run db:status'
```

For an update:

```bash
sudo bash -c 'set -a; . /etc/petconnect/db-maintenance.env; set +a; npm run db:migrate; npm run db:status'
```

Back up before migrations.

## 7. Frontend environment and export

Create `/opt/petconnect/frontend/.env.local`:

```env
EXPO_PUBLIC_FIREBASE_ENV=production
EXPO_PUBLIC_API_BASE_URL=https://pets.example.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<PROJECT_ID>
EXPO_PUBLIC_FIREBASE_API_KEY=<WEB_API_KEY>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<AUTH_DOMAIN>
EXPO_PUBLIC_FIREBASE_APP_ID=<WEB_APP_ID>
# EXPO_PUBLIC_EAS_PROJECT_ID=<EAS_PROJECT_UUID>
```

These are Firebase Web client configuration values, not Firebase Admin secrets.

Build:

```bash
cd /opt/petconnect
npm run web:export
test -f frontend/dist/index.html
```

Rebuild the static frontend whenever an `EXPO_PUBLIC_*` value changes.

## 8. Run the API as a service

Example systemd unit at `/etc/systemd/system/petconnect.service`:

```ini
[Unit]
Description=PetConnect API
Wants=network-online.target
After=network-online.target mysql.service

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

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now petconnect
curl -fsS http://127.0.0.1:3000/v1/health
curl -fsS http://127.0.0.1:3000/v1/ready
```

## 9. HTTPS reverse proxy

Example Caddy configuration:

```caddyfile
pets.example.com {
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

Verify Caddy's configuration and that `https://pets.example.com/v1/ready`, `/`, and `/recover` are reachable over a valid certificate.

## 10. Backup and restore

PetConnect data is split between MySQL and `UPLOAD_DIR`; back up both as one set.

Before each release and on a regular schedule:

```bash
sudo systemctl stop petconnect
sudo bash -c 'set -a; . /etc/petconnect/db-maintenance.env; set +a; cd /opt/petconnect; npm run db:backup -- --output /var/lib/petconnect/backups/$(date -u +%Y%m%dT%H%M%SZ)'
sudo systemctl start petconnect
curl -fsS http://127.0.0.1:3000/v1/ready
```

Copy the completed backup to protected storage outside this VM. A backup only on the same VM does not protect against VM/disk loss. Periodically perform a restore drill into a disposable MySQL database and separate upload directory.

## 11. Updates and rollback

Before update:

1. verify the target commit in CI;
2. create and copy an off-host backup;
3. record the currently deployed commit.

Then:

```bash
cd /opt/petconnect
git pull --ff-only
npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
npm run check:backend
npm run lint:frontend
npm run test:frontend
npm run web:export
sudo bash -c 'set -a; . /etc/petconnect/db-maintenance.env; set +a; cd /opt/petconnect; npm run db:migrate; npm run db:status'
sudo systemctl restart petconnect
curl -fsS https://pets.example.com/v1/ready
```

For a code rollback, checkout the previously recorded tested commit and rebuild/restart. Do not reverse database migrations casually; restore a validated backup when a data/schema rollback is truly required.

## 12. Operational checks

Monitor:

- `systemctl status petconnect`
- `journalctl -u petconnect`
- `/v1/health` and `/v1/ready`
- MySQL status
- disk usage for database, uploads, logs, and backups
- backup job success and off-host copies
- TLS/domain renewal
- notification/push errors

Never log or paste database passwords, Firebase Admin JSON, recovery secrets, access tokens, private keys, or real user records.

## 13. Native Android/iOS release

Source configuration can be validated without production accounts, but real store delivery requires operator-owned external configuration:

- Expo/EAS project and `EXPO_PUBLIC_EAS_PROJECT_ID`
- Android/iOS signing credentials
- FCM for Android remote push
- APNs for iOS remote push
- App Store Connect / Google Play Console accounts
- physical-device verification of camera, QR, image picker, location, deep links, and push

Run source-level export checks before attempting signed builds:

```bash
npm run release:android
npm run release:ios
```

Do not call the native app production-tested until signed builds and push have been exercised on physical devices.

## 14. Acceptance check

Before exposing real user data, use dedicated test accounts to verify:

- owner create/sign-in/sign-out/password reset/session persistence;
- at least two pets and correct per-pet edit/ID/health/lost actions;
- QR public profile, rotation, revocation, malformed-token rejection;
- privacy settings;
- lost report, finder sighting, notification, reunion;
- clinic role and authorization boundary;
- health record/vaccination/reminder/appointment workflows;
- upload replacement/removal;
- backup and restore drill;
- HTTPS, CORS, health/readiness endpoints and logs.

Stop rollout and fix any applicable failed check before using production data.
