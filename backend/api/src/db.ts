import { mysqlConnectionOptions } from "./db-config.js";
import mysql, { Pool, PoolConnection } from "mysql2/promise";

export function createPool(config?: {
  host?: string;
  user?: string;
  password?: string;
  database?: string;
  port?: number;
}): Pool {
  const pool = mysql.createPool({ ...mysqlConnectionOptions(), ...config });
  pool.pool.on("connection", (connection) => {
    // The driver timezone controls parsing; MySQL also needs UTC for
    // TIMESTAMP columns and database-generated dates. This query is queued
    // before the connection is handed to its first caller.
    connection.query("SET time_zone = '+00:00'");
  });
  return pool;
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
