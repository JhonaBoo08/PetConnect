# PetConnect Feature Audit

**Audit date:** 2026-10-05  
**Branch:** `main`  
**Scope:** Current owner, finder, recovery, notification, privacy, and personal-care experience. The planned-for-removal veterinary/clinic product area is intentionally excluded from the user manual and is not treated as part of the target product scope in this audit.

## Executive summary

The current PetConnect codebase has a coherent core product centered on pet identity and recovery:

1. owner authentication and account/session protection;
2. pet registration and photo management;
3. generated Pet IDs;
4. multiple revocable QR recovery tags per pet;
5. QR and short-code scanning;
6. public finder recovery without requiring an owner account;
7. finder evidence, location, optional contact sharing, and phone verification;
8. lost-pet reporting and nearby discovery;
9. owner recovery cases, sightings, map trails, finder-report review, and reunification;
10. in-app/push notifications;
11. owner privacy controls;
12. personal care reminders and a care calendar.

The five-tab owner navigation is currently:

`Home | Pets | Scan | Recovery | Profile`

No critical source-level failure was found in the audited owner/finder scope. Type checking, linting, backend compilation, frontend tests, repository audit tests, and production-readiness source checks pass.

The main release concern is **scope cleanup**: the module planned for removal is still wired into authentication roles, route guards, shared contracts, owner care services, and several pieces of UI copy. It should be removed as one controlled de-scope rather than by deleting only its screens.

---

## Current feature inventory

| Area | Status | Notes |
| --- | --- | --- |
| Account creation | Implemented | Firebase/API-backed registration flow |
| Sign in | Implemented | Auth state is centrally guarded |
| Password reset | Implemented | Available from sign-in |
| Session state | Implemented | Loading, setup, blocked/error, and signed-in states |
| Logout | Implemented | Confirmation flow |
| Owner dashboard | Implemented | Pets, upcoming care, recovery shortcut, notifications |
| Pet list | Implemented | Shows all pets owned by current account |
| Add pet | Implemented | Photo + identity fields |
| Edit pet | Implemented | Round-trip through API |
| Delete pet | Implemented | Confirmation required |
| Pet photo | Implemented | Pick, optimize when possible, upload, replace/remove |
| Generated Pet ID | Implemented | Assigned after save |
| Multiple recovery tags | Implemented | Collar, harness, print, sticker |
| Recovery QR | Implemented | QR contains revocable public recovery identity |
| Recovery short code | Implemented | Manual fallback to QR scanning |
| Tag lifecycle | Implemented | Replace, mark lost, disable/revoke |
| Tag scan history | Implemented | Last scan + scan count shown to owner |
| Tag export | Implemented | Download/print on web, share on mobile |
| Public scan flow | Implemented | Does not require owner sign-in |
| No-tag nearby search | Implemented | Species/breed/appearance + location |
| Public recovery profile | Implemented | Recovery-safe pet information |
| Finder "I have pet" flow | Implemented | Current photo required |
| Finder sighting flow | Implemented | Photo optional |
| Finder location | Implemented | GPS or typed landmark/street |
| Finder contact sharing | Implemented | Explicit opt-in |
| Finder phone verification | Implemented | OTP challenge when required |
| Finder evidence | Implemented | Staged photo evidence and retention controls |
| Lost-pet report | Implemented | Pet, last seen, map/GPS, details, publish |
| Nearby recovery feed | Implemented | Location-based active cases |
| Owner recovery cases | Implemented | Active and reunited cases |
| Recovery statuses | Implemented | LOST → SIGHTED → REUNITED |
| Recovery map trail | Implemented | Original location + accepted sightings |
| Finder report review | Implemented | Evidence, contact, verification, timeline |
| Abuse reporting | Implemented | Finder submissions/contact can be reported |
| Mark reunited | Implemented | Owner confirmation flow |
| Lost-pet poster | Implemented | Share on mobile / print on web |
| In-app notifications | Implemented | Notification history and deep-link routing |
| Push notifications | Implemented | Registration, token refresh, response routing |
| Personal reminders | Implemented | Create, complete, reopen, reschedule, delete |
| Care calendar | Implemented | Monthly view, per-pet filtering, create reminder |
| Profile | Implemented | Identity, contact, pet count, settings, logout |
| Recovery privacy | Implemented | Recovery phone and precise-location controls |

---

## Recovery and privacy audit

The recovery implementation has several strong controls already in place.

### Public profile minimizes sensitive pet data

The public recovery profile exposes whether a pet is microchipped, but not the actual microchip number. The owner-facing Pet ID can still show the number to the authenticated owner.

### Recovery phone is opt-in

The owner recovery-phone setting defaults to disabled. A public recovery profile only receives the phone number when the owner has enabled recovery-phone sharing.

### Exact lost location is opt-in

