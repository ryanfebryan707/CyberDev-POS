import { z } from "zod";
import { env } from "@/lib/runtime-env";
import { requireTenant } from "@/lib/access";
import { safeRoute, jsonBody, HttpError } from "@/lib/http";
const customer = z.object({name:z.string().trim().min(1).max(100),phone:z.string().trim().max(20).default(""),email:z.union([z.string().trim().email().max(254),z.literal("")]).default("")});
export const GET = safeRoute(async request => {
  const user = await requireTenant(request);
  const result = await env.DB.prepare("SELECT id,name,phone,email,created_at AS createdAt FROM customers WHERE tenant_id=? ORDER BY name LIMIT 2000").bind(user.tenantId).all();
  return Response.json({customers:result.results});
});
export const POST = safeRoute(async request => {
  const user = await requireTenant(request,["owner","supervisor"]);
  const body = await jsonBody(request,customer), id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO customers(id,tenant_id,name,phone,email,created_at) VALUES (?,?,?,?,?,?)").bind(id,user.tenantId,body.name,body.phone,body.email,Date.now()).run();
  return Response.json({id},{status:201});
});
export const PATCH = safeRoute(async request => {
  const user = await requireTenant(request,["owner","supervisor"]);
  const body = await jsonBody(request,customer.extend({id:z.string().uuid()}));
  const result=await env.DB.prepare("UPDATE customers SET name=?,phone=?,email=? WHERE id=? AND tenant_id=? RETURNING id").bind(body.name,body.phone,body.email,body.id,user.tenantId).first();
  if(!result)throw new HttpError(404,"Pelanggan tidak ditemukan.");
  return Response.json({ok:true});
});
