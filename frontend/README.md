# PetConnect frontend

The frontend is the Expo SDK 57 / React Native client for web, Android, and iOS.

From the repository root:

```bash
npm --prefix frontend ci
cp frontend/.env.example frontend/.env.local
npm run web
```

Important checks:

```bash
npm run typecheck:frontend
npm run lint:frontend
npm run test:frontend
npm run doctor:frontend
npm run web:export
npm run release:android
npm run release:ios
```

Authentication uses Firebase Authentication. Application data comes from the Express/MySQL API configured by `EXPO_PUBLIC_API_BASE_URL`.

For native push, configure an operator-owned EAS project through `EXPO_PUBLIC_EAS_PROJECT_ID` and the required FCM/APNs credentials. For local physical-device testing, leave `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_EMULATOR_HOST` unset. Emulator-mode development automatically routes API, photos, and Firebase Auth SDK calls through the Expo server, including `npm run dev:tunnel`. Start the API and Auth emulator as described in the root README. An explicitly configured endpoint must be reachable from the phone.

See the repository root [README](../README.md) and [production deployment guide](../PRODUCTION_DEPLOYMENT.md) for the complete setup.