Precise location sharing defaults to disabled. When it is disabled, public recovery coordinates are reduced in precision before they are returned.

### Finder flow has abuse controls

The backend includes:

- anonymous finder sessions;
- rate limits for public/finder actions;
- idempotency keys for finder submissions;
- finder evidence controls;
- phone OTP verification when required;
- abuse-report endpoints;
- evidence retention/cleanup handling.

These controls support the app's public finder flow without requiring every finder to create an account.

---

## Navigation and UX audit

### Main navigation is understandable

The owner-facing root navigation is now organized around five distinct destinations:

- Home
- Pets
- Scan
- Recovery
- Profile

This is substantially clearer than duplicating pet/recovery actions across multiple root tabs.

### Root screens and child screens are mostly separated correctly

Root destinations remain persistent navigation targets, while actions such as Add Pet, Pet ID, Recovery Report, Privacy, and Reminder Details behave as child flows.

### Internal route naming still carries older terminology

The user-facing **Recovery** root is implemented in `alerts.tsx`. This is not a functional problem, but the filename/route terminology is stale and can confuse future maintenance.

A future cleanup can rename the internal route after higher-priority scope work is complete.

---

## Planned scope-removal impact

The product area planned for removal is **not isolated to three screens**. It currently touches the following architectural layers:

- auth role handling and route guards;
- shared role/contracts and database schema;
- owner care service naming and data contracts;
- dashboard data loading;
- care-calendar aggregation;
- notification copy/routing;
- privacy settings;
- profile copy;
- pet-profile privacy copy;
- tests and migrations.

Because of that coupling, removing only the dedicated screens would leave dead branches and misleading owner UI.

### Recommended removal strategy

1. **Freeze the target owner/finder feature set** using this audit and the user manual.
2. **Preserve personal reminders and the care calendar** as owner-only functionality.
3. Split owner reminder APIs/services away from mixed legacy service naming before deleting the planned-for-removal module.
4. Remove the unused role, route guards, routes, screens, service methods, shared types, database objects, and tests as one reviewed change.
5. Remove all stale owner-facing copy and settings that refer to the removed scope.
6. Run the full frontend, backend, migration, and E2E suites after the de-scope.
7. Re-audit the public API to ensure no removed endpoint remains reachable.

---

## Validation results

### Passed in this audit

- `npm run typecheck`
- `npm run lint:frontend`
- `npm run lint:backend`
- `npm run build:backend`
- `npm run test:frontend`
- `npm run test:audit`
- `npm run test:production-readiness`

All of the checks above completed successfully.

### Backend integration suite: environment-blocked

`npm run test:backend` currently stops during the test-database reset because the configured local MySQL endpoint is not running.

Direct connection check:

`ECONNREFUSED 127.0.0.1:3306`

This is an environment prerequisite failure rather than evidence of a TypeScript/build regression. The backend integration suite should be rerun after the local test MySQL instance is started.

---

## Issues and recommendations

### P1 — Planned scope removal is cross-cutting

Do not delete only the dedicated screens. The old scope is referenced by auth, data contracts, services, owner UI, database schema, and tests.

**Action:** perform a controlled de-scope with owner reminders/calendar explicitly preserved.

### P1 — Current backend integration gate cannot run without MySQL

The source-level backend build passes, but the full database-backed suite was not revalidated in this audit because nothing is listening on the configured local MySQL port.

**Action:** start the test MySQL instance and rerun `npm run test:backend` before a release or major backend change.

### P2 — Care functionality should be renamed/separated from mixed legacy service code

Personal reminders and the owner calendar are valid standalone PetConnect features, but their current service layer is mixed with functionality being removed.

**Action:** create a clean owner-care/reminders service boundary before deleting the old module.

### P2 — Some user-facing copy will become stale after the de-scope

Several current strings still describe the old scope in account/privacy/care/notification surfaces.

**Action:** include text cleanup in the same de-scope PR so the UI matches the new product definition.

### P3 — Welcome copy is location-specific

The landing page currently describes the network as operating across Tagum City.

**Action:** keep it if Tagum City is the intended product boundary; otherwise move the location to configuration/content instead of hard-coding it.

### P3 — Internal route name `alerts` no longer matches the Recovery concept

This is maintenance debt only.

**Action:** rename later if desired; do not prioritize it over the scope cleanup.

---

## Recommended product definition after cleanup

PetConnect should be presented as a **pet identity and community recovery platform with lightweight owner care reminders**.

The strongest core loop is:

**Register pet → create/print QR tag → finder scans or searches nearby → finder submits location/evidence → owner receives update → recovery trail updates → owner marks reunited.**

That loop is already supported by the current frontend and backend and should remain the center of the app.

---

## User manual

The user-facing manual created from this audit is:

`docs/USER_MANUAL.md`

It intentionally documents only the owner/finder product scope intended to remain.
