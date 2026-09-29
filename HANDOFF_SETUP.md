# PetConnect handoff and continuation guide

This is the source-of-truth setup note for moving PetConnect into a new repository or development machine.

## 1. What is in this handoff

PetConnect is an Expo/React Native application with an Express/TypeScript API, MySQL 8, and Firebase Authentication.

Implemented product areas:

- Firebase email/password owner and clinic authentication with role-aware routing and real logout/password reset.
- Owner-scoped Pet CRUD, generated IDs, pet photos, dashboard/profile counts.
- Signed and revocable Pet ID QR codes with a public recovery-safe profile and real camera scanning.
- Lost reports, unverified finder sightings, GPS/map recovery, nearby feed, owner alerts, and reunion tracking. Finder submissions never overwrite the owner's authoritative last-known location.
- Clinic/health ecosystem with QR patient identification, owner-authorized clinical access through an active appointment relationship, health records, vaccinations, reminders, appointments, and notification scheduling.
- Owner privacy settings for public phone disclosure, public location precision, and clinic phone disclosure.
- Hardened image processing, structured request logging, readiness/liveness endpoints, rate limiting, graceful shutdown, migrations, backups, frontend tests, browser E2E tests, CI, and release bundle checks.

## 2. What is deliberately NOT inside the handoff ZIP

On the sender's Windows computer, run `powershell -ExecutionPolicy Bypass -File .\scripts\make-handoff.ps1` from the project root. This packages the current tracked and untracked source, adds `HANDOFF_MANIFEST.txt`, and excludes known local data. Inspect the manifest and the ZIP before sharing. Do not use `git archive HEAD` while project changes are uncommitted: it would omit them.

The handoff package must not contain secrets or machine-local data. It excludes:

- `.git/`
- every `node_modules/`
- `backend/api/.env`
- `frontend/.env.local` and other `.env*.local`
- Firebase Admin/service-account JSON
- signing keys/certificates
- local uploads and backups
- generated Expo/build/test output
- local MySQL data directories

The checked-in `.env.example`, `backend/api/.env.example`, and `frontend/.env.example` contain placeholders only.

## 3. Prerequisites

Use:

- Node.js **22.13 or newer**.
- npm.
- MySQL **8.x**.
- Java 21 or another Firebase Emulator-compatible Java runtime for local Firebase Auth.
- Git for the new repository.
- Chromium installed by Playwright when running browser E2E tests.
- For real mobile distribution later: an Expo/EAS account, Android signing/FCM setup, and Apple Developer/APNs setup for iOS.

Expo SDK is 57. Keep Expo packages aligned with SDK 57 and use `npx expo install` for Expo-managed dependencies.

## 4. Unzip into a new repository

If you are following `PRODUCTION_DEPLOYMENT.md`, use its ZIP-to-GitHub import steps and do not initialize the repository a second time. The commands here are a standalone local-development route.

After extracting the ZIP:

```bash
git init
git branch -M main
npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
```

Do not run `npm install` just to "refresh" lockfiles unless you intentionally want dependency changes. The handoff includes all three lockfiles.

Before committing anything, verify no secrets were added:

```bash
git status --short
git check-ignore backend/api/.env frontend/.env.local
```

Both local env files should be ignored.

## 5. Configure the frontend

Copy:

```text
frontend/.env.example -> frontend/.env.local
```

For local web/iOS simulator development:

```env
EXPO_PUBLIC_FIREBASE_ENV=emulator
EXPO_PUBLIC_EMULATOR_HOST=127.0.0.1
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
```

For the Android emulator, use `10.0.2.2` instead of `127.0.0.1`.

For a physical phone on the same LAN, use the development computer's reachable LAN address. Do not use `127.0.0.1` from the phone.

`EXPO_PUBLIC_*` values are embedded into the app bundle. Never put Firebase Admin credentials, MySQL passwords, or private signing secrets in them.

## 6. Configure the API

Copy:

```text
backend/api/.env.example -> backend/api/.env
```

At minimum configure MySQL plus a stable recovery signing secret.

Generate a secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value in:

```env
RECOVERY_TOKEN_SECRET=<generated secret>
```

Important: changing this value later invalidates every previously issued Pet ID QR. Store the production value in a real secret manager.

For the free single-VM web deployment, `UPLOAD_DIR` points to a persistent directory on the VM and both photos and MySQL are backed up off the VM. For multiple API replicas, use shared persistent storage or replace the adapter with object storage.

## 7. Database: fresh setup

Make sure the MySQL server is running and the configured MySQL user can create the target database.

Then run from the repository root:

```bash
npm run db:bootstrap
npm run db:status
```

`db:bootstrap` is the preferred fresh-install command. It:

