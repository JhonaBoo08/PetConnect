import type { FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
export const persistentAuth = (app: FirebaseApp) => getAuth(app);
