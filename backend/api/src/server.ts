import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import dotenv from "dotenv";
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth, DecodedIdToken } from "firebase-admin/auth";
import { createPool } from "./db.js";
import { AccountIdentityConflictError, Accounts } from "./accounts.js";
import { Pets, PetValidationError } from "./pets.js";
import { RecoveryTokens } from "./recovery.js";
import {
  RecoveryNetwork,
  RecoveryNetworkConflictError,
  RecoveryNetworkValidationError,
} from "./recovery-network.js";
import { Notifications, PushValidationError } from "./notifications.js";
import { ScheduledNotifications } from "./scheduled-notifications.js";
import {
  HealthClinic,
  HealthClinicAccessError,
  HealthClinicConflictError,
  HealthClinicValidationError,
} from "./health-clinic.js";
import type { SessionResponse } from "../../../shared/contracts.js";
import {
  UploadValidationError,
  sanitizeFinderPhoto,
  sanitizePetPhoto,
} from "./uploads.js";
import { FinderEvidence, FinderEvidenceError } from "./finder-evidence.js";
import { FinderSessions, type FinderSession } from "./finder-sessions.js";
import { RecoveryAbuse } from "./recovery-abuse.js";
import {
  FinderVerification,
  FinderVerificationError,
  FinderVerificationRateLimitError,
} from "./finder-verification.js";
import {
  logError,
  requestObservability,
  type RequestWithId,
} from "./observability.js";
import { assertProductionEnvironment, serverPort } from "./config.js";
import { createMediaStorage, MediaStorageError } from "./media-storage.js";
import { MediaCleanup } from "./media-cleanup.js";
import { firebaseServiceAccount } from "./firebase-admin-config.js";

dotenv.config();
assertProductionEnvironment();

let adminApp: App;
if (getApps().length === 0) {
  const serviceAccount = firebaseServiceAccount();
  adminApp = initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || "demo-petconnect",
    ...(serviceAccount ? { credential: cert(serviceAccount) } : {}),
  });
} else {
  adminApp = getApps()[0];
}

const auth = getAuth(adminApp);
export const pool = createPool();
export const accounts = new Accounts(auth, pool);

export const app = express();
app.disable("x-powered-by");

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

app.use(requestObservability);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

const corsAllowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ||
  "http://localhost:8081,http://127.0.0.1:8081"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || corsAllowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    allowedHeaders: ["Content-Type", "Authorization", "X-Finder-Session"],
  }),
);

app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "256kb",
  }),
);

const configuredUploadDir = process.env.UPLOAD_DIR?.trim();
const uploadDir = path.resolve(
  configuredUploadDir || path.join(process.cwd(), "uploads"),
);
const uploadStorageProvider = (
  process.env.UPLOAD_STORAGE_PROVIDER || "local"
).toLowerCase();
const mediaStorage = createMediaStorage(uploadDir);
export const mediaCleanup = new MediaCleanup(pool, mediaStorage);
const reserveMedia = (reference: string) =>
  mediaCleanup.schedule(reference, 24 * 60 * 60);
if (uploadStorageProvider === "local" && !fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o750 });
}
// Recovery evidence is private. It is delivered only through authenticated
// evidence routes, even though it lives inside the durable upload tree.
app.use("/uploads/recovery", (_req: Request, res: Response) => {
  res.status(404).json({ error: "not-found", message: "File not found." });
});
app.use(
  "/uploads",
  express.static(uploadDir, {
    dotfiles: "deny",
    etag: true,
    immutable: true,
    index: false,
    maxAge: "1y",
    redirect: false,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);

const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const finderSessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Math.max(
    5,
    Number(process.env.FINDER_SESSION_RATE_LIMIT_HOURLY) || 20,
  ),
  standardHeaders: true,
  legacyHeaders: false,
});
const finderEvidenceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Math.max(
    3,
    Number(process.env.FINDER_EVIDENCE_RATE_LIMIT_HOURLY) || 12,
  ),
  standardHeaders: true,
  legacyHeaders: false,
});
const finderSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Math.max(
    3,
    Number(process.env.FINDER_SUBMISSION_RATE_LIMIT_15M) || 12,
  ),
  standardHeaders: true,
  legacyHeaders: false,
});
const finderOtpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Math.max(3, Number(process.env.FINDER_OTP_RATE_LIMIT_HOURLY) || 10),
  standardHeaders: true,
  legacyHeaders: false,
});
const finderOtpVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  // Verification already has a strict five-attempt budget per challenge. Keep a
  // separate coarse IP ceiling so failed code entry cannot consume the much
  // smaller OTP-send budget and lock out otherwise valid verification flows.
  limit: Math.max(
    15,
    Number(process.env.FINDER_OTP_VERIFY_RATE_LIMIT_HOURLY) || 50,
  ),
  standardHeaders: true,
  legacyHeaders: false,
});

const finderEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(
      1024 * 1024,
      Math.min(
        12 * 1024 * 1024,
        Number(process.env.FINDER_EVIDENCE_MAX_BYTES) || 8 * 1024 * 1024,
      ),
    ),
    files: 1,
    fields: 0,
    parts: 2,
  },
});

