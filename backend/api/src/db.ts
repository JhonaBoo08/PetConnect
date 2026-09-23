import mysql, { Pool, PoolConnection } from "mysql2/promise";

export function createPool(config?: {
  host?: string;
  user?: string;
  password?: string;
  database?: string;
  port?: number;
}): Pool {
  return mysql.createPool({
    host: config?.host || process.env.MYSQL_HOST || "127.0.0.1",
    user: config?.user || process.env.MYSQL_USER || "root",
    password: config?.password || process.env.MYSQL_PASSWORD || "",
    database: config?.database || process.env.MYSQL_DATABASE || "petconnect_db",
    port: config?.port || Number(process.env.MYSQL_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
  });
}

export async function withTransaction<T>(
  pool: Pool,
  action: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await action(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
