import { rateLimit } from "@/lib/rate-limit";
import { safeRoute } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import { createSession, getBootstrapAdmin, hashPassword, normalizeEmail, normalizePhone, phoneLoginVariants, validatePassword } from "@/lib/auth";
import { isBusinessType } from "@/lib/business-types";

async function POSTHandler(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      storeName?: string;
      email?: string;
      phone?: string;
      password?: string;
      address?: string;
      city?: string;
      latitude?: number | null;
      longitude?: number | null;
      businessType?: string;
    };
    const name = body.name?.trim().slice(0, 80) || "";
    const storeName = body.storeName?.trim().slice(0, 100) || "";
    const email = normalizeEmail(body.email || "");
    const phone = normalizePhone(body.phone || "").slice(0, 20);
    const password = body.password || "";
    const address = body.address?.trim().slice(0, 240) || "";
    const city = body.city?.trim().slice(0, 80) || "";
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const businessType = isBusinessType(body.businessType) ? body.businessType : "general";
    const hasCoordinates = typeof body.latitude === "number" && typeof body.longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    if (!name || !storeName || !email.includes("@") || phone.length < 9 || !validatePassword(password)) {
      return Response.json({ error: "Lengkapi data dan nomor WhatsApp. Password minimal 12 karakter, berisi huruf serta angka." }, { status: 400 });
    }
    const bootstrap = getBootstrapAdmin();
    if (email === bootstrap.email || bootstrap.phoneAliases.includes(phone)) {
      return Response.json({ error: "Email/nomor WhatsApp ini khusus Super-Admin dan tidak dapat didaftarkan sebagai client." }, { status: 403 });
    }
    const variants = phoneLoginVariants(phone);
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ? OR phone IN (?, ?, ?) LIMIT 1")
      .bind(email, variants[0] || "", variants[1] || "", variants[2] || "").first();
    if (exists) return Response.json({ error: "Email atau nomor WhatsApp sudah terdaftar. Silakan masuk." }, { status: 409 });
    const capacity = await env.DB.prepare("SELECT COUNT(*) AS total FROM tenants").first<{ total: number }>();
    if (Number(capacity?.total || 0) >= 2000) {
      return Response.json({ error: "Kapasitas 2.000 client telah tercapai. Hubungi Customer Service." }, { status: 503 });
    }

    const now = Date.now();
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const demoExpiresAt = now + 14 * 24 * 60 * 60 * 1000;
    const storeSlug = `${storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 28) || "toko"}-${tenantId.slice(0, 6)}`;
    const credentials = await hashPassword(password);
    const writes = [
      env.DB.prepare(
        "INSERT INTO tenants (id, name, business_type, store_slug, owner_email, phone, address, city, latitude, longitude, last_location_at, status, plan_code, demo_expires_at, active_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', 'demo', ?, NULL, ?, ?)"
      ).bind(tenantId, storeName, businessType, storeSlug, email, phone, address || null, city || null, hasCoordinates ? latitude : null, hasCoordinates ? longitude : null, hasCoordinates ? now : null, demoExpiresAt, now, now),
      env.DB.prepare(
        "INSERT INTO users (id, tenant_id, name, email, phone, password_hash, password_salt, role, is_active, password_changed_at, last_login_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', 1, ?, ?, ?)"
      ).bind(userId, tenantId, name, email, phone, credentials.hash, credentials.salt, now, now, now),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'CLIENT_REGISTERED', ?, ?)"
      ).bind(crypto.randomUUID(), tenantId, userId, `Akun demo 14 hari dibuat otomatis untuk jenis usaha ${businessType}.`, now),
    ];
    await env.DB.batch(writes);
    const session = await createSession(userId);
    return new Response(JSON.stringify({ ok: true, role: "owner", demoExpiresAt }), {
      status: 201,
      headers: { "content-type": "application/json", "set-cookie": session.cookie },
    });
  } catch (error) {
    console.error("AUTH_REGISTER_FAILED", error instanceof Error ? error.name : "UnknownError");
    return Response.json(
      { error: "Pendaftaran belum dapat diproses. Silakan coba kembali.", code: "AUTH_REGISTER_FAILED" },
      { status: 500 }
    );
  }
}

export const POST = safeRoute(async request=>{await rateLimit(request,"register",10,3600000);return POSTHandler(request);});