1. creates `MYSQL_DATABASE` if necessary;
2. creates the current schema;
3. creates the `schema_migrations` history table;
4. records the known migration checksums.

Do not manually replay every migration into a brand-new database.

## 8. Database: continuing an existing PetConnect database

**Back it up first:**

```bash
npm run db:backup
```

Then:

```bash
npm run db:status
npm run db:migrate
npm run db:status
```

The migration tool uses an advisory database lock and SHA-256 checksums. It refuses to proceed when an already-recorded migration has been modified.

Rules for all future schema work:

- Never edit a migration that has already been applied to a shared environment.
- Add a new timestamped SQL file under `sql/migrations/`.
- Keep `sql/schema.sql` equal to the current final schema for new installs.
- Run `npm run db:migrate`.
- Run `npm run db:status`.
- Commit the migration and schema change together.

### Legacy database with no migration history

`db:bootstrap` recognizes the PetConnect schema from immediately before migration tracking and can safely establish its baseline before applying the release-hardening migration.

For any other existing database, the tool stops instead of guessing. Only after manually verifying that its schema exactly matches the current schema may you run:

```bash
npm run db:baseline -- --confirm-current-schema
```

Never baseline an unknown or partially migrated database.

## 9. Database and upload backups

Create a backup:

```bash
npm run db:backup
```

A backup folder contains:

- `database.sql`
- `uploads/`
- `manifest.json`

The manifest records the SQL SHA-256, migration checksums, and per-upload SHA-256/size metadata. Database rows and photo files are therefore treated as one backup unit.

To choose the destination:

```bash
npm run db:backup -- --output ./some-safe-location
```

Store production backups outside the application host, encrypt them at rest, restrict access, and periodically test restores.

### Restore

Stop application traffic first. Then:

```bash
npm run db:restore -- --backup <backup-directory> --confirm-db <MYSQL_DATABASE>
```

The restore command verifies the manifest database name, SQL checksum, upload count, upload paths, sizes, and per-file hashes **before** it changes the target database. It then makes an automatic pre-restore safety backup by default.

A production restore additionally requires this temporary environment acknowledgement:

```env
ALLOW_PRODUCTION_RESTORE=YES
```

Do not leave that variable enabled permanently.

## 10. Local Firebase Auth

No cloud Firebase project is required for local authentication testing.

Terminal 1:

```bash
npm run emulators
```

Default Auth emulator: `127.0.0.1:9099`.

Default emulator UI: `http://127.0.0.1:4000`.

## 11. Start the API and app

Terminal 2:

```bash
npm --prefix backend/api run dev
```

Terminal 3:

```bash
npm run web
```

Or run Expo normally for Android/iOS.

Health endpoints:

- `GET /v1/health` — process liveness.
- `GET /v1/ready` — verifies MySQL connectivity and returns 503 when the API is not ready.

## 12. Upload hardening

Pet photos are accepted only through:

```text
PUT /v1/pets/:id/photo
```

The old generic `POST /v1/uploads` route is disabled.

Upload controls include:

- authenticated owner and pet ownership checks;
- rate limiting;
- one file/part only;
- 5 MB input limit;
- JPEG/PNG/WebP input only;
- real image decoding with Sharp rather than trusting the supplied MIME type or extension;
- maximum input pixel and dimension limits;
- animated/multi-page rejection;
- orientation normalization;
- metadata stripping by re-encoding;
- resize to a bounded maximum dimension;
- canonical WebP output with random server-generated file names;
- cleanup if the database update fails;
- immutable static caching and `nosniff`.

Production still needs durable/shared storage and infrastructure-level malware/content controls if your threat model requires them.

## 13. Privacy controls

Owner privacy settings are under **Profile -> Privacy & preferences**.

Defaults are intentionally restrictive:

- public recovery phone: **off**;
- precise public recovery GPS: **off**;
- phone visible to authenticated scanning clinics: **on**, but owner-controllable.

When precise public recovery location is off, public/nearby responses use a coarsened point and coarsened accuracy/distance. Private owner data still retains the exact coordinates needed for recovery history.

Finder contact remains owner-only. Health records and appointments are authenticated and never returned by the public recovery endpoint.

## 14. Observability and deployment behavior

The API emits JSON request logs with:

- timestamp;
- request ID;
- HTTP method;
- sanitized path;
- response status;
- duration;
- authenticated user ID when available.

Recovery tokens and sensitive query values are redacted from logged paths.

Every response gets `X-Request-Id`; 404/500 responses include the request ID for support correlation.

The API also has:

- Helmet security headers;
- CORS allow-listing;
- public recovery read/write rate limits;
- configurable proxy trust;
- bounded JSON request bodies;
- graceful SIGTERM/SIGINT shutdown;
- scheduled-notification worker shutdown;
- MySQL pool close on shutdown.

