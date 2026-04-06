# Testing Best Practices

This document describes the selector strategy and test patterns used in this codebase.
Follow these rules when writing new E2E tests (`e2e/specs/`) or component tests (`ct/`).

## Selector Priority Order

Use selectors in this order. Stop at the first that works.

### 1. `data-testid` (preferred for stable identity)

Use `page.getByTestId("name")` for elements that have no semantic role or when
a stable identity separate from the visual design is needed.

```ts
// Good
await page.getByTestId("camera-input").setInputFiles(grayPngPath);
await page.getByTestId("prompt").fill("add a fireplace");
await page.getByTestId("new-renovation-card").click();
```

Add `data-testid` to any element that tests need to target reliably. Name it
after what the element *is*, not what it looks like.

### 2. ARIA roles and accessible names

Use `page.getByRole()` for interactive elements (buttons, links, headings,
dialogs). This is the closest to how assistive technology—and users—identify
elements.

```ts
// Good
await page.getByRole("button", { name: "Generate" }).click();
await page.getByRole("button", { name: "← Back" }).click();
await page.getByRole("heading", { name: "Renovation Details" }).toBeVisible();
await page.getByRole("link", { name: "Delete" }).click();

// Use exact: true when the accessible name must match exactly
await page.getByRole("button", { name: "Back", exact: true }).click();
```

Buttons get their accessible name from:
- `aria-label` attribute (explicit label, takes precedence)
- Text content of child elements that are not `aria-hidden`

When adding a button whose visible text would be ambiguous or too long, use
`aria-label` to give it a concise, stable name:

```html
<!-- Good: aria-label provides the accessible name -->
<button aria-label="Renovation Details" @click="handleTimeline">
  <i aria-hidden="true">timeline</i>
  <span>Details</span>
</button>
```

### 3. ARIA labels and other semantic queries

```ts
// Input associated with a <label>
await page.getByLabel("Title").fill("My Room");

// Image alt text
await expect(page.getByAltText("Result")).toBeVisible();
await expect(page.getByAltText("Original")).toBeVisible();

// Visible text (last resort for non-interactive content)
await expect(page.getByText("Paint the area you want to change")).toBeVisible();
```

## What NOT to use

### CSS selectors — never

CSS selectors couple tests to implementation details (class names, element
types, DOM structure). When any of those change for non-functional reasons,
tests break.

```ts
// BAD — CSS selector
const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles(grayPngPath);

// BAD — CSS class selector
await page.locator(".renovation-card").click();

// BAD — DOM path
await page.locator("footer > nav > button:nth-child(2)").click();
```

Add a `data-testid` instead and use `getByTestId`.

### Text matching for interactive elements

`getByText` is fine for asserting that content is visible, but don't use it to
click buttons or links — use `getByRole` with the accessible name.

```ts
// BAD — text matching to trigger action
await page.getByText("Sign out").click();

// GOOD — role + name
await page.getByRole("menuitem", { name: "Sign out" }).click();
// or, if "Sign out" is the only link/button with that text:
await page.getByRole("link", { name: "Sign out" }).click();
```

## Adding test IDs to components

When writing a component that tests will interact with, add `data-testid` to:

- Form inputs that don't have an associated `<label>` or whose label may change
- Cards, list items, or containers that tests reference by identity
- Hidden inputs (like file inputs) that tests set files on
- Buttons or menus whose visible label is an icon or a short word shared by
  multiple elements

```html
<!-- File input with no label -->
<input
  ref="cameraInput"
  data-testid="camera-input"
  type="file"
  accept="image/*"
  capture="environment"
  hidden
  @change="onCameraSelected"
/>

<!-- Prompt textarea associated via label — data-testid is a bonus for tests -->
<textarea
  id="prompt-input"
  data-testid="prompt"
  v-model="prompt"
></textarea>
<label for="prompt-input">What should change in the red area?</label>
```

Use `aria-label` on buttons and controls to provide a stable, human-readable
accessible name that tests can use with `getByRole`:

```html
<!-- aria-label names the button; the visible span can be shortened or
     translated without breaking any test -->
<button aria-label="Next Change" @click="handleNextChange">
  <i aria-hidden="true">edit</i>
  <span>Next</span>
</button>
```

## Driving hidden file inputs in tests

Native OS file-picker dialogs cannot be controlled by Playwright. When a button
triggers a file picker (`input.click()`), the test cannot interact with the
resulting dialog.

**Use `setInputFiles` directly on the `data-testid` input instead.**

```ts
// BAD — clicks the button, which opens a native file picker Playwright cannot use
await page.getByRole("button", { name: "Take Photo" }).click();
await page.waitForURL("/renovation/new"); // will time out

// GOOD — set the file directly on the hidden input
await page.getByTestId("camera-input").setInputFiles(grayPngPath);
await page.waitForURL("/renovation/new?source=cropped");
```

This simulates the same browser event (`change`) that the real picker fires,
without any OS dialog involvement.

## Wait strategies

Prefer semantic waits over arbitrary delays.

```ts
// Wait for navigation
await page.waitForURL("/renovation/new?source=cropped");
await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

// Wait for element visibility
await expect(page.getByText("Paint the area you want to change")).toBeVisible();
await expect(page.getByAltText("Result")).toBeVisible({ timeout: 30000 });

// Never use
await page.waitForTimeout(2000); // arbitrary sleep — flaky
```

The global `expect` timeout is set to 10 seconds in `playwright.config.ts`.
Pass an explicit `{ timeout }` only for operations that are legitimately slow
(Cloud Function processing, file uploads).

## Test file conventions

- E2E tests: `e2e/specs/*.spec.ts`
- Component tests: `ct/*.ct.ts`
- Use `authenticatedPage` fixture for tests that need a signed-in user
- Use standard `page` from `@playwright/test` for unauthenticated tests
- Clean up temp files with a `try/finally` block
- Use `createGrayPng()` / `fillNewRenovationForm()` / `createRenovationAndWaitForResult()`
  from `e2e/helpers/renovation.ts` rather than duplicating setup logic
