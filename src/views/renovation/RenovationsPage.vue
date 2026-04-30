<script setup lang="ts">
import { doc, getDoc } from "firebase/firestore";
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppBar from "../../components/AppBar.vue";
import NewRenovationCard from "../../components/NewRenovationCard.vue";
import StorageImage from "../../components/StorageImage.vue";
import { useAuth } from "../../composables/useAuth";
import { updateLastActivity } from "../../composables/useLastActivity";
import { useRenovations } from "../../composables/useRenovations";
import { resolveStorageUrl } from "../../composables/useStorageUrl";
import { db } from "../../firebase";

const { renovations, loading: renovationsLoading, error } = useRenovations();
const { currentUser } = useAuth();
const router = useRouter();
const cardDataUrls = ref<Record<string, string>>({});

onMounted(() => {
  localStorage.setItem("payasyougo-last-page", "renovations");
  updateLastActivity();
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
  <AppBar title="Renovations" />

  <main
    class="responsive"
    style="max-width: 800px; margin: 0 auto; padding-top: 4.5rem"
  >
    <nav>
      <h1 class="max">My Renovations</h1>
    </nav>

    <div v-if="renovationsLoading" class="center-align medium-padding">
      <progress class="circle"></progress>
      <p>Loading renovations...</p>
    </div>

    <div v-else-if="error" class="center-align medium-padding">
      <p class="error-text">Error loading renovations: {{ error }}</p>
    </div>

    <div v-else class="card-grid">
      <div>
        <NewRenovationCard />
      </div>
      <div v-if="!currentUser">
        <router-link
          :to="{ path: '/login', query: { redirect: '/renovations' } }"
          class="button responsive small-round guest-renovations-cta"
          data-testid="renovations-sign-in"
        >
          <i aria-hidden="true">login</i>
          <span>Log in to see your renovations</span>
        </router-link>
      </div>
      <div v-for="renovation in renovations" :key="renovation.id">
        <article
          class="round no-padding small-elevate"
          style="cursor: pointer"
          data-testid="renovation-card"
          @click="router.push(`/renovation/${renovation.id}`)"
        >
          <StorageImage
            :src="cardDataUrls[renovation.id]"
            alt="Renovation"
            data-testid="renovation-thumbnail"
          />
        </article>
      </div>
    </div>
  </main>
</template>

<style scoped>
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.card-grid > div {
  max-width: 512px;
}

.card-grid article {
  min-height: 300px;
  text-align: center;
}

.guest-renovations-cta {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  white-space: normal;
}
</style>
