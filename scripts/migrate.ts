import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in the server environment before migration.");
const pool = new Pool({connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, max: 1});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(904121)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  for (const file of (await readdir("db/migrations")).filter(x => x.endsWith(".sql")).sort()) {
    const found = await client.query("SELECT name FROM schema_migrations WHERE name=$1", [file]);
    if (found.rowCount) continue;
    await client.query(await readFile(`db/migrations/${file}`, "utf8"));
    await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
    console.log(`Applied ${file}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK"); throw error;
} finally { client.release(); await pool.end(); }
