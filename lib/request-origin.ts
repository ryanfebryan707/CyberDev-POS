function requestHosts(request: Request) {
  const hosts = new Set<string>();
  const add = (value: string | null) => {
    for (const candidate of (value || "").split(",")) {
      const normalized = candidate.trim().toLowerCase();
      if (normalized) hosts.add(normalized);
    }
  };
  try { add(new URL(request.url).host); }
  catch { /* Invalid request URLs are rejected by the caller. */ }
  add(request.headers.get("host"));
  add(request.headers.get("x-forwarded-host"));
  return hosts;
}

export function isSamePublicOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return requestHosts(request).has(parsed.host.toLowerCase());
  } catch {
    return false;
  }
}
