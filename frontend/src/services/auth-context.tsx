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
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
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
    case "auth/network-request-failed":
      return "Cannot reach Firebase Auth. Check your connection or local emulator.";
  }
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "Cannot reach the Pet-Connect API. Check the API address and try again.";
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
        const { disableRecoveryPush } = await import("./device-recovery");
        await disableRecoveryPush();
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
