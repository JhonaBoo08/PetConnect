import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import dotenv from "dotenv";
import {
  initializeApp,
  getApps,
  cert,
  App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, DecodedIdToken } from "firebase-admin/auth";
import { createPool } from "./db.js";
import { Accounts } from "./accounts.js";
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
import { UploadValidationError, sanitizePetPhoto } from "./uploads.js";
import {
  logError,
  requestObservability,
  type RequestWithId,
} from "./observability.js";

dotenv.config();

function firebaseServiceAccount(): ServiceAccount | undefined {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON.");
  }
}

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
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "256kb",
  }),
);

const configuredUploadDir = process.env.UPLOAD_DIR?.trim();
if (process.env.NODE_ENV === "production" && !configuredUploadDir) {
  throw new Error(
    "UPLOAD_DIR is required in production and must point to durable storage.",
  );
}
const uploadDir = path.resolve(
  configuredUploadDir || path.join(process.cwd(), "uploads"),
);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o750 });
}
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

export interface AuthenticatedRequest extends RequestWithId {
  user?: { uid: string; token: DecodedIdToken };
  session?: SessionResponse;
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
  res.json({ status: "ok" });
});

app.get("/v1/ready", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
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
export const recoveryNetwork = new RecoveryNetwork(pool, notifications);
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
  "/v1/recovery/:token/sightings",
  publicWriteLimiter,
  petRoute(async (req, res) => {
    const petId = await recovery.resolvePetId(req.params.token);
    if (!petId) {
      res.status(404).json({
        error: "not-found",
        message: "This recovery code is invalid, expired, or disabled.",
      });
      return;
    }
    const sighting = await recoveryNetwork.submitSighting(petId, req.body);
    if (!sighting) {
      res.status(409).json({
        error: "no-active-report",
        message: "This pet does not currently have an active lost report.",
      });
      return;
    }
    res.status(201).json(sighting);
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
    );
    res.json({ reports });
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
    res.json({
      reminders: await healthClinic.ownerReminders(req.user!.uid, petId),
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
    res.json({
      appointments: await healthClinic.ownerAppointments(req.user!.uid),
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

function removeStoredPhoto(url: string | null) {
  if (!url || !/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(url)) return;
  void fs.promises
    .unlink(path.join(uploadDir, path.basename(url)))
    .catch((error) => {
      console.error("Could not remove pet photo:", error);
    });
}

app.delete(
  "/v1/pets/:id",
  requireAuth,
  requireOwner,
  petRoute(async (req, res) => {
    const previous = await pets.get(req.user!.uid, req.params.id);
    if (!previous) return petNotFound(res);
    if (!(await pets.delete(req.user!.uid, req.params.id)))
      return petNotFound(res);
    removeStoredPhoto(previous.photoUrl);
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

    const processed = await sanitizePetPhoto(req.file.buffer, uploadDir);
    let stored = false;
    try {
      const previous = await pets.get(req.user!.uid, req.params.id);
      if (!previous) return petNotFound(res);
      const pet = await pets.setPhoto(
        req.user!.uid,
        req.params.id,
        processed.relativeUrl,
      );
      if (!pet) return petNotFound(res);
      stored = true;
      removeStoredPhoto(previous.photoUrl);
      res.json(pet);
    } finally {
      if (!stored)
        await fs.promises.unlink(processed.absolutePath).catch(() => {});
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
    const pet = await pets.setPhoto(req.user!.uid, req.params.id, null);
    if (!pet) return petNotFound(res);
    removeStoredPhoto(previous.photoUrl);
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
      err instanceof UploadValidationError
    ) {
      return res
        .status(400)
        .json({ error: "invalid-argument", message: err.message });
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
            ? "Photo must be under 5 MB."
            : "Invalid photo upload.",
      });
    }
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
  const port = Number(process.env.PORT) || 3000;
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
