/**
 * Read helpers for the anonymous measurement counters (issue #93).
 *
 * The `metrics` collection is locked to clients by Firestore rules, so tests
 * read it through the Firestore emulator's admin REST API (the same
 * `Authorization: Bearer owner` bypass the auth helper uses to seed balances).
 */

import { expect } from "@playwright/test";
import { EMULATOR_URLS, PROJECT_ID } from "./emulator-config";

/** UTC day bucket the Cloud Function keys counters on (YYYY-MM-DD). */
export function metricDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Mirror of the Cloud Function's `metrics` doc id: `${day}__${source}__${event}`. */
export function metricId(event: string, source = "direct", day = metricDay()): string {
  return `${day}__${source}__${event}`;
}

/**
 * Read the current count for a counter doc, or 0 if it doesn't exist yet.
 */
export async function readMetricCount(
  event: string,
  source = "direct",
  day = metricDay(),
): Promise<number> {
  const id = metricId(event, source, day);
  const res = await fetch(
    `${EMULATOR_URLS.firestore}/v1/projects/${PROJECT_ID}/databases/(default)/documents/metrics/${id}`,
    { headers: { Authorization: "Bearer owner" } },
  );
  if (res.status === 404) return 0;
  if (!res.ok) {
    throw new Error(`Failed to read metric ${id}: ${res.status}`);
  }
  const body = (await res.json()) as {
    fields?: { count?: { integerValue?: string } };
  };
  return Number(body.fields?.count?.integerValue ?? 0);
}

/**
 * Poll until a counter reaches at least `min` (default 1). Counters are written
 * by a fire-and-forget callable, so they land a moment after the UI action.
 */
export async function expectMetricAtLeast(
  event: string,
  source = "direct",
  min = 1,
  timeoutMs = 10_000,
): Promise<void> {
  await expect
    .poll(() => readMetricCount(event, source), { timeout: timeoutMs })
    .toBeGreaterThanOrEqual(min);
}
