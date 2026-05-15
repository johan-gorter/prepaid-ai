// ---------------------------------------------------------------------------
// Per-environment Cloud Functions region.
//
// MUST be a code constant — firebase-tools reads the `region` option from
// each function during deploy-time discovery, BEFORE it loads any
// `functions/.env.<projectId>` file. An env-var indirection there silently
// falls back to the default and deploys functions to the wrong region.
//
// !! KEEP IN SYNC with !!
//   - terraform/environments/<env>.tfvars  →  `region = "..."`
//   - src/firebase.ts and src/composables/useChat.ts (the VITE_FUNCTIONS_REGION
//     fallback constants — see the matching comment block there)
//
// The frontend reads `import.meta.env.VITE_FUNCTIONS_REGION` (built into the
// Vite bundle by CI from the GitHub var `VITE_FUNCTIONS_REGION_<ENV>`, which
// is synced from the tfvars value above via `scripts/sync-github-vars.mjs`).
//
// To change a region, edit:
//   1. the matching entry in REGIONS below
//   2. terraform/environments/<env>.tfvars `region = "..."`
//   3. the matching fallback constants in src/firebase.ts and src/composables/useChat.ts
// then run:
//   node scripts/tf.mjs <env> apply
//   node scripts/sync-github-vars.mjs <env>
// and redeploy via CI. Drift between any of these = `functions/internal` errors.
// ---------------------------------------------------------------------------

const REGIONS: Record<string, string> = {
  "prepaid-ai-sandbox": "europe-west4",
  "prepaid-ai-dev": "europe-west1",
  "prepaid-ai-emulator": "europe-west4",
  "payasyougo-production": "europe-west4",
};

function resolveRegion(): string {
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (project && project in REGIONS) {
    return REGIONS[project];
  }
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "europe-west4";
  }
  throw new Error(
    `FUNCTIONS_REGION: unknown project "${project}". ` +
      `Add it to REGIONS in functions/src/region.ts.`,
  );
}

export const FUNCTIONS_REGION = resolveRegion();
