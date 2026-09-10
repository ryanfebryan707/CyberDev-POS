import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
    if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({error: "Asal permintaan tidak diizinkan."}, {status: 403});
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return NextResponse.json({error: "Gunakan format JSON."}, {status: 415});
    }
    if (Number(request.headers.get("content-length") || 0) > 1048576) return NextResponse.json({error: "Permintaan terlalu besar."}, {status: 413});
    try {
      const text = await request.clone().text();
      if (new TextEncoder().encode(text).length > 1048576) return NextResponse.json({error: "Permintaan terlalu besar."}, {status: 413});
      // Logout accepts an empty JSON body.
      if (text) {
        const body = JSON.parse(text);
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
        const strings = ["name","storeName","ownerName","email","identifier","phone","password","currentPassword","newPassword","address","city","businessType","tenantId","action","planCode","confirmation","category","barcode","unit","reference","method","title","message","audience","severity","announcementId","offlineId","paymentMethod","customerName","role"];
        for (const field of strings) if (field in body && typeof body[field] !== "string") throw new Error("Invalid field");
        for (const field of ["price","cost","stock","subtotal","tax","discount","total","amountReceived","dataRevision","expiresInDays"]) if (field in body && (typeof body[field] !== "number" || !Number.isFinite(body[field]) || Math.abs(body[field]) > 1000000000000)) throw new Error("Invalid number");
      }
    } catch { return NextResponse.json({error: "JSON tidak valid."}, {status: 400}); }
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
export const config = { matcher: ["/api/:path*"] };
