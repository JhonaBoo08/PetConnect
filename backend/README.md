# PetConnect backend, authentication, and recovery setup

PetConnect uses Firebase Authentication for email/password identity and an Express/MySQL API for roles, profiles, pets, photos, and public pet recovery. Owner accounts can be created in the app. Clinic accounts must be provisioned by an operator.

This file is the setup checklist for the project. **When a backend, native, database, storage, or environment dependency is added, document it here in the same change.**

## Current prerequisites

Install these before running the full app locally:

- Node.js 22.13 or newer.
- npm.
- MySQL 8.
- Java for the Firebase Local Emulator Suite.
- A phone, Android emulator, iOS simulator, or browser for the Expo frontend.
- Camera permission on the device/browser for QR scanning.

No cloud Firebase project is required for local development; the Auth emulator uses the `demo-petconnect` project ID.

## 1. Install dependencies

From the repository root:

```bash
npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
```

The frontend includes `expo-camera` for real QR scanning, `react-native-qrcode-svg` for standards-compliant QR rendering, `expo-location` for foreground-only recovery GPS, `react-native-maps` for native recovery pins, and `expo-notifications` for opt-in remote recovery alerts.

## 2. Bootstrap or migrate MySQL

Configure `backend/api/.env` first, then use the tracked database tool instead of manually replaying SQL files.

Fresh database:

```bash
npm run db:bootstrap
npm run db:status
```

Existing PetConnect database:

```bash
npm run db:backup
npm run db:status
npm run db:migrate
npm run db:status
```

The tool creates/uses `schema_migrations`, records SHA-256 checksums, takes an advisory migration lock, and refuses migration-history drift. `db:bootstrap` loads `sql/schema.sql` for an empty database and establishes the migration baseline. It can also recognize the immediately preceding PetConnect schema that predates migration tracking.

Never edit an already-applied migration in a shared environment. Add a new timestamped file under `sql/migrations/` and update `sql/schema.sql` to the same final schema. See `HANDOFF_SETUP.md` for backup, restore, legacy baseline, and production rules.

## 3. Configure the Expo frontend

Copy the repository `.env.example` to `frontend/.env.local`.

Local web/iOS simulator defaults:

```env
EXPO_PUBLIC_FIREBASE_ENV=emulator
EXPO_PUBLIC_EMULATOR_HOST=127.0.0.1
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
# EXPO_PUBLIC_EAS_PROJECT_ID=your_eas_project_uuid
```

For an Android emulator use `10.0.2.2` instead of `127.0.0.1`.

For a physical device, use the computer's reachable LAN IP for both the emulator host and API URL. The phone cannot use the computer's `127.0.0.1`.

## 4. Configure `backend/api/.env`

Create `backend/api/.env`:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_local_password
MYSQL_DATABASE=petconnect_db

FIREBASE_PROJECT_ID=demo-petconnect
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
CORS_ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081

PUBLIC_APP_BASE_URL=http://localhost:8081
RECOVERY_TOKEN_SECRET=replace_with_a_stable_random_secret_at_least_32_bytes
RECOVERY_ALERT_RADIUS_KM=10
NOTIFICATION_WORKER_INTERVAL_MS=60000
# Set only if Expo Push enhanced security is enabled:
# EXPO_ACCESS_TOKEN=
```

Generate a strong recovery signing secret with Node:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### Recovery-token rules

`RECOVERY_TOKEN_SECRET` is security-critical.

- Keep it private and out of Git.
- Keep the same value across API restarts and deployments.
- Use at least 32 random bytes.
- Changing it invalidates **every recovery QR already issued**, even if its database row is still active.
- Individual pet QRs should normally be invalidated with the owner-facing **Disable QR** or **Regenerate QR** controls instead of changing the global secret.

`PUBLIC_APP_BASE_URL` is the public origin encoded into pet QR codes.

- Local web: `http://localhost:8081`.
- Physical-device LAN testing: use a URL the scanning device can actually open.
- Production: use the deployed HTTPS frontend origin, for example `https://app.example.com`.
- The deployed frontend must serve the `/recover?token=...` route.
- Do not put the API URL here unless the API host also serves the frontend recovery page.

