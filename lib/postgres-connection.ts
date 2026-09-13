const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const LEGACY_STRICT_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

export function securePostgresConnectionString(value: string) {
  try {
    const url = new URL(value);
    if (!POSTGRES_PROTOCOLS.has(url.protocol)) return value;
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode && LEGACY_STRICT_SSL_MODES.has(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return value;
  }
}
