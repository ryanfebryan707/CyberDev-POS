import { databaseRuntimeAvailable, env } from "@/lib/runtime-env";
export async function GET() {
  if (!databaseRuntimeAvailable()) return Response.json({status:"unavailable",database:"not_configured"},{status:503,headers:{"cache-control":"no-store"}});
  try {
    await env.DB.prepare("SELECT id FROM tenants LIMIT 1").all();
    return Response.json({status:"ok",database:"connected"},{headers:{"cache-control":"no-store"}});
  } catch { return Response.json({status:"unavailable",database:"unreachable"},{status:503,headers:{"cache-control":"no-store"}}); }
}
