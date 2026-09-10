import { env } from "@/lib/runtime-env";
import { sha256 } from "@/lib/auth";
import { HttpError } from "@/lib/http";
export async function rateLimit(request: Request, scope:string, limit:number, windowMs:number) {
  const ip=(request.headers.get("x-vercel-forwarded-for")||request.headers.get("x-forwarded-for")||"local").split(",")[0].trim().slice(0,80);
  const now=Date.now(),bucket=Math.floor(now/windowMs),key=await sha256(`${scope}|${ip}|${bucket}`);
  const row=await env.DB.prepare("INSERT INTO auth_login_attempts(key_hash,attempts,window_started_at,updated_at) VALUES (?,1,?,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=auth_login_attempts.attempts+1,updated_at=excluded.updated_at RETURNING attempts").bind(key,now,now).first<{attempts:number}>();
  if(Number(row?.attempts)>limit)throw new HttpError(429,"Terlalu banyak permintaan. Coba lagi nanti.");
}
