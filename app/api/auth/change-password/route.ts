import { rateLimit } from "@/lib/rate-limit";
import { safeRoute } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import { authError, getCurrentUser, hashPassword, validatePassword, verifyPassword } from "@/lib/auth";

type PasswordRow = { passwordHash: string; passwordSalt: string };

async function POSTHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  const body = (await request.json()) as { currentPassword?: string; newPassword?: string };
  const currentPassword = body.currentPassword || "";
  const newPassword = body.newPassword || "";
  if (!validatePassword(newPassword)) {
    return Response.json({ error: "Password baru minimal 12 karakter dan harus mengandung huruf serta angka." }, { status: 400 });
  }
  const row = await env.DB.prepare(
    "SELECT password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE id = ?"
  ).bind(user.id).first<PasswordRow>();
  if (!row || !(await verifyPassword(currentPassword, row.passwordHash, row.passwordSalt))) {
    return Response.json({ error: "Password saat ini salah." }, { status: 400 });
  }
  const credentials = await hashPassword(newPassword);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_changed_at = ? WHERE id = ?")
      .bind(credentials.hash, credentials.salt, now, user.id),
    env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare(
      "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, ?, ?, 'PASSWORD_CHANGED', ?, ?)"
    ).bind(crypto.randomUUID(), user.tenantId, user.id, "Password akun diubah.", now),
  ]);
  return new Response(JSON.stringify({ ok: true, loginAgain: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": "cyberdev_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" },
  });
}

export const POST = safeRoute(async request=>{await rateLimit(request,"password",12,900000);return POSTHandler(request);});
