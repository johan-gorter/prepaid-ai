<script setup lang="ts">
import { doc, getDoc } from "firebase/firestore";
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppBar from "../../components/AppBar.vue";
import NewRenovationCard from "../../components/NewRenovationCard.vue";
import StorageImage from "../../components/StorageImage.vue";
import { useAuth } from "../../composables/useAuth";
import { idbSet } from "../../composables/useIdbStorage";
import { updateLastActivity } from "../../composables/useLastActivity";
import { useRenovations } from "../../composables/useRenovations";
import { resolveStorageUrl } from "../../composables/useStorageUrl";
import { db } from "../../firebase";

const { renovations, loading: renovationsLoading, error } = useRenovations();
const { currentUser } = useAuth();
const router = useRouter();
const cardDataUrls = ref<Record<string, string>>({});

onMounted(() => {
  void idbSet("lastPage", "renovations");
  void updateLastActivity();
});

/**
 * Draw a diagonal before/after composite on a canvas.
 * 15-degree line divides: upper-left 30%, lower-right 70%.
 */
function drawBeforeAfterComposite(
  beforeImg: HTMLImageElement,
  afterImg: HTMLImageElement | null,
  size: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  if (!afterImg) {
    // No after image, show only before
    ctx.drawImage(beforeImg, 0, 0, size, size);
    return canvas.toDataURL("image/webp");
  }

  const theta = (15 * Math.PI) / 180;
  const tanTheta = Math.tan(theta);
  const b = size * (0.3 - 0.5 * tanTheta);
  const xTop = tanTheta * size + b; // where line meets top edge
  const xBot = b; // where line meets bottom edge

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(xTop, 0);
  ctx.lineTo(xBot, size);
  ctx.lineTo(0, size);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(beforeImg, 0, 0, size, size);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(xTop, 0);
  ctx.lineTo(size, 0);
  ctx.lineTo(size, size);
  ctx.lineTo(xBot, size);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(afterImg, 0, 0, size, size);
  ctx.restore();

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(xTop, 0);
  ctx.lineTo(xBot, size);
  ctx.stroke();

  return canvas.toDataURL("image/webp");
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

watch(
  renovations,
  async (items, _oldValue, onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    const uid = currentUser.value?.uid;
    if (!uid) return;

    const entries = await Promise.all(
      items.map(async (renovation) => {
        try {
          // Resolve before image
          const beforeUrl = await resolveStorageUrl(
            renovation.originalImagePath,
          );
          const beforeImg = await loadImage(beforeUrl);

          let afterImg: HTMLImageElement | null = null;
          if (renovation.afterImpressionId) {
            const impDoc = await getDoc(
              doc(
                db,
                "users",
                uid,
                "renovations",
                renovation.id,
                "impressions",
                renovation.afterImpressionId,
              ),
            );
            if (impDoc.exists()) {
              const resultPath = impDoc.data().resultImagePath as
                | string
                | undefined;
              if (resultPath) {
                const afterUrl = await resolveStorageUrl(resultPath);
                afterImg = await loadImage(afterUrl);
              }
            }
          }

          const dataUrl = drawBeforeAfterComposite(beforeImg, afterImg, 400);
          return [renovation.id, dataUrl] as const;
        } catch {
          try {
            const beforeUrl = await resolveStorageUrl(
              renovation.originalImagePath,
            );
            return [renovation.id, beforeUrl] as const;
          } catch {
            return [renovation.id, renovation.originalImageUrl ?? ""] as const;
          }
        }
      }),
    );

    if (!cancelled) {
      cardDataUrls.value = Object.fromEntries(
        entries.filter(([, url]) => Boolean(url)),
      );
    }
  },
  { immediate: true },
);
</script>

<template>
  <AppBar />

  <main
    class="responsive"
    style="
      max-width: 800px;
      margin: 0 auto;
      padding: var(--app-bar-clearance) 0 0;
    "
  >
    <!-- Match the 0.5rem horizontal inset used by NewRenovationCard -->
    <h4 style="padding: 0 0.5rem">{{ $t("renovations.title") }}</h4>

    <NewRenovationCard />

    <nav v-if="!currentUser" class="guest-renovations-auth">
      <router-link
        :to="{ path: '/login', query: { redirect: '/renovations' } }"
        class="transparent button small-round guest-renovations-link"
        data-testid="renovations-sign-in"
      >
        <i aria-hidden="true">login</i>
        <span>{{ $t("renovations.signInPrompt") }}</span>
      </router-link>
    </nav>

    <div v-if="renovationsLoading" class="center-align medium-padding">
      <progress class="circle"></progress>
      <p>{{ $t("renovations.loading") }}</p>
    </div>

    <div v-else-if="error" class="center-align medium-padding">
      <p class="error-text">{{ $t("renovations.errorLoading", { error }) }}</p>
    </div>

    <div v-else class="renovation-grid">
      <article
        v-for="renovation in renovations"
        :key="renovation.id"
        class="renovation-grid-item renovation-photo-item"
        data-testid="renovation-card"
        @click="router.push(`/renovation/${renovation.id}`)"
      >
        <StorageImage
          :src="cardDataUrls[renovation.id]"
          alt="Renovation"
          class="renovation-thumbnail"
          data-testid="renovation-thumbnail"
        />
      </article>
    </div>
  </main>
</template>

<style scoped>
.renovation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  align-items: start;
}

.renovation-grid-item {
  min-width: 0;
  margin: 0 !important;
  padding: 0 !important;
  border: 0;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.renovation-photo-item {
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: transparent !important;
  cursor: pointer;
  line-height: 0;
}

.renovation-thumbnail {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 0 !important;
  overflow: hidden;
}

:deep(.renovation-thumbnail img) {
  width: 100%;
  height: 100%;
  border-radius: 0 !important;
  cursor: pointer;
  object-fit: cover;
}

.guest-renovations-auth {
  justify-content: flex-start;
  margin: 0.5rem 0 1rem;
}

.guest-renovations-link {
  color: var(--primary);
}
</style>
