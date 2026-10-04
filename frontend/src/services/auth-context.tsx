import { onIdTokenChanged, type User } from "firebase/auth";
import { AppState } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  InitializeOwnerRequest,
  SessionResponse,
  UserRole,
} from "../../../shared/contracts";
import {
  ApiError,
  completeOwnerRegistration,
  currentSession,
  login,
  logout,
  registerOwner,
} from "@/services/auth";
import { firebaseClient } from "@/services/firebase/client";
import { authEmulatorUrl } from "./development-endpoints";

export type AuthState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "ready"; session: SessionResponse }
  | { status: "setup"; email: string }
  | { status: "blocked"; message: string }
  | { status: "error"; message: string };

type AuthContextValue = {
  state: AuthState;
  signIn: (
    email: string,
    password: string,
    role: UserRole,
  ) => Promise<SessionResponse>;
  signUp: (
    email: string,
    password: string,
    input: InitializeOwnerRequest,
  ) => Promise<SessionResponse>;
  finishRegistration: (
    input: InitializeOwnerRequest,
  ) => Promise<SessionResponse>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Builds the auth/network-request-failed message. The Firebase SDK only tells
 * us the request failed, not which endpoint, so we read back the address this
 * app is actually configured to reach. In emulator mode that address is the
 * one the developer must be able to open, which turns a vague connectivity
 * warning into an actionable one.
 */
function firebaseNetworkMessage(): string {
  const environment = process.env.EXPO_PUBLIC_FIREBASE_ENV ?? "emulator";
  if (environment === "emulator") {
    return `Cannot reach the Firebase Auth emulator at ${authEmulatorUrl()}. Start it with "npm run emulators", then reload the app.`;
  }
  return `Cannot reach Firebase Auth for the "${environment}" environment. Check your connection and that the Firebase project is reachable.`;
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "account-not-found") {
      return "Your account setup is unfinished. Complete your profile to continue.";
    }
    if (error.status === 401 || error.status === 403) {
      return "This account cannot access Pet-Connect. Contact support if you think this is a mistake.";
    }
    return error.status >= 500
      ? "The account service is unavailable. Please try again."
      : error.message;
  }
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    // Credentials. Firebase 11+ folds wrong-password and user-not-found into
    // invalid-credential so the client cannot enumerate accounts; all three
    // still reach older emulator/production responses.
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/missing-password":
      return "Enter your password.";
    case "auth/email-already-in-use":
      return "That email is already registered. Sign in to continue.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Use a stronger password (at least 6 characters).";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a while and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support.";
    case "auth/requires-recent-login":
      return "Sign in again to confirm this change.";
    case "auth/unverified-email":
      return "Verify your email address before signing in.";

    // Firebase project / console configuration. These mean the app is pointed
    // at the wrong project or a provider was never switched on, which is very
    // different from a connectivity problem and needs a different fix.
    case "auth/invalid-api-key":
      return "The Firebase API key is not valid. Check the EXPO_PUBLIC_FIREBASE_* values in frontend/.env.local.";
    case "auth/api-key-not-supported":
      return "The Firebase API key is not a Web API key. Copy it from the Firebase console Web app settings.";
    case "auth/app-not-found":
      return "No Firebase app matches the configured appId. Check EXPO_PUBLIC_FIREBASE_APP_ID.";
    case "auth/configuration-not-found":
      return "This Firebase project has no Auth configuration. Open the Firebase console and enable Authentication.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is disabled for this Firebase project. Enable it under Authentication > Sign-in method.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized by the Firebase project. Add it under Authentication > Settings > Authorized domains.";
    case "auth/project-not-found":
      return "The Firebase project in frontend/.env.local does not exist.";
    case "auth/unsupported-first-argument":
      return "This sign-in method is not available in the current build.";

    // Emulator wiring. connectAuthEmulator was called twice or the emulator
    // was already configured on this Auth instance.
    case "auth/emulator-config-failed":
      return "The Firebase Auth emulator is already connected to this app. Restart the app if the address is wrong.";

    // Transport. Distinguish "emulator/host unreachable" from a general
    // timeout so the user knows whether to start the emulator or check Wi-Fi.
    case "auth/timeout":
      return "Firebase Auth did not respond in time. Check your connection and try again.";
    case "auth/network-request-failed":
      return firebaseNetworkMessage();
  }
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "Cannot reach the Pet-Connect API. Check the API address and try again.";
  }
  if (code && code.startsWith("auth/")) {
    // Never swallow an unrecognised Firebase code: surface it verbatim so a
    // new SDK error is diagnosable instead of degrading to a generic string.
    return `Firebase Auth error: ${code}`;
  }
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function failedSession(error: unknown, user: User): AuthState {
  if (error instanceof ApiError && error.code === "account-not-found") {
    return { status: "setup", email: user.email || "" };
  }
  if (
    (error instanceof ApiError &&
      (error.status === 401 || error.status === 403)) ||
    (error as { code?: string } | null)?.code === "auth/user-disabled"
  ) {
    return { status: "blocked", message: authErrorMessage(error) };
  }
  return { status: "error", message: authErrorMessage(error) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const revision = useRef(0);
  const busy = useRef(false);

  const loadSession = useCallback(async (user: User | null) => {
    const turn = ++revision.current;
    if (!user) {
      setState({ status: "guest" });
      return;
    }
    setState({ status: "loading" });
    try {
      const session = await currentSession();
      if (turn === revision.current) setState({ status: "ready", session });
    } catch (error) {
      if (turn === revision.current) setState(failedSession(error, user));
    }
  }, []);

  useEffect(() => {
    try {
      const auth = firebaseClient().auth;
      const unsubscribe = onIdTokenChanged(
        auth,
        (user) => {
          if (!busy.current) void loadSession(user);
        },
        (error) =>
          setState({ status: "error", message: authErrorMessage(error) }),
      );
      const subscription = AppState.addEventListener("change", (next) => {
        if (next === "active" && !busy.current && auth.currentUser) {
          void loadSession(auth.currentUser);
        }
      });
      return () => {
        unsubscribe();
        subscription.remove();
        ++revision.current;
      };
    } catch (error) {
      setState({ status: "error", message: authErrorMessage(error) });
    }
  }, [loadSession]);

  async function run<T>(
    action: () => Promise<T>,
    success: (result: T) => AuthState,
    resumeSetup = false,
  ): Promise<T> {
    busy.current = true;
    ++revision.current;
    try {
      const result = await action();
      ++revision.current;
      setState(success(result));
      return result;
    } catch (error) {
      ++revision.current;
      const user = firebaseClient().auth.currentUser;
      const canResume =
        resumeSetup &&
        !(error instanceof ApiError && [401, 403].includes(error.status));
      setState(
        user
          ? canResume
            ? { status: "setup", email: user.email || "" }
            : failedSession(error, user)
          : { status: "guest" },
      );
      throw error;
    } finally {
      busy.current = false;
    }
  }

  const value: AuthContextValue = {
    state,
    signIn: (email, password, role) =>
      run(
        () => login(email, password, role),
        (session) => ({ status: "ready", session }),
      ),
    signUp: (email, password, input) =>
      run(
        () => registerOwner(email, password, input),
        (session) => ({ status: "ready", session }),
        true,
      ),
    finishRegistration: (input) =>
      run(
        () => completeOwnerRegistration(input),
        (session) => ({ status: "ready", session }),
        true,
      ),
    signOut: async () => {
      const previous = state;
      busy.current = true;
      ++revision.current;
      try {
        try {
          const { disableRecoveryPush } = await import("./device-recovery");
          await disableRecoveryPush();
        } catch {
          // Push cleanup is best-effort and must never trap someone in an
          // authenticated session when the notification service is unavailable.
        }
        await logout();
        ++revision.current;
        setState({ status: "guest" });
      } catch (error) {
        setState(previous);
        throw error;
      } finally {
        busy.current = false;
      }
    },
    retry: async () => {
      try {
        await loadSession(firebaseClient().auth.currentUser);
      } catch (error) {
        setState({ status: "error", message: authErrorMessage(error) });
      }
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
