<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AppBar from "../../components/AppBar.vue";
import ImageCropper from "../../components/ImageCropper.vue";
import StickyFooter from "../../components/StickyFooter.vue";
import {
  clearImpressionDraft,
  clearImpressionMask,
  clearUncroppedSource,
  getUncroppedSource,
  setImpressionSource,
} from "../../composables/useImpressionStore";

const { t } = useI18n();
const router = useRouter();

const cropperRef = ref<InstanceType<typeof ImageCropper> | null>(null);
const sourceBlob = ref<Blob | null>(null);
const errorMessage = ref<string | null>(null);

onMounted(async () => {
  const blob = await getUncroppedSource();
  if (!blob) {
    errorMessage.value = t("crop.noImage");
    return;
  }
  sourceBlob.value = blob;
});

async function handleConfirm() {
  const cropper = cropperRef.value;
  if (!cropper) return;
  const blob = await cropper.getBlob();
  await setImpressionSource(blob);
  await Promise.all([
    clearUncroppedSource(),
    clearImpressionMask(),
    clearImpressionDraft(),
  ]);
  router.push("/new-impression?source=crop");
}

async function handleCancel() {
  await clearUncroppedSource();
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
        <i aria-hidden="true" style="font-size: 3rem">image_not_supported</i>
        <p>{{ errorMessage }}</p>
        <button class="small-round" @click="handleCancel">
          <i aria-hidden="true">arrow_back</i>
          <span>{{ $t("common.back") }}</span>
        </button>
      </div>
      <template v-else>
        <h5 class="center-align no-margin">{{ $t("crop.title") }}</h5>
        <p class="center-align small-text">
          {{ $t("crop.dragHint") }}
        </p>
        <ImageCropper
          v-if="sourceBlob"
          ref="cropperRef"
          :source="sourceBlob"
          :zoom-in-label="$t('crop.zoomIn')"
          :zoom-out-label="$t('crop.zoomOut')"
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
        :disabled="!sourceBlob"
        @click="handleConfirm"
      >
        <i aria-hidden="true">check</i>
        <span>{{ $t("crop.useImage") }}</span>
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
