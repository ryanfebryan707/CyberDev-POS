import { env } from "@/lib/runtime-env";
import { ADMIN_LOGIN_EMAIL, ADMIN_LOGIN_PHONES } from "@/lib/admin-identity";

const SESSION_COOKIE = "cyberdev_session";
const SESSION_DAYS = 7;
// PBKDF2-SHA256, independent salt per password.
export const PASSWORD_HASH_ITERATIONS = 600000;
const encoder = new TextEncoder();

type RuntimeEnv = typeof env & {
  ADMIN_EMAIL?: string;
  ADMIN_BOOTSTRAP_PASSWORD?: string;
  ADMIN_PHONE_ALIASES?: string;
};

export type AuthUser = {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: "superadmin" | "owner" | "supervisor" | "cashier";
  storeName: string | null;
  businessType: string | null;
  dataRevision: number | null;
  tenantStatus: "demo" | "active" | "suspend" | null;
  planCode: string | null;
  demoExpiresAt: number | null;
  activeUntil: number | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  locationConsentAt: number | null;
  deviceAuthorizedAt: number | null;
  lastIp: string | null;
  qrisConfigured: number | null;
  qrisMerchantName: string | null;
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function randomHex(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashPassword(password: string, saltHex = randomHex(16)) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: PASSWORD_HASH_ITERATIONS },
    key,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: saltHex };
}

export async function verifyPassword(password: string, expectedHash: string, salt: string) {
  const candidate = await hashPassword(password, salt);
  const a = hexToBytes(candidate.hash);
  const b = hexToBytes(expectedHash);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  if (digits.startsWith("8")) return `0${digits}`;
  return digits;
}

export function phoneLoginVariants(value: string) {
  const normalized = normalizePhone(value);
  if (!normalized) return [];
  const local = normalized.startsWith("0") ? normalized : `0${normalized}`;
  const international = local.startsWith("0") ? `62${local.slice(1)}` : local;
  return Array.from(new Set([local, international, `+${international}`]));
}

export function validatePassword(value: string) {
  return typeof value === "string" && value.length >= 12 && value.length <= 128 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

export function validateLoginPassword(value: string) {
  // Strength rules apply when a password is created or changed. Login must
  // continue accepting an existing legacy password so it can be upgraded.
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

export function getBootstrapAdmin() {
  const runtime = env as RuntimeEnv;
  const productionIdentityLocked = process.env.NODE_ENV === "production";
  const configuredPhones = (runtime.ADMIN_PHONE_ALIASES || "")
    .split(",")
    .map(normalizePhone)
    .filter(Boolean);
  return {
    email: productionIdentityLocked ? ADMIN_LOGIN_EMAIL : normalizeEmail(runtime.ADMIN_EMAIL || ADMIN_LOGIN_EMAIL),
    password: runtime.ADMIN_BOOTSTRAP_PASSWORD || "",
    phoneAliases: productionIdentityLocked
      ? ADMIN_LOGIN_PHONES.map(normalizePhone)
      : configuredPhones.length ? Array.from(new Set(configuredPhones)) : ADMIN_LOGIN_PHONES.map(normalizePhone),
  };
}

export async function createSession(userId: string) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await env.DB.prepare(
    "INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(tokenHash, userId, expiresAt, now).run();
  return {
    cookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
    expiresAt,
  };
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}SameSite=Lax; Max-Age=0`;
}

export function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function destroySession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT u.id, u.tenant_id AS tenantId, u.name, u.email, u.phone, u.role,
      t.name AS storeName, t.business_type AS businessType, t.data_revision AS dataRevision, t.status AS tenantStatus, t.plan_code AS planCode,
      t.demo_expires_at AS demoExpiresAt, t.active_until AS activeUntil,
      t.address, t.city, t.latitude, t.longitude,
      t.location_accuracy AS locationAccuracy, t.location_consent_at AS locationConsentAt,
      t.device_authorized_at AS deviceAuthorizedAt, t.last_ip AS lastIp,
      CASE WHEN NULLIF(t.qris_payload, '') IS NULL THEN 0 ELSE 1 END AS qrisConfigured,
      t.qris_merchant_name AS qrisMerchantName
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1`
  ).bind(await sha256(token), now).first<AuthUser>();
  return row || null;
}

export function hasTenantAccess(user: AuthUser) {
  if (user.role === "superadmin") return true;
  if (!user.tenantId || !user.tenantStatus) return false;
  const now = Date.now();
  if (user.tenantStatus === "active") {
    const subscriptionValid = Boolean(user.activeUntil && user.activeUntil > now);
    const deviceAuthorized = Boolean(user.deviceAuthorizedAt && user.locationConsentAt && user.latitude !== null && user.longitude !== null);
    return subscriptionValid && deviceAuthorized;
  }
  if (user.tenantStatus === "demo") return Boolean(user.demoExpiresAt && user.demoExpiresAt > now);
  return false;
}

export function authError(message = "Silakan masuk terlebih dahulu.") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Anda tidak memiliki izin untuk tindakan ini.") {
  return Response.json({ error: message }, { status: 403 });
}