export interface AuthenticatedRequest extends RequestWithId {
  user?: { uid: string; token: DecodedIdToken };
  session?: SessionResponse;
  finder?: FinderSession;
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthenticated",
      message: "Missing or invalid authorization header",
    });
  }

  const tokenStr = authHeader.slice(7);
  try {
    const decodedToken = await auth.verifyIdToken(tokenStr, true);
    req.user = { uid: decodedToken.uid, token: decodedToken };
    return next();
  } catch {
    return res.status(401).json({
      error: "unauthenticated",
      message: "Sign in again to continue.",
    });
  }
}

app.get("/v1/health", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: "ok" });
});

app.get("/v1/ready", async (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await pool.query({
      sql: "SELECT 1 FROM media_cleanup_jobs LIMIT 0",
      timeout: 5000,
    });
    if (uploadStorageProvider === "local") {
      await fs.promises.access(
        uploadDir,
        fs.constants.R_OK | fs.constants.W_OK,
      );
    }
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not-ready" });
  }
});

app.post(
  "/v1/account/initialize",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await accounts.initializeOwner(req.user!.uid, req.body);
      res.json(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to initialize owner profile";
      if (message === "Invalid display name") {
        return res.status(400).json({ error: "invalid-argument", message });
      }
      if (
        message === "Account is not an owner" ||
        message === "Account disabled"
      ) {
        return res.status(403).json({ error: "permission-denied", message });
      }
      if (err instanceof AccountIdentityConflictError) {
        return res.status(409).json({
          error: "account-conflict",
          message:
            "This account is already registered. Sign in with the existing account or contact support.",
        });
      }
      res.status(500).json({
        error: "internal",
        message: "Failed to initialize owner profile",
      });
    }
  },
);

app.get(
  "/v1/session",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = await accounts.session(req.user!.uid, req.user!.token);
      res.json(session);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Session retrieval failed";
      if (message === "User not found") {
        return res.status(404).json({ error: "account-not-found", message });
      }
      if (
        message.includes("not active") ||
        message.includes("missing") ||
        message === "Role mismatch"
      ) {
        return res.status(403).json({ error: "permission-denied", message });
      }
      res
        .status(500)
        .json({ error: "internal", message: "Session retrieval failed" });
    }
  },
);

app.patch(
  "/v1/profile",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await accounts.updateProfile(req.user!.uid, req.body);
      res.json({ success: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Update profile failed";
      res.status(400).json({ error: "invalid-argument", message });
    }
  },
);

app.get(
  "/v1/privacy",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    res.json(await accounts.getPrivacy(req.user!.uid));
  }),
);

app.patch(
  "/v1/privacy",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    res.json(await accounts.updatePrivacy(req.user!.uid, req.body));
  }),
);

app.post(
  "/v1/uploads",
  requireAuth,
  (_req: AuthenticatedRequest, res: Response) => {
    res.status(410).json({
      error: "gone",
      message:
        "Generic uploads are disabled. Upload pet photos through the pet photo endpoint.",
    });
  },
);

export const pets = new Pets(pool);

const configuredRecoverySecret = process.env.RECOVERY_TOKEN_SECRET;
if (process.env.NODE_ENV === "production" && !configuredRecoverySecret) {
  throw new Error("RECOVERY_TOKEN_SECRET is required in production.");
}
export const recovery = new RecoveryTokens(
  pool,
  configuredRecoverySecret || "petconnect-local-recovery-secret-change-me",
  process.env.PUBLIC_APP_BASE_URL || "http://localhost:8081",
);

export const notifications = new Notifications(pool);
export const scheduledNotifications = new ScheduledNotifications(
  pool,
  notifications,
);

const finderSessionSecret =
  process.env.FINDER_SESSION_SECRET ||
  "petconnect-local-finder-session-secret-change-me";
const finderIpHashSecret =
  process.env.FINDER_IP_HASH_SECRET ||
  "petconnect-local-finder-ip-hash-secret-change-me";
export const finderSessions = new FinderSessions(
  pool,
  finderSessionSecret,
  finderIpHashSecret,
  Number(process.env.FINDER_SESSION_TTL_DAYS) || 30,
);
export const finderEvidence = new FinderEvidence(
  pool,
  mediaStorage,
  Number(process.env.FINDER_EVIDENCE_RETENTION_HOURS) || 24,
  Number(process.env.FINDER_INCIDENT_RETENTION_DAYS) || 30,
);
export const recoveryAbuse = new RecoveryAbuse(pool);
export const finderVerification = new FinderVerification(pool, finderSessions);
export const recoveryNetwork = new RecoveryNetwork(
  pool,
  notifications,
  finderEvidence,
);
export const healthClinic = new HealthClinic(
  pool,
  notifications,
  scheduledNotifications,
);

async function requireOwner(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await accounts.session(req.user!.uid, req.user!.token);
    if (session.role !== "OWNER")
      return res.status(403).json({
        error: "permission-denied",
        message: "Owner account required.",
      });
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      ["User not found", "Account not active", "Role mismatch"].includes(
        message,
      )
    ) {
      return res.status(403).json({
        error: "permission-denied",
        message: "Active owner account required.",
      });
    }
    return next(error);
  }
}

async function requireClinic(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await accounts.session(req.user!.uid, req.user!.token);
    if (session.role !== "CLINIC" || !session.clinicId) {
      return res.status(403).json({
        error: "permission-denied",
        message: "Active clinic account required.",
      });
    }
    req.session = session;
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      [
        "User not found",
        "Account not active",
        "Role mismatch",
        "Clinic membership inactive or missing",
      ].includes(message)
    ) {
      return res.status(403).json({
        error: "permission-denied",
        message: "Active clinic account required.",
      });
    }
    return next(error);
  }
}

