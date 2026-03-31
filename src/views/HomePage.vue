<script setup lang="ts">
import { doc, getDoc } from "firebase/firestore";
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import StorageImage from "../components/StorageImage.vue";
import { useAuth } from "../composables/useAuth";
import { useRenovations } from "../composables/useRenovations";
import { resolveStorageUrl } from "../composables/useStorageUrl";
import { db } from "../firebase";

const { renovations, loading: renovationsLoading, error } = useRenovations();
const { currentUser, signOut } = useAuth();
const router = useRouter();
const cardDataUrls = ref<Record<string, string>>({});

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
    return canvas.toDataURL();
  }

  const theta = (15 * Math.PI) / 180;
  // Compute x-intercept so left polygon is ~30% of area
  // Line goes vertically: x = tanTheta*(size-y) + b
  // At y=0 (top): x = tanTheta*size + b
  // At y=size (bottom): x = b
  // Area of left trapezoid = size * (top_width + bottom_width) / 2
  //   = size * (tanTheta*size + b + b) / 2 = size*b + 0.5*tanTheta*size^2
  // Set = 0.3*size^2: b = size*(0.3 - 0.5*tanTheta)
  const tanTheta = Math.tan(theta);
  const b = size * (0.3 - 0.5 * tanTheta);
  const xTop = tanTheta * size + b; // where line meets top edge
  const xBot = b; // where line meets bottom edge

  // Clip region for "before" (left polygon)
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

  // Clip region for "after" (right polygon)
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

  // Draw the dividing line
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(xTop, 0);
  ctx.lineTo(xBot, size);
  ctx.stroke();

  return canvas.toDataURL();
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
            // Fetch after impression's resultImagePath
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
          // Fallback: try to show just the before image
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

async function handleSignOut() {
  await signOut();
  router.push("/login");
}
</script>

<template>
  <div class="home-page">
    <header class="app-header">
      <h1>Prepaid AI</h1>
      <div class="user-info" v-if="currentUser">
        <img
          v-if="currentUser.photoURL"
          :src="currentUser.photoURL"
          :alt="currentUser.displayName ?? 'User'"
          class="avatar"
        />
        <span class="user-name">{{ currentUser.displayName }}</span>
        <button class="btn-text" @click="handleSignOut">Sign out</button>
      </div>
    </header>

    <main class="content">
      <div class="section-header">
        <h2>My Renovations</h2>
        <router-link to="/renovation/new" class="btn-primary">
          + New Renovation
        </router-link>
      </div>

      <div v-if="renovationsLoading" class="state-message">
        <p>Loading renovations...</p>
      </div>

      <div v-else-if="error" class="state-message error">
        <p>Error loading renovations: {{ error }}</p>
      </div>

      <div v-else-if="renovations.length === 0" class="empty-state">
        <div class="empty-icon">📷</div>
        <h3>No renovations yet</h3>
        <p>Take or upload a photo of your space and let AI reimagine it.</p>
        <router-link to="/renovation/new" class="btn-primary">
          Start your first renovation
        </router-link>
      </div>

      <div v-else class="renovation-grid">
        <div
          v-for="renovation in renovations"
          :key="renovation.id"
          class="renovation-card"
          @click="router.push(`/renovation/${renovation.id}`)"
        >
          <StorageImage :src="cardDataUrls[renovation.id]" alt="Renovation" />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f8f9fa;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: #1a1a2e;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.app-header h1 {
  font-size: 1.25rem;
  margin: 0;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
}

.user-name {
  font-size: 0.9rem;
}

.btn-text {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 0.85rem;
  text-decoration: underline;
}

.btn-text:hover {
  color: #fff;
}

.content {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.section-header h2 {
  margin: 0;
  color: #1a1a2e;
}

.btn-primary {
  display: inline-block;
  background: #0f3460;
  color: #fff;
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background: #1a1a2e;
}

.state-message {
  text-align: center;
  padding: 3rem 1rem;
  color: #666;
}

.state-message.error {
  color: #c0392b;
}

.empty-state {
  text-align: center;
  padding: 4rem 1rem;
  background: #fff;
  border-radius: 1rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: #1a1a2e;
}

.empty-state p {
  color: #666;
  margin-bottom: 1.5rem;
}

.renovation-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}

.renovation-card {
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.renovation-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.renovation-thumbnail {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  display: block;
}
</style>
