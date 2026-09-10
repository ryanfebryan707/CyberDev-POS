import { safeRoute } from "@/lib/http";
import { env, type PreparedStatement } from "@/lib/runtime-env";
import { authError, forbidden, getCurrentUser, hasTenantAccess } from "@/lib/auth";

type ImportItem = {
  name?: string;
  category?: string;
  barcode?: string;
  price?: number;
  cost?: number;
  stock?: number;
  unit?: string;
};

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function POSTHandler(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return authError();
    if (!["owner","supervisor"].includes(user.role)) return forbidden();
    if (!user.tenantId || !hasTenantAccess(user)) return forbidden("Masa akses toko telah berakhir.");
    if (user.tenantStatus !== "active") {
      return forbidden("Import Excel adalah fitur penuh. Aktifkan paket Mingguan, Bulanan, atau Tahunan terlebih dahulu.");
    }

    const body = (await request.json()) as { products?: ImportItem[] };
    if (!Array.isArray(body.products) || body.products.length === 0) {
      return Response.json({ error: "File Excel tidak memiliki baris produk yang dapat diimpor." }, { status: 400 });
    }
    if (body.products.length > 1000) {
      return Response.json({ error: "Maksimal 1.000 produk dalam satu kali impor." }, { status: 400 });
    }

    const existing = await env.DB.prepare(
      "SELECT id, barcode FROM products WHERE tenant_id = ? AND barcode IS NOT NULL AND barcode != ''"
    ).bind(user.tenantId).all<{ id: number; barcode: string }>();
    const existingByBarcode = new Map(existing.results.map((item) => [item.barcode, item.id]));
    const seen = new Set<string>();
    const writes: PreparedStatement[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const raw of body.products) {
      const name = String(raw.name || "").trim().slice(0, 100);
      const barcode = String(raw.barcode || "").replace(/\s/g, "").slice(0, 80);
      const price = Math.round(finiteNumber(raw.price, -1));
      const cost = Math.max(0, Math.round(finiteNumber(raw.cost)));
      const stock = Math.max(0, finiteNumber(raw.stock));
      const category = String(raw.category || "Lainnya").trim().slice(0, 50) || "Lainnya";
      const unit = String(raw.unit || "pcs").trim().slice(0, 20) || "pcs";
      if (!name || !barcode || price < 0 || seen.has(barcode)) {
        skipped += 1;
        continue;
      }
      seen.add(barcode);
      const productId = existingByBarcode.get(barcode);
      if (productId) {
        writes.push(env.DB.prepare(
          "UPDATE products SET name = ?, category = ?, price = ?, cost = ?, stock = ?, unit = ? WHERE id = ? AND tenant_id = ?"
        ).bind(name, category, price, cost, stock, unit, productId, user.tenantId));
        updated += 1;
      } else {
        writes.push(env.DB.prepare(
          "INSERT INTO products (tenant_id, name, category, barcode, price, cost, stock, unit, low_stock, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, ?)"
        ).bind(user.tenantId, name, category, barcode, price, cost, stock, unit, Date.now()));
        created += 1;
      }
    }

    for (let index = 0; index < writes.length; index += 50) {
      await env.DB.batch(writes.slice(index, index + 50));
    }
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'PRODUCTS_EXCEL_IMPORTED', ?, ?)"
    ).bind(crypto.randomUUID(), user.tenantId, user.id, `${created} dibuat, ${updated} diperbarui, ${skipped} dilewati.`, now).run();

    return Response.json({ ok: true, created, updated, skipped, processed: created + updated }, { status: 201 });
  } catch {
    return Response.json({ error: false ? "" : "Import Excel gagal diproses." }, { status: 500 });
  }
}

export const POST = safeRoute(POSTHandler);
