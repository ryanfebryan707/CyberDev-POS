import { safeRoute } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import { authError, forbidden, getCurrentUser } from "@/lib/auth";

async function requireAdmin(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return { response: authError(), user: null };
  if (user.role !== "superadmin") return { response: forbidden(), user: null };
  return { response: null, user };
}

async function GETHandler(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const tenantId = new URL(request.url).searchParams.get("tenantId")?.trim() || "";
  if (!tenantId) return Response.json({ error: "Client wajib dipilih." }, { status: 400 });
  const tenant = await env.DB.prepare("SELECT id, name FROM tenants WHERE id = ?").bind(tenantId).first();
  if (!tenant) return Response.json({ error: "Client tidak ditemukan." }, { status: 404 });
  const products = await env.DB.prepare(
    "SELECT id, name, category, barcode, price, cost, stock, unit, low_stock AS lowStock FROM products WHERE tenant_id = ? ORDER BY name ASC LIMIT 2000"
  ).bind(tenantId).all();
  return Response.json({ tenant, products: products.results });
}

async function POSTHandler(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  if (!auth.user) return authError();
  const body = (await request.json()) as {
    tenantId?: string;
    name?: string;
    category?: string;
    barcode?: string;
    price?: number;
    cost?: number;
    stock?: number;
    unit?: string;
  };
  const tenantId = body.tenantId?.trim() || "";
  const name = body.name?.trim().slice(0, 100) || "";
  const category = body.category?.trim().slice(0, 50) || "Lainnya";
  const barcode = (body.barcode || "").replace(/\s/g, "").slice(0, 80);
  const price = Number(body.price);
  const cost = Number(body.cost || 0);
  const stock = Number(body.stock || 0);
  const unit = body.unit?.trim().slice(0, 20) || "pcs";
  if (!tenantId || !name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(stock) || stock < 0) {
    return Response.json({ error: "Nama client, produk, harga jual, modal, dan stok harus valid." }, { status: 400 });
  }
  const tenant = await env.DB.prepare("SELECT id, name FROM tenants WHERE id = ?").bind(tenantId).first<{ id: string; name: string }>();
  if (!tenant) return Response.json({ error: "Client tidak ditemukan." }, { status: 404 });
  if (barcode) {
    const duplicate = await env.DB.prepare("SELECT id FROM products WHERE tenant_id = ? AND barcode = ? LIMIT 1")
      .bind(tenantId, barcode).first();
    if (duplicate) return Response.json({ error: "Barcode sudah digunakan produk lain pada toko ini." }, { status: 409 });
  }
  const now = Date.now();
  const product = await env.DB.prepare(
    "INSERT INTO products (tenant_id, name, category, barcode, price, cost, stock, unit, low_stock, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, ?) RETURNING id"
  ).bind(tenantId, name, category, barcode || null, Math.round(price), Math.round(cost), stock, unit, now).first<{ id: number }>();
  await env.DB.prepare(
    "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'PRODUCT_CREATED_BY_ADMIN', ?, ?)"
  ).bind(crypto.randomUUID(), tenantId, auth.user.id, `${name} ditambahkan ke ${tenant.name}. Modal ${Math.round(cost)} • jual ${Math.round(price)} • stok ${stock}.`, now).run();
  return Response.json({ ok: true, id: product?.id }, { status: 201 });
}

export const GET = safeRoute(GETHandler);
export const POST = safeRoute(POSTHandler);
