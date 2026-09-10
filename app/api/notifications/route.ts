import { safeRoute } from "@/lib/http";
import { env } from "@/lib/runtime-env";
import { authError, forbidden, getCurrentUser } from "@/lib/auth";

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  audience: "all" | "active" | "demo" | "suspend";
  severity: "info" | "success" | "warning";
  createdAt: number;
  expiresAt: number | null;
  isRead: number;
};

async function visibleAnnouncements(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, limit = 30) {
  const now = Date.now();
  const audienceClause = user.role === "superadmin" ? "" : "AND (a.audience = 'all' OR a.audience = ?)";
  const statement = env.DB.prepare(
    `SELECT a.id, a.title, a.message, a.audience, a.severity,
      a.created_at AS createdAt, a.expires_at AS expiresAt,
      CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS isRead
     FROM announcements a
     LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = ?
     WHERE a.is_active = 1 AND (a.expires_at IS NULL OR a.expires_at > ?) ${audienceClause}
     ORDER BY a.created_at DESC LIMIT ?`
  );
  const result = user.role === "superadmin"
    ? await statement.bind(user.id, now, limit).all<AnnouncementRow>()
    : await statement.bind(user.id, now, user.tenantStatus || "demo", limit).all<AnnouncementRow>();
  return result.results;
}

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  const notifications = await visibleAnnouncements(user);
  return Response.json({
    notifications,
    unread: notifications.filter((item) => !Number(item.isRead)).length,
  });
}

async function POSTHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  if (user.role !== "superadmin") return forbidden("Hanya Super-Admin yang dapat mengirim pemberitahuan.");
  const body = (await request.json()) as {
    title?: string;
    message?: string;
    audience?: string;
    severity?: string;
    expiresInDays?: number;
  };
  const title = body.title?.trim().slice(0, 100) || "";
  const message = body.message?.trim().slice(0, 600) || "";
  const audience = ["all", "active", "demo", "suspend"].includes(body.audience || "") ? body.audience! : "all";
  const severity = ["info", "success", "warning"].includes(body.severity || "") ? body.severity! : "info";
  const days = Math.min(90, Math.max(1, Math.round(Number(body.expiresInDays) || 14)));
  if (title.length < 3 || message.length < 5) {
    return Response.json({ error: "Judul minimal 3 karakter dan isi pemberitahuan minimal 5 karakter." }, { status: 400 });
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO announcements (id, title, message, audience, severity, is_active, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)"
    ).bind(id, title, message, audience, severity, now + days * 24 * 60 * 60 * 1000, user.id, now),
    env.DB.prepare(
      "INSERT INTO audit_logs (id, tenant_id, user_id, action, details, created_at) VALUES (?, NULL, ?, 'ANNOUNCEMENT_BROADCAST_CREATED', ?, ?)"
    ).bind(crypto.randomUUID(), user.id, `${title} • audience ${audience}`, now),
  ]);
  return Response.json({ ok: true, id }, { status: 201 });
}

async function PATCHHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return authError();
  const body = (await request.json()) as { action?: string; announcementId?: string };
  const visible = await visibleAnnouncements(user, 100);
  const targets = body.action === "read_all"
    ? visible.filter((item) => !Number(item.isRead)).map((item) => item.id)
    : visible.some((item) => item.id === body.announcementId) ? [body.announcementId!] : [];
  if (!targets.length) return Response.json({ ok: true, updated: 0 });
  const now = Date.now();
  await env.DB.batch(targets.map((announcementId) => env.DB.prepare(
    "INSERT INTO announcement_reads (id, announcement_id, user_id, read_at) VALUES (?, ?, ?, ?) ON CONFLICT (announcement_id, user_id) DO NOTHING"
  ).bind(crypto.randomUUID(), announcementId, user.id, now)));
  return Response.json({ ok: true, updated: targets.length });
}

export const GET = safeRoute(GETHandler);
export const POST = safeRoute(POSTHandler);
export const PATCH = safeRoute(PATCHHandler);
