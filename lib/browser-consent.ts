export const ACCESS_CONSENT_STORAGE_KEY = "cyberdev:access-consent";
export const ACCESS_CONSENT_VERSION = 1;

export type AccessConsent = {
  version: typeof ACCESS_CONSENT_VERSION;
  acceptedAt: number;
  essentialStorage: true;
  permissionsOnDemand: true;
};

export function createAccessConsent(now = Date.now()): AccessConsent {
  return {
    version: ACCESS_CONSENT_VERSION,
    acceptedAt: now,
    essentialStorage: true,
    permissionsOnDemand: true,
  };
}

export function parseAccessConsent(value: string | null): AccessConsent | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as Partial<AccessConsent>;
    if (
      candidate.version !== ACCESS_CONSENT_VERSION ||
      candidate.essentialStorage !== true ||
      candidate.permissionsOnDemand !== true ||
      typeof candidate.acceptedAt !== "number" ||
      !Number.isFinite(candidate.acceptedAt) ||
      candidate.acceptedAt <= 0
    ) return null;
    return candidate as AccessConsent;
  } catch {
    return null;
  }
}