async function requireFinderSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const credential = req.get("X-Finder-Session");
  const finder = await finderSessions.resolve(credential);
  if (!finder) {
    return res.status(401).json({
      error: "finder-session-required",
      message: "Start a new PetConnect finder session and try again.",
    });
  }
  req.finder = finder;
  return next();
}

function petRoute(
  handler: (req: AuthenticatedRequest, res: Response) => Promise<void>,
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

function petNotFound(res: Response) {
  res.status(404).json({ error: "not-found", message: "Pet not found." });
}

app.post(
  "/v1/recovery/finder-session",
  finderSessionLimiter,
  petRoute(async (req, res) => {
    const existing = await finderSessions.resolve(req.get("X-Finder-Session"));
    const finder = existing || (await finderSessions.create(req.ip));
    res.status(existing ? 200 : 201).json({
      credential: finder.credential,
      expiresAt: finder.expiresAt,
      phoneVerified: finder.phoneVerified,
      verificationRequired: false,
    });
  }),
);

app.post(
  "/v1/recovery/finder-session/otp/send",
  finderOtpSendLimiter,
  requireFinderSession,
  petRoute(async (req, res) => {
    const result = await finderVerification.send(
      req.finder!.id,
      req.body?.phone,
    );
    res.status(201).json(result);
  }),
);

app.post(
  "/v1/recovery/finder-session/otp/verify",
  finderOtpVerifyLimiter,
  requireFinderSession,
  petRoute(async (req, res) => {
    await finderVerification.verify(
      req.finder!.id,
      req.body?.challengeId,
      req.body?.code,
    );
    const refreshed = await finderSessions.resolve(req.get("X-Finder-Session"));
    res.json({
      verified: true,
      expiresAt: refreshed?.expiresAt || req.finder!.expiresAt,
    });
  }),
);

app.post(
  "/v1/recovery/report/:id/evidence/photo",
  finderEvidenceLimiter,
  requireFinderSession,
  petRoute(async (req, res) => {
    const petId = await recovery.resolveActiveReportPetId(req.params.id);
    if (!petId) {
      res.status(404).json({
        error: "not-found",
        message: "This lost-pet report is no longer active.",
      });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      finderEvidenceUpload.single("file")(req, res, (error) =>
        error ? reject(error) : resolve(),
      );
    });
    if (!req.file) {
      res.status(400).json({
        error: "invalid-argument",
        message: "Choose a valid JPEG, PNG, or WebP pet photo.",
      });
      return;
    }
    const processed = await sanitizeFinderPhoto(
      req.file.buffer,
      mediaStorage,
      reserveMedia,
    );
    const staged = await finderEvidence.stage(petId, req.finder!.id, processed);
    res.status(201).json({
      id: staged.evidence.id,
      expiresAt: staged.expiresAt,
      byteSize: staged.evidence.byteSize,
      width: staged.evidence.width,
      height: staged.evidence.height,
      mimeType: staged.evidence.mimeType,
    });
  }),
);

app.post(
  "/v1/recovery/:token/evidence/photo",
  finderEvidenceLimiter,
  requireFinderSession,
  petRoute(async (req, res) => {
    const petId = await recovery.resolvePetId(req.params.token);
    if (!petId) {
      res.status(404).json({
        error: "not-found",
        message: "This recovery code is invalid, expired, or disabled.",
      });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      finderEvidenceUpload.single("file")(req, res, (error) =>
        error ? reject(error) : resolve(),
      );
    });
    if (!req.file) {
      res.status(400).json({
        error: "invalid-argument",
        message: "Choose a valid JPEG, PNG, or WebP pet photo.",
      });
      return;
    }
    const processed = await sanitizeFinderPhoto(
      req.file.buffer,
      mediaStorage,
      reserveMedia,
    );
    const staged = await finderEvidence.stage(petId, req.finder!.id, processed);
    res.status(201).json({
      id: staged.evidence.id,
      expiresAt: staged.expiresAt,
      byteSize: staged.evidence.byteSize,
      width: staged.evidence.width,
      height: staged.evidence.height,
      mimeType: staged.evidence.mimeType,
    });
  }),
);

