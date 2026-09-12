import { safeRoute } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import { authError, forbidden, getCurrentUser } from "@/lib/auth";

function clientIp(request: Request) {
  return (
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "tidak-tersedia"
  ).slice(0, 64);
}

async function POSTHandler(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return authError();
  if (user.role !== "owner") return forbidden();
    if (!user.tenantId) return forbidden("Akun ini tidak memiliki toko.");
    if (user.tenantStatus !== "active") {
      return forbidden("Otorisasi perangkat tersedia setelah paket diverifikasi Aktif.");
    }
    const body = (await request.json()) as {
      consent?: boolean;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      address?: string;
      city?: string;
    };
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = Number(body.accuracy);
    if (!body.consent) return Response.json({ error: "Persetujuan lokasi dan IP wajib diberikan." }, { status: 400 });
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return Response.json({ error: "Koordinat lokasi tidak valid." }, { status: 400 });
    }
    if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 1000) {
      return Response.json({ error: "Lokasi belum cukup presisi. Aktifkan GPS/lokasi presisi dan coba di area terbuka (akurasi maksimal 1 km)." }, { status: 400 });
    }
    const now = Date.now();
    const address = body.address?.trim().slice(0, 240) || user.address || null;
    const city = body.city?.trim().slice(0, 80) || user.city || null;
    const ip = clientIp(request);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE tenants SET address = ?, city = ?, latitude = ?, longitude = ?, location_accuracy = ?, last_location_at = ?, location_consent_at = ?, device_authorized_at = ?, last_ip = ?, updated_at = ? WHERE id = ?"
      ).bind(address, city, latitude, longitude, accuracy, now, now, now, ip, now, user.tenantId),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'DEVICE_LOCATION_AUTHORIZED', ?, ?)"
      ).bind(crypto.randomUUID(), user.tenantId, user.id, `Lokasi presisi disetujui. Akurasi ${Math.round(accuracy)} m. IP ${ip}.`, now),
    ]);
    return Response.json({ ok: true, authorizedAt: now, ip, accuracy });
  } catch (error) {
    console.error("DEVICE_AUTHORIZATION_FAILED", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Otorisasi perangkat belum dapat disimpan." }, { status: 500 });
  }
}


export const POST = safeRoute(POSTHandler);

