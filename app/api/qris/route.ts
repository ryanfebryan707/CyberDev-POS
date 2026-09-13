import QRCode from "qrcode";
import { authError, forbidden, getCurrentUser, hasTenantAccess } from "@/lib/auth";
import { env } from "@/lib/runtime-env";
import { safeRoute } from "@/lib/http";

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  if (!user.tenantId || !hasTenantAccess(user)) return forbidden("Akses QRIS toko tidak aktif.");
  const qris = await env.DB.prepare(
    "SELECT qris_payload AS payload FROM tenants WHERE id = ?"
  ).bind(user.tenantId).first<{ payload: string | null }>();
  const payload = qris?.payload?.trim() || "";
  if (!payload || payload.length > 2048 || !payload.startsWith("000201")) {
    return Response.json({ error: "QRIS toko belum dihubungkan oleh pemilik." }, { status: 404 });
  }
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 360,
    color: { dark: "#141221", light: "#ffffff" },
  });
  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}

export const GET = safeRoute(GETHandler);
