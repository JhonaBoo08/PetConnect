import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function webQrUrl({
  url,
  port = 8081,
  interfaces = networkInterfaces(),
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("The web port must be an integer from 1 to 65535.");
  }
  if (!url) {
    const hosts = [
      ...new Set(
        Object.values(interfaces)
          .flat()
          .filter(
            (item) =>
              item &&
              !item.internal &&
              (item.family === "IPv4" || item.family === 4) &&
              !item.address.startsWith("169.254."),
          )
          .map((item) => item.address),
      ),
    ];
    if (hosts.length !== 1) {
      throw new Error(
        "Cannot choose one LAN address. Pass --url http://YOUR_COMPUTER_IP:WEB_PORT.",
      );
    }
    url = `http://${hosts[0]}:${port}/`;
  }
  const target = new URL(url);
  const host = target.hostname.toLowerCase();
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error(
      "A browser QR must use http:// or https://, not an Expo app scheme.",
    );
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.startsWith("127.") ||
    ["[::1]", "0.0.0.0", "[::]"].includes(host)
  ) {
    throw new Error(
      "Localhost cannot open this computer's website from a phone. Use its LAN address.",
    );
  }
  if (target.username || target.password || target.search || target.hash) {
    throw new Error("Use a web URL without credentials, a query or fragment.");
  }
  return target.href;
}

export async function generateWebQr({ url, port = 8081 } = {}) {
  const target = webQrUrl({ url, port });
  const response = await fetch(target, { signal: AbortSignal.timeout(30_000) });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/html")
  ) {
    throw new Error(
      `The website at ${target} is not ready (HTTP ${response.status}). Start the web server on the correct port first.`,
    );
  }
  // Use the QR encoder already installed by the application's QR component.
  const frontendRequire = createRequire(
    path.join(projectRoot, "frontend/package.json"),
  );
  const componentRequire = createRequire(
    frontendRequire.resolve("react-native-qrcode-svg/package.json"),
  );
  const qr = componentRequire("qrcode");
  const output = path.join(projectRoot, "frontend/assets/web-access-qr.png");
  await mkdir(path.dirname(output), { recursive: true });
  await qr.toFile(output, target, {
    width: 480,
    margin: 4,
    errorCorrectionLevel: "M",
  });
  return { url: target, file: output };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    while (args.length) {
      const flag = args.shift();
      if (!["--url", "--port"].includes(flag) || !args.length) {
        throw new Error(
          "Usage: npm run web:qr -- [--url http://LAN_IP:WEB_PORT/] [--port 8081]",
        );
      }
      const value = args.shift();
      options[flag.slice(2)] = flag === "--port" ? Number(value) : value;
    }
    const result = await generateWebQr(options);
    console.log(
      `Browser URL: ${result.url}\nWeb QR: ${result.file}\nScan with your phone camera, then tap the browser link. Both devices must be on the same network.\nRegenerate this QR if your computer's IP address or web port changes.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