app.post(
  "/v1/recovery/:token/sightings",
  publicWriteLimiter,
  finderSubmissionLimiter,
  petRoute(async (req, res) => {
    const petId = await recovery.resolvePetId(req.params.token);
    if (!petId) {
      res.status(404).json({
        error: "not-found",
        message: "This recovery code is invalid, expired, or disabled.",
      });
      return;
    }

    const credential = req.get("X-Finder-Session");
    const legacy = !credential && !req.body?.encounterType;
    if (legacy) {
      const sighting = await recoveryNetwork.submitSighting(petId, req.body);
      if (!sighting) {
        res.status(409).json({
          error: "no-active-report",
          message: "This pet does not currently have an active lost report.",
        });
        return;
      }
      res.status(201).json(sighting);
      return;
    }

    const finder = await finderSessions.resolve(credential);
    if (!finder) {
      res.status(401).json({
        error: "finder-session-required",
        message: "Start a new PetConnect finder session and try again.",
      });
      return;
    }

    // A retry must still succeed after its evidence has been attached and must
    // not consume another submission or trigger a new verification challenge.
    const previous = await recoveryNetwork.findFinderSubmission(
      petId,
      finder.id,
      req.body?.idempotencyKey,
    );
    if (previous) {
      res.status(201).json(previous);
      return;
    }

    const evidence = req.body?.evidenceId
      ? await finderEvidence.ownedStaged(
          String(req.body.evidenceId),
          petId,
          finder.id,
        )
      : null;
    if (req.body?.evidenceId && !evidence) {
      res.status(409).json({
        error: "evidence-unavailable",
        message:
          "That finder photo is expired, already used, or belongs to another session.",
      });
      return;
    }

    const assessment = await recoveryAbuse.assess(
      finder.id,
      finder.phoneVerified,
      evidence?.sha256,
    );
    if (assessment.blocked) {
      res.status(429).json({
        error: "finder-temporarily-blocked",
        message:
          "This finder session has submitted too many reports. Please try again later.",
      });
      return;
    }
    if (assessment.verificationRequired && !finder.phoneVerified) {
      res.status(428).json({
        error: "phone-verification-required",
        message:
          "Verify a phone number before sending more finder reports from this session.",
      });
      return;
    }

    const result = await recoveryNetwork.submitFinderReport(petId, req.body, {
      finderSessionId: finder.id,
      phoneVerified: finder.phoneVerified,
      riskState: assessment.riskState,
      evidenceId: evidence?.id || null,
    });
    if (!result) {
      res.status(404).json({
        error: "not-found",
        message: "The pet is no longer available for public recovery.",
      });
      return;
    }
    await finderSessions.incrementSubmission(finder.id);
    res.status(201).json(result);
  }),
);

app.get(
  "/v1/recovery/nearby",
  publicReadLimiter,
  petRoute(async (req, res) => {
    const reports = await recoveryNetwork.nearby(
      req.query.latitude,
      req.query.longitude,
      req.query.radiusKm,
      {
        species: req.query.species,
        breed: req.query.breed,
        appearance: req.query.appearance,
      },
    );
    res.json({ reports });
  }),
);

app.get(
  "/v1/recovery/code/:code",
  publicReadLimiter,
  petRoute(async (req, res) => {
    const tag = await recovery.resolveCode(req.params.code);
    if (!tag?.token || !tag.recoveryUrl) {
      res.status(404).json({
        error: "not-found",
        message: "That PetConnect code is invalid or disabled.",
      });
      return;
    }
    res.json({
      token: tag.token,
      recoveryUrl: tag.recoveryUrl,
      shortCode: tag.shortCode,
    });
  }),
);

app.get(
  "/v1/recovery/report/:id",
  publicReadLimiter,
  petRoute(async (req, res) => {
    const profile = await recovery.publicProfileByReport(req.params.id);
    if (!profile) {
      res.status(404).json({
        error: "not-found",
        message: "This lost-pet report is no longer active.",
      });
      return;
    }
    res.json(profile);
  }),
);

app.post(
  "/v1/recovery/report/:id/sightings",
  publicWriteLimiter,
  finderSubmissionLimiter,
  requireFinderSession,
  petRoute(async (req, res) => {
    const petId = await recovery.resolveActiveReportPetId(req.params.id);
    if (!petId) {
      res.status(404).json({
        error: "not-found",
        message: "This lost-pet report is no longer active.",
      });
      return;
    }
    const input = { ...req.body, encounterType: "SEEN" };

    // Retries remain idempotent even after staged evidence has been attached.
    const previous = await recoveryNetwork.findFinderSubmission(
      petId,
      req.finder!.id,
      input.idempotencyKey,
    );
    if (previous) {
      res.status(201).json(previous);
      return;
    }

    const evidence = input.evidenceId
      ? await finderEvidence.ownedStaged(
          String(input.evidenceId),
          petId,
          req.finder!.id,
        )
      : null;
    if (input.evidenceId && !evidence) {
      res.status(409).json({
        error: "evidence-unavailable",
        message:
          "That finder photo is expired, already used, or belongs to another session.",
      });
      return;
    }

    const assessment = await recoveryAbuse.assess(
      req.finder!.id,
      req.finder!.phoneVerified,
      evidence?.sha256,
    );
    if (assessment.blocked) {
      res.status(429).json({
        error: "finder-temporarily-blocked",
        message: "Too many reports were sent from this finder session.",
      });
      return;
    }
    if (assessment.verificationRequired && !req.finder!.phoneVerified) {
      res.status(428).json({
        error: "phone-verification-required",
        message: "Verify a phone number before sending more finder reports.",
      });
      return;
    }
    const result = await recoveryNetwork.submitFinderReport(petId, input, {
      finderSessionId: req.finder!.id,
      phoneVerified: req.finder!.phoneVerified,
      riskState: assessment.riskState,
      evidenceId: evidence?.id || null,
    });
    if (!result || result.kind !== "SIGHTING") {
      res.status(409).json({
        error: "no-active-report",
        message: "This lost-pet report is no longer active.",
      });
      return;
    }
    await finderSessions.incrementSubmission(req.finder!.id);
    res.status(201).json(result);
  }),
);

app.post(
  "/v1/recovery/:token/scan",
  publicWriteLimiter,
  requireFinderSession,
  petRoute(async (req, res) => {
    const scan = await recovery.recordScan(
      req.params.token,
      req.finder!.id,
      req.body?.source === "CODE" ? "CODE" : "QR",
    );
    if (!scan) {
      res.status(404).json({
        error: "not-found",
        message: "This recovery tag is invalid or disabled.",
      });
      return;
    }
    if (scan.created) {
      await notifications.notifyUser(
        scan.ownerId,
        "PET_TAG_SCANNED",
        `${scan.petName}'s tag was scanned`,
        "Someone opened the PetConnect recovery tag.",
        {
          petId: scan.petId,
          tagId: scan.tagId,
          scanId: scan.scanId,
        },
      );
    }
    res.status(scan.created ? 201 : 200).json({ recorded: scan.created });
  }),
);

