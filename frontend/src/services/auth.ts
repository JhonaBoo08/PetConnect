import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { firebaseClient } from "./firebase/client";
import {
  parseProfile,
  type ProfileInput,
  type Session,
} from "../../../backend/functions/src/contracts";

export async function completeOwnerRegistration(input: ProfileInput) {
  const profile = parseProfile(input);
  const { auth, functions } = firebaseClient();
  if (!auth.currentUser)
    throw new Error("Sign in before completing your profile.");
  await httpsCallable(functions, "initializeOwnerProfile")(profile);
  await auth.currentUser.getIdToken(true);
  return currentSession();
}
export async function registerOwner(
  email: string,
  password: string,
  input: ProfileInput,
) {
  const profile = parseProfile(input);
  await createUserWithEmailAndPassword(
    firebaseClient().auth,
    email.trim(),
    password,
  );
  // If initialization fails, keep the authenticated session so the UI can retry
  // completeOwnerRegistration without creating another Auth account.
  return completeOwnerRegistration(profile);
}
export async function login(email: string, password: string) {
  await signInWithEmailAndPassword(
    firebaseClient().auth,
    email.trim(),
    password,
  );
  return currentSession();
}
export async function currentSession(): Promise<Session> {
  const { auth, functions } = firebaseClient();
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Sign in to continue.");
  await auth.currentUser.getIdToken(true);
  return (await httpsCallable<void, Session>(functions, "getSession")()).data;
}
export async function updateProfile(input: ProfileInput) {
  const { auth, db } = firebaseClient();
  if (!auth.currentUser) throw new Error("Sign in to continue.");
  await updateDoc(doc(db, "users", auth.currentUser.uid), {
    ...parseProfile(input),
    updatedAt: serverTimestamp(),
  });
}
export const resetPassword = (email: string) =>
  sendPasswordResetEmail(firebaseClient().auth, email.trim());
export const logout = () => signOut(firebaseClient().auth);
