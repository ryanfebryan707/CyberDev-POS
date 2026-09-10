import { safeRoute } from "@/lib/http";
import { getCurrentUser, hasTenantAccess } from "@/lib/auth";

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ user: null }, { status: 200 });
  return Response.json({ user, hasAccess: hasTenantAccess(user) });
}

export const GET = safeRoute(GETHandler);