app.get(
  "/v1/recovery/:token",
  publicReadLimiter,
  petRoute(async (req, res) => {
    const profile = await recovery.publicProfile(req.params.token);
    if (!profile) {
      res.status(404).json({
        error: "not-found",
        message: "This recovery code is invalid, expired, or disabled.",
      });
      return;
    }
    res.json(profile);
  }),
);

app.get(
  "/v1/pets",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    res.json({ pets: await pets.list(req.user!.uid) });
  }),
);

app.post(
  "/v1/pets",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const pet = await pets.create(req.user!.uid, req.body);
    res.status(201).json(pet);
  }),
);

app.get(
  "/v1/pets/:id",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const pet = await pets.get(req.user!.uid, req.params.id);
    if (!pet) return petNotFound(res);
    res.json(pet);
  }),
);

app.patch(
  "/v1/pets/:id",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const pet = await pets.update(req.user!.uid, req.params.id, req.body);
    if (!pet) return petNotFound(res);
    res.json(pet);
  }),
);

app.get(
  "/v1/pets/:id/recovery",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const state = await recovery.getOrCreate(req.user!.uid, req.params.id);
    if (!state) return petNotFound(res);
    res.json(state);
  }),
);

app.post(
  "/v1/pets/:id/recovery/rotate",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const state = await recovery.rotate(req.user!.uid, req.params.id);
    if (!state) return petNotFound(res);
    res.json(state);
  }),
);

app.delete(
  "/v1/pets/:id/recovery",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const state = await recovery.revoke(req.user!.uid, req.params.id);
    if (!state) return petNotFound(res);
    res.json(state);
  }),
);

app.get(
  "/v1/pets/:id/recovery/tags",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const tags = await recovery.listTags(req.user!.uid, req.params.id);
    if (!tags) return petNotFound(res);
    res.json({ tags });
  }),
);

app.post(
  "/v1/pets/:id/recovery/tags",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const tag = await recovery.createTag(
      req.user!.uid,
      req.params.id,
      req.body || {},
    );
    if (!tag) return petNotFound(res);
    res.status(201).json(tag);
  }),
);

app.post(
  "/v1/pets/:id/recovery/tags/:tagId/replace",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const tag = await recovery.replaceTag(
      req.user!.uid,
      req.params.id,
      req.params.tagId,
    );
    if (!tag) return petNotFound(res);
    res.json(tag);
  }),
);

app.post(
  "/v1/pets/:id/recovery/tags/:tagId/lost",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const tag = await recovery.setTagStatus(
      req.user!.uid,
      req.params.id,
      req.params.tagId,
      "LOST",
    );
    if (!tag) return petNotFound(res);
    res.json(tag);
  }),
);

app.delete(
  "/v1/pets/:id/recovery/tags/:tagId",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const tag = await recovery.setTagStatus(
      req.user!.uid,
      req.params.id,
      req.params.tagId,
      "REVOKED",
    );
    if (!tag) return petNotFound(res);
    res.json(tag);
  }),
);

app.post(
  "/v1/lost-reports",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const report = await recoveryNetwork.create(req.user!.uid, req.body);
    res.status(201).json(report);
  }),
);

app.get(
  "/v1/lost-reports",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    res.json({ reports: await recoveryNetwork.listMine(req.user!.uid) });
  }),
);

app.get(
  "/v1/owner/recovery-overview",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    res.json(await recoveryNetwork.ownerOverview(req.user!.uid));
  }),
);

app.get(
  "/v1/lost-reports/:id",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const report = await recoveryNetwork.getOwnerReport(
      req.user!.uid,
      req.params.id,
    );
    if (!report) {
      res
        .status(404)
        .json({ error: "not-found", message: "Lost report not found." });
      return;
    }
    const sightings = await recoveryNetwork.listSightings(
      req.user!.uid,
      req.params.id,
    );
    res.json({ report, sightings: sightings || [] });
  }),
);

app.get(
  "/v1/lost-reports/:id/timeline",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const report = await recoveryNetwork.getOwnerReport(
      req.user!.uid,
      req.params.id,
    );
    if (!report) {
      res
        .status(404)
        .json({ error: "not-found", message: "Lost report not found." });
      return;
    }
    const sightings =
      (await recoveryNetwork.listSightings(req.user!.uid, req.params.id)) || [];
    const scans =
      (await recovery.listScans(
        req.user!.uid,
        report.petId,
        report.reportedAt,
        report.reunitedAt,
      )) || [];
    const events = [
      {
        id: `reported-${report.id}`,
        kind: "REPORTED_LOST",
        title: `${report.petName} reported missing`,
        detail: report.lastSeenText,
        createdAt: report.reportedAt,
      },
      ...scans.map((scan) => ({
        id: scan.id,
        kind: "TAG_SCANNED",
        title: "Recovery tag scanned",
        detail: scan.label,
        createdAt: scan.createdAt,
        tagId: scan.tagId,
      })),
      ...sightings.map((sighting) => ({
        id: sighting.id,
        kind: sighting.encounterType === "HAVE_PET" ? "FOUND" : "SIGHTING",
        title:
          sighting.encounterType === "HAVE_PET"
            ? "Finder has the pet"
            : "Pet sighted",
        detail: sighting.locationText || sighting.notes || "Finder update",
        createdAt: sighting.createdAt,
        sightingId: sighting.id,
      })),
      ...(report.reunitedAt
        ? [
            {
              id: `reunited-${report.id}`,
              kind: "REUNITED",
              title: `${report.petName} reunited`,
              detail: "Recovery closed",
              createdAt: report.reunitedAt,
            },
          ]
        : []),
    ].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    res.json({ events });
  }),
);

