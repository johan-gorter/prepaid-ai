# AI Lab — local Gemini image-editing experiments

Call the Gemini image model directly from your dev machine to iterate on the
paint/remove pipeline without deploying Cloud Functions or going through the
app. Plain Node ES modules, no build step; `sharp` and `@google/genai` resolve
from `functions/node_modules` (run `npm install` in `functions/` once).

This directory is excluded from functions deploys (`firebase.json` ignore)
and `out/` is git-ignored.

## Setup

`GEMINI_API_KEY` is read from the environment, or from the first of
`functions/.secret.local`, `functions/.env`, `.env` that defines it.

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

- **`current`** — baseline; replicates the production paint pipeline:
  dotted-grayscale composite + colour swatch, one generation. Builds the
  composite from `--source` + `--mask`, or sends an existing one via
  `--composite` (e.g. downloaded from the Storage emulator before the
  Cloud Function deletes it). `--prompt` overrides the production prompt
  for quick prompt-only experiments.

  ```bash
  node functions/ai-lab/run.mjs current --source room.jpg --mask ceiling-mask.png --color "#213529"
  ```

- **`two-step`** — splits paint and compose into two generations: step 1
  fills the marked area with the flat target colour; step 2 gets the original
  photo + the flat repaint and harmonises lighting/shadows/texture.

  ```bash
  node functions/ai-lab/run.mjs two-step --source room.jpg --mask ceiling-mask.png --color "#213529"
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
- `grayscale`, `colorSwatch`, `dotGrid`, `compositeMasked` — primitives to
  build new variants
- `makeOutDir(name)` / `save(dir, name, data)` — run output

When an experiment wins, port it back into `functions/src/ai.ts` /
`src/components/MaskingCanvas.vue` — this lab is throwaway scaffolding, the
app never uses it.
