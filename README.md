# PetConnect

PetConnect is a cross-platform pet identity, recovery, and veterinary-care application. Owners can manage multiple pets, issue revocable QR Pet IDs, report pets lost, receive sightings and notifications, manage care reminders and appointments, and share limited pet information with participating clinics.

## Architecture

- **Frontend:** Expo SDK 57, React Native, Expo Router, TypeScript
- **Authentication:** Firebase Authentication
- **API:** Node.js 22+, Express, TypeScript
- **Persistence:** MySQL 8
- **Media:** server-side validated/re-encoded pet photos on durable local storage
- **Notifications:** durable in-app notifications plus Expo push when configured

Firebase is used for identity. Application data is stored in MySQL; PetConnect does not use Firestore or Firebase Storage.

## Repository layout

```text
backend/
  api/                 Express API, tests, migrations/backup tooling
  firebase.json        local Firebase Auth emulator configuration
frontend/              Expo/React Native application
shared/                frontend/backend TypeScript contracts
sql/
  schema.sql           current complete schema
  migrations/          ordered forward migrations
e2e/                   Playwright browser tests
docs/                  operator-facing legal/privacy templates
.github/workflows/     CI
```

## Requirements

For the normal local `npm run dev` workflow install:

- Node.js 22 or newer
- npm
- MySQL 8 server
- Java 17 or newer for the Firebase Auth emulator
- At least 2 GB of free disk space for the first dependency install and Expo caches

The MySQL `mysql` / `mysqldump` CLI tools are only required for backup/restore workflows. Playwright Chromium is only required for browser E2E tests. Android Studio/Xcode are only required when building the corresponding native platform.

## Clean install

With the prerequisites above installed, the intended fresh-clone workflow is:

```bash
git clone <YOUR_REPOSITORY_URL> petconnect
cd petconnect
npm run dev
```

On first run, PetConnect automatically installs the root/backend/frontend lockfile dependencies when they are missing, creates ignored local environment files from the tracked examples, bootstraps or migrates the local MySQL database, starts the Firebase Auth emulator and API, then starts Expo.

The generated database defaults are `127.0.0.1:3306`, user `root`, blank password, database `petconnect_db`. If your MySQL installation uses different credentials, the first run will stop with a clear message. Edit `backend/api/.env` once and run `npm run dev` again. PetConnect never overwrites an existing local environment file.

The tracked environment examples are development-only templates. Never commit the real files.

## Local database

`npm run dev` runs the safe database bootstrap automatically. It creates `petconnect_db` when permitted, loads the current schema for an empty database, and applies pending checksum-tracked migrations for an existing PetConnect database.

You can inspect or run the database tooling manually:

```bash
npm run db:bootstrap
npm run db:status
```

For an existing database:

```bash
npm run db:backup
npm run db:migrate
npm run db:status
```

Migrations are checksum-tracked. Do not edit a migration that may already have been applied; add a new migration and keep `sql/schema.sql` equivalent to the final migrated schema.

## Local Firebase Auth emulator

The repository intentionally uses the fake project ID `demo-petconnect` only for local/test emulator workflows.

Start the complete local development stack with one command:

```bash
npm run dev
```

This starts the Firebase Auth emulator, PetConnect API, and Expo frontend together. A fresh clone starts with an empty Auth emulator; no pre-existing `.firebase/emulators` export is required. After the first session, local Auth accounts are saved there on normal Ctrl+C shutdown and imported on later runs. Run `npm run emulators:save` before a forced restart. This ignored local state keeps Firebase user IDs aligned with the MySQL owner profiles between development sessions.

If you intentionally want to run components separately, use `npm run emulators`, `npm run dev:api`, and `npm run dev:frontend`.

Default local endpoints are API `http://127.0.0.1:3000`, Expo web `http://127.0.0.1:8081`, Auth emulator `127.0.0.1:9099`, and Emulator UI `http://127.0.0.1:4000`.

In emulator-mode development, API, photo, and Firebase Auth SDK requests automatically go through the Expo server. Leave `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_EMULATOR_HOST` unset to use this route. It works with web, LAN, Android emulators, and `npm run dev:tunnel` on a physical phone, including mobile data. MySQL must already be running before `npm run dev`.

If an older `frontend/.env.local` sets localhost endpoint overrides, remove those two lines and restart Expo with `npm run dev:tunnel`. Explicit overrides are still supported for separate services; those addresses must be reachable from the device. Production and exported builds use explicitly configured service endpoints and do not include the development proxy.

For a public recovery QR link during a tunnel session, set the API's `PUBLIC_APP_BASE_URL` to the tunnel's HTTPS origin and restart the API. The link follows the current development tunnel and will stop working when that tunnel closes.

