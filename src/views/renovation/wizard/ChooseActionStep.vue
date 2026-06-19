<script setup lang="ts">
/**
 * Choose-action stage (#86): the deliberate price-reveal moment.
 *
 * The masked photo is rendered by the parent (NewImpressionPage) above this
 * component, so the user can see the area they just marked while choosing what
 * to do with it. This component contributes, top to bottom:
 *   - a sober guidance note (AI fallibility + the remedy: work in small steps),
 *   - the step question heading ("What should happen?"),
 *   - the Remove / Change-color / Other menu with each option's credit price
 *     right-aligned,
 *   - a small price anchor ("1 🪙 = $0.01"),
 *   - a normal Back button below the anchor (no sticky footer on this screen).
 *
 * Prices come straight from ACTION_CREDITS (the client copy of the canonical
 * pricing table) so the reveal can never drift from what the user is charged.
 */
import { ACTION_CREDITS } from "../../../credits";

defineEmits<{
  remove: [];
  paint: [];
  other: [];
  back: [];
}>();
</script>

<template>
  <p class="choose-action-guidance" data-testid="choose-guidance">
    {{ $t("newImpression.chooseGuidance") }}
  </p>

  <h2 class="choose-action-heading" data-testid="choose-heading">
    {{ $t("newImpression.titleChoose") }}
  </h2>

  <div class="choose-action-menu" data-testid="choose-action">
    <button
      class="border small-round choose-action-button"
      data-testid="choose-remove"
      @click="$emit('remove')"
    >
      <i aria-hidden="true">delete_sweep</i>
      <span class="max choose-action-text">
        <span class="choose-action-label">{{
          $t("newImpression.chooseRemove")
        }}</span>
        <span class="choose-action-subtitle">{{
          $t("newImpression.chooseRemoveSubtitle")
        }}</span>
      </span>
      <span class="choose-action-cost">{{
        $t("newImpression.chooseCost", { credits: ACTION_CREDITS.remove })
      }}</span>
    </button>

    <button
      class="border small-round choose-action-button"
      data-testid="choose-paint"
      @click="$emit('paint')"
    >
      <i aria-hidden="true">format_paint</i>
      <span class="max choose-action-text">
        <span class="choose-action-label">{{
          $t("newImpression.choosePaint")
        }}</span>
      </span>
      <span class="choose-action-cost">{{
        $t("newImpression.chooseCost", { credits: ACTION_CREDITS.colorChange })
      }}</span>
    </button>

    <button
      class="border small-round choose-action-button"
      data-testid="choose-other"
      @click="$emit('other')"
    >
      <i aria-hidden="true">chat_bubble</i>
      <span class="max choose-action-text">
        <span class="choose-action-label">{{
          $t("newImpression.chooseOther")
        }}</span>
        <span class="choose-action-subtitle">{{
          $t("newImpression.chooseOtherSubtitle")
        }}</span>
      </span>
      <span class="choose-action-cost">{{
        $t("newImpression.chooseCost", { credits: ACTION_CREDITS.freePrompt })
      }}</span>
    </button>
  </div>

  <p class="choose-action-anchor" data-testid="choose-price-anchor">
    {{ $t("newImpression.choosePriceAnchor") }}
  </p>

  <!-- Back is a normal button here, below the price anchor — not a sticky
       footer (#124). Styled like the option buttons above it. -->
  <div class="choose-action-back">
    <button
      class="border small-round choose-action-button choose-action-back-button"
      data-testid="choose-back"
      @click="$emit('back')"
    >
      <i aria-hidden="true">arrow_back</i>
      <span class="choose-action-label">{{ $t("newImpression.back") }}</span>
    </button>
  </div>
</template>

<style scoped>
.choose-action-guidance {
  max-width: 544px;
  margin: 0.5rem auto 0;
  padding: 0 1rem;
  text-align: center;
  font-size: 0.875rem;
  opacity: 0.7;
  box-sizing: border-box;
}

.choose-action-heading {
  max-width: 544px;
  margin: 0.75rem auto 0;
  padding: 0 1rem;
  text-align: center;
  font-size: 1.125rem;
  font-weight: 600;
  box-sizing: border-box;
}

.choose-action-menu {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 544px;
  margin: 0.5rem auto 0;
  padding: 0 1rem;
  box-sizing: border-box;
}

/* Beer CSS buttons default to `box-sizing: content-box`, so `width: 100%` +
   padding overflows the parent on narrow viewports. Force border-box here so
   the rows fit within the menu's content area on mobile. Label sits left,
   price right (the menu layout from #86). */
.choose-action-button {
  width: 100%;
  padding: 0.625rem 1rem;
  justify-content: flex-start;
  text-align: left;
  box-sizing: border-box;
  min-width: 0;
  height: auto;
}

/* Grow to fill the row so the cost is pushed to the right edge. The Beer CSS
   `.max` helper on this span doesn't reliably flex-grow inside a button, so we
   set it explicitly. min-width:0 lets a long subtitle wrap instead of shoving
   the right-aligned cost off-screen at 320 px. */
.choose-action-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1 1 auto;
  min-width: 0;
}

.choose-action-label {
  text-transform: none;
}

.choose-action-subtitle {
  font-size: 0.75rem;
  opacity: 0.7;
  text-transform: none;
}

/* margin-left:auto pins the cost flush to the button's right edge regardless of
   how wide the label/subtitle column ends up; padding-left keeps a minimum gap
   from a long subtitle. */
.choose-action-cost {
  margin-left: auto;
  padding-left: 0.5rem;
  font-weight: 600;
  white-space: nowrap;
}

.choose-action-anchor {
  max-width: 544px;
  margin: 0.5rem auto 0;
  padding: 0 1rem;
  text-align: center;
  font-size: 0.75rem;
  opacity: 0.6;
  box-sizing: border-box;
}

.choose-action-back {
  display: flex;
  max-width: 544px;
  margin: 0.75rem auto 0;
  padding: 0 1rem;
  box-sizing: border-box;
}

/* Match the option buttons above, but center the icon+label since there's no
   trailing cost to push around. */
.choose-action-back-button {
  justify-content: center;
}
</style>
