import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../check-production-audit.mjs", import.meta.url),
);
const clean = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
      total: 0,
    },
  },
};
function runAudit(report, npmStatus = 1) {
  const dir = mkdtempSync(path.join(tmpdir(), "petconnect-audit-test-"));
  const output = JSON.stringify(report);
  const stub = process.platform === "win32" ? "npm.cmd" : "npm";
  writeFileSync(
    path.join(dir, stub),
    process.platform === "win32"
      ? "@echo off\r\necho " + output + "\r\nexit /b " + npmStatus + "\r\n"
      : "#!/bin/sh\nprintf '%s\\n' '" + output + "'\nexit " + npmStatus + "\n",
    { mode: 0o755 },
  );
  const env = { ...process.env };
  const key =
    Object.keys(env).find((name) => name.toLowerCase() === "path") || "PATH";
  env[key] = dir + path.delimiter + (env[key] || "");
  try {
    return spawnSync(process.execPath, [script], { env, encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("accepts a complete clean npm report", () => {
  const result = runAudit(clean, 0);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /audit passed policy/);
});
test("does not confuse a registry error with a clean audit", () => {
  const result = runAudit({
    error: { code: "ENOAUDIT", summary: "Registry unavailable" },
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /audit passed policy/);
});
test("rejects missing or malformed vulnerability metadata", () => {
  for (const report of [
    { vulnerabilities: {} },
    { ...clean, vulnerabilities: [] },
    { ...clean, metadata: { vulnerabilities: { high: "0" } } },
  ]) {
    assert.notEqual(runAudit(report).status, 0);
  }
});
test("accepts an advisory report returned with npm exit one only for the exact allowed advisory", () => {
  const report = {
    ...clean,
    vulnerabilities: {
      braces: {
        severity: "high",
        via: [{ url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }],
      },
    },
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 1,
        critical: 0,
        total: 1,
      },
    },
  };
  assert.equal(runAudit(report).status, 0);
  report.vulnerabilities.braces.via[0].url =
    "https://github.com/advisories/GHSA-new-test-only";
  assert.notEqual(runAudit(report).status, 0);
});
test("rejects inconsistent counts and malformed advisory entries", () => {
  assert.notEqual(
    runAudit({
      ...clean,
      metadata: {
        vulnerabilities: {
          ...clean.metadata.vulnerabilities,
          high: 1,
          total: 1,
        },
      },
    }).status,
    0,
  );
  assert.notEqual(
    runAudit({ ...clean, vulnerabilities: { broken: { via: [] } } }).status,
    0,
  );
});
