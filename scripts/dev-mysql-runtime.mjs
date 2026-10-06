import { spawn, spawnSync } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const mysqlVersion = "8.4.11";
const mysqlArchive = "mysql-" + mysqlVersion + "-winx64.zip";
const mysqlChecksum =
  "a492371d687d2bab088b0062581144a0044b8964baefdf4faa579292b423d25c"; // SHA256 of the official archive, also verified against Oracle\'s published MD5.
async function digest(file, algorithm, signal) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) {
    signal?.throwIfAborted();
    hash.update(chunk);
  }
  return hash.digest("hex");
}
export async function downloadVerified({
  urls,
  destination,
  checksum,
  algorithm = "sha256",
  verify,
  label = "runtime",
  signal,
}) {
  if (!checksum && !verify)
    throw new Error("A checksum or signature verifier is required.");
  signal?.throwIfAborted();
  const valid = async (file) =>
    verify
      ? verify(file)
      : (await digest(file, algorithm, signal)) === checksum;
  if (existsSync(destination)) {
    if (await valid(destination)) return destination;
    rmSync(destination);
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  const partial = destination + ".partial";
  if (existsSync(partial) && (await valid(partial))) {
    renameSync(partial, destination);
    return destination;
  }
  let lastError;
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        signal?.throwIfAborted();
        const offset = existsSync(partial) ? statSync(partial).size : 0;
        const response = await fetch(url, {
          headers: offset ? { Range: "bytes=" + offset + "-" } : {},
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(30 * 60 * 1000)])
            : AbortSignal.timeout(30 * 60 * 1000),
        });
        if (response.status === 416 && offset) {
          await response.body?.cancel();
          rmSync(partial, { force: true });
          continue;
        }
        if (!response.ok)
          throw new Error(label + " download returned HTTP " + response.status);
        const resumed = response.status === 206;
        const range = response.headers.get("content-range");
        if (resumed && !range?.startsWith("bytes " + offset + "-"))
          throw new Error(
            "Download resume range did not match the partial file.",
          );
        let bytes = resumed ? offset : 0;
        const total = Number(
          range?.split("/")[1] || response.headers.get("content-length") || 0,
        );
        let reported = 0;
        console.log(
          "Downloading " +
            label +
            (bytes
              ? " (resuming at " + Math.round(bytes / 1024 / 1024) + " MB)"
              : "") +
            "...",
        );
        const progress = new Transform({
          transform(chunk, _encoding, done) {
            bytes += chunk.length;
            if (bytes > 1024 ** 3)
              return done(
                new Error("Runtime archive exceeded the 1 GB limit."),
              );
            if (Date.now() - reported > 15000) {
              console.log(
                label +
                  ": " +
                  Math.round(bytes / 1024 / 1024) +
                  " MB" +
                  (total
                    ? " / " + Math.round(total / 1024 / 1024) + " MB"
                    : ""),
              );
              reported = Date.now();
            }
            done(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(response.body),
          progress,
          createWriteStream(partial, { flags: resumed ? "a" : "w" }),
        );
        if (!(await valid(partial))) {
          rmSync(partial, { force: true });
          throw new Error(label + " checksum/signature verification failed.");
        }
        renameSync(partial, destination);
        return destination;
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        lastError = error;
        // Corrupt payloads and HTTP errors are not an interrupted transfer.
        if (/checksum|signature|HTTP|range|limit/i.test(error.message)) break;
        console.warn(
          label + " download interrupted; retrying the saved partial file.",
        );
      }
    }
  }
  throw lastError || new Error(label + " download failed.");
}

