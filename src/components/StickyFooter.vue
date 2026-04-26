<template>
  <footer class="fixed">
    <nav class="footer-nav">
      <slot />
    </nav>
  </footer>
</template>

<style scoped>
.footer-nav {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

/* Below Beer CSS's small→medium breakpoint (600px), switch to bottom-nav layout:
   icon stacked above label, children distributed evenly across full width.
   Slot content only needs <i>icon</i><span>Label</span> inside each button/a. */
@media (max-width: 599px) {
  .footer-nav {
    max-width: 100%;
    padding: 0;
    gap: 0;
  }

  .footer-nav :deep(button),
  .footer-nav :deep(a) {
    flex: 1 1 0;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 3.5rem;
    border-radius: 0;
    padding: 0.25rem 0.25rem 0.5rem;
    gap: 0.125rem;
    background: transparent !important;
    box-shadow: none !important;
    border: none !important;
  }

  .footer-nav :deep(button i),
  .footer-nav :deep(a i) {
    font-size: 1.5rem;
    margin: 0;
    line-height: 1;
  }

  .footer-nav :deep(button span),
  .footer-nav :deep(a span),
  .footer-nav :deep(a div) {
    font-size: 0.6875rem;
    line-height: 1;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* Spacer elements serve desktop layout only */
  .footer-nav :deep(.small-space),
  .footer-nav :deep(.medium-space),
  .footer-nav :deep(.large-space) {
    display: none;
  }
}
</style>