## 5. Camera / QR native configuration

`frontend/app.json` configures the `expo-camera` plugin with barcode scanning enabled and audio recording disabled.

After adding or changing native camera plugin configuration, rebuild the native app binary. Expo Go already contains `expo-camera`; a custom development/production build must be rebuilt for config-plugin changes to take effect.

The scanner uses only QR barcodes and requests camera permission at runtime. On production web deployments, serve the app over HTTPS so browsers can grant camera access.

## 6. Recovery network, GPS, maps, and push

Recovery location is deliberately **foreground-only**. PetConnect does not continuously track owners or finders. Location permission is requested only when someone chooses to place/refresh a lost-pet pin, submit a finder sighting, or load the nearby feed.

While a report is active, the public nearby feed and Pet ID recovery view use the owner's privacy setting. Precise recovery GPS is off by default; when disabled, public coordinates/accuracy/distance are coarsened while the owner-side report retains the exact recovery data. Finder name/contact are optional and visible only to the pet owner through the owner report detail API; they are never included in the nearby feed or public recovery profile.

Recovery state is:

```text
LOST -> SIGHTED -> REUNITED
```

A finder sighting stores an immutable sighting row and moves the report's latest-known pin. Only the owner can mark the report `REUNITED`. Reunited reports remain owner history but disappear from the public nearby feed.

Owner endpoints:

- `POST /v1/lost-reports`
- `GET /v1/lost-reports`
- `GET /v1/lost-reports/:id`
- `POST /v1/lost-reports/:id/reunite`
- `PUT /v1/push/devices`
- `DELETE /v1/push/devices`
- `GET /v1/notifications`
- `POST /v1/notifications/:id/read`

Public endpoints:

- `GET /v1/recovery/nearby?latitude=...&longitude=...&radiusKm=...`
- `POST /v1/recovery/:token/sightings`

`RECOVERY_ALERT_RADIUS_KM` defaults to 10 km and is clamped by the API to 1–50 km for lost-report push fanout.

### Native maps

The iOS/Android app uses `react-native-maps`. Expo Go can render the library for development. For standalone Android/iOS production builds, configure the map provider/API credentials required by the provider you deploy with. The web app intentionally uses a coordinate-list fallback rather than trying to bundle the native map package.

### Remote push notifications

Push registration is explicit: the user taps **Enable recovery alerts**. The app does not prompt at startup.

Set `EXPO_PUBLIC_EAS_PROJECT_ID` to the EAS project UUID (or configure the EAS project ID in Expo config) before requesting a real Expo push token. Android remote push is not available in Expo Go; test it in a development or production build. Configure FCM/APNs credentials through EAS for real device delivery.

If Expo Push enhanced security is enabled, set backend `EXPO_ACCESS_TOKEN`. Push delivery is best-effort: the backend always records the matching notification in MySQL first, so finder sightings and nearby lost alerts remain visible in the in-app Updates feed even when push delivery is unavailable.

For production hardening, process Expo push receipts and disable tokens that return `DeviceNotRegistered`.

## 7. Health and clinic ecosystem

PetConnect now treats health data as private authenticated data. The public recovery endpoint still exposes **no health records, vaccination history, reminders, clinic data, or appointments**.

### Health/clinic migration

Do not apply individual migration files manually. For an existing database, use the tracked migration tool from the repository root:

```bash
npm run db:backup
npm run db:migrate
npm run db:status
```

The migration history/checksum guard applies the health/clinic schema changes in the correct order and refuses drift.

### Owner health APIs

These routes require an active `OWNER` account:

- `GET /v1/clinics` — list active clinics.
- `GET /v1/health-records?petId=...` — owner-scoped clinical history.
- `GET /v1/reminders?petId=...` — owner-scoped health reminders.
- `POST /v1/reminders` — create a manual reminder.
- `PATCH /v1/reminders/:id` — reschedule or mark a reminder completed/pending/cancelled.
- `DELETE /v1/reminders/:id` — delete an owner reminder.
- `GET /v1/appointments` — owner appointment history.
- `POST /v1/appointments` — request an appointment at an active clinic.
- `POST /v1/appointments/:id/cancel` — cancel an active owner appointment.

