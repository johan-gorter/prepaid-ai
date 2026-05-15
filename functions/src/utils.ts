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
 * automatically by Cloud Functions) plus any extra entries in the
 * ALLOWED_ORIGINS env var (comma-separated, used for custom domains).
 * Falls back to localhost-only for emulator mode.
 */
export function getAllowedOrigins(): (string | RegExp)[] {
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  const extra = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (project) {
    return [
      `https://${project}.web.app`,
      `https://${project}.firebaseapp.com`,
      ...extra,
    ];
  }
  if (extra.length > 0) return extra;
  return [/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
}

/** Whether `origin` matches any allowed origin (string or RegExp). */
export function isAllowedOrigin(origin: string): boolean {
  for (const allowed of getAllowedOrigins()) {
    if (typeof allowed === "string" && allowed === origin) return true;
    if (allowed instanceof RegExp && allowed.test(origin)) return true;
  }
  return false;
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
    if (project === "payasyougo-production") return "production";
    const env = project.replace("prepaid-ai-", "");
    if (env) return env;
  }
  return process.env.ENVIRONMENT ?? "emulator";
}
