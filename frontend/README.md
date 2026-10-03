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

For native push, configure an operator-owned EAS project through `EXPO_PUBLIC_EAS_PROJECT_ID` and the required FCM/APNs credentials. For local physical-device testing, use network-reachable API/Auth-emulator hosts rather than `127.0.0.1`.

See the repository root [README](../README.md) and [production deployment guide](../PRODUCTION_DEPLOYMENT.md) for the complete setup.
