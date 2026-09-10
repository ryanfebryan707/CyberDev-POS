import { z } from "zod";
import { databaseRuntimeAvailable, env } from "@/lib/runtime-env";
import { getCurrentUser, sha256 } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { completeGoogleIdentityLogin, googleClientId, googleCookie, googleIdentityConfigured, randomToken } from "@/lib/google-auth";
import { HttpError, jsonBody, safeRoute } from "@/lib/http";

const credentialSchema = z.object({ credential: z.string().min(100).max(12000) }).strict();

export const GET = safeRoute(async request => {
  await rateLimit(request,"google-identity-config",30,900000);
  if (!googleIdentityConfigured()) throw new HttpError(503,"Login Google belum diaktifkan.");
  if (!databaseRuntimeAvailable()) throw new HttpError(503,"Database production belum terhubung di Vercel.");
  const user = await getCurrentUser(request);
  if (user?.role === "superadmin") throw new HttpError(403,"Login Google hanya tersedia untuk Client.");
  const state = randomToken(), browserToken = randomToken(), nonce = randomToken(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT INTO oauth_states(state_hash,nonce,verifier,browser_hash,user_id,intent,expires_at) VALUES (?,?,?,?,?,'client',?)")
      .bind(await sha256(state),nonce,"google-identity-services",await sha256(browserToken),user?.id||null,now+600000),
  ]);
  return Response.json({clientId:googleClientId(),nonce},{headers:{"set-cookie":googleCookie(browserToken)}});
});

export const POST = safeRoute(async request => {
  await rateLimit(request,"google-identity-login",30,900000);
  if (!googleIdentityConfigured()) throw new HttpError(503,"Login Google belum diaktifkan.");
  if (!databaseRuntimeAvailable()) throw new HttpError(503,"Database production belum terhubung di Vercel.");
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403,"Asal permintaan tidak diizinkan.");
  }
  const {credential} = await jsonBody(request,credentialSchema);
  const session = await completeGoogleIdentityLogin(request,credential);
  const headers = new Headers();
  headers.append("set-cookie",googleCookie("",0));
  headers.append("set-cookie",session.cookie);
  return Response.json({ok:true},{headers});
});
