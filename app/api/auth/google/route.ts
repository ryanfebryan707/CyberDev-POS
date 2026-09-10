import { rateLimit } from "@/lib/rate-limit";
import { createHash } from "node:crypto";
import { env } from "@/lib/runtime-env";
import { getCurrentUser, sha256 } from "@/lib/auth";
import { googleClientId, googleConfigured, googleCookie, googleRedirectUri, randomToken } from "@/lib/google-auth";
import { safeRoute } from "@/lib/http";

export const GET = safeRoute(async (request) => {
  await rateLimit(request,"google",30,900000);
  if (!googleConfigured()) return Response.json({error:"Login Google belum diaktifkan oleh pengelola."},{status:503});
  const state = randomToken(), browserToken = randomToken(), nonce = randomToken(), verifier = randomToken();
  const user = await getCurrentUser(request);
  if (user?.role === "superadmin") return Response.json({error:"Login Google hanya tersedia untuk Client."},{status:403});
  const intent = "client";
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT INTO oauth_states(state_hash,nonce,verifier,browser_hash,user_id,intent,expires_at) VALUES (?,?,?,?,?,?,?)").bind(await sha256(state),nonce,verifier,await sha256(browserToken),user?.id||null,intent,now+600000),
  ]);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({client_id:googleClientId(),redirect_uri:googleRedirectUri(),response_type:"code",scope:"openid email profile",state,nonce,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",prompt:"select_account"}).toString();
  return new Response(null,{status:302,headers:{location:url.toString(),"set-cookie":googleCookie(browserToken)}});
});
