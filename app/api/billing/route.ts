import { safeRoute } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import { authError, forbidden, getCurrentUser } from "@/lib/auth";
import { isPlanCode, subscriptionPlans } from "@/lib/plans";
import { customerServiceContacts, isPaymentMethod, paymentMethods } from "@/lib/payment-config";

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  if (user.role !== "owner") return forbidden();
  if (!user.tenantId) return Response.json({ error: "Akun ini tidak memiliki toko." }, { status: 400 });
  const history = await env.DB.prepare(
    "SELECT id, plan_code AS planCode, amount, method, reference, status, submitted_at AS submittedAt, verified_at AS verifiedAt FROM payments WHERE tenant_id = ? ORDER BY submitted_at DESC LIMIT 20"
  ).bind(user.tenantId).all();
  return Response.json({ tenant: {
    name: user.storeName,
    status: user.tenantStatus,
    planCode: user.planCode,
    demoExpiresAt: user.demoExpiresAt,
    activeUntil: user.activeUntil,
  }, history: history.results, plans: subscriptionPlans, paymentMethods, customerServiceContacts });
}

async function POSTHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  if (user.role !== "owner") return forbidden();
  if (!user.tenantId) return Response.json({ error: "Akun ini tidak memiliki toko." }, { status: 400 });
  const body = (await request.json()) as { planCode?: string; method?: string; reference?: string };
  if (!body.planCode || !isPlanCode(body.planCode)) return Response.json({ error: "Paket tidak valid." }, { status: 400 });
  if (!body.method || !isPaymentMethod(body.method)) return Response.json({ error: "Metode pembayaran tidak valid." }, { status: 400 });
  const plan = subscriptionPlans[body.planCode];
  const now = Date.now();
  const paymentId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO payments (id, tenant_id, plan_code, amount, method, reference, status, submitted_at, verified_at, verified_by) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL)"
    ).bind(paymentId, user.tenantId, body.planCode, plan.amount, body.method.slice(0, 30), (body.reference || "").slice(0, 100), now),
    env.DB.prepare(
      "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'PAYMENT_SUBMITTED', ?, ?)"
    ).bind(crypto.randomUUID(), user.tenantId, user.id, `Permintaan aktivasi ${plan.label} dikirim.`, now),
  ]);
  return Response.json({ ok: true, paymentId, status: "pending" }, { status: 201 });
}

export const GET = safeRoute(GETHandler);
export const POST = safeRoute(POSTHandler);
