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

For local development install:

- Node.js 22 or newer
- npm
- MySQL 8, including the `mysql` and `mysqldump` CLI tools
- Java 21 for the Firebase Auth emulator
- Playwright Chromium for browser E2E tests
- Android Studio/Xcode only when building or running the corresponding native platform

## Clean install

```bash
git clone <YOUR_REPOSITORY_URL> petconnect
cd petconnect
npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
```

Create local configuration:

```bash
# copy these files using your shell/file manager
backend/api/.env.example  -> backend/api/.env
frontend/.env.example     -> frontend/.env.local
```

The tracked examples are development-only templates. Never commit the real files.

## Local database

Create an empty MySQL database matching `MYSQL_DATABASE` in `backend/api/.env`, then:

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

Start the emulator:

```bash
npm run emulators
```

Then start the API and frontend in separate terminals:

```bash
npm --prefix backend/api run dev
npm run web
```

Default local endpoints are API `http://127.0.0.1:3000`, Expo web `http://127.0.0.1:8081`, Auth emulator `127.0.0.1:9099`, and Emulator UI `http://127.0.0.1:4000`.

For an Android emulator use `10.0.2.2` instead of `127.0.0.1` in frontend host settings. A physical phone must use the development computer's reachable LAN address.

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

Backend integration tests need a disposable `petconnect_test` MySQL database and Java 21:

```bash
npm run test:backend
```

They truncate test data. Never point them at a database containing real user data. Migration and backup/restore tests also create temporary test databases and upload directories. Make `mysql` and `mysqldump` available on PATH, or set `MYSQL_BIN` and `MYSQLDUMP_BIN` to their executable paths.

Browser tests:

```bash
npm run test:e2e:install
npm run test:e2e
```

Run the owner/recovery integration flows against disposable MySQL with `npm run test:e2e:integration`. The test configuration starts the Auth emulator and API; provide your test MySQL connection through `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, and `MYSQL_PASSWORD`.

The CI workflow installs Chromium and provides disposable MySQL/Firebase emulator infrastructure. If the browser download is unavailable locally, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chrome/Chromium executable. Record that override when reporting results, since it differs from Playwright's pinned browser.

Full release verification, where all local prerequisites are available:

```bash
npm run release:verify
```

## Production deployment

See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md). Production configuration intentionally fails during startup when required database, Firebase Admin, CORS, public URL, recovery-secret, or durable-upload settings are missing or unsafe.

For a public deployment, configure your own Firebase project, MySQL credentials, HTTPS domain, Firebase Admin credentials, stable recovery signing secret, and durable upload path. Keep all secrets outside Git.

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