For production, send stdout/stderr JSON to your platform logger and add alerts for 5xx rate, readiness failures, scheduled-notification failures, and database saturation.

## 15. Tests

Static checks:

```bash
npm run check:backend
npm run lint:frontend
npm run test:frontend
npm run doctor:frontend
```

Backend integration tests require a disposable `petconnect_test` MySQL database and use the Firebase Auth emulator:

```bash
npm run test:backend
```

**Never point backend tests at production or a database containing real data.** The integration suite truncates test tables.

Browser E2E:

```bash
npm run test:e2e:install
npm run test:e2e
```

Playwright exports and serves the web app, then performs public navigation/recovery smoke tests.

## 16. Release verification

Production dependency audit:

```bash
npm run audit:prod
```

Web/Android/iOS JavaScript bundle checks plus static quality gates:

```bash
npm run release:check
```

Full release verification, including MySQL/Firebase backend integration:

```bash
npm run release:verify
```

The Android/iOS commands in this repository are **bundle/export validation**, not signed Play Store/App Store binaries.

For actual signed mobile builds, configure the EAS project and credentials first, then from `frontend/` run:

```bash
npx eas-cli build --platform android --profile production
npx eas-cli build --platform ios --profile production
```

Before doing that, set a real `EXPO_PUBLIC_EAS_PROJECT_ID`, production API/Firebase values, FCM credentials, APNs/Apple credentials, and any native map-provider credentials required by the final map configuration.

## 17. CI in the new repository

`.github/workflows/backend.yml` is the quality workflow. It provisions MySQL, runs dependency audits, validates fresh database bootstrap/migration state, runs API integration tests, frontend type/lint/Jest checks, Expo Doctor, Playwright web E2E, and release bundle checks.

Do not merge a change that leaves this workflow red.

## 18. Real Firebase project setup

For a new recipient's full ZIP-to-GitHub handoff and the free web deployment (Oracle Always Free + Firebase Spark + DuckDNS + Caddy), follow `PRODUCTION_DEPLOYMENT.md`. Native signed builds and background push are a separate later release. When moving from the local emulator to Firebase cloud:

1. Create the Firebase project.
2. Enable Email/Password Authentication.
3. Create a Web app and copy only its public Web SDK config into the frontend environment.
4. Set the API `FIREBASE_PROJECT_ID` to the same project.
5. Remove `FIREBASE_AUTH_EMULATOR_HOST` in deployed environments.
6. Supply Firebase Admin credentials using your hosting platform's secure credential mechanism/Application Default Credentials.
7. Set the frontend `EXPO_PUBLIC_FIREBASE_ENV` to the chosen non-emulator environment.
8. Rebuild the frontend; `EXPO_PUBLIC_*` values are bundle-time values.

Clinic accounts remain operator-provisioned. Build the API first, then use the existing operator command documented in `backend/README.md`.

## 19. Launch scope

For the free public web route, use the exact environment, HTTPS, database/photo backup, and real-browser acceptance checks in `PRODUCTION_DEPLOYMENT.md`. The one VM has no managed high-availability guarantee; the owner must transfer backups off the VM at least weekly and before releases.

If you later distribute native binaries or need higher availability, plan separate work for signed Android/iOS builds, Apple/Google store accounts and review, FCM/APNs credentials, real-device background push tests, monitoring, privacy/retention policies, automated off-host backups, and shared photo storage for multiple API replicas. Those are not prerequisites to the free web route.

## 20. How to continue development safely

For each new feature:

1. Pull/rebase first.
2. Create a feature branch.
3. If schema changes, create a **new** migration and update `sql/schema.sql`.
4. Update shared contracts before API/frontend consumers.
5. Preserve owner/clinic authorization boundaries.
6. Add or update backend integration tests.
7. Add frontend unit tests for new state/transform logic.
8. Add a Playwright smoke/E2E path when the web surface can exercise it.
9. Update `.env.example` and this handoff note when setup requirements change.
10. Run `npm run release:verify` against a disposable test database.
11. Review `git diff --check`, `git status`, and the diff before committing.
12. Never commit credentials, local uploads, backups, emulator state, or generated release output.

## 21. Recommended first commands after importing this ZIP

```bash
npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
# copy/edit both env example files
npm run db:bootstrap
npm run db:status
npm run check:backend
npm run test:frontend
npm run lint:frontend
npm --prefix frontend exec expo-doctor
npm run test:e2e:install
```

Start MySQL **before** `db:bootstrap`. Then start the Firebase emulator, API, and Expo as described above.

If following this standalone route, create the first commit after the checks pass. If following `PRODUCTION_DEPLOYMENT.md`, the import commit is already pushed; check its GitHub Actions run.
