# Layout and Scrolling

This document describes how page height, scrolling, fixed headers/footers, and
the on-screen keyboard interact in payasyougo.app. It captures the contract
that the styles in `src/style.css`, the composable `src/composables/useKeyboardInset.ts`,
the `StickyFooter.vue` component, and per-page layouts together enforce.

If you change any of these, re-read this whole document and verify the
invariants below in a real browser on Android, iOS, and desktop — the four
combinations break in mutually inconsistent ways otherwise.

## Goals

1. The document is the only page-level vertical scroll owner. Do not create a
  second scrolling `<main>` or message pane for route content.
2. Pages whose content fits in the visible viewport do not scroll. Pages whose
  content overflows scroll naturally at the `html` / `body` level.
3. Fixed chrome is removed from document flow. Pages reserve explicit top and
  bottom clearance so content is not hidden underneath the AppBar or footer.
4. A fixed footer always sits at the bottom of the visible viewport — above
  the keyboard when it is open, at the screen bottom when it is not.
5. Inputs near the bottom of the page (chat composer, prompt textarea) remain
  in normal document flow. When they receive focus, the browser and the page's
  small focus helpers scroll the document so the user can see what they type.

## The keyboard inset

`src/composables/useKeyboardInset.ts` is mounted once in `App.vue`. It
listens to `window.visualViewport`'s `resize` and `scroll` events and writes
the keyboard height into a CSS custom property on `<html>`:

```css
--kb-inset: <px>; /* 0 when the keyboard is closed */
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
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, viewport-fit=cover"
/>
```

`viewport-fit=cover` is needed for PWA safe-area handling. Anything beyond
that breaks the inset calculation on at least one platform.

## Body and `#app` height

`src/style.css` gives the document a keyboard-aware minimum height:

```css
body {
  min-height: calc(100dvh - var(--kb-inset, 0px));
  overflow-x: clip;
}

#app {
  min-height: calc(100dvh - var(--kb-inset, 0px));
}
```

This is a `min-height`, not a fixed height. Content is allowed to grow past it;
when it does, the document scrolls. The keyboard inset only changes the minimum
visible page height so short pages and bottom controls can reflow above the
keyboard instead of leaving a dead area below the body.

`overflow-x: clip` keeps the page horizontally readable at 320 px even when
a child element refuses to shrink.

## Fixed AppBar overlay

`AppBar.vue` renders Beer CSS's `header.fixed`, but Beer CSS implements that
header as `position: sticky`, which means it still occupies normal document
flow. The page patterns below reserve their own top space for the AppBar, so
`src/style.css` deliberately promotes it to a real fixed overlay:

```css
#app header.fixed {
  position: fixed;
  inset: 0 0 auto 0;
}
```

This keeps the page-height math single-source: routes add
`padding-top: var(--app-bar-clearance)` to clear the AppBar visually, while the
header itself does not make the document one toolbar taller. The document may
still scroll, but only because route content is taller than the viewport, not
because the AppBar secretly contributed another toolbar-height block.

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

## Page-Height Pattern

Use one pattern everywhere: fixed chrome plus natural document scrolling. This
includes browseable pages, chat, and prompt/editor flows.

```vue
<template>
  <AppBar title="..." />
  <main
    class="responsive"
    style="max-width: 800px; margin: 0 auto;
           padding-top: var(--app-bar-clearance); /* clears the fixed AppBar */
           padding-bottom: 5rem;    /* clears StickyFooter, omit if no footer */"
  >
    <!-- content -->
  </main>
  <StickyFooter v-if="...">...</StickyFooter>
</template>
```

The page can grow past the viewport; the document scrolls naturally; the fixed
AppBar and StickyFooter stay in place. If the page should feel full-height when
content is short, use `min-height`, not `height`, so overflow still belongs to
the document:

```vue
<style scoped>
.page-layout {
  min-height: calc(100dvh - var(--kb-inset, 0px));
}
</style>
```

Avoid `height: calc(100dvh - var(--kb-inset))` on route containers unless the
route is intentionally clipping its content. A fixed height forces overflow
into child panes and recreates the mobile double-scroll problems this contract
is trying to avoid.

For chat-like composers and large prompt textareas, keep the input area in
document flow. Let it auto-grow when appropriate, and use `scrollIntoView()` on
focus as a small assist for iOS/Android keyboard timing. A user who scrolls up
to read earlier content should be able to move the composer or prompt off
screen; the UI should not fight them with a second inner scroll layer.

## Header / footer width clamps

Beer CSS uses `display: grid` on `<header>`, and a single `auto` grid cell
expands to its content's intrinsic width — which lets a wide nav push past
the viewport on narrow screens. `src/style.css` clamps the column to the
available header width:

```css
#app header.fixed {
  grid-template-columns: minmax(0, 1fr);
}
#app header.fixed > nav {
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
`StickyFooter.vue`, `index.html`'s viewport meta, or a page with a bottom input,
manually verify all of the following before pushing:

- [ ] **Android Chrome — chat page.** Tap the composer. Keyboard appears.
  The document scrolls enough to keep the composer visible. Chat messages
  are not inside their own scrolling pane.
- [ ] **iOS Safari — chat page.** Same as above. The on-screen keyboard should
  not leave a black gap or trap scrolling inside the composer area.
- [ ] **Android Chrome — `/new-impression` prompt stage.** Tap the prompt
      textarea. The textarea and the StickyFooter (`Back` / `Generate`)
  are reachable above the keyboard. The document, not the prompt wrapper,
  owns vertical scrolling.
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

| File                                                                              | Role                                                                               |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `index.html`                                                                      | Viewport meta — `viewport-fit=cover`, **no** `interactive-widget`                  |
| `src/App.vue`                                                                     | Mounts `useKeyboardInset()` once globally                                          |
| `src/composables/useKeyboardInset.ts`                                             | Tracks `visualViewport`, writes `--kb-inset` on `<html>`                           |
| `src/style.css`                                                                   | Keyboard-aware body / app min-height; horizontal clip; fixed AppBar override       |
| `src/components/StickyFooter.vue`                                                 | Fixed footer using `bottom: var(--kb-inset, 0px)`; mobile bottom-nav layout        |
| `src/views/PrivateChatPage.vue`                                                   | Document-scrolling chat with an in-flow auto-growing composer                      |
| `src/views/NewImpressionPage.vue`                                                 | Document-scrolling wizard; prompt textarea reveals itself on focus                 |
| `src/views/PhotoCapturePage.vue`, `CropImagePage.vue`, `RenovationDetailPage.vue` | Document-scrolling page-layout columns                                             |
