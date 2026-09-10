import { safeRoute } from "@/lib/http";
import { clearSessionCookie, destroySession } from "@/lib/auth";

async function POSTHandler(request: Request) {
  await destroySession(request);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": clearSessionCookie() },
  });
}

export const POST = safeRoute(POSTHandler);
