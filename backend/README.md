# Firebase backend

The backend foundation supports email/password owner registration, profile
updates, session validation, operator-provisioned clinic accounts, and account
disabling. The Expo services are in `src/services/auth.ts`; the starter screens
are not yet connected to these services.

All commands below run from the repository root. Firebase configuration, rules,
Functions source, and integration tests live together in `backend/`. The Expo
client services remain in `src/services/`.

```text
backend/
  functions/      Cloud Functions source, dependencies, and build configuration
  firebase/       Firestore indexes and Firestore/Storage access rules
  tests/          Backend integration tests
  firebase.json   Firebase service and emulator configuration
  .firebaserc     Firebase project aliases
```

Root npm scripts select `backend/firebase.json` automatically. For direct
Firebase CLI commands from the repository root, pass
`--config backend/firebase.json` so the CLI uses this backend's configuration.

## Local setup

Use Node.js 22.13 or newer (Node 22 matches the Functions runtime), Java 21 or
newer, and install both dependency sets:

```powershell
npm ci
npm --prefix backend/functions ci
```

Copy `.env.example` to `.env.local` if you do not already have a local file.
Keep `EXPO_PUBLIC_FIREBASE_ENV=emulator` for local development. The emulator
project is always `demo-petconnect`, independent of the Firebase CLI aliases.
The default host, `127.0.0.1`, supports a browser running on this computer.
Physical devices require reachable emulator bindings and the computer's LAN
address in `EXPO_PUBLIC_EMULATOR_HOST`; the checked-in bindings are loopback-only.

```powershell
npm run emulators
```

In a second terminal, run `npm start`. Emulator UI is available at
`http://127.0.0.1:4000`. Restart Expo after changing environment variables.
Emulator data is temporary; these commands do not import or export it.

## Checks

```powershell
npm run check:backend
npm run test:backend
```

The first command builds Functions, checks app types, and checks backend lint
and formatting. The second starts Auth, Firestore, Functions, and Storage
emulators, runs integration and access-rule tests, then stops the emulators.
Stop a manually started emulator suite before running the test command because
it needs the same ports. CI runs both commands.

If Functions discovery times out on a slow local startup, allow 60 seconds in
the current PowerShell terminal before starting the suite:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"
npm run test:backend
```

On Windows, if a Java emulator window remains after the suite exits, close that
test emulator before restarting; it can continue holding port 8080.

## Account behavior

- Owners register through `registerOwner`. If profile initialization fails after
  account creation, retry `completeOwnerRegistration` in the signed-in session.
- Profile initialization writes a `PENDING` profile, assigns server-managed
  claims, then activates the profile. Retrying preserves existing profile data.
- Sessions require matching claims and an active profile. Clinics also require
  an active clinic and membership in its provisioned user list.
- Clients can read their own active profile and update its display name, phone,
  and server timestamp. Roles, status, email, and clinic membership are protected.
- Other collections and all Storage access are denied by the current rules.
- Disabling an account preserves its profile and audit history, denies profile
  access, disables Auth, and revokes refresh tokens. Retrying is supported.

## Operator commands

Build first with `npm run build:backend`. For local operator commands, set both
emulator addresses in the same terminal:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
npm --prefix backend/functions run operator -- provision-clinic demo-petconnect local-operator clinic-input.local.json
npm --prefix backend/functions run operator -- disable demo-petconnect local-operator ACCOUNT_UID
```

The clinic JSON requires `uid`, `email`, `clinicId`, `name`, and `address`.
Use a stable UID when retrying. Clinic provisioning does not set a password;
the user must complete a password reset before signing in. Emulator Auth prints
email-action links locally. The operator ID is an audit label; authorization
comes from the trusted Admin SDK credentials, not that label.

## Connected environments

CLI aliases are `dev` (`petconnect-8e685`) and `staging`
(`petconnect-staging-4069d`). Client environment selection must match the exact
project ID and include the public Web app configuration listed in `.env.example`.
Never place Admin credentials in `EXPO_PUBLIC_*` variables.

Live operator commands require Application Default Credentials and both emulator
variables unset. Live deployment, sign-in provider configuration, and end-to-end
device verification are separate from the local checks above; passing emulator
tests does not establish that a live project is configured or deployed.
