import { z } from "zod";
import { env } from "@/lib/runtime-env";
import { getCurrentUser } from "@/lib/auth";
import { safeRoute, HttpError, jsonBody } from "@/lib/http";
import { isBusinessType } from "@/lib/business-types";
export const GET=safeRoute(async request=>{
  const user=await getCurrentUser(request);
  if(!user)throw new HttpError(401,"Silakan masuk.");
  const linked=await env.DB.prepare("SELECT provider FROM oauth_accounts WHERE user_id=? AND provider='google'").bind(user.id).first();
  return Response.json({user,googleLinked:Boolean(linked)});
});
export const PATCH=safeRoute(async request=>{
  const user=await getCurrentUser(request);
  if(!user)throw new HttpError(401,"Silakan masuk.");
  if(user.role!=="owner"||!user.tenantId)throw new HttpError(403,"Hanya pemilik toko dapat mengubah profil.");
  const body=await jsonBody(request,z.object({storeName:z.string().trim().min(1).max(100),businessType:z.string().refine(isBusinessType),address:z.string().trim().max(240),city:z.string().trim().max(80)}));
  await env.DB.batch([
    env.DB.prepare("UPDATE tenants SET name=?,business_type=?,address=?,city=?,updated_at=? WHERE id=?").bind(body.storeName,body.businessType,body.address,body.city,Date.now(),user.tenantId),
    env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,created_at) VALUES (?,?,?,'STORE_PROFILE_UPDATED',?)").bind(crypto.randomUUID(),user.tenantId,user.id,Date.now()),
  ]);
  return Response.json({ok:true});
});
