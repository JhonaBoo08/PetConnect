# Dependency security policy

PetConnect treats dependency auditing as a release gate. Run npm run audit:prod.

The gate executes npm audit --omit=dev --json for the root, backend API, and frontend. It fails on every critical advisory and on every high advisory except the exact upstream exceptions below. New high/critical advisories therefore fail the build automatically.

## Current upstream exceptions

### braces — GHSA-vfj7-8cjw-p6xm

- Severity: high.
- Exposure in this repository: Expo/Metro/Jest file-matching and build/test tooling.
- PetConnect does not accept a user-supplied glob pattern in the deployed API or application that reaches this package.
- At the time this exception was added, installed braces 3.0.3 was also the latest published release, so no patched compatible version existed.
- npm's proposed automatic remediation requires incompatible Expo/Jest/React Native changes rather than a patched braces release.

### node-forge — GHSA-86w9-cpqp-85rv

- Severity: high.
- Exposure in this repository: @expo/code-signing-certificates / Expo CLI tooling.
- PetConnect does not expose node-forge certificate-signature verification as deployed application functionality.
- At the time this exception was added, installed node-forge 1.4.0 was also the latest published release, so no patched version existed.
- npm's proposed automatic remediation changes the Expo dependency line incompatibly with the current SDK.

## Fixed during release cleanup

Firebase's package graph included an unused Firestore dependency on an old @grpc/grpc-js. Even though PetConnect uses Firebase Authentication only and does not use Firestore, the frontend overrides that transitive dependency to patched @grpc/grpc-js 1.14.5.

Expo's iOS project tooling also resolves `xcode@3.0.1`, whose released dependency range installs a vulnerable `uuid@7.x`. PetConnect applies a scoped `xcode -> uuid@11.1.1` override. The xcode package only uses the CommonJS `uuid.v4()` API in this path, which remains available in uuid 11.1.1. This removes the advisory without broadening the exception list or crossing the Expo SDK compatibility line.

The full typecheck, tests, Expo Doctor, and platform exports must remain green with these overrides.

## Review rules

- Do not add a broad package-name or severity waiver.
- An exception must identify the exact advisory URL and explain reachability.
- Remove an exception when an upstream patched release becomes compatible.
- Do not use npm audit fix --force to cross Expo/React Native compatibility boundaries.
- Moderate advisories are still reviewed, but the release-blocking target is zero critical and zero unapproved/runtime-reachable high advisories.
