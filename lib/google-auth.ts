import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/runtime-env";
import { createSession, getBootstrapAdmin, hashPassword, normalizeEmail, readCookie, sha256 } from "@/lib/auth";
import { HttpError } from "@/lib/http";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
export const googleCookieName = "cyberdev_google_state";
export const randomToken = () => randomBytes(32).toString("base64url");

export function googleClientId() {
  return (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID || "").trim();
}

function googleClientSecret() {
  return (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || "").trim();
}

function toOrigin(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate || candidate.includes("your-project.vercel.app")) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    if (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.hostname === "localhost")) return url.origin;
  } catch { /* Try the next configured origin. */ }
  return "";
}

export function googleAppOrigin() {
  return toOrigin(process.env.APP_URL)
    || toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    || toOrigin(process.env.VERCEL_URL)
    || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
}

export function googleConfigured() {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  return /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(clientId)
    && clientSecret.length >= 16
    && clientSecret !== clientId
    && !clientSecret.includes(".apps.googleusercontent.com")
    && Boolean(googleAppOrigin());
}
export function googleRedirectUri() { return `${googleAppOrigin()}/api/auth/google/callback`; }
export function googleCookie(value: string, maxAge = 600) {
  return `${googleCookieName}=${value}; Path=/; HttpOnly; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}SameSite=Lax; Max-Age=${maxAge}`;
}
export async function verifyGoogleToken(token: string, nonce: string, key: JWTVerifyGetKey | CryptoKey = googleKeys) {
  const options = { audience: googleClientId(), issuer: ["https://accounts.google.com", "accounts.google.com"], algorithms: ["RS256"] };
  const { payload } = typeof key === "function" ? await jwtVerify(token, key, options) : await jwtVerify(token, key, options);
  if (!payload.sub || payload.nonce !== nonce || payload.email_verified !== true || typeof payload.email !== "string") throw new HttpError(400, "Identitas Google tidak valid.");
  return {subject: payload.sub, email: normalizeEmail(payload.email), name: typeof payload.name === "string" ? payload.name.slice(0, 80) : "Pemilik toko"};
}

export async function completeGoogleLogin(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const browserToken = readCookie(request, googleCookieName);
  if (!state || !browserToken) throw new HttpError(400, "Sesi login Google telah berakhir.");
  const saved = await env.DB.prepare("DELETE FROM oauth_states WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? RETURNING nonce, verifier, user_id AS userId, intent")
    .bind(await sha256(state), await sha256(browserToken), Date.now()).first<{nonce:string;verifier:string;userId:string|null;intent:"client"|"admin"}>();
  if (!saved || url.searchParams.has("error") || !url.searchParams.get("code")) throw new HttpError(400, "Login Google dibatalkan atau sesi kedaluwarsa.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({code:url.searchParams.get("code")!,client_id:googleClientId(),client_secret:googleClientSecret(),redirect_uri:googleRedirectUri(),grant_type:"authorization_code",code_verifier:saved.verifier}),
    signal:AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new HttpError(400, "Google belum dapat memverifikasi login.");
  const tokens = await response.json() as {id_token?:string};
  if (!tokens.id_token) throw new HttpError(400, "Token Google tidak tersedia.");
  const identity = await verifyGoogleToken(tokens.id_token, saved.nonce);
  const userId = await env.DB.transaction(async () => {
    if (saved.intent !== "client") throw new HttpError(403,"Login Google hanya tersedia untuk Client.");
    const linked = await env.DB.prepare("SELECT u.id, u.is_active AS isActive, u.role FROM oauth_accounts a JOIN users u ON u.id=a.user_id WHERE a.provider='google' AND a.subject=?").bind(identity.subject).first<{id:string;isActive:number;role:string}>();
    if (linked) {
      if (!linked.isActive || (saved.userId && saved.userId !== linked.id)) throw new HttpError(403,"Akun Google tidak dapat digunakan.");
      if (linked.role === "superadmin") throw new HttpError(403,"Super-Admin harus masuk menggunakan email/nomor dan password.");
      return linked.id;
    }
    if (saved.userId) {
      // Linking requires the SAME still-active login session and matching verified email.
      const { getCurrentUser } = await import("@/lib/auth");
      const current = await getCurrentUser(request);
      if (!current || current.id !== saved.userId || current.email !== identity.email) throw new HttpError(403,"Masuk kembali dan gunakan email Google yang sama.");
      if (current.role === "superadmin") throw new HttpError(403,"Google hanya dapat ditautkan ke akun Client.");
      await env.DB.prepare("INSERT INTO oauth_accounts(provider,subject,user_id,created_at) VALUES ('google',?,?,?)").bind(identity.subject,current.id,Date.now()).run();
      return current.id;
    }
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(identity.email).first();
    if (existing || identity.email === getBootstrapAdmin().email) throw new HttpError(409,"Masuk menggunakan password terlebih dahulu, lalu tautkan Google di Pengaturan.");
    const now = Date.now(), tenantId = crypto.randomUUID(), id = crypto.randomUUID();
    const credentials = await hashPassword(randomToken());
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants(id,name,owner_email,business_type,status,plan_code,demo_expires_at,created_at,updated_at) VALUES (?,?,?,'general','demo','demo',?,?,?)").bind(tenantId,`Toko ${identity.name}`,identity.email,now+14*86400000,now,now),
      env.DB.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,password_salt,role,is_active,created_at) VALUES (?,?,?,?,?,?,'owner',1,?)").bind(id,tenantId,identity.name,identity.email,credentials.hash,credentials.salt,now),
      env.DB.prepare("INSERT INTO oauth_accounts(provider,subject,user_id,created_at) VALUES ('google',?,?,?)").bind(identity.subject,id,now),
      env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,created_at) VALUES (?,?,?,'GOOGLE_ACCOUNT_CREATED',?)").bind(crypto.randomUUID(),tenantId,id,now),
    ]);
    return id;
  });
  await env.DB.prepare("UPDATE users SET last_login_at=? WHERE id=?").bind(Date.now(),userId).run();
  return createSession(userId);
}
