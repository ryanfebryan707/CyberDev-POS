import { safeRoute } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import { authError, forbidden, getCurrentUser, hasTenantAccess } from "@/lib/auth";

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  if (!user.tenantId) return forbidden();
  const result = await env.DB.prepare(
    "SELECT id, name, category, barcode, price, cost, stock, unit, low_stock AS lowStock FROM products WHERE tenant_id = ? ORDER BY name ASC"
  ).bind(user.tenantId).all();
  return Response.json({ products: result.results, hasAccess: hasTenantAccess(user), tenantStatus: user.tenantStatus });
}

async function POSTHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  if (!["owner","supervisor"].includes(user.role)) return forbidden();
  if (!user.tenantId) return forbidden();
  if (!hasTenantAccess(user)) return forbidden(user.tenantStatus === "active"
    ? "Paket sudah aktif. Selesaikan otorisasi lokasi/perangkat toko sebelum menambah produk."
    : "Masa akses toko telah berakhir. Silakan perpanjang langganan.");
  const body = (await request.json()) as { name?: string; category?: string; barcode?: string; price?: number; cost?: number; stock?: number; unit?: string };
  const name = body.name?.trim().slice(0, 100) || "";
  const category = body.category?.trim().slice(0, 50) || "Lainnya";
  const barcode = (body.barcode || "").replace(/\s/g, "").slice(0, 80);
  const price = Number(body.price);
  const cost = Number(body.cost || 0);
  const stock = Number(body.stock || 0);
  const unit = (body.unit || "pcs").trim().slice(0, 20) || "pcs";
  if (!name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(stock) || stock < 0) {
    return Response.json({ error: "Data produk tidak valid." }, { status: 400 });
  }
  if (user.tenantStatus === "demo") {
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM products WHERE tenant_id = ?")
      .bind(user.tenantId).first<{ total: number }>();
    if (Number(count?.total || 0) >= 20) {
      return forbidden("Demo dibatasi 20 produk. Aktifkan paket Mingguan, Bulanan, atau Tahunan untuk produk tanpa batas.");
    }
  }
  if (barcode) {
    const duplicate = await env.DB.prepare("SELECT id FROM products WHERE tenant_id = ? AND barcode = ? LIMIT 1")
      .bind(user.tenantId, barcode).first();
    if (duplicate) return Response.json({ error: "Barcode sudah digunakan oleh produk lain di toko ini." }, { status: 409 });
  }
  const result = await env.DB.prepare(
    "INSERT INTO products (tenant_id, name, category, barcode, price, cost, stock, unit, low_stock, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, ?) RETURNING id"
  ).bind(user.tenantId, name, category, barcode || null, Math.round(price), Math.round(cost), stock, unit, Date.now()).first();
  return Response.json({ ok: true, id: result?.id }, { status: 201 });
}

async function PATCHHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  if (!["owner","supervisor"].includes(user.role)) return forbidden();
  if (!user.tenantId || !hasTenantAccess(user)) return forbidden("Aktifkan paket dan otorisasi lokasi toko untuk mengedit produk.");
  const body = (await request.json()) as { id?: number; name?: string; category?: string; barcode?: string; price?: number; cost?: number; stock?: number; unit?: string };
  const id = Math.round(Number(body.id));
  const name = body.name?.trim().slice(0, 100) || "";
  const category = body.category?.trim().slice(0, 50) || "Lainnya";
  const barcode = (body.barcode || "").replace(/\s/g, "").slice(0, 80);
  const price = Number(body.price);
  const cost = Number(body.cost || 0);
  const stock = Number(body.stock || 0);
  const unit = (body.unit || "pcs").trim().slice(0, 20) || "pcs";
  if (!Number.isInteger(id) || id <= 0 || !name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(stock) || stock < 0) {
    return Response.json({ error: "Data produk tidak valid." }, { status: 400 });
  }
  const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? AND tenant_id = ?").bind(id, user.tenantId).first();
  if (!product) return Response.json({ error: "Produk tidak ditemukan." }, { status: 404 });
  if (barcode) {
    const duplicate = await env.DB.prepare("SELECT id FROM products WHERE tenant_id = ? AND barcode = ? AND id != ? LIMIT 1")
      .bind(user.tenantId, barcode, id).first();
    if (duplicate) return Response.json({ error: "Barcode sudah digunakan produk lain." }, { status: 409 });
  }
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE products SET name = ?, category = ?, barcode = ?, price = ?, cost = ?, stock = ?, unit = ? WHERE id = ? AND tenant_id = ?"
    ).bind(name, category, barcode || null, Math.round(price), Math.round(cost), stock, unit, id, user.tenantId),
    env.DB.prepare(
      "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'PRODUCT_UPDATED', ?, ?)"
    ).bind(crypto.randomUUID(), user.tenantId, user.id, `${name} • modal ${Math.round(cost)} • jual ${Math.round(price)}`, Date.now()),
  ]);
  return Response.json({ ok: true });
}

export const GET = safeRoute(GETHandler);
export const POST = safeRoute(POSTHandler);
export const PATCH = safeRoute(PATCHHandler);
