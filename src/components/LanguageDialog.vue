<script setup lang="ts">
import { useLocale } from "../composables/useLocale";
import { LOCALE_LABELS, type AppLocale } from "../i18n";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { locale, setLocale, supportedLocales } = useLocale();

function choose(loc: AppLocale) {
  setLocale(loc);
  emit("close");
}
</script>

<template>
  <dialog :class="{ active: open }" data-testid="language-dialog">
    <h5>{{ $t("language.label") }}</h5>
    <nav class="vertical">
      <button
        v-for="loc in supportedLocales"
        :key="loc"
        class="border small-round"
        :class="{ 'fill primary': loc === locale }"
        :data-testid="`language-option-${loc}`"
        @click="choose(loc)"
      >
        <i>{{ loc === locale ? "check" : "translate" }}</i>
        <span>{{ LOCALE_LABELS[loc] }}</span>
      </button>
    </nav>
    <nav class="right-align">
      <button class="transparent" @click="emit('close')">
        {{ $t("common.cancel") }}
      </button>
    </nav>
  </dialog>
</template>
