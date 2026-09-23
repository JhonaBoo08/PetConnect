# Express API & MySQL Backend

The backend foundation supports email/password owner registration, profile
updates, session validation, operator-provisioned clinic accounts, account
disabling, and local media uploads. It uses **Firebase Authentication** for identity
and **MySQL Server** for relational data persistence.

```text
backend/
  api/            Node.js Express API source, dependencies, build, and tests
  firebase.json   Firebase Auth emulator configuration
sql/
  schema.sql      Canonical MySQL database schema (InnoDB, utf8mb4)
shared/
  contracts.ts    Shared request/response DTO contracts
```

## Local setup

1. Install Node.js dependencies:

```powershell
npm ci
npm --prefix backend/api ci
npm --prefix frontend ci
```

2. Copy `.env.example` to `.env.local`. Ensure `EXPO_PUBLIC_API_BASE_URL` is set to `http://127.0.0.1:3000` (or your computer's LAN IP when testing physical devices).

3. Apply `sql/schema.sql` to your local MySQL Server:

```powershell
mysql -u root -p petconnect_db < sql/schema.sql
```

4. Set MySQL credentials in `backend/api/.env`:

```env
MYSQL_HOST=127.0.0.1
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=petconnect_db
MYSQL_PORT=3306
CORS_ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
```

5. Start the Firebase Auth emulator and Express API server:

```powershell
npm run emulators
```

In a separate terminal, start the API server:

```powershell
npm --prefix backend/api run dev
```

## Checks and Integration Tests

```powershell
npm run check:backend
npm run test:backend
```

`check:backend` builds the API, checks frontend types, lints backend & frontend services, and checks formatting. `test:backend` starts the Auth emulator and runs `supertest` HTTP integration tests against a MySQL test database (`petconnect_test`).

## Operator Commands (CLI Only)

Build the API first (`npm run build:backend`). Local CLI operator commands require `FIREBASE_AUTH_EMULATOR_HOST`:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
npm --prefix backend/api run operator -- provision-clinic demo-petconnect local-operator clinic-input.local.json
npm --prefix backend/api run operator -- disable demo-petconnect local-operator ACCOUNT_UID
```

Clinic provisioning creates the clinic record, active user profile, `clinic_members` membership link, and sets Firebase Auth custom claims.
