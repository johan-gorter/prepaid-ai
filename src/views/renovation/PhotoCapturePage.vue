<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AppBar from "../../components/AppBar.vue";
import CameraCapture from "../../components/CameraCapture.vue";
import StickyFooter from "../../components/StickyFooter.vue";
import {
  clearImpressionDraft,
  clearImpressionMask,
  setImpressionSource,
} from "../../composables/useImpressionStore";

const { t } = useI18n();
const router = useRouter();

const cameraRef = ref<InstanceType<typeof CameraCapture> | null>(null);
const cameraReady = ref(false);
const errorMessage = ref<string | null>(null);

async function onCapture(blob: Blob) {
  await setImpressionSource(blob);
  await Promise.all([clearImpressionMask(), clearImpressionDraft()]);
  router.push("/new-impression?source=photo");
}

function handleCancel() {
  router.push("/renovations");
}
</script>

<template>
  <div class="page-layout">
    <AppBar />

    <main
      class="responsive"
      style="
        max-width: 800px;
        margin: 0 auto;
        padding-top: var(--app-bar-clearance);
        padding-bottom: 5rem;
      "
    >
      <div v-if="errorMessage" class="error-panel center-align">
        <i aria-hidden="true" style="font-size: 3rem">no_photography</i>
        <p>{{ errorMessage }}</p>
      </div>
      <template v-else>
        <h5 class="center-align no-margin">{{ $t("photoCapture.title") }}</h5>
        <p class="center-align small-text">
          {{ $t("photoCapture.positionHint") }}
        </p>
        <CameraCapture
          ref="cameraRef"
          @capture="onCapture"
          @ready="cameraReady = $event"
          @error="errorMessage = t('photoCapture.cameraError')"
        />
      </template>
    </main>

    <StickyFooter v-if="!errorMessage">
      <button class="max border small-round" @click="handleCancel">
        <i aria-hidden="true">close</i>
        <span>{{ $t("common.cancel") }}</span>
      </button>
      <div class="small-space"></div>
      <button
        class="max small-round"
        :disabled="!cameraReady"
        @click="cameraRef?.capture()"
        :aria-label="$t('photoCapture.capturePhotoAria')"
      >
        <i aria-hidden="true">camera</i>
        <span>{{ $t("photoCapture.capture") }}</span>
      </button>
    </StickyFooter>
  </div>
</template>

<style scoped>
.page-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

.error-panel {
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
</style>
