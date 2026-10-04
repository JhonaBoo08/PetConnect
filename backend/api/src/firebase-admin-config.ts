import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ServiceAccount } from "firebase-admin/app";

export function firebaseServiceAccount(
  env: NodeJS.ProcessEnv = process.env,
): ServiceAccount | undefined {
  const inline = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const file = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!inline && !file) return undefined;
  try {
    const parsed = JSON.parse(inline || readFileSync(file!, "utf8"));
    const projectId = parsed.project_id || parsed.projectId;
    const clientEmail = parsed.client_email || parsed.clientEmail;
    const privateKey = parsed.private_key || parsed.privateKey;
    if (
      typeof projectId !== "string" ||
      !projectId ||
      typeof clientEmail !== "string" ||
      !/^[^\s@]+@[^\s@]+$/.test(clientEmail) ||
      typeof privateKey !== "string"
    )
      throw new Error();
    if (env.FIREBASE_PROJECT_ID && projectId !== env.FIREBASE_PROJECT_ID)
      throw new Error();
    const key = createPrivateKey(privateKey);
    if (
      key.asymmetricKeyType !== "rsa" ||
      (key.asymmetricKeyDetails?.modulusLength || 0) < 2048
    )
      throw new Error();
    return { projectId, clientEmail, privateKey };
  } catch {
    throw new Error(
      "Firebase Admin credentials must be valid service-account JSON with a matching project, client email and RSA private key.",
    );
  }
}
