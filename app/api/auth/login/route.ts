import { rateLimit } from "@/lib/rate-limit";
import { safeRoute } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import {
  createSession,
  getBootstrapAdmin,
  hashPassword,
  normalizeEmail,
  normalizePhone,
  phoneLoginVariants,
  sha256,
  validateLoginPassword,
  verifyPassword,
} from "@/lib/auth";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 6;

type LoginAttempt = {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number | null;
};

async function loginThrottleKey(request: Request, identifier: string) {
  const ip = (request.headers.get("x-nf-client-connection-ip") || request.headers.get("cf-connecting-ip") || request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown")
    .trim()
    .slice(0, 80);
  return sha256(`${identifier.toLowerCase()}|${ip}`);
}

async function currentLoginThrottle(keyHash: string, now: number) {
  const attempt = await env.DB.prepare(
    "SELECT attempts, window_started_at AS windowStartedAt, blocked_until AS blockedUntil FROM auth_login_attempts WHERE key_hash = ?"
  ).bind(keyHash).first<LoginAttempt>();
  if (!attempt) return null;
  if (attempt.windowStartedAt + LOGIN_WINDOW_MS <= now && (!attempt.blockedUntil || attempt.blockedUntil <= now)) {
    await env.DB.prepare("DELETE FROM auth_login_attempts WHERE key_hash = ?").bind(keyHash).run();
    return null;
  }
  return attempt;
}

async function recordFailedLogin(keyHash: string, now: number) {
  const current = await currentLoginThrottle(keyHash, now);
  const attempts = (current?.attempts || 0) + 1;
  const windowStartedAt = current?.windowStartedAt || now;
  const blockedUntil = attempts >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_WINDOW_MS : null;
  await env.DB.prepare(
    `INSERT INTO auth_login_attempts (key_hash, attempts, window_started_at, blocked_until, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key_hash) DO UPDATE SET attempts = auth_login_attempts.attempts + 1, window_started_at = excluded.window_started_at,
       blocked_until = CASE WHEN auth_login_attempts.attempts + 1 >= 6 THEN excluded.updated_at + 900000 ELSE auth_login_attempts.blocked_until END, updated_at = excluded.updated_at`
  ).bind(keyHash, attempts, windowStartedAt, blockedUntil, now).run();
}

function invalidCredentials() {
  return Response.json({ error: "Email/nomor WhatsApp atau password salah." }, { status: 401 });
}

type LoginUser = {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: string;
  isActive: number;
  passwordChangedAt: number | null;
  lastLoginAt: number | null;
  createdAt: number;
};

async function POSTHandler(request: Request) {
  try {
    const body = (await request.json()) as { identifier?: string; email?: string; password?: string };
    const rawIdentifier = (body.identifier || body.email || "").trim();
    const isEmail = rawIdentifier.includes("@");
    const email = isEmail ? normalizeEmail(rawIdentifier) : "";
    const phone = isEmail ? "" : normalizePhone(rawIdentifier);
    const password = body.password || "";
    if ((!email && !phone) || !validateLoginPassword(password)) {
      return Response.json({ error: "Email/nomor WhatsApp atau password tidak valid." }, { status: 400 });
    }
    const now = Date.now();
    const throttleKey = await loginThrottleKey(request, email || phone);
    const throttle = await currentLoginThrottle(throttleKey, now);
    if (throttle?.blockedUntil && throttle.blockedUntil > now) {
      const retryAfter = Math.max(1, Math.ceil((throttle.blockedUntil - now) / 1000));
      return Response.json(
        { error: "Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba kembali." },
        { status: 429, headers: { "retry-after": String(retryAfter) } }
      );
    }

    const bootstrap = getBootstrapAdmin();
    const isAdminIdentifier = Boolean(
      bootstrap.email &&
      ((email && email === bootstrap.email) || (phone && bootstrap.phoneAliases.includes(phone)))
    );
    let user: LoginUser | null = null;
    if (isAdminIdentifier) {
      user = await env.DB.prepare(
        "SELECT id, email, password_hash AS passwordHash, password_salt AS passwordSalt, role, is_active AS isActive, password_changed_at AS passwordChangedAt, last_login_at AS lastLoginAt, created_at AS createdAt FROM users WHERE email = ?"
      ).bind(bootstrap.email).first<LoginUser>();
    } else if (email) {
      user = await env.DB.prepare(
        "SELECT id, email, password_hash AS passwordHash, password_salt AS passwordSalt, role, is_active AS isActive, password_changed_at AS passwordChangedAt, last_login_at AS lastLoginAt, created_at AS createdAt FROM users WHERE email = ?"
      ).bind(email).first<LoginUser>();
    } else {
      const variants = phoneLoginVariants(phone);
      user = await env.DB.prepare(
        "SELECT id, email, password_hash AS passwordHash, password_salt AS passwordSalt, role, is_active AS isActive, password_changed_at AS passwordChangedAt, last_login_at AS lastLoginAt, created_at AS createdAt FROM users WHERE phone IN (?, ?, ?) LIMIT 1"
      ).bind(variants[0] || "", variants[1] || "", variants[2] || "").first<LoginUser>();
    }

    if (!user) {
      if (!isAdminIdentifier || !bootstrap.email || password !== bootstrap.password) {
        await recordFailedLogin(throttleKey, now);
        return invalidCredentials();
      }
      const credentials = await hashPassword(password);
      const userId = crypto.randomUUID();
      const bootstrapNow = Date.now();
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO users (id, tenant_id, name, email, phone, password_hash, password_salt, role, is_active, password_changed_at, last_login_at, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, 'superadmin', 1, ?, ?, ?)"
        ).bind(userId, "Moch Rizky Febryanto", bootstrap.email, bootstrap.phoneAliases[0] || null, credentials.hash, credentials.salt, bootstrapNow, bootstrapNow, bootstrapNow),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, NULL, ?, 'ADMIN_BOOTSTRAPPED', ?, ?)"
        ).bind(crypto.randomUUID(), userId, "Super-admin pertama dibuat secara aman.", bootstrapNow),
      ]);
      user = { id: userId, email: bootstrap.email, passwordHash: credentials.hash, passwordSalt: credentials.salt, role: "superadmin", isActive: 1, passwordChangedAt: bootstrapNow, lastLoginAt: bootstrapNow, createdAt: bootstrapNow };
    }

    if (isAdminIdentifier && user.role !== "superadmin") {
      await recordFailedLogin(throttleKey, now);
      return Response.json({ error: "Identitas admin dikunci dan tidak dapat digunakan sebagai akun client." }, { status: 403 });
    }
    let passwordMatches = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    // ADMIN_BOOTSTRAP_PASSWORD is also a one-time recovery path for an Admin
    // record that was provisioned but has never completed its first login.
    // Once last_login_at is set, this path can no longer replace the password.
    if (
      !passwordMatches &&
      isAdminIdentifier &&
      user.role === "superadmin" &&
      user.isActive &&
      !user.lastLoginAt &&
      bootstrap.password &&
      (await sha256(password)) === (await sha256(bootstrap.password))
    ) {
      const credentials = await hashPassword(password);
      const recovered = await env.DB.transaction(async () => {
        const updated = await env.DB.prepare(
          "UPDATE users SET password_hash = ?, password_salt = ?, password_changed_at = ?, last_login_at = ? WHERE id = ? AND role = 'superadmin' AND is_active = 1 AND last_login_at IS NULL RETURNING id"
        ).bind(credentials.hash, credentials.salt, now, now, user!.id).first<{ id: string }>();
        if (!updated) return false;
        await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(user!.id).run();
        await env.DB.prepare(
          "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, NULL, ?, 'ADMIN_FIRST_LOGIN_RECOVERED', ?, ?)"
        ).bind(crypto.randomUUID(), user!.id, "Password bootstrap dipakai satu kali untuk memulihkan login pertama Super-Admin.", now).run();
        return true;
      });
      passwordMatches = recovered;
    }
    if (!user.isActive || !passwordMatches) {
      await recordFailedLogin(throttleKey, now);
      return invalidCredentials();
    }

    await env.DB.prepare("DELETE FROM auth_login_attempts WHERE key_hash = ?").bind(throttleKey).run();
    await env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now, user.id).run();
    const session = await createSession(user.id);
    return new Response(JSON.stringify({ ok: true, role: user.role }), {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": session.cookie },
    });
  } catch (error) {
    console.error("AUTH_LOGIN_FAILED", error instanceof Error ? error.name : "UnknownError");
    return Response.json(
      { error: "Login belum dapat diproses. Silakan coba kembali.", code: "AUTH_LOGIN_FAILED" },
      { status: 500 }
    );
  }
}

export const POST = safeRoute(async request=>{await rateLimit(request,"login-ip",60,900000);return POSTHandler(request);});
