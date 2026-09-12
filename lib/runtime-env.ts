import { AsyncLocalStorage } from "node:async_hooks";
import { Client, Pool, types } from "pg";

types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);
type Row = Record<string, unknown>;
type QueryResult = { rows: Row[]; rowCount?: number | null; affectedRows?: number };
type Connection = { query: (sql: string, values?: unknown[]) => Promise<QueryResult> };
const context = new AsyncLocalStorage<Connection>();
type RequestDatabase = {
  connectionString: string;
  client?: Client;
  connecting?: Promise<Client>;
};
const requestDatabase = new AsyncLocalStorage<RequestDatabase>();
let pool: Pool | undefined;
let local: Promise<import("@electric-sql/pglite").PGlite> | undefined;

function databaseUrlFromParts() {
  const host = process.env.PGHOST || process.env.POSTGRES_HOST;
  const user = process.env.PGUSER || process.env.POSTGRES_USER;
  const password = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const databaseName = process.env.PGDATABASE || process.env.POSTGRES_DATABASE;
  const port = process.env.PGPORT || "5432";
  if (!host || !user || !password || !databaseName) return "";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(databaseName)}?sslmode=${encodeURIComponent(process.env.PGSSLMODE || "require")}`;
}

function configuredDatabaseUrl() {
  return requestDatabase.getStore()?.connectionString
    || process.env.CYBERDEV_DATABASE_URL
    || process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_URL
    || process.env.DATABASE_URL_UNPOOLED
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.NEON_DATABASE_URL
    || databaseUrlFromParts()
    || "";
}

async function requestConnection() {
  const state = requestDatabase.getStore();
  if (!state) return null;
  state.connecting ??= (async () => {
    const client = new Client({
      connectionString: state.connectionString,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    state.client = client;
    return client;
  })();
  return state.connecting;
}

export async function withRequestDatabaseUrl<T>(
  connectionString: string | undefined,
  work: () => Promise<T>
) {
  const value = connectionString?.trim();
  if (!value) return work();
  const state: RequestDatabase = { connectionString: value };
  return requestDatabase.run(state, async () => {
    try {
      return await work();
    } finally {
      if (state.connecting) {
        try { await (await state.connecting).end(); }
        catch { /* The request is already complete; never hide its response. */ }
      }
    }
  });
}

export function databaseConfigured() { return Boolean(configuredDatabaseUrl()); }
export function databaseRuntimeAvailable() { return databaseConfigured() || process.env.NODE_ENV !== "production"; }

export function postgresQuery(query: string) {
  let index = 0;
  // Application SQL is static; only values are ever bound. Preserve quoted strings.
  return query.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?|\bAS\s+([a-z]\w*[A-Z]\w*)/g, (match, alias) => {
    if (match === "?") return `$${++index}`;
    return alias ? `AS "${alias}"` : match;
  });
}

async function localDb() {
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is required in production");
  local ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readFile, readdir } = await import("node:fs/promises");
    const db = new PGlite(process.env.LOCAL_DATABASE_PATH || ".data/cyberdev");
    for (const file of (await readdir("db/migrations")).filter(x => x.endsWith(".sql")).sort()) {
      await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    }
    return db;
  })();
  return local;
}

function getPool() {
  const connectionString = configuredDatabaseUrl();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  pool ??= new Pool({ connectionString, max: 5, idleTimeoutMillis: 20000, connectionTimeoutMillis: 10000 });
  return pool;
}

async function query(sql: string, values: unknown[] = []): Promise<QueryResult> {
  const connection = context.getStore();
  if (connection) return connection.query(sql, values);
  const scopedConnection = await requestConnection();
  if (scopedConnection) return scopedConnection.query(sql, values);
  if (configuredDatabaseUrl()) return getPool().query(sql, values);
  return (await localDb()).query(sql, values) as Promise<QueryResult>;
}

export async function transaction<T>(work: () => Promise<T>): Promise<T> {
  if (context.getStore()) return work();
  if (!configuredDatabaseUrl()) {
    const db = await localDb();
    return db.transaction(tx => context.run(tx as Connection, work));
  }
  const requestClient = await requestConnection();
  const execute = async (client: Connection) => {
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '15s'");
      const value = await context.run(client, work);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  };
  if (requestClient) return execute(requestClient);
  const pooledClient = await getPool().connect();
  try { return await execute(pooledClient); }
  finally { pooledClient.release(); }
}

export class PreparedStatement {
  constructor(private sql: string, private values: unknown[] = []) {}
  bind(...values: unknown[]) { return new PreparedStatement(this.sql, values); }
  async all<T = Row>() {
    const result = await query(postgresQuery(this.sql), this.values);
    return { success: true, results: result.rows as T[], meta: { changes: result.rowCount ?? result.affectedRows ?? 0 } };
  }
  async first<T = Row>() { return (await this.all<T>()).results[0] ?? null; }
  async run<T = Row>() { return this.all<T>(); }
}

export const database = {
  prepare(sql: string) { return new PreparedStatement(sql); },
  async batch(statements: PreparedStatement[]) {
    return transaction(async () => {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    });
  },
  transaction,
};

export const env = {
  DB: database,
  get ADMIN_EMAIL() { return process.env.ADMIN_EMAIL; },
  get ADMIN_BOOTSTRAP_PASSWORD() {
    return process.env.CYBERDEV_ADMIN_BOOTSTRAP_PASSWORD
      || process.env.ADMIN_BOOTSTRAP_PASSWORD;
  },
  get ADMIN_PHONE_ALIASES() { return process.env.ADMIN_PHONE_ALIASES; },
};

export async function closeDatabase() {
  if (pool) await pool.end();
  if (local) await (await local).close();
  pool = undefined; local = undefined;
}