Owner appointment requests start as `REQUESTED`. A clinic can confirm them as `SCHEDULED`; a scheduled visit can then become `COMPLETED` or `CANCELLED`.

### Clinic APIs and QR patient lookup

These routes require an active `CLINIC` account and clinic membership:

- `GET /v1/clinic`
- `GET /v1/clinic/appointments`
- `PATCH /v1/clinic/appointments/:id`
- `GET /v1/clinic/patients/recovery/:token`
- `GET /v1/clinic/patients/recovery/:token/health-records`
- `POST /v1/clinic/patients/recovery/:token/health-records`
- `POST /v1/clinic/patients/recovery/:token/vaccinations`
- `POST /v1/clinic/patients/recovery/:token/appointments`

Clinic patient lookup deliberately reuses the signed, revocable Pet ID QR token rather than exposing a general internal-pet-ID lookup API. Access requires **both**:

1. an authenticated active clinic account; and
2. a currently valid PetConnect Pet ID token scanned from the owner/pet.

The recovery QR is **identification, not clinical authorization**. Before the owner has ever authorized that clinic through an appointment, the clinic receives only pet identity fields plus the owner's display name/optional phone; clinical history is omitted. An owner-requested appointment establishes a clinic-pet relationship, so that clinic may continue to read the resulting clinical history after a completed visit. Clinical writes remain stricter: health-record, vaccination, and clinic-created appointment routes require a currently active owner-requested appointment in `REQUESTED` or `SCHEDULED` state and return HTTP 403 otherwise. Cancelled appointments do not establish historical access.

Rotating or disabling the Pet ID immediately invalidates the old token for clinic patient lookup as well as public recovery. Public `/v1/recovery/:token` never exposes health data.

### Vaccinations and automatic follow-up

A clinic vaccination entry stores the vaccine name, optional dose/lot, administration time, notes, and optional next-dose time. When a next dose is supplied, PetConnect automatically creates an owner health reminder linked to that vaccination and schedules notification delivery.

General clinic records support `CHECKUP`, `VACCINATION`, `MEDICATION`, `LAB`, `PROCEDURE`, and `OTHER`.

### Durable notification scheduling

Health reminders and scheduled appointments use the MySQL `scheduled_notifications` queue. This is server-side rather than device-only scheduling so reminders survive app reinstalls and can reach any registered device.

The API worker:

- claims due jobs with a transaction and `FOR UPDATE SKIP LOCKED`;
- recovers jobs left in `PROCESSING` for more than 10 minutes;
- writes the normal durable in-app `notifications` row first;
- then reuses Expo push delivery for registered devices;
- marks the scheduled job `SENT`, or returns it to `PENDING` if delivery processing fails.

The default scheduler interval is 60 seconds. Override it in `backend/api/.env` when needed:

```env
NOTIFICATION_WORKER_INTERVAL_MS=60000
```

This worker is best suited to a continuously running API process. If the API is scaled horizontally, the database claiming logic prevents two healthy workers from processing the same pending row simultaneously. Production deployments should still monitor failed/retried jobs and Expo push receipts.

## 8. Start local services

Use separate terminals from the repository root:

```bash
npm run emulators
npm --prefix backend/api run dev
npm run web
```

Default ports:

- Firebase Emulator UI: `4000`
- Firebase Auth emulator: `9099`
- PetConnect API: `3000`
- Expo web: normally `8081`

In emulator mode, password reset emails are not sent. The reset link appears in emulator output/UI.

For physical-device testing, bind the Firebase Auth emulator to a reachable interface in `backend/firebase.json`, use the computer's LAN IP in frontend environment variables, and allow the relevant ports through the local firewall.

## Pet ID and public recovery model

The QR code does **not** contain the MySQL pet ID or Firebase user ID.

When an owner opens Pet ID, the API creates or returns a high-entropy random token ID and signs it with HMAC-SHA256 using `RECOVERY_TOKEN_SECRET`. The QR contains a normal recovery URL:

```text
https://your-public-app.example/recover?token=<random-id>.<signature>
```

The database stores the random token ID and revocation state. The signature is derived by the server and is not stored.

Owner-only endpoints:

