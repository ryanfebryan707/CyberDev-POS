import { databaseRuntimeAvailable, env } from "@/lib/runtime-env";

function databaseFailureReason(error: unknown) {
  const candidate = error && typeof error === "object" ? error as {code?: unknown;message?: unknown;errors?: unknown[]} : {};
  const nested = Array.isArray(candidate.errors) ? candidate.errors.find(item => item && typeof item === "object") as {code?: unknown;message?: unknown} | undefined : undefined;
  const code = String(candidate.code || nested?.code || "").toUpperCase();
  const message = String(candidate.message || nested?.message || "").toLowerCase();
  if (code === "28P01" || message.includes("password authentication failed")) return "authentication_failed";
  if (code === "3D000") return "database_not_found";
  if (code === "42P01") return "schema_not_migrated";
  if (["ENOTFOUND","EAI_AGAIN"].includes(code)) return "dns_failed";
  if (["ENETUNREACH","EHOSTUNREACH"].includes(code)) return "network_unreachable";
  if (code === "ECONNREFUSED") return "connection_refused";
  if (code === "ETIMEDOUT" || message.includes("connection timeout")) return "connection_timeout";
  if (code.includes("CERT") || code.includes("TLS") || message.includes("certificate")) return "tls_failed";
  if (code === "ERR_INVALID_URL" || message.includes("invalid connection string") || message.includes("must be a string")) return "invalid_connection_string";
  if (["57P01","57P02","57P03"].includes(code)) return "database_starting";
  return "connection_failed";
}

export async function GET() {
  if (!databaseRuntimeAvailable()) return Response.json({status:"unavailable",database:"not_configured"},{status:503,headers:{"cache-control":"no-store"}});
  try {
    await env.DB.prepare("SELECT id FROM tenants LIMIT 1").all();
    return Response.json({status:"ok",database:"connected"},{headers:{"cache-control":"no-store"}});
  } catch (error) {
    const reason=databaseFailureReason(error);
    console.error("Database health check failed",{reason});
    return Response.json({status:"unavailable",database:"unreachable",reason},{status:503,headers:{"cache-control":"no-store"}});
  }
}
