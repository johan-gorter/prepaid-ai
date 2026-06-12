# AI Lab — local Gemini image-editing experiments

Call the Gemini image model directly from your dev machine to iterate on the
paint/remove pipeline without deploying Cloud Functions or going through the
app. Plain Node ES modules, no build step; `sharp` and `@google/genai` resolve
from `functions/node_modules` (run `npm install` in `functions/` once).

This directory is excluded from functions deploys (`firebase.json` ignore)
and `out/` is git-ignored.

## Setup

The lab talks to Gemini through **Vertex AI** (mirrors the production Cloud
Function's `vertex` backend) using Application Default Credentials:

```bash
gcloud auth application-default login
```

The GCP project is read from `GOOGLE_CLOUD_PROJECT` (or `GCLOUD_PROJECT` /
`GCP_PROJECT`), falling back to the `default` project in `.firebaserc`. Set
`AI_REGION` to override the location (default: `global`).

## Usage

```bash
node functions/ai-lab/run.mjs <approach> [options]
node functions/ai-lab/run.mjs --help
```

Every run writes its inputs, prompts, intermediates and result to
`functions/ai-lab/out/<approach>-<timestamp>/` so runs can be compared
side by side.

**Mask convention:** white = area to repaint, black = keep. Any image format
sharp can read; it is resized to the source dimensions.

### Approaches

- **`paint`** — the 2026-06-12 experiment winner: one-shot masked repaint on
  **nano banana 2** (`gemini-3-pro-image-preview` — `gemini-2.5-flash-image`
  no-ops on this edit). Marks the masked area with a magenta checkerboard at
  50% coverage over the original colours (coverage is the colour-commitment
  dial: sparser markings let the model keep the original materials), sends
  the tinted reference room as the colour reference, and lightens the colour
  sent to the model with `--lighten` (nano banana renders paint darker than
  asked). All inputs sent to the model are saved next to the result.

  ```bash
  node functions/ai-lab/run.mjs paint --source in/in-beams.png --mask in/mask-beams.png --color "#887360" --lighten 0.2
  ```

  Tweak the marking with `--variant checker|dots|grayscale|solid`,
  `--cell <px>`, `--coverage half|quarter`, `--spacing <px>`, `--radius <px>`.

- **`current`** — baseline; replicates the old production paint pipeline:
  dotted-grayscale composite + a whole-image colour/material reference (the
  paint colour multiplied over the clean source, so the model sees the colour
  in multiple natural ways under the room's lighting), one generation. Builds
  the composite from `--source` + `--mask`, or sends an existing one via
  `--composite` (e.g. downloaded from the Storage emulator before the
  Cloud Function deletes it). `--source` is always required — the colour
  reference is built from the clean source. `--prompt` overrides the
  production prompt for quick prompt-only experiments.

  ```bash
  node functions/ai-lab/run.mjs current --source in/in-beams.png --mask in/mask-beams.png --color "#887360"
  ```

- **`reference`** — like `current`, but the colour/material reference is built
  from a bundled reference room (`functions/reference/room.png` or
  `room-dark.png`) tinted with the paint colour, rather than the source photo.
  The bright or dim room is chosen by the colour's luminance so the colour
  reads naturally on real wall/ceiling/wood surfaces. Builds the composite from
  `--source` + `--mask`, or sends an existing one via `--composite`.

  ```bash
  node functions/ai-lab/run.mjs reference --source in/in-beams.png --mask in/mask-beams.png --color "#887360"
  ```

- **`two-step`** — splits paint and compose into two generations: step 1
  fills the marked area with the flat target colour; step 2 gets the original
  photo + the flat repaint and harmonises lighting/shadows/texture.

  ```bash
  node functions/ai-lab/run.mjs two-step --source in/in-beams.png --mask in/mask-beams.png --color "#887360"
  ```

- **`custom`** — arbitrary prompt + images, sent in order:

  ```bash
  node functions/ai-lab/run.mjs custom --prompt "Repaint the ceiling #213529" --image room.jpg --image swatch.png
  ```

## Adding an approach

Create `approaches/<name>.mjs` with a default-exported async function taking
the parsed CLI options, add the name to `APPROACHES` in `run.mjs`, and compose
the utilities from `lib.mjs`:

- `generateImage({ prompt, images, model })` — one Gemini call, returns
  `{ image, text }`
- `buildPaintComposite(source, mask, { spacing, radius })` /
  `buildSolidComposite(source, mask)` — the production composite variants
- `buildColorReference(source, hex)` — the production whole-image colour
  reference: the paint colour multiplied over the clean source
- `buildRoomReference(hex, variant)` — tint a bundled reference room
  (`functions/reference/room.png` / `room-dark.png`) with the paint colour;
  `variant` defaults to the luminance-based switch (`pickRoomVariant`)
- `grayscale`, `colorSwatch`, `dotGrid`, `compositeMasked` — primitives to
  build new variants
- `makeOutDir(name)` / `save(dir, name, data)` — run output

When an experiment wins, port it back into `functions/src/ai.ts` /
`src/components/MaskingCanvas.vue` — this lab is throwaway scaffolding, the
app never uses it.
