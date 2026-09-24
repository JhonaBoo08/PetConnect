import { Auth } from "firebase-admin/auth";
import { FieldValue, Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { parseProfile, Session } from "./contracts";

const denied = () =>
  new HttpsError("permission-denied", "Account access is unavailable.");

export type ClinicStatus = "verified" | "pending" | "rejected";

export type ClinicInfoInput = {
  clinicName: string;
  phone: string;
  city: string;
  province: string;
  address: string;
  veterinarianInCharge: string;
  license: string;
  staff: string[];
};

function parseClinicInfo(value: unknown): ClinicInfoInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpsError("invalid-argument", "Invalid clinic profile.");
  const data = value as Record<string, unknown>;
  const allowed = new Set([
    "clinicName",
    "phone",
    "city",
    "province",
    "address",
    "veterinarianInCharge",
    "license",
    "staff",
  ]);
  if (Object.keys(data).some((key) => !allowed.has(key)))
    throw new HttpsError("invalid-argument", "Invalid clinic profile.");
  const text = (value: unknown, max: number): string => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max)
      throw new HttpsError("invalid-argument", "Invalid clinic profile.");
    return value.trim();
  };
  const optional = (value: unknown, max: number): string => {
    if (value === undefined) return "";
    if (typeof value !== "string" || value.length > max)
      throw new HttpsError("invalid-argument", "Invalid clinic profile.");
    return value.trim();
  };
  const staff = Array.isArray(data.staff)
    ? data.staff.map((member) => {
        if (typeof member !== "string" || !member.trim() || member.length > 80)
          throw new HttpsError("invalid-argument", "Invalid clinic profile.");
        return member.trim();
      })
    : [];
  return {
    clinicName: text(data.clinicName, 80),
    phone: text(data.phone, 30),
    city: text(data.city, 80),
    province: optional(data.province, 80),
    address: optional(data.address, 300),
    veterinarianInCharge: optional(data.veterinarianInCharge, 80),
    license: optional(data.license, 40),
    staff,
  };
}

function clinicStatusLabel(status: string | undefined): ClinicStatus {
  if (status === "ACTIVE") return "verified";
  if (status === "DISABLED") return "rejected";
  return "pending";
}

export class Accounts {
  constructor(
    private auth: Auth,
    private db: Firestore,
  ) {}