app.get(
  "/v1/recovery-contacts/:id",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const event = await recoveryNetwork.getRecoveryContactEvent(
      req.user!.uid,
      req.params.id,
    );
    if (!event) {
      res.status(404).json({
        error: "not-found",
        message: "Recovery contact not found.",
      });
      return;
    }
    res.json(event);
  }),
);

app.get(
  "/v1/finder-evidence/:id/file",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const file = await finderEvidence.ownerFile(req.params.id, req.user!.uid);
    if (!file) {
      res.status(404).json({
        error: "not-found",
        message: "Finder evidence not found.",
      });
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(file.mimeType);
    res.send(await mediaStorage.read(file.storageUrl));
  }),
);

app.post(
  "/v1/lost-reports/:reportId/sightings/:sightingId/report-abuse",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const [result] = await pool.query<import("mysql2/promise").ResultSetHeader>(
      `UPDATE sightings s
       JOIN lost_reports lr ON lr.id = s.report_id
          SET s.risk_state = 'REVIEW'
        WHERE s.id = ? AND lr.id = ? AND lr.owner_id = ?`,
      [req.params.sightingId, req.params.reportId, req.user!.uid],
    );
    if (result.affectedRows === 0) {
      res.status(404).json({
        error: "not-found",
        message: "Finder report not found.",
      });
      return;
    }
    await pool.query(
      `INSERT INTO audit_logs
        (entity_type, entity_id, action, performed_by, details)
       VALUES ('sighting', ?, 'report_abuse', ?, ?)`,
      [
        req.params.sightingId,
        req.user!.uid,
        JSON.stringify({ reportId: req.params.reportId }),
      ],
    );
    res.status(204).end();
  }),
);

app.post(
  "/v1/recovery-contacts/:id/report-abuse",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const [result] = await pool.query<import("mysql2/promise").ResultSetHeader>(
      `UPDATE recovery_contact_events
          SET risk_state = 'REVIEW'
        WHERE id = ? AND owner_id = ?`,
      [req.params.id, req.user!.uid],
    );
    if (result.affectedRows === 0) {
      res.status(404).json({
        error: "not-found",
        message: "Recovery contact not found.",
      });
      return;
    }
    await pool.query(
      `INSERT INTO audit_logs
        (entity_type, entity_id, action, performed_by, details)
       VALUES ('recovery_contact', ?, 'report_abuse', ?, '{}')`,
      [req.params.id, req.user!.uid],
    );
    res.status(204).end();
  }),
);

app.post(
  "/v1/lost-reports/:id/reunite",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const report = await recoveryNetwork.markReunited(
      req.user!.uid,
      req.params.id,
    );
    if (!report) {
      res
        .status(404)
        .json({ error: "not-found", message: "Lost report not found." });
      return;
    }
    res.json(report);
  }),
);

app.put(
  "/v1/push/devices",
  requireAuth,
  petRoute(async (req, res) => {
    await accounts.session(req.user!.uid, req.user!.token);
    await notifications.registerDevice(req.user!.uid, req.body);
    res.status(204).end();
  }),
);

app.delete(
  "/v1/push/devices",
  requireAuth,
  petRoute(async (req, res) => {
    await accounts.session(req.user!.uid, req.user!.token);
    await notifications.unregisterDevice(
      req.user!.uid,
      String(req.body?.expoPushToken || ""),
    );
    res.status(204).end();
  }),
);

app.get(
  "/v1/notifications",
  requireAuth,
  petRoute(async (req, res) => {
    await accounts.session(req.user!.uid, req.user!.token);
    res.json({ notifications: await notifications.list(req.user!.uid) });
  }),
);

app.post(
  "/v1/notifications/:id/read",
  requireAuth,
  petRoute(async (req, res) => {
    await accounts.session(req.user!.uid, req.user!.token);
    if (!(await notifications.markRead(req.user!.uid, req.params.id))) {
      res
        .status(404)
        .json({ error: "not-found", message: "Notification not found." });
      return;
    }
    res.status(204).end();
  }),
);

app.get(
  "/v1/clinics",
  requireAuth,
  petRoute(async (req, res) => {
    await accounts.session(req.user!.uid, req.user!.token);
    res.json({ clinics: await healthClinic.listClinics() });
  }),
);

app.get(
  "/v1/health-records",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const petId =
      typeof req.query.petId === "string" ? req.query.petId : undefined;
    res.json({
      records: await healthClinic.ownerHealthRecords(req.user!.uid, petId),
    });
  }),
);

app.get(
  "/v1/reminders",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const petId =
      typeof req.query.petId === "string" ? req.query.petId : undefined;
    const range =
      req.query.from === undefined && req.query.to === undefined
        ? undefined
        : {
            from: typeof req.query.from === "string" ? req.query.from : "",
            to: typeof req.query.to === "string" ? req.query.to : "",
          };
    res.json({
      reminders: await healthClinic.ownerReminders(req.user!.uid, petId, range),
    });
  }),
);

