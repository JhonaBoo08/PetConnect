/** Fail closed before any test creates tables, drops a database, or truncates data. */
export function assertTestDatabase(
  env: NodeJS.ProcessEnv,
  database: unknown,
): asserts database is string {
  if (
    env.NODE_ENV !== "test" ||
    typeof database !== "string" ||
    !/^[A-Za-z0-9_]+$/.test(database) ||
    !/(?:_test|_e2e)$/.test(database)
  ) {
    throw new Error(
      "Refusing test database mutation: NODE_ENV must be test and the resolved MYSQL_DATABASE must end in _test or _e2e.",
    );
  }
}
export function assertTestAuth(env: NodeJS.ProcessEnv): void {
  if (
    env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199" ||
    env.FIREBASE_PROJECT_ID !== "demo-petconnect-test"
  ) {
    throw new Error(
      "Backend tests require the isolated Auth emulator at 127.0.0.1:9199 and project demo-petconnect-test.",
    );
  }
}