function command(executable, argv, env = process.env, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argv, {
      windowsHide: true,
      env,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}
async function ensureVisualCpp(cache, signal) {
  const destination = path.join(cache, "vc_redist.x64.exe");
  const verify = async (file) => {
    const result = await command(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$s = Get-AuthenticodeSignature -LiteralPath $env:PETCONNECT_RUNTIME_INSTALLER; if ($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match 'O=Microsoft Corporation') { exit 0 }; exit 1",
      ],
      { ...process.env, PETCONNECT_RUNTIME_INSTALLER: file },
    );
    return result.code === 0;
  };
  await downloadVerified({
    urls: ["https://aka.ms/vc14/vc_redist.x64.exe"],
    destination,
    verify,
    signal,
    label: "Microsoft Visual C++ runtime",
  });
  console.log(
    "Installing the verified Microsoft Visual C++ runtime. Approve the Windows prompt if it appears.",
  );
  const result = await command(
    destination,
    ["/install", "/quiet", "/norestart"],
    process.env,
    signal,
  );
  if (![0, 1638, 3010].includes(result.code))
    throw new Error(
      "Microsoft Visual C++ runtime setup did not finish (exit " +
        result.code +
        "). Run " +
        destination +
        " and approve its Windows prompt, then rerun npm run demo.",
    );
}

export async function ensurePortableMysql({
  repoRoot,
  platform = process.platform,
  arch = process.arch,
  signal,
}) {
  if (platform !== "win32" || arch !== "x64")
    throw new Error(
      "Automatic portable MySQL setup supports Windows x64. On this platform, install MySQL 8.0/8.4 or set MYSQLD_PATH to its server executable.",
    );
  const runtimeRoot = path.join(repoRoot, ".petconnect-dev", "runtime");
  const directory = path.join(runtimeRoot, "mysql-" + mysqlVersion + "-winx64");
  const binary = path.join(directory, "bin", "mysqld.exe");
  const downloads = path.join(repoRoot, ".petconnect-dev", "downloads");
  mkdirSync(runtimeRoot, { recursive: true });
  if (!existsSync(binary)) {
    const stats = statfsSync(repoRoot);
    if (Number(stats.bavail) * Number(stats.bsize) < 1.5 * 1024 ** 3)
      throw new Error(
        "Portable MySQL needs at least 1.5 GB of free disk space for its first download and extraction.",
      );
    const archive = await downloadVerified({
      urls: [
        "https://cdn.mysql.com/Downloads/MySQL-8.4/" + mysqlArchive,
        "https://cdn.mysql.com/archives/mysql-8.4/" + mysqlArchive,
      ],
      destination: path.join(downloads, mysqlArchive),
      checksum: mysqlChecksum,
      signal,
      label: "MySQL " + mysqlVersion,
    });
    console.log("Extracting verified portable MySQL...");
    const staging = path.join(runtimeRoot, ".extract-" + randomUUID());
    mkdirSync(staging);
    try {
      let result;
      try {
        result = await command(
          "tar.exe",
          ["-xf", archive, "-C", staging],
          process.env,
          signal,
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        result = await command(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Expand-Archive -LiteralPath $env:PETCONNECT_RUNTIME_ARCHIVE -DestinationPath $env:PETCONNECT_RUNTIME_OUTPUT -Force",
          ],
          {
            ...process.env,
            PETCONNECT_RUNTIME_ARCHIVE: archive,
            PETCONNECT_RUNTIME_OUTPUT: staging,
          },
          signal,
        );
      }
      if (result.code !== 0)
        throw new Error(
          "Portable MySQL extraction failed: " + result.output.trim(),
        );
      const extracted = path.join(staging, "mysql-" + mysqlVersion + "-winx64");
      if (!existsSync(path.join(extracted, "bin/mysqld.exe")))
        throw new Error("MySQL archive did not contain its server executable.");
      if (existsSync(directory))
        rmSync(directory, { recursive: true, force: true });
      renameSync(extracted, directory);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
  signal?.throwIfAborted();
  let probe = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
  });
  if (probe.status !== 0) {
    await ensureVisualCpp(downloads, signal);
    probe = spawnSync(binary, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    });
  }
  if (probe.error || probe.status !== 0)
    throw new Error(
      "Portable MySQL cannot run: " +
        (probe.error?.message || probe.stderr || "exit " + probe.status),
    );
  console.log("Portable MySQL " + mysqlVersion + " is ready.");
  return binary;
}
