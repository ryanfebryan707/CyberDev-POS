import { safeRoute } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import { authError, forbidden, getCurrentUser, hasTenantAccess } from "@/lib/auth";

async function GETHandler(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return authError();
    if (!["owner","supervisor"].includes(user.role)) return forbidden();
    if (!user.tenantId || user.tenantStatus !== "active" || !hasTenantAccess(user)) {
      return forbidden("Laporan untung-rugi memerlukan paket Aktif dan otorisasi lokasi toko.");
    }
    const url = new URL(request.url);
    const days = Math.min(90, Math.max(7, Math.round(Number(url.searchParams.get("days")) || 30)));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const summary = await env.DB.prepare(
      `SELECT COUNT(*) AS transactionCount, COALESCE(SUM(t.total-t.tax),0) AS revenue,
       COALESCE(SUM((SELECT SUM(i.unit_cost*i.quantity) FROM transaction_items i WHERE i.transaction_id=t.id)),0) AS costOfGoods
       FROM transactions t WHERE t.tenant_id=? AND t.status='paid' AND t.created_at>=?`
    ).bind(user.tenantId,since).first<{transactionCount:number;revenue:number;costOfGoods:number}>();
    const daily=await env.DB.prepare(
      `SELECT to_char(to_timestamp(t.created_at/1000.0) AT TIME ZONE 'Asia/Makassar','YYYY-MM-DD') AS day,
       SUM(t.total-t.tax) AS revenue, COALESCE(SUM((SELECT SUM(i.unit_cost*i.quantity) FROM transaction_items i WHERE i.transaction_id=t.id)),0) AS costOfGoods
       FROM transactions t WHERE t.tenant_id=? AND t.status='paid' AND t.created_at>=? GROUP BY day ORDER BY day`
    ).bind(user.tenantId,since).all();
    const topProducts = await env.DB.prepare(
      `SELECT i.product_name AS name, SUM(i.quantity) AS quantity,
        SUM(i.line_total - t.discount * i.line_total / (t.subtotal * 1.0)) AS revenue,
        SUM(i.line_total - t.discount * i.line_total / (t.subtotal * 1.0) - i.unit_cost * i.quantity) AS profit
       FROM transaction_items i
       JOIN transactions t ON t.id = i.transaction_id
       WHERE t.tenant_id = ? AND t.status = 'paid' AND t.created_at >= ?
       GROUP BY i.product_name ORDER BY revenue DESC LIMIT 8`
    ).bind(user.tenantId, since).all();
    const paymentMix = await env.DB.prepare(
      `SELECT payment_method AS method, COUNT(*) AS count, SUM(total) AS total
       FROM transactions WHERE tenant_id = ? AND status = 'paid' AND created_at >= ?
       GROUP BY payment_method ORDER BY total DESC`
    ).bind(user.tenantId, since).all();
    const revenue = Number(summary?.revenue || 0);
    const costOfGoods = Number(summary?.costOfGoods || 0);
    const grossProfit = revenue - costOfGoods;
    return Response.json({
      periodDays: days,
      summary: {
        transactionCount: Number(summary?.transactionCount || 0),
        revenue,
        costOfGoods,
        grossProfit,
        margin: revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0,
        averageOrder: Number(summary?.transactionCount || 0) > 0 ? Math.round(revenue / Number(summary?.transactionCount || 1)) : 0,
      },
      daily: daily.results,
      topProducts: topProducts.results,
      paymentMix: paymentMix.results,
    });
  } catch (error) {
    console.error("REPORTS_FAILED", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Laporan belum dapat dihitung." }, { status: 500 });
  }
}


export const GET = safeRoute(GETHandler);
