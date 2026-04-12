/**
 * Extract the Storage path from a Firebase Storage download URL.
 */
export function storagePathFromUrl(url: string): string {
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) throw new Error(`Cannot parse storage path from URL: ${url}`);
  return decodeURIComponent(match[1]);
}

/**
 * CORS — built from ALLOWED_ORIGINS env var (comma-separated URLs).
 * Falls back to localhost-only for emulator mode.
 */
export function getAllowedOrigins(): (string | RegExp)[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (raw) {
    return raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  // Default: localhost only (emulator / dev)
  return [/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
}

/** Admin UIDs that may call addCredits. Set via ADMIN_UIDS env var (comma-separated). */
export function getAdminUids(): string[] {
  const raw = process.env.ADMIN_UIDS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
