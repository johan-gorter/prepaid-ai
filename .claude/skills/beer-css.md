# Beer CSS — Component Reference for Prepaid AI

This skill documents beer-css (Material Design 3) patterns used in this project.
Use these patterns when creating or modifying Vue components.

## Setup

Beer CSS is imported globally in `src/main.ts`:

```ts
import "beercss";
import "material-dynamic-colors";
```

Material Icons are loaded via CDN in `index.html`:

```html
<link href="https://fonts.googleapis.com/icon?family=Material+Icons|Material+Icons+Outlined" rel="stylesheet" />
```

## Core Principles

- **Elements** are HTML tags (`<button>`, `<nav>`, `<article>`, `<dialog>`, `<progress>`, `<menu>`)
- **Helpers** are CSS classes added to elements (`class="circle primary small-round"`)
- One element per tag — do NOT combine element classes (e.g. no `class="button card"`)
- Icons use `<i>icon_name</i>` with Material Icons names

## Layout Structure

```html
<header class="fixed primary">
  <nav>
    <button class="transparent circle"><i>arrow_back</i></button>
    <h5 class="max">Page Title</h5>
    <button class="transparent circle"><i>more_vert</i></button>
  </nav>
</header>

<main class="responsive">
  <!-- Page content here -->
</main>

<footer class="fixed">
  <nav>
    <!-- Bottom bar buttons -->
  </nav>
</footer>
```

- `fixed` on header/footer = sticky (stays visible on scroll)
- `responsive` on main = centered with max-width
- `max` on an element = flex-grow to fill space
- Add `padding-top: 4.5rem` to main when using fixed header
- Add `padding-bottom: 5rem` to main when using fixed footer

## Buttons

```html
<!-- Filled (default) -->
<button>Label</button>
<button><i>icon</i><span>Label</span></button>

<!-- Outlined -->
<button class="border">Label</button>

<!-- Text / transparent -->
<button class="transparent">Label</button>

<!-- Icon button -->
<button class="transparent circle"><i>settings</i></button>

<!-- FAB (floating action button) -->
<button class="circle extra"><i>add</i></button>

<!-- Extended FAB -->
<button class="extend circle"><i>add</i><span>Create</span></button>

<!-- Error/danger button -->
<button class="error">Delete</button>

<!-- Disabled -->
<button :disabled="true">Disabled</button>

<!-- Full width -->
<button class="responsive">Full Width</button>

<!-- Small rounded -->
<button class="small-round">Rounded</button>
```

## Cards

```html
<article class="round small-elevate">
  <h5>Title</h5>
  <p>Description text</p>
  <nav>
    <button>Action 1</button>
    <button>Action 2</button>
  </nav>
</article>

<!-- Image card (no padding) -->
<article class="round no-padding small-elevate">
  <img src="..." class="responsive" />
  <div class="padding">
    <p>Caption</p>
  </div>
</article>
```

## Dialogs / Popups

```html
<!-- Toggle with :class="{ active: showDialog }" -->
<dialog :class="{ active: showDialog }">
  <h5>Dialog Title</h5>
  <p>Dialog content goes here.</p>
  <nav>
    <button class="border" @click="showDialog = false">Cancel</button>
    <button @click="handleConfirm">Confirm</button>
  </nav>
</dialog>
```

## Menus / Dropdowns

```html
<div style="position: relative;">
  <button class="transparent circle" @click="showMenu = !showMenu">
    <i>more_vert</i>
  </button>
  <menu :class="{ active: showMenu }" class="right no-wrap">
    <li><a @click="action1"><i>edit</i><span>Edit</span></a></li>
    <li><a @click="action2"><i>delete</i><span>Delete</span></a></li>
    <li class="divider"></li>
    <li><a @click="action3"><i>info</i><span>About</span></a></li>
  </menu>
</div>
```

## Form Fields

```html
<!-- Text input with floating label -->
<div class="field label border round">
  <input type="text" placeholder=" " />
  <label>Label text</label>
</div>

<!-- Textarea with floating label -->
<div class="field textarea label border round">
  <textarea rows="4" placeholder=" "></textarea>
  <label>Label text</label>
</div>

<!-- Input with icon prefix -->
<div class="field label prefix border">
  <i>search</i>
  <input type="text" placeholder=" " />
  <label>Search</label>
</div>
```

## Navigation

```html
<!-- Top app bar (sticky) -->
<header class="fixed primary">
  <nav>
    <button class="transparent circle"><i>menu</i></button>
    <h5 class="max">Title</h5>
  </nav>
</header>

<!-- Bottom navigation bar -->
<nav class="bottom">
  <a><i>home</i><div>Home</div></a>
  <a><i>search</i><div>Search</div></a>
  <a><i>settings</i><div>Settings</div></a>
</nav>
```

## Progress / Loading

```html
<!-- Circular spinner (indeterminate) -->
<progress class="circle"></progress>

<!-- Linear progress bar -->
<progress></progress>

<!-- With value -->
<progress value="50" max="100"></progress>
```

## Snackbar / Toast

```html
<div class="snackbar" :class="{ active: showSnackbar }">
  <i>info</i>
  <span>Message text here</span>
</div>
```

## Overlay (full-screen loading)

```html
<div class="overlay center-align middle-align" :class="{ active: showOverlay }">
  <progress class="circle"></progress>
</div>
```

## Grid System

```html
<div class="grid">
  <div class="s12 m6 l4">Column 1</div>
  <div class="s12 m6 l4">Column 2</div>
  <div class="s12 m6 l4">Column 3</div>
</div>
```

- `s1`–`s12`: small screens (mobile)
- `m1`–`m12`: medium screens (tablet)
- `l1`–`l12`: large screens (desktop)

## Common Helper Classes

| Category     | Classes                                                            |
| ------------ | ------------------------------------------------------------------ |
| **Shape**    | `round`, `small-round`, `medium-round`, `large-round`, `circle`    |
| **Elevation**| `elevate`, `small-elevate`, `medium-elevate`, `large-elevate`      |
| **Padding**  | `padding`, `no-padding`, `small-padding`, `medium-padding`, `large-padding` |
| **Margin**   | `margin`, `no-margin`, `small-margin`, `medium-margin`             |
| **Spacing**  | `space`, `small-space`, `medium-space`, `large-space`              |
| **Align**    | `center-align`, `left-align`, `right-align`, `middle-align`       |
| **Size**     | `tiny`, `small`, `medium`, `large`, `extra`, `max`, `responsive`  |
| **Color**    | `primary`, `secondary`, `tertiary`, `error`, `surface`             |
| **Color bg** | `primary-container`, `secondary-container`, `amber-container`      |
| **Border**   | `border`, `no-border`                                              |
| **Text**     | `bold`, `small-text`, `medium-text`, `large-text`                  |
| **Display**  | `responsive` (auto-hide label on small screens)                    |
| **Theme**    | `light`, `dark` (on `<body>`)                                      |

## Divider

```html
<div class="divider"></div>
```

## Chips

```html
<span class="chip">Label</span>
<span class="chip small">Small chip</span>
```

## Project Conventions

- All pages use `<header class="fixed primary">` for the sticky app bar
- Fixed footers use `<footer class="fixed">` with `<nav>` inside
- Dialogs are toggled via Vue reactive `showDialog` + `:class="{ active: showDialog }"`
- Menus are toggled via Vue reactive `showMenu` + `:class="{ active: showMenu }"`
- No scoped styles needed for basic beer-css usage — only add `<style scoped>` for custom canvas or position overrides
- Use Material Icons names in `<i>` tags (e.g., `arrow_back`, `delete`, `star`, `add`)
