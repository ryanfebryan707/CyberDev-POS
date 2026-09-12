import { safeRoute } from "@/lib/http";
import { env, type PreparedStatement } from "@/lib/runtime-env";
import {
  authError,
  forbidden,
  getBootstrapAdmin,
  getCurrentUser,
  hashPassword,
  normalizeEmail,
  normalizePhone,
  phoneLoginVariants,
  validatePassword,
} from "@/lib/auth";
import { isPlanCode, subscriptionPlans } from "@/lib/plans";
import { isBusinessType } from "@/lib/business-types";

function coordinates(latitude: unknown, longitude: unknown) {
  const lat = typeof latitude === "number" ? latitude : Number.NaN;
  const lng = typeof longitude === "number" ? longitude : Number.NaN;
  return {
    latitude: lat,
    longitude: lng,
    valid: Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180,
  };
}

async function requireAdmin(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return { response: authError(), user: null };
  if (user.role !== "superadmin") return { response: forbidden(), user: null };
  return { response: null, user };
}

async function GETHandler(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE tenants SET status = 'suspend', updated_at = ? WHERE status = 'active' AND active_until IS NOT NULL AND active_until < ?"
  ).bind(now, now).run();
  await env.DB.prepare(
    "UPDATE tenants SET status = 'suspend', updated_at = ? WHERE status = 'demo' AND demo_expires_at IS NOT NULL AND demo_expires_at < ?"
  ).bind(now, now).run();

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const requestedStatus = url.searchParams.get("status") || "semua";
  const status = ["active", "demo", "suspend"].includes(requestedStatus) ? requestedStatus : "semua";
  const page = Math.max(1, Math.round(Number(url.searchParams.get("page")) || 1));
  const limit = Math.min(100, Math.max(10, Math.round(Number(url.searchParams.get("limit")) || 25)));
  const offset = (page - 1) * limit;
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (status !== "semua") {
    clauses.push("t.status = ?");
    values.push(status);
  }
  if (query) {
    clauses.push("(LOWER(t.name) LIKE ? OR LOWER(t.owner_email) LIKE ? OR t.phone LIKE ? OR LOWER(COALESCE(t.city, '')) LIKE ?)");
    const search = `%${query.toLowerCase()}%`;
    values.push(search, search, `%${query}%`, search);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const clients = await env.DB.prepare(
    `SELECT t.id, t.name, t.business_type AS businessType, t.owner_email AS ownerEmail, t.phone, t.address, t.city,
      t.latitude, t.longitude, t.last_location_at AS lastLocationAt,
      t.location_accuracy AS locationAccuracy, t.location_consent_at AS locationConsentAt,
      t.device_authorized_at AS deviceAuthorizedAt, t.last_ip AS lastIp,
      t.status, t.plan_code AS planCode, t.demo_expires_at AS demoExpiresAt,
      t.active_until AS activeUntil, t.created_at AS createdAt,
      (SELECT u.name FROM users u WHERE u.tenant_id = t.id AND u.role = 'owner' LIMIT 1) AS ownerName,
      (SELECT COUNT(*) FROM transactions x WHERE x.tenant_id = t.id) AS transactionCount,
      (SELECT COUNT(*) FROM products pr WHERE pr.tenant_id = t.id) AS productCount,
      (SELECT COALESCE(SUM(x.total), 0) FROM transactions x WHERE x.tenant_id = t.id) AS salesTotal,
      (SELECT p.status FROM payments p WHERE p.tenant_id = t.id ORDER BY p.submitted_at DESC LIMIT 1) AS paymentStatus,
      (SELECT p.amount FROM payments p WHERE p.tenant_id = t.id ORDER BY p.submitted_at DESC LIMIT 1) AS paymentAmount,
      (SELECT p.method FROM payments p WHERE p.tenant_id = t.id ORDER BY p.submitted_at DESC LIMIT 1) AS paymentMethod,
      (SELECT p.reference FROM payments p WHERE p.tenant_id = t.id ORDER BY p.submitted_at DESC LIMIT 1) AS paymentReference
     FROM tenants t ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...values, limit, offset).all();
  const filteredCountStatement = env.DB.prepare(`SELECT COUNT(*) AS total FROM tenants t ${where}`);
  const filteredCount = values.length
    ? await filteredCountStatement.bind(...values).first<{ total: number }>()
    : await filteredCountStatement.first<{ total: number }>();
  const stats = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'demo' THEN 1 ELSE 0 END) AS demo,
      SUM(CASE WHEN status = 'suspend' THEN 1 ELSE 0 END) AS suspended
     FROM tenants`
  ).first();
  const revenue = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'verified'"
  ).first();
  const health = await env.DB.prepare(
    `SELECT
      SUM(CASE WHEN status = 'active' AND device_authorized_at IS NOT NULL THEN 1 ELSE 0 END) AS authorizedDevices,
      SUM(CASE WHEN status = 'active' AND active_until BETWEEN ? AND ? THEN 1 ELSE 0 END) AS expiringSoon,
      (SELECT COUNT(*) FROM payments WHERE status = 'pending') AS pendingPayments
     FROM tenants`
  ).bind(now, now + 7 * 24 * 60 * 60 * 1000).first();
  const businessMix = await env.DB.prepare(
    "SELECT business_type AS businessType, COUNT(*) AS total FROM tenants GROUP BY business_type ORDER BY total DESC"
  ).all();
  const recentActivity = await env.DB.prepare(
    `SELECT a.id, a.action, a.details, a.created_at AS createdAt, t.name AS storeName
     FROM audit_logs a LEFT JOIN tenants t ON t.id = a.tenant_id
     ORDER BY a.created_at DESC LIMIT 6`
  ).all();
  const total = Number(filteredCount?.total || 0);
  return Response.json({
    clients: clients.results,
    stats: { ...stats, ...health, revenue: revenue?.total || 0, capacity: 2000 },
    businessMix: businessMix.results,
    recentActivity: recentActivity.results,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
}

async function POSTHandler(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    if (!auth.user) return authError();
    const body = (await request.json()) as {
      ownerName?: string;
      storeName?: string;
      email?: string;
      phone?: string;
      password?: string;
      planCode?: string;
      address?: string;
      city?: string;
      latitude?: number | null;
      longitude?: number | null;
      businessType?: string;
      confirmation?: string;
    };
    const ownerName = body.ownerName?.trim().slice(0, 80) || "";
    const storeName = body.storeName?.trim().slice(0, 100) || "";
    const email = normalizeEmail(body.email || "");
    const phone = normalizePhone(body.phone || "").slice(0, 20);
    const password = body.password || "";
    const planCode = body.planCode || "demo";
    const address = body.address?.trim().slice(0, 240) || "";
    const city = body.city?.trim().slice(0, 80) || "";
    const businessType = isBusinessType(body.businessType) ? body.businessType : "general";
    const point = coordinates(body.latitude, body.longitude);
    if (!ownerName || !storeName || !email.includes("@") || phone.length < 9 || !validatePassword(password)) {
      return Response.json({ error: "Nama, toko, email, WhatsApp, dan password huruf+angka minimal 12 karakter wajib diisi." }, { status: 400 });
    }
    if (planCode !== "demo" && !isPlanCode(planCode)) return Response.json({ error: "Paket tidak valid." }, { status: 400 });
    const bootstrap = getBootstrapAdmin();
    if (email === bootstrap.email || bootstrap.phoneAliases.includes(phone)) {
      return Response.json({ error: "Identitas ini khusus Super-Admin." }, { status: 403 });
    }
    const variants = phoneLoginVariants(phone);
    const duplicate = await env.DB.prepare("SELECT id FROM users WHERE email = ? OR phone IN (?, ?, ?) LIMIT 1")
      .bind(email, variants[0] || "", variants[1] || "", variants[2] || "").first();
    if (duplicate) return Response.json({ error: "Email atau nomor WhatsApp sudah terdaftar." }, { status: 409 });
    const capacity = await env.DB.prepare("SELECT COUNT(*) AS total FROM tenants").first<{ total: number }>();
    if (Number(capacity?.total || 0) >= 2000) return Response.json({ error: "Kapasitas 2.000 client telah tercapai." }, { status: 503 });

    const now = Date.now();
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const credentials = await hashPassword(password);
    const activePlan = planCode !== "demo" && isPlanCode(planCode) ? subscriptionPlans[planCode] : null;
    const demoExpiresAt = activePlan ? null : now + 14 * 24 * 60 * 60 * 1000;
    const activeUntil = activePlan ? now + activePlan.days * 24 * 60 * 60 * 1000 : null;
    const storeSlug = `${storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 28) || "toko"}-${tenantId.slice(0, 6)}`;
    const writes: PreparedStatement[] = [
      env.DB.prepare(
        "INSERT INTO tenants (id, name, business_type, store_slug, owner_email, phone, address, city, latitude, longitude, last_location_at, status, plan_code, demo_expires_at, active_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(tenantId, storeName, businessType, storeSlug, email, phone, address || null, city || null, point.valid ? point.latitude : null, point.valid ? point.longitude : null, point.valid ? now : null, activePlan ? "active" : "demo", activePlan ? planCode : "demo", demoExpiresAt, activeUntil, now, now),
      env.DB.prepare(
        "INSERT INTO users (id, tenant_id, name, email, phone, password_hash, password_salt, role, is_active, password_changed_at, last_login_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', 1, ?, NULL, ?)"
      ).bind(userId, tenantId, ownerName, email, phone, credentials.hash, credentials.salt, now, now),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'CLIENT_CREATED_BY_ADMIN', ?, ?)"
      ).bind(crypto.randomUUID(), tenantId, auth.user.id, activePlan ? `${activePlan.label} langsung diaktifkan.` : "Demo 14 hari dibuat oleh Super-Admin.", now),
    ];
    if (activePlan && activeUntil) {
      const paymentId = crypto.randomUUID();
      writes.push(
        env.DB.prepare(
          "INSERT INTO payments (id, tenant_id, plan_code, amount, method, reference, status, submitted_at, verified_at, verified_by) VALUES (?, ?, ?, ?, 'manual', 'admin-create', 'verified', ?, ?, ?)"
        ).bind(paymentId, tenantId, planCode, activePlan.amount, now, now, auth.user.id),
        env.DB.prepare(
          "INSERT INTO subscriptions (id, tenant_id, plan_code, amount, payment_reference, status, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?)"
        ).bind(crypto.randomUUID(), tenantId, planCode, activePlan.amount, paymentId, now, activeUntil, now)
      );
    }
    await env.DB.batch(writes);
    return Response.json({ ok: true, tenantId, status: activePlan ? "active" : "demo", activeUntil, demoExpiresAt }, { status: 201 });
  } catch (error) {
    console.error("ADMIN_CLIENT_CREATE_FAILED", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Client belum dapat ditambahkan. Periksa data lalu coba lagi." }, { status: 500 });
  }
}

