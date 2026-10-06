import { execSync } from "node:child_process";
import { writeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

const allowedHighAdvisories = new Map([
  [
    "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
    "braces is used by Expo/Metro/Jest glob tooling; no patched release is currently available.",
  ],
  [
    "https://github.com/advisories/GHSA-86w9-cpqp-85rv",
    "node-forge is used by Expo CLI code-signing tooling; no patched release is currently available.",
  ],
]);

const targets = [
  ["root", root],
  ["backend", path.join(root, "backend", "api")],
  ["frontend", path.join(root, "frontend")],
];

function validateReport(report) {
  const object = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const severities = ["info", "low", "moderate", "high", "critical"];
  if (
    !object(report) ||
    report.error ||
    report.auditReportVersion !== 2 ||
    !object(report.vulnerabilities) ||
    !object(report.metadata?.vulnerabilities)
  ) {
    throw new Error(
      "npm audit returned an error or incomplete report; no clean audit can be inferred.",
    );
  }
  const counts = report.metadata.vulnerabilities;
  if (
    ![...severities, "total"].every(
      (key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0,
    )
  ) {
    throw new Error("npm audit returned invalid vulnerability counts.");
  }
  const entries = Object.values(report.vulnerabilities);
  if (
    entries.some(
      (item) =>
        !object(item) ||
        !severities.includes(item.severity) ||
        !Array.isArray(item.via),
    ) ||
    counts.total !== entries.length ||
    severities.some(
      (severity) =>
        counts[severity] !==
        entries.filter((item) => item.severity === severity).length,
    )
  ) {
    throw new Error(
      "npm audit vulnerability entries and counts are inconsistent.",
    );
  }
}

function audit(cwd) {
  let stdout = "";
  try {
    stdout = execSync("npm audit --omit=dev --json", {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      shell: isWindows ? process.env.ComSpec || "cmd.exe" : "/bin/sh",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (typeof error?.stdout === "string" && error.stdout.trim()) {
      stdout = error.stdout;
    } else {
      const detail =
        (typeof error?.stderr === "string" && error.stderr.trim()) ||
        error?.message ||
        "npm audit failed without JSON output";
      throw new Error(detail);
    }
  }

  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new Error("npm audit did not return valid JSON");
  }
  validateReport(report);
  return report;
}

function rootAdvisories(vulnerabilities, name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const vulnerability = vulnerabilities[name];
  if (!vulnerability) return [];

  const roots = [];
  for (const via of vulnerability.via ?? []) {
    if (typeof via === "string") {
      roots.push(...rootAdvisories(vulnerabilities, via, new Set(seen)));
    } else if (via && typeof via === "object") {
      roots.push(via);
    }
  }
  return roots;
}

function out(message) {
  writeSync(1, String(message) + "\n");
}

function err(message) {
  writeSync(2, String(message) + "\n");
}

let failed = false;

for (const [label, cwd] of targets) {
  const report = audit(cwd);
  const vulnerabilities = report.vulnerabilities ?? {};
  const counts = report.metadata?.vulnerabilities ?? {};
  const allowed = [];
  const blocked = [];

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (!["high", "critical"].includes(vulnerability.severity)) continue;
    // npm propagates the maximum severity to parent packages.
    // Evaluate high/critical root advisories without elevating moderate siblings.
    // Unknown root severities remain subject to the strict exception policy.
    const roots = rootAdvisories(vulnerabilities, name).filter(
      (item) => !["info", "low", "moderate"].includes(item.severity),
    );
    const urls = [...new Set(roots.map((item) => item.url).filter(Boolean))];
    const allow =
      vulnerability.severity === "high" &&
      !roots.some((item) => item.severity === "critical") &&
      urls.length > 0 &&
      urls.every((url) => allowedHighAdvisories.has(url));
    (allow ? allowed : blocked).push({
      name,
      severity: vulnerability.severity,
      urls,
    });
  }

  out(
    "[" +
      label +
      "] critical=" +
      (counts.critical ?? 0) +
      " high=" +
      (counts.high ?? 0) +
      " moderate=" +
      (counts.moderate ?? 0),
  );

  if (allowed.length) {
    const rootUrls = [...new Set(allowed.flatMap((item) => item.urls))].sort();
    for (const url of rootUrls) {
      out("  allowed upstream build-tool advisory: " + url);
    }
  }

  if (blocked.length) {
    failed = true;
    for (const item of blocked) {
      err(
        "  BLOCKED " +
          item.severity +
          ": " +
          item.name +
          " (" +
          (item.urls.join(", ") || "unresolved root cause") +
          ")",
      );
    }
  }
}

if (failed) {
  err(
    "Production dependency audit failed: a high/critical advisory is outside the documented exception set.",
  );
} else {
  out(
    "Production dependency audit passed policy: zero critical and no unapproved high-severity advisories.",
  );
}
process.exitCode = failed ? 1 : 0;
