import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import { initializeApp, getApps, App } from "firebase-admin/app";
import { getAuth, DecodedIdToken } from "firebase-admin/auth";
import { createPool } from "./db.js";
import { Accounts } from "./accounts.js";

dotenv.config();

let adminApp: App;
if (getApps().length === 0) {
  adminApp = initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || "demo-petconnect",
  });
} else {
  adminApp = getApps()[0];
}

const auth = getAuth(adminApp);
export const pool = createPool();
export const accounts = new Accounts(auth, pool);

export const app = express();

const corsAllowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ||
  "http://localhost:8081,http://127.0.0.1:8081"
).split(",");

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

app.use(express.json());

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, and WebP images are allowed.",
        ),
      );
    }
  },
});

export interface AuthenticatedRequest extends Request {
  user?: { uid: string; token: DecodedIdToken };
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
      res.status(500).json({ error: "internal", message });
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
      if (message.includes("not active") || message.includes("missing")) {
        return res.status(403).json({ error: "permission-denied", message });
      }
      res.status(401).json({ error: "unauthenticated", message });
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

app.post(
  "/v1/uploads",
  requireAuth,
  upload.single("file"),
  (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "invalid-argument", message: "No file uploaded" });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  },
);

/* eslint-disable @typescript-eslint/no-unused-vars */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled API error:", err);
  res.status(500).json({
    error: "internal",
    message: err.message || "Internal server error",
  });
});
/* eslint-enable @typescript-eslint/no-unused-vars */

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`PetConnect Express API running on port ${port}`);
  });
}