app.post(
  "/v1/reminders",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const reminder = await healthClinic.createOwnerReminder(
      req.user!.uid,
      req.body,
    );
    res.status(201).json(reminder);
  }),
);

app.patch(
  "/v1/reminders/:id",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const reminder = await healthClinic.updateOwnerReminder(
      req.user!.uid,
      req.params.id,
      req.body,
    );
    if (!reminder) {
      res
        .status(404)
        .json({ error: "not-found", message: "Reminder not found." });
      return;
    }
    res.json(reminder);
  }),
);

app.delete(
  "/v1/reminders/:id",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    if (
      !(await healthClinic.deleteOwnerReminder(req.user!.uid, req.params.id))
    ) {
      res
        .status(404)
        .json({ error: "not-found", message: "Reminder not found." });
      return;
    }
    res.status(204).end();
  }),
);

app.get(
  "/v1/appointments",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const range =
      req.query.from === undefined && req.query.to === undefined
        ? undefined
        : {
            from: typeof req.query.from === "string" ? req.query.from : "",
            to: typeof req.query.to === "string" ? req.query.to : "",
          };
    res.json({
      appointments: await healthClinic.ownerAppointments(req.user!.uid, range),
    });
  }),
);

app.post(
  "/v1/appointments",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const appointment = await healthClinic.createOwnerAppointment(
      req.user!.uid,
      req.body,
    );
    res.status(201).json(appointment);
  }),
);

app.post(
  "/v1/appointments/:id/cancel",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const appointment = await healthClinic.cancelOwnerAppointment(
      req.user!.uid,
      req.params.id,
    );
    if (!appointment) {
      res.status(404).json({
        error: "not-found",
        message: "Appointment not found.",
      });
      return;
    }
    res.json(appointment);
  }),
);

app.get(
  "/v1/clinic",
  requireAuth,
  requireClinic,
  petRoute(async (req, res) => {
    const clinic = await healthClinic.currentClinic(req.session!.clinicId!);
    if (!clinic) {
      res
        .status(404)
        .json({ error: "not-found", message: "Clinic not found." });
      return;
    }
    res.json(clinic);
  }),
);

app.get(
  "/v1/clinic/appointments",
  requireAuth,
  requireClinic,
  petRoute(async (req, res) => {
    res.json({
      appointments: await healthClinic.clinicAppointments(
        req.session!.clinicId!,
      ),
    });
  }),
);

app.patch(
  "/v1/clinic/appointments/:id",
  requireAuth,
  requireClinic,
  petRoute(async (req, res) => {
    const appointment = await healthClinic.updateClinicAppointment(
      req.session!.clinicId!,
      req.user!.uid,
      req.params.id,
      req.body,
    );
    if (!appointment) {
      res.status(404).json({
        error: "not-found",
        message: "Appointment not found.",
      });
      return;
    }
    res.json(appointment);
  }),
);

app.get(
  "/v1/clinic/patients/recovery/:token",
  requireAuth,
  requireClinic,
  petRoute(async (req, res) => {
    const petId = await recovery.resolvePetId(req.params.token);
    if (!petId) {
      res.status(404).json({
        error: "not-found",
        message: "This Pet ID is invalid, expired, or disabled.",
      });
      return;
    }
    const patient = await healthClinic.clinicPatient(
      req.session!.clinicId!,
      petId,
    );
    if (!patient) {
      res
        .status(404)
        .json({ error: "not-found", message: "Patient not found." });
      return;
    }
    res.json(patient);
  }),
);

app.get(
  "/v1/clinic/patients/recovery/:token/health-records",
  requireAuth,
  requireClinic,
  petRoute(async (req, res) => {
    const petId = await recovery.resolvePetId(req.params.token);
    if (!petId) {
      res.status(404).json({
        error: "not-found",
        message: "This Pet ID is invalid, expired, or disabled.",
      });
      return;
    }
    res.json({
      records: await healthClinic.recordsForClinicPet(
        req.session!.clinicId!,
        petId,
      ),
    });
  }),
);

app.post(
  "/v1/clinic/patients/recovery/:token/health-records",
  requireAuth,
  requireClinic,
  petRoute(async (req, res) => {
    const petId = await recovery.resolvePetId(req.params.token);
    if (!petId) {
      res.status(404).json({
        error: "not-found",
        message: "This Pet ID is invalid, expired, or disabled.",
      });
      return;
    }
    const record = await healthClinic.createHealthRecord(
      req.session!.clinicId!,
      req.user!.uid,
      petId,
      req.body,
    );
    res.status(201).json(record);
  }),
);

app.post(
  "/v1/clinic/patients/recovery/:token/vaccinations",
  requireAuth,
  requireClinic,
  petRoute(async (req, res) => {
    const petId = await recovery.resolvePetId(req.params.token);
    if (!petId) {
      res.status(404).json({
        error: "not-found",
        message: "This Pet ID is invalid, expired, or disabled.",
      });
      return;
    }
    const record = await healthClinic.createVaccination(
      req.session!.clinicId!,
      req.user!.uid,
      petId,
      req.body,
    );
    res.status(201).json(record);
  }),
);

