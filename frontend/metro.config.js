const { getDefaultConfig } = require("expo/metro-config");
const { createDevProxy } = require("./dev-proxy.cjs");

const config = getDefaultConfig(__dirname);
config.server.enhanceMiddleware = (middleware) => {
  const proxy = createDevProxy({
    enabled:
      process.env.NODE_ENV !== "production" &&
      (process.env.EXPO_PUBLIC_FIREBASE_ENV ?? "emulator") === "emulator",
    apiPort: Number(process.env.PETCONNECT_DEV_API_PORT) || 3000,
    authPort: Number(process.env.PETCONNECT_DEV_AUTH_PORT) || 9099,
  });
  return (req, res, next) => proxy(req, res, () => middleware(req, res, next));
};
module.exports = config;