## Core product flows

Owner accounts can create and manage multiple pets. Pet-specific actions always require the intended pet rather than assuming the first pet in an account.

A Pet ID QR contains a signed public recovery token, not the Firebase UID or internal MySQL pet ID. Owners can rotate or revoke the token. Public recovery responses are filtered by owner privacy settings and exclude health, clinic, authentication, and internal-account data.

Recovery supports `LOST -> SIGHTED -> REUNITED` with finder sightings, foreground location, an owner updates feed, and nearby recovery data. Clinic access requires an authenticated clinic role and a valid recovery token; clinical access remains subject to the appointment/consent boundary implemented by the API.

## Quality checks

Useful individual checks:

```bash
npm run typecheck:frontend
npm run lint:frontend
npm run test:frontend
npm run check:backend
npm run doctor:frontend
npm run web:export
npm run release:android
npm run release:ios
npm run audit:prod
```

The production audit fails on any critical or unapproved high-severity advisory. Two exact, currently unpatched Expo/Jest build-tool advisories are documented and narrowly allow-listed in [docs/DEPENDENCY_SECURITY.md](docs/DEPENDENCY_SECURITY.md); the policy does not waive new high-severity findings.

Backend integration tests need a disposable `petconnect_test` MySQL database and Java 17+:

```bash
npm run test:backend
```

They truncate test data. Never point them at a database containing real user data. Migration and backup/restore tests also create temporary test databases and upload directories. Make `mysql` and `mysqldump` available on PATH, or set `MYSQL_BIN` and `MYSQLDUMP_BIN` to their executable paths.

Browser tests:

```bash
npm run test:e2e:install
npm run test:e2e
```

To test the running development app, start MySQL, the Auth emulator, the API, and `npm --prefix frontend run web -- --port 8083`, then run `npm run test:e2e:dev`. This includes real registration, multi-pet editing, QR rotation/revocation, lost reports, sightings, reunification, and route guards. It creates test accounts and pets; run it against development data.

Run the owner/recovery integration flows against disposable MySQL with `npm run test:e2e:integration`. The test configuration starts the Auth emulator and API; provide your test MySQL connection through `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, and `MYSQL_PASSWORD`.

The CI workflow installs Chromium and provides disposable MySQL/Firebase emulator infrastructure. If the browser download is unavailable locally, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chrome/Chromium executable. Record that override when reporting results, since it differs from Playwright's pinned browser.

Full release verification, where all local prerequisites are available:

```bash
npm run release:verify
```

## Production deployment

See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md). Local/demo behavior is kept separate from production; no production hardening requires removing emulator or development workflows.

Tracked deployment templates are under `deploy/`. Before launch, run:

```bash
npm run test:production-readiness
npm run production:preflight -- --api-env <api.env> --frontend-env <frontend.env>
npm run production:probe -- --api-env <api.env> --frontend-env <frontend.env>
```

After the public endpoints are live, run `npm run production:smoke -- --web-url https://... --api-url https://...`.

Production configuration intentionally fails closed when database transport, Firebase Admin credentials, CORS/public origins, recovery/finder secrets, OTP delivery, or durable media settings are unsafe. Same-server MySQL can use a local Unix socket; remote MySQL requires verified TLS. Keep all secrets outside Git.

## Native builds

`frontend/app.json` contains the PetConnect package/bundle identity, branding, and permissions. `frontend/eas.json` contains build profiles but no private project/account identifiers.

Before real Android/iOS distribution, the operator must:

1. create/connect an Expo/EAS project and provide `EXPO_PUBLIC_EAS_PROJECT_ID`;
2. configure signing credentials;
3. configure FCM for Android push;
4. configure APNs for iOS push;
5. test camera, QR scanning, image picking, foreground location, deep links, and push on physical devices;
6. submit through the appropriate store account.

Source-level export success is not the same as store approval or production push delivery.

## Security and privacy

- Firebase ID tokens are verified by the API.
- Owner pet operations are owner-scoped.
- Public recovery data is explicitly filtered.
- Clinic access is role/relationship constrained.
- Uploads are decoded, size/dimension limited, re-encoded, metadata-stripped, and stored under generated filenames.
- Production configuration has no silent root/blank-password/demo/localhost fallbacks.
- Recovery signing secrets, service-account JSON, database credentials, Expo tokens, uploads, and backups must never be committed.
- A backup stored only on the application VM is not sufficient; copy encrypted/protected backups off-host.

Public-deployment templates are in [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md), [docs/TERMS_OF_USE.md](docs/TERMS_OF_USE.md), and [docs/DATA_DELETION.md](docs/DATA_DELETION.md). Replace every bracketed operator placeholder before launch.
