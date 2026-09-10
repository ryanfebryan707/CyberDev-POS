import { z } from "zod";
import { env } from "@/lib/runtime-env";
import { requireTenant } from "@/lib/access";
import { getBootstrapAdmin, hashPassword } from "@/lib/auth";
import { safeRoute, jsonBody, HttpError, emailSchema, passwordSchema } from "@/lib/http";
const staff = z.object({name:z.string().trim().min(1).max(80),email:emailSchema,role:z.enum(["cashier","supervisor"]),password:passwordSchema});
export const GET = safeRoute(async request => {
  const user=await requireTenant(request,["owner"]);
  const result=await env.DB.prepare("SELECT id,name,email,role,is_active AS isActive,last_login_at AS lastLoginAt FROM users WHERE tenant_id=? AND role IN ('cashier','supervisor') ORDER BY name").bind(user.tenantId).all();
  return Response.json({staff:result.results});
});
export const POST = safeRoute(async request => {
  const user=await requireTenant(request,["owner"]),body=await jsonBody(request,staff);
  if(body.email===getBootstrapAdmin().email)throw new HttpError(403,"Email ini khusus admin.");
  const id=crypto.randomUUID(),password=await hashPassword(body.password),now=Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,password_salt,role,is_active,password_changed_at,created_at) VALUES (?,?,?,?,?,?,?,1,?,?)").bind(id,user.tenantId,body.name,body.email,password.hash,password.salt,body.role,now,now),
    env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,details,created_at) VALUES (?,?,?,'STAFF_CREATED',?,?)").bind(crypto.randomUUID(),user.tenantId,user.id,`${id} ${body.role}`,now),
  ]);
  return Response.json({id},{status:201});
});
export const PATCH = safeRoute(async request => {
  const user=await requireTenant(request,["owner"]);
  const body=await jsonBody(request,z.object({id:z.string().uuid(),isActive:z.boolean(),role:z.enum(["cashier","supervisor"])}));
  await env.DB.transaction(async()=>{
    const row=await env.DB.prepare("UPDATE users SET is_active=?,role=? WHERE id=? AND tenant_id=? AND role IN ('cashier','supervisor') RETURNING id").bind(body.isActive?1:0,body.role,body.id,user.tenantId).first();
    if(!row)throw new HttpError(404,"Karyawan tidak ditemukan.");
    await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(body.id).run();
    await env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,details,created_at) VALUES (?,?,?,'STAFF_ACCESS_UPDATED',?,?)").bind(crypto.randomUUID(),user.tenantId,user.id,`${body.id} ${body.role} ${body.isActive}`,Date.now()).run();
  });
  return Response.json({ok:true});
});
