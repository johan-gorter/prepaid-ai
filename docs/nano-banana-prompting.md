# Prompting Nano Banana to Edit an Existing Image

Practical, proven guidance for prompting **Gemini 2.5 Flash Image** (model id
`gemini-2.5-flash-image`, nicknamed "nano banana") to **edit a photo the user
provides** — the image flows in this app: recolouring/painting a surface,
removing an object, and free-prompt edits.

The code lives in:

- `functions/src/ai.ts` — `geminiProcess()`: builds the request and prompt.
- `src/components/MaskingCanvas.vue` — `getCompositeBlob()`: produces the
  AI-facing image with the edit region marked.
- `src/views/renovation/NewImpressionPage.vue` — chooses the marking variant per
  flow.

Sections marked **[proven]** were confirmed by trial-and-error on the sandbox
deploy against real photos. Sections marked **[guide]** come from Google's and
the community's published guidance and are corroborating, not yet A/B-tested
here.

---

## TL;DR

1. **Keep the instruction short and direct.** Long, multi-paragraph prompts make
   the model do _nothing_. **[proven]**
2. **Don't pile on "preserve everything exactly / keep lighting, shadows,
   texture…" language.** Over-constraining the preservation side suppresses the
   edit entirely (no-op output). **[proven]**
3. **Enumerate every surface you want changed** (e.g. "walls, the ceiling, and
   any wooden beams or trim"). If you ask it to "determine the surface the user
   meant," it collapses to a single surface and skips the rest. **[proven]**
4. **Mark the edit region _inside_ the image, not around it.** A sparse pattern
   of small magenta dots over the region beats outlining/circling it. **[proven]**
5. **Always tell it to remove the marking** in the output. **[proven]**
6. **Force a full replacement** when recolouring: "The old colours are
   completely replaced." A tint/wash is the default failure mode. **[proven]**
7. **Use a second image as a colour/style reference** and refer to images by
   position ("the first image… the second image…"). **[proven]**

---

## What backfired (anti-patterns) — the most useful part

These are the concrete failures we hit, in order. Avoid repeating them.

### 1. "Logically determine what surface the user intended" → skips surfaces
The original paint prompt asked the model to _infer_ which surface to paint.
With a ceiling-plus-beams selection it painted only the flat ceiling and left
the wooden beams untouched — it treats structural wood as a distinct object to
preserve. **Fix:** name the surfaces explicitly and tell it to paint _all_ of
them, including the beams/trim.

### 2. Long, fully-specified prompt → paints nothing at all
The "complete" version (multiple paragraphs: approximate-boundary explanation,
an enumerated include-list, an enumerated exclude-list, and a strong
preservation clause — "keep everything else exactly the same, preserving the
original lighting, shadows, highlights, surface texture, and perspective") made
the model return the original image unchanged. The heavy "keep everything the
same" framing dominated and cancelled the edit. **Fix:** delete the preservation
paragraph; keep one short sentence of realism guidance at most ("natural
lighting and shadows").

### 3. Outlining / "circling" the region → weak, ambiguous signal
Marking the area with a thin magenta **outline** (the old `"border"` composite
variant) was unreliable — the model often painted only near the line or
misjudged the enclosed area. **Fix:** mark the region with a **sparse grid of
small magenta dots** laid _over_ the whole region (the `"dots"` variant). The
dots sit on top of every surface to change, while leaving the underlying surface
visible between them so the model can still see what it's recolouring.

### Rule of thumb
Editing degrades at **both** extremes: too vague (it guesses and under-edits)
**and** too constrained (it freezes and no-ops). Aim for a few explicit,
positive sentences.

---

## Marking the edit region

The client composites the user's mask onto the photo before sending it, so
Gemini sees _where_ to edit without a separate mask channel. Three variants
(`getCompositeBlob` in `MaskingCanvas.vue`):

| Variant    | What it draws                              | Used by        |
| ---------- | ------------------------------------------ | -------------- |
| `"dots"`   | Sparse grid of small magenta filled circles over the region | Paint / recolour |
| `"solid"`  | Solid magenta fill of the region           | Remove object  |
| `"checker"`| Magenta checkerboard fill of the region    | Free-prompt    |

Guidelines that held up:

- **Use magenta `rgb(255, 0, 255)`.** It almost never occurs in real interior
  photos, so the model never confuses the marker with scene content. **[proven]**
- **Dots for recolouring** (radius ~2.5px / ~5px diameter, spaced ~15px on the
  1024² composite). Sparse enough to leave the original surface visible between
  dots — the model needs to see the surface to recolour it convincingly, but
  dense enough to define the region. **[proven]**
- **Solid fill for removal**, so the model reads it as a single "stain" to paint
  out and reconstruct plausible background underneath. **[proven]**
- **Always instruct removal of the marker** in the output text, matched to the
  variant ("remove all the magenta dots", "remove the magenta area"). **[proven]**

---

## Request structure (multi-image)

In `geminiProcess()` the request `parts` are read **in order**, so the prompt
refers to images by position and the `inlineData` parts are pushed in that same
order:

1. `text` — the instruction.
2. `inlineData` — the marked photo ("the first image").
3. `inlineData` — the colour/style reference swatch ("the second image"), when
   present.

Config: `responseModalities: ["TEXT", "IMAGE"]`. Read the response by scanning
`candidates[0].content.parts` for the first `inlineData.data` (the image); if
none is present, surface the returned text as the error (it usually explains a
refusal). **[proven]**

A **second reference image** as the colour source works better than naming a
colour in words alone. Refer to it explicitly ("using the colour shown in the
second image"). **[proven]**

---

## Prompt templates

Short, positive, explicit. Adjust the surface list to the domain.

### Recolour / paint a marked region (with a colour reference image)
> The first image shows a scene where the area to be changed is marked with a
> pattern of small magenta dots. Color everything that is covered by the dots
> using the colour that is shown in the second image. The old colours are
> completely replaced. Also remove all magenta dots in the now recoloured area.

Why each clause earns its place:
- _"marked with a pattern of small magenta dots"_ — tells it what the marker is.
- _"Color everything that is covered by the dots"_ — covers multiple surfaces at
  once without enumerating; pair with an explicit surface list ("including walls,
  the ceiling, and any wooden beams or trim") if a flow keeps missing one.
- _"The old colours are completely replaced"_ — forces a real recolour, not a
  translucent tint. **[proven]**
- _"remove all magenta dots"_ — cleans up the marker.

### Remove an object (solid magenta fill)
> Apply the prompt below to the magenta area. Reconstruct a clean, plausible
> background where the magenta is, and do not include the magenta area in the
> output.

(For removals, being explicit about what _stays_ is fine and helpful — the
no-op risk is specific to _recolour_ edits where the preservation clause fights
the recolour.) **[guide]**

### Free-prompt edit (checkerboard fill)
> Apply the prompt below to the magenta checkered area. Do not include the
> checkered area in the output.

---

## General best practices (corroborating) **[guide]**

- **Describe, don't keyword-list.** Natural-language sentences beat comma-bagged
  keywords for editing.
- **Be hyper-specific about materials/finishes** when relevant ("matte navy
  paint", not "blue").
- **Prefer positive instructions**; a _single_ reinforcing semantic negative is
  fine ("…and no leftover magenta"), but don't build long exclusion lists.
- **Iterate one variable at a time:** Brief → Generate one candidate → Inspect
  against intent → change exactly one thing. Don't rewrite the whole prompt
  between attempts.
- **Editing is non-deterministic.** Re-run a couple of times before concluding a
  prompt is bad, and test edge cases (a single-surface selection, a
  multi-surface selection, a tiny selection) before shipping a prompt change.

---

## Deploying a prompt change to sandbox for testing

The prompt lives in a Cloud Function, so changes need a functions deploy to take
effect on the hosted sandbox:

```bash
npx firebase deploy --only functions:processImpression --project prepaid-ai-sandbox --force
```

Then exercise it at <https://prepaid-ai-sandbox.web.app>. Marking-pattern changes
(`MaskingCanvas.vue`) are frontend and also need a hosting deploy — see
[sandbox-deployment.md](sandbox-deployment.md).

---

## References

- [Ultimate prompting guide for Nano Banana — Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)
- [Introducing Gemini 2.5 Flash Image — Google Developers Blog](https://developers.googleblog.com/en/introducing-gemini-2-5-flash-image/)
- [Gemini API: Image generation docs](https://ai.google.dev/gemini-api/docs/image-generation)
- [Nano Banana prompt-engineering best practices — Skywork](https://skywork.ai/blog/nano-banana-gemini-prompt-engineering-best-practices-2025/)