app.post(
  "/v1/clinic/patients/recovery/:token/appointments",
  requireAuth,
  requireClinic,
  petRoute(async (req, res) => {
    const petId = await recovery.resolvePetId(req.params.token);
    if (!petId) {
      res.status(404).json({
        error: "not-found",
        message: "This Pet ID is invalid, expired, or disabled.",
      });
      return;
    }
    const appointment = await healthClinic.clinicCreateAppointment(
      req.session!.clinicId!,
      req.user!.uid,
      petId,
      req.body,
    );
    res.status(201).json(appointment);
  }),
);

app.delete(
  "/v1/pets/:id",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const previous = await pets.get(req.user!.uid, req.params.id);
    if (!previous) return petNotFound(res);
    await mediaCleanup.schedule(previous.photoUrl);
    await mediaCleanup.schedulePetEvidence(req.params.id);
    if (!(await pets.delete(req.user!.uid, req.params.id)))
      return petNotFound(res);
    await mediaCleanup.removeNow(previous.photoUrl);
    res.status(204).end();
  }),
);

const petPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0,
    // Busboy reports the limit at one file's final boundary. The file and
    // field limits still reject any extra file or form field.
    parts: 2,
  },
  fileFilter: (_req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

app.put(
  "/v1/pets/:id/photo",
  uploadLimiter,
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    if (!(await pets.get(req.user!.uid, req.params.id)))
      return petNotFound(res);
    await new Promise<void>((resolve, reject) => {
      petPhotoUpload.single("file")(req, res, (error) =>
        error ? reject(error) : resolve(),
      );
    });
    if (!req.file) {
      res.status(400).json({
        error: "invalid-argument",
        message: "Choose a JPEG, PNG, or WebP image.",
      });
      return;
    }

    const processed = await sanitizePetPhoto(
      req.file.buffer,
      mediaStorage,
      reserveMedia,
    );
    let stored = false;
    try {
      const previous = await pets.get(req.user!.uid, req.params.id);
      if (!previous) return petNotFound(res);
      await mediaCleanup.schedule(previous.photoUrl);
      const pet = await pets.setPhoto(
        req.user!.uid,
        req.params.id,
        processed.relativeUrl,
      );
      if (!pet) return petNotFound(res);
      stored = true;
      await mediaCleanup.removeNow(previous.photoUrl);
      res.json(pet);
    } finally {
      if (!stored)
        await mediaStorage.remove(processed.relativeUrl).catch(() => {});
    }
  }),
);

app.delete(
  "/v1/pets/:id/photo",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const previous = await pets.get(req.user!.uid, req.params.id);
    if (!previous) return petNotFound(res);
    await mediaCleanup.schedule(previous.photoUrl);
    const pet = await pets.setPhoto(req.user!.uid, req.params.id, null);
    if (!pet) return petNotFound(res);
    await mediaCleanup.removeNow(previous.photoUrl);
    res.json(pet);
  }),
);

app.use((req: AuthenticatedRequest, res: Response) => {
  res.status(404).json({
    error: "not-found",
    message: "Route not found.",
    requestId: req.requestId,
  });
});

/* eslint-disable @typescript-eslint/no-unused-vars */
app.use(
  (
    err: Error,
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction,
  ) => {
    if (
      err instanceof PetValidationError ||
      err instanceof RecoveryNetworkValidationError ||
      err instanceof PushValidationError ||
      err instanceof HealthClinicValidationError ||
      err instanceof UploadValidationError ||
      err instanceof FinderEvidenceError ||
      err instanceof FinderVerificationError
    ) {
      return res
        .status(400)
        .json({ error: "invalid-argument", message: err.message });
    }
    if (err instanceof FinderVerificationRateLimitError) {
      return res.status(429).json({
        error: "rate-limited",
        message: err.message,
      });
    }
    if (
      err instanceof RecoveryNetworkConflictError ||
      err instanceof HealthClinicConflictError
    ) {
      return res.status(409).json({ error: "conflict", message: err.message });
    }
    if (err instanceof HealthClinicAccessError) {
      return res.status(403).json({ error: "forbidden", message: err.message });
    }
    if (err instanceof multer.MulterError) {
      return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error: "invalid-argument",
        message:
          err.code === "LIMIT_FILE_SIZE"
            ? req.path.includes("/evidence/")
              ? "Finder photo must be under 8 MB."
              : "Photo must be under 5 MB."
            : "Invalid photo upload.",
      });
    }
    if (err instanceof MediaStorageError)
      return res
        .status(503)
        .json({ error: "unavailable", message: err.message });
    logError(err, req);
    res.status(500).json({
      error: "internal",
      message: "Internal server error",
      requestId: req.requestId,
    });
  },
);
/* eslint-enable @typescript-eslint/no-unused-vars */

if (process.env.NODE_ENV !== "test") {
  scheduledNotifications.start(
    Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS) || 60_000,
  );
  finderEvidence.start(
    Number(process.env.FINDER_CLEANUP_INTERVAL_MS) || 60 * 60 * 1000,
  );
  mediaCleanup.start();
  const port = serverPort();
  const server = app.listen(port, "0.0.0.0", () => {
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        event: "api_started",
        port,
      }) + "\n",
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    scheduledNotifications.stop();
    finderEvidence.stop();
    mediaCleanup.stop();
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        event: "api_shutdown",
        signal,
      }) + "\n",
    );
    const forceTimer = setTimeout(() => process.exit(1), 10_000);
    forceTimer.unref();
    server.close(() => {
      void pool
        .end()
        .catch((error) => logError(error, undefined, "db_close_failed"))
        .finally(() => process.exit(0));
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
