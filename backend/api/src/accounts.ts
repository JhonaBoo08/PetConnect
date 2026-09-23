import { Auth, DecodedIdToken } from "firebase-admin/auth";
import { Pool, RowDataPacket } from "mysql2/promise";
import {
  UserRole,
  AccountStatus,
  SessionResponse,
  InitializeOwnerRequest,
  UpdateProfileRequest,
} from "../../../shared/contracts.js";

export class Accounts {
  constructor(
    private auth: Auth,
    private pool: Pool,
  ) {}

  async initializeOwner(
    uid: string,
    input: InitializeOwnerRequest,
  ): Promise<{ status: AccountStatus; refreshToken: boolean }> {
    const displayName = input.displayName?.trim();
    if (!displayName || displayName.length < 2 || displayName.length > 80) {
      throw new Error("Invalid display name");
    }
    const phone = input.phone?.trim() || null;

    const [users] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, role, status FROM users WHERE id = ?",
      [uid],
    );

    let authUser;
    try {
      authUser = await this.auth.getUser(uid);
    } catch {
      throw new Error("User does not exist in Firebase Auth");
    }

    if (users.length > 0) {
      const existing = users[0];
      if (existing.role !== "OWNER") {
        throw new Error("Account is not an owner");
      }
      if (existing.status === "DISABLED") {
        throw new Error("Account disabled");
      }
      if (existing.status === "ACTIVE") {
        return { status: "ACTIVE", refreshToken: false };
      }
    } else {
      await this.pool.query(
        "INSERT INTO users (id, email, role, display_name, phone, status) VALUES (?, ?, 'OWNER', ?, ?, 'PENDING')",
        [uid, authUser.email, displayName, phone],
      );
    }

    await this.auth.setCustomUserClaims(uid, { role: "OWNER" });

    await this.pool.query(
      "UPDATE users SET status = 'ACTIVE', display_name = ?, phone = ? WHERE id = ?",
      [displayName, phone, uid],
    );

    await this.pool.query(
      "INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, details) VALUES ('user', ?, 'initialize_owner', ?, ?)",
      [uid, uid, JSON.stringify({ displayName, phone })],
    );

    return { status: "ACTIVE", refreshToken: true };
  }

  async session(uid: string, token: DecodedIdToken): Promise<SessionResponse> {
    const [users] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, role, status FROM users WHERE id = ?",
      [uid],
    );
    if (users.length === 0) {
      throw new Error("User not found");
    }
    const user = users[0];
    if (user.status !== "ACTIVE") {
      throw new Error("Account not active");
    }

    const claimRole = token.role as UserRole | undefined;
    if (!claimRole || claimRole !== user.role) {
      throw new Error("Role mismatch");
    }

    let clinicId: string | undefined;
    if (user.role === "CLINIC") {
      const [members] = await this.pool.query<RowDataPacket[]>(
        `SELECT cm.clinic_id 
         FROM clinic_members cm 
         JOIN clinics c ON cm.clinic_id = c.id 
         WHERE cm.user_id = ? AND c.status = 'ACTIVE'`,
        [uid],
      );
      if (members.length === 0) {
        throw new Error("Clinic membership inactive or missing");
      }
      clinicId = members[0].clinic_id;
    }

    return {
      role: user.role,
      status: user.status,
      ...(clinicId ? { clinicId } : {}),
    };
  }

  async updateProfile(uid: string, input: UpdateProfileRequest): Promise<void> {
    const [users] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, status FROM users WHERE id = ?",
      [uid],
    );
    if (users.length === 0 || users[0].status !== "ACTIVE") {
      throw new Error("Account inactive or missing");
    }

    const updates: string[] = [];
    const params: (string | null)[] = [];

    if (input.displayName !== undefined) {
      const name = input.displayName.trim();
      if (name.length < 2 || name.length > 80)
        throw new Error("Invalid display name");
      updates.push("display_name = ?");
      params.push(name);
    }
    if (input.phone !== undefined) {
      const phone = input.phone ? input.phone.trim() : null;
      updates.push("phone = ?");
      params.push(phone);
    }

    if (updates.length === 0) return;

    params.push(uid);
    await this.pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      params,
    );
  }

  async provisionClinic(
    input: {
      uid: string;
      email: string;
      clinicId: string;
      name: string;
      address: string;
      phone?: string;
    },
    operatorId: string,
  ): Promise<void> {
    if (
      !input ||
      !input.uid ||
      !input.email ||
      !input.clinicId ||
      !input.name ||
      !input.address
    ) {
      throw new Error("Invalid clinic input");
    }

    let authUser;
    try {
      authUser = await this.auth.getUser(input.uid);
    } catch {
      authUser = await this.auth.createUser({
        uid: input.uid,
        email: input.email,
      });
    }

    await this.pool.query(
      "INSERT INTO clinics (id, name, address, phone, status) VALUES (?, ?, ?, ?, 'ACTIVE') ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address)",
      [input.clinicId, input.name, input.address, input.phone || null],
    );

    await this.pool.query(
      "INSERT INTO users (id, email, role, display_name, phone, status) VALUES (?, ?, 'CLINIC', ?, ?, 'ACTIVE') ON DUPLICATE KEY UPDATE status = 'ACTIVE'",
      [input.uid, authUser.email, input.name, input.phone || null],
    );

    await this.pool.query(
      "INSERT IGNORE INTO clinic_members (clinic_id, user_id) VALUES (?, ?)",
      [input.clinicId, input.uid],
    );

    await this.auth.setCustomUserClaims(input.uid, {
      role: "CLINIC",
      clinicId: input.clinicId,
    });

    await this.pool.query(
      "INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, details) VALUES ('clinic', ?, 'provision_clinic', ?, ?)",
      [input.clinicId, operatorId, JSON.stringify(input)],
    );
  }

  async disable(uid: string, operatorId: string): Promise<void> {
    await this.auth.updateUser(uid, { disabled: true });
    await this.auth.revokeRefreshTokens(uid);

    await this.pool.query("UPDATE users SET status = 'DISABLED' WHERE id = ?", [
      uid,
    ]);

    await this.pool.query(
      "INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, details) VALUES ('user', ?, 'disable_account', ?, null)",
      [uid, operatorId],
    );
  }
}
