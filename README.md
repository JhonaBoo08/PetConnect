# PetConnect

PetConnect is an Expo/React Native pet identity, recovery, and veterinary-health platform backed by Firebase Authentication, an Express/TypeScript API, and MySQL 8.

Current functionality includes owner/clinic authentication, real Pet CRUD and photos, signed revocable Pet ID QR codes, public recovery profiles, camera scanning, lost reports/sightings/GPS/nearby recovery, notifications, clinic QR patient lookup, health records, vaccinations, reminders, appointments, privacy controls, migration/backup tooling, and automated quality/release checks.

## Start here

- **ZIP → new GitHub repo → free public web deployment:** follow **[PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md)**. It covers Oracle Always Free, MySQL, Firebase Spark, DuckDNS, HTTPS, backups, and live acceptance checks. Free VM capacity and continued availability are not guaranteed; native app-store distribution and background push are outside this web route.
- **Detailed local development and maintenance:** see **[HANDOFF_SETUP.md](HANDOFF_SETUP.md)**.
- **Safe source ZIP from this working tree:** run `powershell -ExecutionPolicy Bypass -File .\scripts\make-handoff.ps1` on Windows.
- **Backend/API and operator details:** see **[backend/README.md](backend/README.md)**.

## Quick local flow

```bash
npm ci
npm --prefix backend/api ci
npm --prefix frontend ci

# Copy and edit:
# backend/api/.env.example -> backend/api/.env
# frontend/.env.example    -> frontend/.env.local

npm run db:bootstrap
npm run emulators
```

In separate terminals:

```bash
npm --prefix backend/api run dev
npm run web
```

Before a free web release, run `npm run release:static`. For the full API and browser integration suite, first prepare a disposable `petconnect_test` MySQL database and Java for the Firebase emulator, then run:

```bash
npm run release:verify
```

Never commit local env files, service-account credentials, recovery signing secrets, uploads, database backups, or generated build output.
