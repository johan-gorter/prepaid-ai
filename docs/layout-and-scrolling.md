# Layout and Scrolling

This document describes how page height, scrolling, fixed headers/footers, and
the on-screen keyboard interact in payasyougo.app. It captures the contract
that the styles in `src/style.css`, the composable `src/composables/useKeyboardInset.ts`,
the `StickyFooter.vue` component, and per-page layouts together enforce.

If you change any of these, re-read this whole document and verify the
invariants below in a real browser on Android, iOS, and desktop — the four
combinations break in mutually inconsistent ways otherwise.

## Goals

1. The document never extends past the visible viewport when the on-screen
   keyboard is open. No black gap below the body, no needless document
   scrolling, no fixed footer hidden underneath the keyboard.
2. Pages whose content fits in the visible viewport do not scroll.
3. Pages whose content overflows the viewport scroll inside `<main>` (or a
   designated inner container), not at the document level on top of fixed
   chrome.
4. A fixed footer always sits at the bottom of the visible viewport — above
   the keyboard when it is open, at the screen bottom when it is not.
5. Inputs near the bottom of the page (chat composer, prompt textarea) stay
   visible above the keyboard without the user scrolling.

## The keyboard inset

`src/composables/useKeyboardInset.ts` is mounted once in `App.vue`. It
listens to `window.visualViewport`'s `resize` and `scroll` events and writes
the keyboard height into a CSS custom property on `<html>`:

```css
--kb-inset: <px>;     /* 0 when the keyboard is closed */
```

The value is computed as
`max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)`,
which yields the height of the on-screen keyboard on every browser that
implements VisualViewport — including Android Chrome, iOS Safari, and
desktop browsers (where it stays 0).

The composable is registered globally in `src/App.vue` via `useKeyboardInset()`
so every route gets the variable. There is a single set of viewport
listeners no matter how many components mount or unmount.

### Why we do **not** use `interactive-widget=resizes-content` or `VirtualKeyboard.overlaysContent`

An earlier iteration opted into both. On Android Chrome that combination
**prevents** the visual viewport from shrinking when the keyboard appears,
so `--kb-inset` stays at 0 and the fixed footer ends up underneath the
keyboard. iOS Safari ignores both APIs.

The current setup (see `index.html`) opts into none of them:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

`viewport-fit=cover` is needed for PWA safe-area handling. Anything beyond
that breaks the inset calculation on at least one platform.

## Body and `#app` height

`src/style.css` caps the document at the visible viewport:

```css
body {
  min-height: calc(100dvh - var(--kb-inset, 0px));
  overflow-x: clip;
}

#app {
  min-height: calc(100dvh - var(--kb-inset, 0px));
}
```

This is a `min-height`, not a fixed height: pages with content that
overflows can still grow past it and scroll. Pages whose content fits stay
exactly at the visible viewport and do not introduce a document-level
scrollbar.

`overflow-x: clip` keeps the page horizontally readable at 320 px even when
a child element refuses to shrink.

## Fixed footer that follows the keyboard

`src/components/StickyFooter.vue` anchors itself above the keyboard:

```css
footer.sticky-footer {
  position: fixed;
  inset: auto 0 0 0;
  bottom: var(--kb-inset, 0px);
}
```

When the keyboard is closed the footer sits at the screen bottom. When the
keyboard opens, `--kb-inset` becomes the keyboard height and the footer
slides up to stay visible.

Pages that use `StickyFooter` should reserve `padding-bottom: 5rem` on
their `<main>` so content does not hide underneath it.

## Two page-height patterns

There are two correct ways to lay out a page. Pick the one that matches
your content.

### Pattern A — Scrolling page (most pages)

The default. Use this when the page content is browseable: lists, detail
pages, settings, balance, the renovation timeline.

```vue
<template>
  <AppBar title="..." />
  <main
    class="responsive"
    style="max-width: 800px; margin: 0 auto;
           padding-top: 4.5rem;     /* clears the fixed AppBar */
           padding-bottom: 5rem;    /* clears the StickyFooter, omit if no footer */"
  >
    <!-- content -->
  </main>
  <StickyFooter v-if="...">...</StickyFooter>
</template>
```

The page can grow past the viewport; the document scrolls naturally; the
fixed AppBar and StickyFooter stay in place.

### Pattern B — Viewport-locked flex column (chat & prompt stage)