  async initializeOwner(uid: string, input: unknown): Promise<void> {
    let profile;
    try {
      profile = parseProfile(input);
    } catch {
      throw new HttpsError(
        "invalid-argument",
        "Provide a valid display name and optional phone.",
      );
    }
    const user = await this.auth.getUser(uid);
    if (
      user.disabled ||
      !user.email ||
      !user.providerData.some((p) => p.providerId === "password") ||
      (user.customClaims?.role && user.customClaims.role !== "OWNER") ||
      user.customClaims?.clinicId
    )
      throw denied();
    const ref = this.db.doc(`users/${uid}`);
    await this.db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.exists) {
        if (
          current.get("role") !== "OWNER" ||
          !["PENDING", "ACTIVE"].includes(current.get("status"))
        )
          throw denied();
        return;
      }
      tx.create(ref, {
        ...profile,
        email: user.email,
        role: "OWNER",
        status: "PENDING",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    // Auth and Firestore are separate systems. A PENDING profile is denied by rules
    // until claims have been written. Retrying completes the same profile.
    await this.auth.setCustomUserClaims(uid, {
      ...user.customClaims,
      role: "OWNER",
    });
    if ((await this.auth.getUser(uid)).disabled) throw denied();
    await this.db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (
        current.get("role") !== "OWNER" ||
        !["PENDING", "ACTIVE"].includes(current.get("status"))
      )
        throw denied();
      if (current.get("status") === "PENDING") {
        tx.update(ref, {
          status: "ACTIVE",
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.create(this.db.doc(`auditLogs/owner-created-${uid}`), {
          eventType: "OWNER_CREATED",
          actorId: uid,
          entityId: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  }

  async session(
    uid: string,
    claims: Record<string, unknown>,
  ): Promise<Session> {
    const user = await this.auth.getUser(uid);
    const profile = (await this.db.doc(`users/${uid}`).get()).data();
    if (
      user.disabled ||
      !profile ||
      profile.status !== "ACTIVE" ||
      !["OWNER", "CLINIC"].includes(profile.role) ||
      claims.role !== profile.role
    )
      throw denied();
    if (profile.role === "CLINIC") {
      if (!profile.clinicId || claims.clinicId !== profile.clinicId)
        throw denied();
      const clinic = (
        await this.db.doc(`clinics/${profile.clinicId}`).get()
      ).data();
      if (
        clinic?.status !== "ACTIVE" ||
        !clinic.provisionedUserIds?.includes(uid)
      )
        throw denied();
    }
    return {
      uid,
      role: profile.role,
      displayName: profile.displayName,
      email: profile.email,
      ...(profile.phone !== undefined ? { phone: profile.phone } : {}),
      ...(profile.role === "CLINIC" ? { clinicId: profile.clinicId } : {}),
    };
  }

  async provisionClinic(
    input: {
      uid: string;
      email: string;
      clinicId: string;
      name: string;
      address: string;
    },
    actorId: string,
  ): Promise<void> {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("Invalid clinic input");
    const { uid, clinicId, email, name, address } = input;
    if (
      ![uid, clinicId].every(
        (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id),
      ) ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 80 ||
      typeof address !== "string" ||
      !address.trim() ||
      address.length > 300
    )
      throw new Error("Invalid clinic input");
    const userRef = this.db.doc(`users/${uid}`);
    const clinicRef = this.db.doc(`clinics/${clinicId}`);
    // Reserve the profile first. Never convert an existing owner into a clinic.
    await this.db.runTransaction(async (tx) => {
      const profile = await tx.get(userRef);
      const clinic = await tx.get(clinicRef);
      if (
        profile.exists &&
        (profile.get("role") !== "CLINIC" ||
          profile.get("clinicId") !== clinicId ||
          profile.get("email") !== email ||
          !["PENDING", "ACTIVE"].includes(profile.get("status")))
      )
        throw new Error("UID already provisioned or unavailable");
      if (
        clinic.exists &&
        (clinic.get("status") !== "ACTIVE" ||
          clinic.get("name") !== name ||
          clinic.get("address") !== address)
      )
        throw new Error("Clinic details do not match");
      if (!profile.exists)
        tx.create(userRef, {
          role: "CLINIC",
          clinicId,
          email,
          displayName: name,
          status: "PENDING",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      if (!clinic.exists)
        tx.create(clinicRef, {
          name,
          address,
          status: "ACTIVE",
          provisionedUserIds: [],
        });
    });
    let user;
    try {
      user = await this.auth.getUser(uid);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found")
        throw error;
      user = await this.auth.createUser({ uid, email, disabled: true });
    }
    const proof = await this.db
      .doc(`auditLogs/clinic-provisioned-${uid}`)
      .get();
    if (
      user.email !== email ||
      (!user.disabled && !proof.exists) ||
      (user.customClaims?.role && user.customClaims.role !== "CLINIC") ||
      (user.customClaims?.clinicId && user.customClaims.clinicId !== clinicId)
    )
      throw new Error("Existing Auth user cannot be adopted");
    if ((await userRef.get()).get("status") === "ACTIVE") {
      if (
        user.disabled ||
        user.customClaims?.role !== "CLINIC" ||
        user.customClaims?.clinicId !== clinicId
      )
        throw denied();
      return;
    }
    await this.auth.setCustomUserClaims(uid, { role: "CLINIC", clinicId });
    await this.db.runTransaction(async (tx) => {
      const profile = await tx.get(userRef);
      const clinic = await tx.get(clinicRef);
      if (
        profile.get("status") !== "PENDING" ||
        clinic.get("status") !== "ACTIVE"
      )
        throw denied();
      tx.update(clinicRef, { provisionedUserIds: FieldValue.arrayUnion(uid) });
      if (!proof.exists)
        tx.create(this.db.doc(`auditLogs/clinic-provisioned-${uid}`), {
          eventType: "CLINIC_PROVISIONED",
          actorId,
          entityId: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
    });
    // Enabling Auth does not grant access while the profile remains PENDING.
    await this.auth.updateUser(uid, { disabled: false });
    try {
      await this.db.runTransaction(async (tx) => {
        const profile = await tx.get(userRef);
        if (profile.get("status") !== "PENDING") throw denied();
        tx.update(userRef, {
          status: "ACTIVE",
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    } catch (error) {
      await this.auth.updateUser(uid, { disabled: true });
      throw error;
    }
  }

  async disable(uid: string, actorId: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error("Invalid UID");
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.doc(`users/${uid}`);
      const profile = await tx.get(ref);
      if (!profile.exists) throw new Error("Account profile not found");
      if (profile.get("status") !== "DISABLED") {
        tx.update(ref, {
          status: "DISABLED",
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.create(this.db.doc(`auditLogs/account-disabled-${uid}`), {
          eventType: "ACCOUNT_DISABLED",
          actorId,
          entityId: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
    await this.auth.updateUser(uid, { disabled: true });
    await this.auth.revokeRefreshTokens(uid);
  }

  /** Self-serve clinic registration submitted from the app while awaiting review. */
  async registerClinicProfile(uid: string, input: unknown): Promise<{
    clinicId: string;
    clinicName: string;
    status: ClinicStatus;
  }> {
    const info = parseClinicInfo(input);
    const user = await this.auth.getUser(uid);
    if (
      user.disabled ||
      !user.email ||
      !user.providerData.some((p) => p.providerId === "password") ||
      (user.customClaims?.role && user.customClaims.role !== "CLINIC")
    )
      throw denied();
    const clinicId = uid;
    const userRef = this.db.doc(`users/${uid}`);
    const clinicRef = this.db.doc(`clinics/${clinicId}`);
    await this.db.runTransaction(async (tx) => {
      const profile = await tx.get(userRef);
      const clinic = await tx.get(clinicRef);
      if (
        profile.exists &&
        (profile.get("role") !== "CLINIC" ||
          profile.get("clinicId") !== clinicId ||
          profile.get("email") !== user.email ||
          profile.get("status") === "DISABLED")
      )
        throw denied();
      if (clinic.exists && clinic.get("status") === "DISABLED") throw denied();
      if (!profile.exists)
        tx.create(userRef, {
          role: "CLINIC",
          clinicId,
          email: user.email,
          displayName: info.clinicName,
          status: "PENDING",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      else
        tx.update(userRef, {
          updatedAt: FieldValue.serverTimestamp(),
        });
      if (!clinic.exists)
        tx.create(clinicRef, {
          ...info,
          status: "PENDING",
          provisionedUserIds: [uid],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      else
        tx.update(clinicRef, {
          ...info,
          provisionedUserIds: FieldValue.arrayUnion(uid),
          updatedAt: FieldValue.serverTimestamp(),
        });
    });
    if (user.customClaims?.role !== "CLINIC" || user.customClaims?.clinicId !== clinicId)
      await this.auth.setCustomUserClaims(uid, {
        ...user.customClaims,
        role: "CLINIC",
        clinicId,
      });
    const clinic = (await clinicRef.get()).data();
    return {
      clinicId,
      clinicName: clinic?.name ?? info.clinicName,
      status: clinicStatusLabel(clinic?.status),
    };
  }

  async clinicProfileForVet(uid: string): Promise<{
    clinicId: string;
    clinicName: string;
    status: ClinicStatus;
  } | null> {
    const profile = (await this.db.doc(`users/${uid}`).get()).data();
    if (!profile || profile.role !== "CLINIC" || !profile.clinicId) return null;
    const clinic = (
      await this.db.doc(`clinics/${profile.clinicId}`).get()
    ).data();
    if (!clinic) return null;
    return {
      clinicId: profile.clinicId,
      clinicName: clinic.name ?? profile.displayName ?? "",
      status: clinicStatusLabel(clinic.status),
    };
  }
}
