/**
 * Extract the Storage path from a Firebase Storage download URL.
 */
export function storagePathFromUrl(url: string): string {
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) throw new Error(`Cannot parse storage path from URL: ${url}`);
  return decodeURIComponent(match[1]);
}

/**
 * CORS — derived from GCLOUD_PROJECT (the Firebase project ID, set
 * automatically by Cloud Functions). Falls back to ALLOWED_ORIGINS env var
 * if set, or localhost-only for emulator mode.
 */
export function getAllowedOrigins(): (string | RegExp)[] {
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (project) {
    return [`https://${project}.web.app`, `https://${project}.firebaseapp.com`];
  }
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

/**
 * Derive the environment label from GCLOUD_PROJECT.
 * Project IDs follow the convention "prepaid-ai-<env>".
 * Falls back to ENVIRONMENT env var, then "emulator".
 */
export function getEnvironment(): string {
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (project) {
    const env = project.replace("prepaid-ai-", "");
    if (env) return env;
  }
  return process.env.ENVIRONMENT ?? "emulator";
}
