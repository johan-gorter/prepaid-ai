<script setup lang="ts">
import { ref } from "vue";
import LanguageDialog from "./LanguageDialog.vue";

const showDialog = ref(false);
</script>

<template>
  <div style="flex-shrink: 0">
    <button
      class="transparent circle"
      :aria-label="$t('language.label')"
      data-testid="language-switcher"
      @click="showDialog = true"
    >
      <i>translate</i>
    </button>
    <LanguageDialog :open="showDialog" @close="showDialog = false" />
  </div>
</template>
