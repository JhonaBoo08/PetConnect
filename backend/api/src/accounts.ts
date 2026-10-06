import { Auth, DecodedIdToken } from "firebase-admin/auth";
import { Pool, RowDataPacket } from "mysql2/promise";
import {
  UserRole,
  AccountStatus,
  SessionResponse,
  InitializeOwnerRequest,
  PrivacySettings,
  UpdatePrivacySettings,
  UpdateProfileRequest,
} from "../../../shared/contracts.js";

export class AccountIdentityConflictError extends Error {
  constructor() {
    super("Account identity conflict");
    this.name = "AccountIdentityConflictError";
  }
}

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

    if (authUser.customClaims?.role && authUser.customClaims.role !== "OWNER") {
      throw new Error("Account is not an owner");
    }

    const email = authUser.email?.trim();
    if (!email) throw new AccountIdentityConflictError();

    if (users.length > 0) {
      const existing = users[0];
      if (existing.role !== "OWNER") {
        throw new Error("Account is not an owner");
      }
      if (existing.status === "DISABLED") {
        throw new Error("Account disabled");
      }
      if (existing.status === "ACTIVE") {
        const refreshToken = authUser.customClaims?.role !== "OWNER";
        if (refreshToken) {
          await this.auth.setCustomUserClaims(uid, {
            ...(authUser.customClaims || {}),
            role: "OWNER",
          });
        }
        return { status: "ACTIVE", refreshToken };
      }
    } else {
      const [emailUsers] = await this.pool.query<RowDataPacket[]>(
        "SELECT id, role, status FROM users WHERE email = ? AND id <> ? LIMIT 1",
        [email, uid],
      );
      let reconciled = false;
      if (emailUsers.length > 0) {
        reconciled = await this.reconcileLocalEmulatorIdentity(
          emailUsers[0],
          email,
          uid,
        );
        if (!reconciled) throw new AccountIdentityConflictError();
      }

      if (!reconciled) {
        await this.pool.query(
          "INSERT INTO users (id, email, role, display_name, phone, status) VALUES (?, ?, 'OWNER', ?, ?, 'PENDING')",
          [uid, email, displayName, phone],
        );
      }
    }

    await this.auth.setCustomUserClaims(uid, {
      ...(authUser.customClaims || {}),
      role: "OWNER",
    });

    await this.pool.query(
      "UPDATE users SET status = 'ACTIVE', display_name = ?, phone = ? WHERE id = ?",
      [displayName, phone, uid],
    );

    await this.pool.query(
      "INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, details) VALUES ('user', ?, 'initialize_owner', ?, ?)",
      [uid, uid, JSON.stringify({ profileUpdated: true })],
    );

    return { status: "ACTIVE", refreshToken: true };
  }

  private async reconcileLocalEmulatorIdentity(
    staleUser: RowDataPacket,
    email: string,
    uid: string,
  ): Promise<boolean> {
    if (
      process.env.NODE_ENV === "production" ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      staleUser.role !== "OWNER" ||
      staleUser.status === "DISABLED"
    ) {
      return false;
    }

    const staleUid = String(staleUser.id);

    // Development-only recovery is allowed only when the old database UID no
    // longer exists in the Auth emulator. If it is still a live Auth identity,
    // never move its data to a different account.
    try {
      await this.auth.getUser(staleUid);
      return false;
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== "auth/user-not-found") {
        return false;
      }
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [locked] = await connection.query<RowDataPacket[]>(
        `SELECT id, email, role, status, display_name, phone,
                share_recovery_phone, share_precise_recovery_location,
                share_phone_with_clinics, created_at, updated_at
           FROM users
          WHERE id = ? AND email = ?
          FOR UPDATE`,
        [staleUid, email],
      );
      if (
        locked.length !== 1 ||
        locked[0].role !== "OWNER" ||
        locked[0].status === "DISABLED"
      ) {
        await connection.rollback();
        return false;
      }

      const [current] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE id = ? FOR UPDATE",
        [uid],
      );
      if (current.length > 0) {
        await connection.rollback();
        return false;
      }

      const temporaryEmail = `__petconnect_stale__${staleUid}`;
      await connection.query(
        "UPDATE users SET email = ? WHERE id = ? AND email = ?",
        [temporaryEmail, staleUid, email],
      );
      await connection.query(
        `INSERT INTO users (
           id, email, role, display_name, phone,
           share_recovery_phone, share_precise_recovery_location,
           share_phone_with_clinics, status, created_at, updated_at
         )
         SELECT ?, ?, role, display_name, phone,
                share_recovery_phone, share_precise_recovery_location,
                share_phone_with_clinics, status, created_at, updated_at
           FROM users
          WHERE id = ?`,
        [uid, email, staleUid],
      );

      const [references] = await connection.query<RowDataPacket[]>(
        `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
           FROM information_schema.KEY_COLUMN_USAGE
          WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
            AND REFERENCED_TABLE_NAME = 'users'
            AND REFERENCED_COLUMN_NAME = 'id'`,
      );

      const quoteIdentifier = (value: unknown) => {
        const identifier = String(value);
        if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
          throw new Error("Unsafe database identifier");
        }
        return "`" + identifier + "`";
      };
      for (const reference of references) {
        const table = quoteIdentifier(reference.table_name);
        const column = quoteIdentifier(reference.column_name);
        await connection.query(
          `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`,
          [uid, staleUid],
        );
      }

      await connection.query("DELETE FROM users WHERE id = ?", [staleUid]);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async session(uid: string, token: DecodedIdToken): Promise<SessionResponse> {
    const [users] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, role, status, display_name, email, phone FROM users WHERE id = ?",
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
    if (claimRole !== "OWNER" || user.role !== "OWNER") {
      throw new Error("Role mismatch");
    }

    return {
      role: "OWNER",
      status: user.status,
      displayName: user.display_name,
      email: user.email,
      ...(user.phone ? { phone: user.phone } : {}),
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

  async getPrivacy(uid: string): Promise<PrivacySettings> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        role: UserRole;
        status: AccountStatus;
        share_recovery_phone: number;
        share_precise_recovery_location: number;
      })[]
    >(
      `SELECT role, status, share_recovery_phone,
              share_precise_recovery_location, share_phone_with_clinics
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [uid],
    );
    const user = rows[0];
    if (!user || user.status !== "ACTIVE" || user.role !== "OWNER") {
      throw new Error("Active owner account required");
    }
    return {
      shareRecoveryPhone: Boolean(user.share_recovery_phone),
      sharePreciseRecoveryLocation: Boolean(
        user.share_precise_recovery_location,
      ),
    };
  }

  async updatePrivacy(
    uid: string,
    input: UpdatePrivacySettings,
  ): Promise<PrivacySettings> {
    const current = await this.getPrivacy(uid);
    const next: PrivacySettings = { ...current };
    const keys: (keyof PrivacySettings)[] = [
      "shareRecoveryPhone",
      "sharePreciseRecoveryLocation",
    ];

    for (const key of keys) {
      const value = input[key];
      if (value === undefined) continue;
      if (typeof value !== "boolean") {
        throw new Error("Privacy settings must be boolean values");
      }
      next[key] = value;
    }

    await this.pool.query(
      `UPDATE users
          SET share_recovery_phone = ?,
              share_precise_recovery_location = ?
        WHERE id = ?`,
      [
        next.shareRecoveryPhone ? 1 : 0,
        next.sharePreciseRecoveryLocation ? 1 : 0,
        uid,
      ],
    );
    await this.pool.query(
      `INSERT INTO audit_logs (
        entity_type, entity_id, action, performed_by, details
      ) VALUES ('user', ?, 'update_privacy', ?, ?)`,
      [
        uid,
        uid,
        JSON.stringify({
          changed: keys.filter((key) => input[key] !== undefined),
        }),
      ],
    );
    return next;
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