async function PATCHHandler(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    if (!auth.user) return authError();
    const body = (await request.json()) as {
      tenantId?: string;
      action?: string;
      planCode?: string;
      ownerName?: string;
      storeName?: string;
      email?: string;
      phone?: string;
      password?: string;
      address?: string;
      city?: string;
      latitude?: number | null;
      longitude?: number | null;
      businessType?: string;
      confirmation?: string;
    };
    const tenantId = body.tenantId || "";
    const action = body.action || "";
    if (!tenantId) return Response.json({ error: "Client tidak ditemukan." }, { status: 400 });
    const tenant = await env.DB.prepare(
      "SELECT id, name, active_until AS activeUntil, data_revision AS dataRevision FROM tenants WHERE id = ?"
    ).bind(tenantId).first<{ id: string; name: string; activeUntil: number | null; dataRevision: number }>();
    if (!tenant) return Response.json({ error: "Client tidak ditemukan." }, { status: 404 });
    const now = Date.now();

    if (action === "reset_data") {
      if ((body.confirmation || "").trim() !== tenant.name) {
        return Response.json({ error: `Ketik nama toko \"${tenant.name}\" untuk mengonfirmasi reset.` }, { status: 400 });
      }
      await env.DB.batch([
        env.DB.prepare("DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE tenant_id = ?)").bind(tenantId),
        env.DB.prepare("DELETE FROM transactions WHERE tenant_id = ?").bind(tenantId),
        env.DB.prepare("DELETE FROM products WHERE tenant_id = ?").bind(tenantId),
        env.DB.prepare("UPDATE tenants SET data_revision = data_revision + 1, updated_at = ? WHERE id = ?").bind(now, tenantId),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'CLIENT_OPERATIONAL_DATA_RESET', ?, ?)"
        ).bind(crypto.randomUUID(), tenantId, auth.user.id, `Produk dan transaksi ${tenant.name} direset. Akun, paket, pembayaran, dan profil tetap dipertahankan. Revisi data ${Number(tenant.dataRevision || 1) + 1}.`, now),
      ]);
      return Response.json({ ok: true, reset: true, dataRevision: Number(tenant.dataRevision || 1) + 1 });
    }

    if (action === "update_client") {
      const ownerName = body.ownerName?.trim().slice(0, 80) || "";
      const storeName = body.storeName?.trim().slice(0, 100) || "";
      const email = normalizeEmail(body.email || "");
      const phone = normalizePhone(body.phone || "").slice(0, 20);
      const address = body.address?.trim().slice(0, 240) || "";
      const city = body.city?.trim().slice(0, 80) || "";
      const businessType = isBusinessType(body.businessType) ? body.businessType : "general";
      const point = coordinates(body.latitude, body.longitude);
      if (!ownerName || !storeName || !email.includes("@") || phone.length < 9) {
        return Response.json({ error: "Nama pemilik, toko, email, dan WhatsApp wajib diisi." }, { status: 400 });
      }
      const bootstrap = getBootstrapAdmin();
      if (email === bootstrap.email || bootstrap.phoneAliases.includes(phone)) return Response.json({ error: "Identitas ini khusus Super-Admin." }, { status: 403 });
      const variants = phoneLoginVariants(phone);
      const duplicate = await env.DB.prepare(
        "SELECT id FROM users WHERE tenant_id != ? AND (email = ? OR phone IN (?, ?, ?)) LIMIT 1"
      ).bind(tenantId, email, variants[0] || "", variants[1] || "", variants[2] || "").first();
      if (duplicate) return Response.json({ error: "Email atau nomor WhatsApp digunakan client lain." }, { status: 409 });
      const owner = await env.DB.prepare("SELECT id, email FROM users WHERE tenant_id = ? AND role = 'owner' LIMIT 1")
        .bind(tenantId).first<{ id: string; email: string }>();
      if (!owner) return Response.json({ error: "Akun pemilik Client tidak ditemukan." }, { status: 404 });
      const emailChanged = owner.email !== email;
      const writes: PreparedStatement[] = [
        env.DB.prepare(
          "UPDATE tenants SET name = ?, business_type = ?, owner_email = ?, phone = ?, address = ?, city = ?, latitude = ?, longitude = ?, last_location_at = ?, updated_at = ? WHERE id = ?"
        ).bind(storeName, businessType, email, phone, address || null, city || null, point.valid ? point.latitude : null, point.valid ? point.longitude : null, point.valid ? now : null, now, tenantId),
        env.DB.prepare("UPDATE users SET name = ?, email = ?, phone = ? WHERE tenant_id = ? AND role = 'owner'")
          .bind(ownerName, email, phone, tenantId),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'CLIENT_PROFILE_UPDATED', ?, ?)"
        ).bind(crypto.randomUUID(), tenantId, auth.user.id, "Profil client diperbarui Super-Admin.", now),
      ];
      if (body.password) {
        if (!validatePassword(body.password)) return Response.json({ error: "Password baru minimal 12 karakter, berisi huruf dan angka." }, { status: 400 });
        const credentials = await hashPassword(body.password);
        writes.push(
          env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_changed_at = ? WHERE id = ?")
            .bind(credentials.hash, credentials.salt, now, owner.id)
        );
      }
      if (emailChanged) {
        writes.push(
          env.DB.prepare("DELETE FROM oauth_accounts WHERE provider = 'google' AND user_id = ?").bind(owner.id),
          env.DB.prepare(
            "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'CLIENT_GOOGLE_LINK_REVOKED', ?, ?)"
          ).bind(crypto.randomUUID(), tenantId, auth.user.id, "Tautan Google lama dilepas karena email pemilik diubah oleh Super-Admin.", now)
        );
      }
      if (emailChanged || body.password) {
        writes.push(env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(owner.id));
      }
      await env.DB.batch(writes);
      return Response.json({ ok: true });
    }

    if (action === "suspend") {
      await env.DB.batch([
        env.DB.prepare("UPDATE tenants SET status = 'suspend', updated_at = ? WHERE id = ?").bind(now, tenantId),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'CLIENT_SUSPENDED', ?, ?)"
        ).bind(crypto.randomUUID(), tenantId, auth.user.id, "Akses client disuspend oleh Super-Admin.", now),
      ]);
      return Response.json({ ok: true, status: "suspend" });
    }
    if (action === "demo") {
      const expires = now + 14 * 24 * 60 * 60 * 1000;
      await env.DB.prepare(
        "UPDATE tenants SET status = 'demo', plan_code = 'demo', demo_expires_at = ?, active_until = NULL, updated_at = ? WHERE id = ?"
      ).bind(expires, now, tenantId).run();
      return Response.json({ ok: true, status: "demo", demoExpiresAt: expires });
    }
    if (action === "activate" && body.planCode && isPlanCode(body.planCode)) {
      const plan = subscriptionPlans[body.planCode];
      const startsAt = tenant.activeUntil && tenant.activeUntil > now ? tenant.activeUntil : now;
      const endsAt = startsAt + plan.days * 24 * 60 * 60 * 1000;
      const pending = await env.DB.prepare(
        "SELECT id FROM payments WHERE tenant_id = ? AND plan_code = ? AND amount = ? AND status = 'pending' ORDER BY submitted_at DESC LIMIT 1"
      ).bind(tenantId, body.planCode, plan.amount).first<{ id: string }>();
      const writes: PreparedStatement[] = [
        env.DB.prepare(
          "UPDATE tenants SET status = 'active', plan_code = ?, active_until = ?, updated_at = ? WHERE id = ?"
        ).bind(body.planCode, endsAt, now, tenantId),
        env.DB.prepare(
          "INSERT INTO subscriptions (id, tenant_id, plan_code, amount, payment_reference, status, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?)"
        ).bind(crypto.randomUUID(), tenantId, body.planCode, plan.amount, pending?.id || "admin-manual", startsAt, endsAt, now),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'SUBSCRIPTION_ACTIVATED', ?, ?)"
        ).bind(crypto.randomUUID(), tenantId, auth.user.id, `${plan.label} aktif sampai ${new Date(endsAt).toISOString()}.`, now),
      ];
      if (pending) {
        writes.push(env.DB.prepare(
          "UPDATE payments SET status = 'verified', verified_at = ?, verified_by = ? WHERE id = ?"
        ).bind(now, auth.user.id, pending.id));
      } else {
        writes.push(env.DB.prepare(
          "INSERT INTO payments (id, tenant_id, plan_code, amount, method, reference, status, submitted_at, verified_at, verified_by) VALUES (?, ?, ?, ?, 'manual', 'admin-manual', 'verified', ?, ?, ?)"
        ).bind(crypto.randomUUID(), tenantId, body.planCode, plan.amount, now, now, auth.user.id));
      }
      await env.DB.batch(writes);
      return Response.json({ ok: true, status: "active", activeUntil: endsAt, planCode: body.planCode });
    }
    return Response.json({ error: "Tindakan tidak valid." }, { status: 400 });
  } catch (error) {
    console.error("ADMIN_CLIENT_UPDATE_FAILED", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Perubahan client belum dapat disimpan." }, { status: 500 });
  }
}

export const GET = safeRoute(GETHandler);
export const POST = safeRoute(POSTHandler);
export const PATCH = safeRoute(PATCHHandler);