Use this when an input must stay anchored at the bottom of the visible
viewport while messages or media scroll above it. The current users are
`PrivateChatPage.vue` and the `prompt` stage in `NewImpressionPage.vue`.

```vue
<template>
  <AppBar title="..." />
  <main class="page-layout">
    <div class="scroll-area">
      <!-- messages, prompt content -->
    </div>
    <div class="bottom">
      <!-- composer / textarea / actions -->
    </div>
  </main>
</template>

<style scoped>
.page-layout {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--kb-inset, 0px));
  padding-top: 4.5rem; /* clears the fixed AppBar */
}
.scroll-area {
  flex: 1;
  overflow-y: auto;
}
.bottom {
  flex-shrink: 0;
}
</style>
```

The container is sized to the visible viewport, so the bottom slot
automatically anchors above the keyboard via flex layout — no
`position: fixed`, no manual offsets. The scroll area takes the remaining
space and scrolls inside itself.

This pattern intentionally does **not** use `StickyFooter`, because
`StickyFooter` is `position: fixed` and would overlap the in-flow bottom
slot.

## Header / footer width clamps

Beer CSS uses `display: grid` on `<header>`, and a single `auto` grid cell
expands to its content's intrinsic width — which lets a wide nav push past
the viewport on narrow screens. `src/style.css` clamps the column to the
available header width:

```css
header.fixed {
  grid-template-columns: minmax(0, 1fr);
}
header.fixed > nav {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  min-width: 0;
}
```

`StickyFooter.vue` applies the same `max-width: 800px` rule to its inner
`<nav>` so footer content matches the main column on wide viewports.

Headings inside the AppBar truncate with an ellipsis; headings inside body
content wrap with `overflow-wrap: anywhere` so a single long word like
"Renovations" does not push the layout wider than a 320 px viewport.

## Invariants to verify after layout changes

When you touch any of `src/style.css`, `useKeyboardInset.ts`,
`StickyFooter.vue`, `index.html`'s viewport meta, or any page using
Pattern B above, manually verify all of the following before pushing:

- [ ] **Android Chrome — chat page.** Tap the composer. Keyboard appears.
      The composer sits flush above the keyboard. The document does **not**
      scroll. Closing the keyboard returns the composer to the screen
      bottom with no jump.
- [ ] **iOS Safari — chat page.** Same as above. The on-screen keyboard
      should not leave a black gap.
- [ ] **Android Chrome — `/new-impression` prompt stage.** Tap the prompt
      textarea. The textarea and the StickyFooter (`Back` / `Generate`)
      both stay visible above the keyboard. The painted image area
      collapses to zero height during the prompt stage so the textarea has
      room — verify this still works.
- [ ] **iPhone SE (320 × 568 dvh).** Open `/new-impression?source=photo`
      and step through `mask` → `prompt`. The footer is reachable, the
      header does not overflow, and no horizontal scrollbar appears.
- [ ] **Desktop, no keyboard.** `--kb-inset` stays at `0px`. Pages with
      tall content scroll inside the document. Pages with short content do
      not introduce a vertical scrollbar.
- [ ] **PWA installed mode (iOS and Android).** `viewport-fit=cover` plus
      `apple-mobile-web-app-status-bar-style: black-translucent` should
      keep the UI clear of the notch / status bar without producing an
      unsafe-area gap.

## File map

| File | Role |
|---|---|
| `index.html` | Viewport meta — `viewport-fit=cover`, **no** `interactive-widget` |
| `src/App.vue` | Mounts `useKeyboardInset()` once globally |
| `src/composables/useKeyboardInset.ts` | Tracks `visualViewport`, writes `--kb-inset` on `<html>` |
| `src/style.css` | Caps `body` / `#app` to `100dvh - --kb-inset`; horizontal clip; header width clamp |
| `src/components/StickyFooter.vue` | Fixed footer using `bottom: var(--kb-inset, 0px)`; mobile bottom-nav layout |
| `src/views/PrivateChatPage.vue` | Pattern B example — chat composer above keyboard |
| `src/views/NewImpressionPage.vue` | Pattern B during prompt stage; Pattern A footer otherwise |
| `src/views/PhotoCapturePage.vue`, `CropImagePage.vue`, `RenovationDetailPage.vue` | Pattern A — `min-height: 100dvh` page-layout columns |
