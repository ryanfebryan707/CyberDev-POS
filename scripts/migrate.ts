import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { securePostgresConnectionString } from "../lib/postgres-connection";

function connectionStringFromParts() {
  const host=process.env.PGHOST || process.env.POSTGRES_HOST;
  const user=process.env.PGUSER || process.env.POSTGRES_USER;
  const password=process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const database=process.env.PGDATABASE || process.env.POSTGRES_DATABASE;
  const port=process.env.PGPORT || "5432";
  if (!host || !user || !password || !database) return "";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?sslmode=${encodeURIComponent(process.env.PGSSLMODE || "verify-full")}`;
}

const configuredConnectionString=process.env.CYBERDEV_DATABASE_URL_UNPOOLED
  || process.env.DATABASE_URL_UNPOOLED
  || process.env.CYBERDEV_DATABASE_URL
  || process.env.POSTGRES_URL_NON_POOLING
  || process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || process.env.POSTGRES_PRISMA_URL
  || process.env.NEON_DATABASE_URL
  || connectionStringFromParts();
if (!configuredConnectionString) throw new Error("Set a supported PostgreSQL connection variable before migration.");
const connectionString=securePostgresConnectionString(configuredConnectionString);
const pool = new Pool({connectionString, max: 1, connectionTimeoutMillis: 15000});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(904121)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const ledger = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='schema_migrations'");
  const ledgerColumns = new Set(ledger.rows.map(row => String(row.column_name)));
  const migrationColumn = ledgerColumns.has("name") ? "name" : ledgerColumns.has("version") ? "version" : null;
  if (!migrationColumn) throw new Error("schema_migrations must contain a name or version column.");
  for (const file of (await readdir("db/migrations")).filter(x => x.endsWith(".sql")).sort()) {
    const found = await client.query(`SELECT ${migrationColumn} FROM schema_migrations WHERE ${migrationColumn}=$1`, [file]);
    if (found.rowCount) continue;
    await client.query(await readFile(`db/migrations/${file}`, "utf8"));
    if (migrationColumn === "version") await client.query("INSERT INTO schema_migrations(version, applied_at) VALUES ($1, $2)", [file, Date.now()]);
    else await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
    console.log(`Applied ${file}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK"); throw error;
} finally { client.release(); await pool.end(); }
