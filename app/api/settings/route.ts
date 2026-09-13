import { z } from "zod";
import { env } from "@/lib/runtime-env";
import { getCurrentUser } from "@/lib/auth";
import { safeRoute, HttpError, jsonBody } from "@/lib/http";
import { isBusinessType } from "@/lib/business-types";
export const GET=safeRoute(async request=>{
  const user=await getCurrentUser(request);
  if(!user)throw new HttpError(401,"Silakan masuk.");
  const linked=await env.DB.prepare("SELECT provider FROM oauth_accounts WHERE user_id=? AND provider='google'").bind(user.id).first();
  const qris=user.tenantId
    ? await env.DB.prepare("SELECT qris_merchant_name AS merchantName,qris_payload AS payload FROM tenants WHERE id=?").bind(user.tenantId).first<{merchantName:string|null;payload:string|null}>()
    : null;
  return Response.json({user,googleLinked:Boolean(linked),qris:{merchantName:qris?.merchantName||"",payload:qris?.payload||"",configured:Boolean(qris?.payload)}});
});
export const PATCH=safeRoute(async request=>{
  const user=await getCurrentUser(request);
  if(!user)throw new HttpError(401,"Silakan masuk.");
  if(user.role!=="owner"||!user.tenantId)throw new HttpError(403,"Hanya pemilik toko dapat mengubah profil.");
  const body=await jsonBody(request,z.object({
    storeName:z.string().trim().min(1).max(100),
    businessType:z.string().refine(isBusinessType),
    address:z.string().trim().max(240),
    city:z.string().trim().max(80),
    qrisMerchantName:z.string().trim().max(100).default(""),
    qrisPayload:z.string().trim().max(2048).refine(value=>!value||value.startsWith("000201"),"Payload QRIS harus berasal dari QRIS resmi dan diawali 000201.").default(""),
  }));
  await env.DB.batch([
    env.DB.prepare("UPDATE tenants SET name=?,business_type=?,address=?,city=?,qris_merchant_name=?,qris_payload=?,updated_at=? WHERE id=?").bind(body.storeName,body.businessType,body.address,body.city,body.qrisMerchantName||null,body.qrisPayload||null,Date.now(),user.tenantId),
    env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,details,created_at) VALUES (?,?,?,'STORE_PROFILE_UPDATED',?,?)").bind(crypto.randomUUID(),user.tenantId,user.id,body.qrisPayload?"Profil toko dan QRIS merchant diperbarui.":"Profil toko diperbarui; QRIS merchant tidak aktif.",Date.now()),
  ]);
  return Response.json({ok:true});
});