- `GET /v1/pets/:id/recovery` — get or lazily create the current recovery QR state.
- `POST /v1/pets/:id/recovery/rotate` — generate a new token ID and immediately invalidate the previous QR.
- `DELETE /v1/pets/:id/recovery` — revoke/disable the current QR.

Public endpoint:

- `GET /v1/recovery/:token` — validate the signed token and return a recovery-safe profile.

The public recovery response intentionally contains only:

- pet name;
- species/breed;
- sex and age label;
- identifying details;
- pet photo URL;
- owner display name;
- owner phone number, if one has been added.

It intentionally excludes email, Firebase UID, owner database ID, internal pet ID, health records, clinic data, appointments, and authentication/session data.

If stronger owner privacy is required later, replace public phone disclosure with an in-app relay/contact workflow rather than adding more account fields to this public endpoint.

## Pet CRUD and photos

These routes require an active Firebase-authenticated OWNER account:

- `GET /v1/pets`
- `POST /v1/pets`
- `GET /v1/pets/:id`
- `PATCH /v1/pets/:id`
- `DELETE /v1/pets/:id`

Pet IDs are API-generated and all owner operations are scoped by the authenticated owner ID. Cross-owner reads and mutations return 404.

Photo routes:

- `PUT /v1/pets/:id/photo`
- `DELETE /v1/pets/:id/photo`

Uploads accept JPEG, PNG, or WebP up to 5 MB. Files currently live in the API `uploads/` directory and the URL is stored in MySQL.

For the free single-VM web deployment, set `UPLOAD_DIR` to a persistent local path and back it up together with MySQL off the VM as in `PRODUCTION_DEPLOYMENT.md`. Local ephemeral container storage is not sufficient for pet identity photos; multiple API replicas need shared storage.

## Connect a real Firebase project later

1. Create a Firebase project and Web app.
2. Enable Email/Password under Firebase Authentication.
3. Set `EXPO_PUBLIC_FIREBASE_ENV=dev`, `staging`, or `production` in `frontend/.env.local`.
4. Add the public Web app values:
   - `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
   - `EXPO_PUBLIC_FIREBASE_API_KEY`
   - `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `EXPO_PUBLIC_FIREBASE_APP_ID`
5. Set the API's `FIREBASE_PROJECT_ID` to the same project.
6. Remove `FIREBASE_AUTH_EMULATOR_HOST` from the deployed API.
7. Provide Firebase Admin Application Default Credentials securely, such as `GOOGLE_APPLICATION_CREDENTIALS`.
8. Set the deployed `EXPO_PUBLIC_API_BASE_URL`, `PUBLIC_APP_BASE_URL`, CORS origins, MySQL credentials, and a production `RECOVERY_TOKEN_SECRET`.
9. Restart/rebuild Expo after changing bundle-time `EXPO_PUBLIC_*` values.

Never commit Firebase Admin credentials, MySQL passwords, or the recovery signing secret.

## Checks

Run these from the repository root:

```bash
npm run check:backend
npm run lint:frontend
npm run test:backend
npm --prefix frontend exec expo-doctor
```

`npm run test:backend` starts its own Firebase Auth emulator and requires a local MySQL `petconnect_test` database. The tests truncate test tables. **Never point the test command at a database containing real data.**

The integration tests verify signed recovery-token creation, public-field filtering, tamper/cross-owner denial, revocation/rotation, one active lost case per pet, GPS nearby filtering, LOST -> SIGHTED -> REUNITED transitions, finder-contact privacy, durable owner/nearby notifications, clinic QR authorization, cross-clinic appointment isolation, clinical record/vaccination writes, vaccination-generated booster reminders, appointment state changes, scheduled notification processing, and removal of reunited cases from the public feed.

## Operator CLI

Build first:

```bash
npm run build:backend
```

For the local emulator, set `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, then:

```bash
npm --prefix backend/api run operator -- provision-clinic demo-petconnect local-operator clinic-input.local.json
npm --prefix backend/api run operator -- disable demo-petconnect local-operator ACCOUNT_UID
```

Clinic credentials are set separately through Firebase Auth/Admin tooling. Provisioning a clinic record does not itself give the user a password.
