import { safeRoute } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import { authError, forbidden, getCurrentUser, hasTenantAccess } from "@/lib/auth";

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  if (!user.tenantId) return forbidden();
  // Store reporting uses WITA (UTC+8); epoch values remain UTC in storage.
  const since = Math.floor((Date.now() + 8*3600000)/86400000)*86400000 - 8*3600000;
  const stats = await env.DB.prepare(
    `SELECT COUNT(*) AS transactionCount, COALESCE(SUM(total), 0) AS revenue,
      COALESCE(SUM(total - tax), 0) AS grossSales
     FROM transactions WHERE tenant_id = ? AND status = 'paid' AND created_at >= ?`
  ).bind(user.tenantId, since).first();
  const inventory = await env.DB.prepare(
    "SELECT COUNT(*) AS productCount, SUM(CASE WHEN stock <= low_stock THEN 1 ELSE 0 END) AS lowStock FROM products WHERE tenant_id = ?"
  ).bind(user.tenantId).first();
  const latest = await env.DB.prepare(
    "SELECT id, total, payment_method AS paymentMethod, created_at AS createdAt FROM transactions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5"
  ).bind(user.tenantId).all();
  const hourly = await env.DB.prepare("SELECT EXTRACT(HOUR FROM to_timestamp(created_at/1000.0) AT TIME ZONE 'Asia/Makassar')::int AS hour, SUM(total) AS revenue FROM transactions WHERE tenant_id=? AND status='paid' AND created_at>=? GROUP BY hour ORDER BY hour").bind(user.tenantId,since).all();
  const topProducts = await env.DB.prepare("SELECT i.product_id AS id,i.product_name AS name,SUM(i.quantity) AS quantity,SUM(i.line_total) AS revenue FROM transaction_items i JOIN transactions t ON t.id=i.transaction_id WHERE t.tenant_id=? AND t.status='paid' AND t.created_at>=? GROUP BY i.product_id,i.product_name ORDER BY quantity DESC LIMIT 4").bind(user.tenantId,since).all();
  const lowProducts = await env.DB.prepare("SELECT id,name,stock,unit FROM products WHERE tenant_id=? AND stock<=low_stock ORDER BY stock LIMIT 4").bind(user.tenantId).all();
  return Response.json({
    hourly:hourly.results,topProducts:topProducts.results,lowProducts:lowProducts.results,
    stats: { ...stats, ...inventory },
    latest: latest.results,
    subscription: {
      status: user.tenantStatus,
      planCode: user.planCode,
      demoExpiresAt: user.demoExpiresAt,
      activeUntil: user.activeUntil,
      hasAccess: hasTenantAccess(user),
    },
  });
}

export const GET = safeRoute(GETHandler);
