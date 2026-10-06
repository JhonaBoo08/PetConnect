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

## Development and pitch setup

```bash
git clone https://github.com/JhonaBoo08/PetConnect.git
cd PetConnect
npm install
npm run demo
```

Install Node.js 22.13+ (Node.js 24 LTS recommended), npm 10+, Git, and MySQL Server 8 first. `node --version` must work. Keep at least 2 GB of free disk space and an Internet connection for dependency/emulator downloads and Expo Tunnel. Judge phones need Internet access and Expo Go compatible with this app's Expo SDK 57; native SDK upgrades may require an Expo Go update.

Root `npm install` installs the API and frontend automatically from their tracked lockfiles, including Expo, ngrok, TypeScript, Firebase CLI, Playwright and Expo Doctor. No global npm tools, Java, Expo login, Android Studio, USB debugging or production Firebase credentials are needed. This pitch uses only the Node-based Firebase Auth emulator.

`npm run demo` generates ignored local configuration, creates a private loopback MySQL instance using the installed MySQL Server binary, bootstraps the database, applies checksum-tracked migrations, starts the API and Auth emulator, then starts Expo Tunnel. Fresh clones select a free MySQL port from 3307–3339 and use their own data directory. Repeated launches preserve the database, media and signing secrets. If the MySQL binary is outside PATH/standard install locations, set `MYSQLD_PATH` to its executable, or configure an existing local MySQL service in `backend/api/.env`. On Linux running as root, use a MySQL service under its normal database user. Linux packages that restrict MySQL data directories through AppArmor may also require their normal loopback MySQL service.

Wait for:

```text
Pitch demo ready: Expo Go Android/iOS bundles, API/Auth proxy, and browser recovery are warmed.
```

This message requires responsive Android/iOS manifests and bundles, the browser recovery JavaScript bundle, database-backed API readiness, and Firebase login responses through the **current public HTTPS tunnel**. A failed check stops startup with an error.

Judges scan the same terminal QR with Expo Go on Android or the iPhone Camera/Expo Go flow. Each phone has its own authenticated session. A finder scans a **Pet ID QR** with an ordinary camera and submits a report in the browser without an account or Expo Go. Generate/display Pet ID QRs after this launch reaches readiness. Keep the laptop awake and the terminal running.

The tunnel URL may change after a restart: previously printed tunnel QRs can stop working. Redisplay/share the current Pet ID for the pitch. Stable printed tags require a permanent production HTTPS address. Development in-app notifications/polling work in Expo Go; native push delivery requires a configured development/production build.

### Genuine prerequisites and troubleshooting

- If a development port is occupied (3000, 8081, 9099, 4000, 4400 or 4500), stop the older PetConnect terminal or conflicting application and rerun. Startup does not kill unrelated listeners or silently borrow another clone's API/Auth services.
- If MySQL cannot initialize, install MySQL Server 8 or supply a working loopback connection in `backend/api/.env`. Database/user administration rights are needed only if **you choose an existing restricted server**; the private instance needs no Administrator terminal.
- If the tunnel fails, check the laptop/phone Internet connection and firewall access to Expo/ngrok. Expo can reconnect a dropped tunnel; if access remains down, press Ctrl+C, rerun `npm run demo`, wait for readiness and scan the current QR again. The first cold build can take several minutes. Judges do not need the laptop's Wi-Fi.
- `backend/api/.env.example` and `frontend/.env.example` contain the complete local templates. They are generated automatically and never overwrite existing files. Keep frontend endpoint overrides unset for Expo Go; demo mode forces requests through the runtime tunnel.
- Firebase accounts start empty on a fresh clone. Normal shutdown exports them and later launches import them. No previous demo data is required. Console OTP codes are exposed only by the local demo launcher when progressive finder verification needs one; production requires a real provider.
- Playwright Chromium is only required for E2E tests: `npm run test:e2e:install`. MySQL CLI tools are only required for backup/restore, and Android Studio/Xcode only for native builds.
- For LAN/browser development use `npm run dev`; for a public tunnel without the pitch warm-up use `npm run dev:tunnel`.

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

In emulator-mode development, API, photo, and Firebase Auth SDK requests automatically go through the Expo server. Leave `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_EMULATOR_HOST` unset to use this route. It works with web, LAN, Android emulators, and `npm run dev:tunnel` on a physical phone, including mobile data. The launcher prepares MySQL before database bootstrap.

If an older `frontend/.env.local` sets localhost endpoint overrides, remove those two lines and restart Expo with `npm run dev:tunnel`. Explicit overrides are still supported for separate services; those addresses must be reachable from the device. Production and exported builds use explicitly configured service endpoints and do not include the development proxy.

For a pitch/demo on physical phones, run `npm run demo` from the repository root and scan the Expo QR with Expo Go. Demo mode ensures a local MySQL instance is available, starts the API and Firebase Auth emulator on the laptop, exposes the Expo development server through a tunnel, pre-builds the Expo Go Android and iOS bundles, and pre-warms the browser recovery route. Wait until the terminal prints `Pitch demo ready` before the live QR demonstration. Multiple judge devices can open the same active Expo tunnel as long as they have Internet access and a compatible Expo Go installation; they do not need to share the laptop's Wi-Fi. API/Auth traffic is proxied through that same Expo origin, and Pet ID recovery QRs are rewritten to the active tunnel/LAN origin instead of phone `localhost`. The laptop must stay running for the demo. On Windows, when the configured local MySQL port is unavailable and MySQL Server is installed, PetConnect can start a private loopback-only development instance without requiring the Windows MySQL service or administrator rights.

The API's `PUBLIC_APP_BASE_URL` can remain local during emulator-mode development because the frontend rewrites active recovery-tag URLs to the current Expo runtime. Production still requires the real public HTTPS origin.

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

Backend integration tests need a disposable `petconnect_test` MySQL database:

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
