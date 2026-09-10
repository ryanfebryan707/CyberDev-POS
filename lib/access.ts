import { getCurrentUser, hasTenantAccess } from "@/lib/auth";
import { HttpError } from "@/lib/http";
export async function requireTenant(request: Request, roles = ["owner","supervisor","cashier"]) {
  const user = await getCurrentUser(request);
  if (!user) throw new HttpError(401,"Silakan masuk terlebih dahulu.");
  if (!user.tenantId || !hasTenantAccess(user) || !roles.includes(user.role)) throw new HttpError(403,"Akses fitur tidak diizinkan untuk akun ini.");
  return {...user,tenantId:user.tenantId};
}
