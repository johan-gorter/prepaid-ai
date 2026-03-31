<script setup lang="ts">
import { doc, getDoc } from "firebase/firestore";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import StorageImage from "../components/StorageImage.vue";
import { useAuth } from "../composables/useAuth";
import { useImpressions } from "../composables/useImpressions";
import { useRenovations } from "../composables/useRenovations";
import { db } from "../firebase";
import type { Renovation } from "../types";

const route = useRoute();
const router = useRouter();
const { currentUser } = useAuth();
const { setAfterImpression, deleteImpression, deleteRenovation } =
  useRenovations();

const renovationId = computed(() => route.params.id as string);
const renovationIdRef = ref(renovationId.value);
watch(renovationId, (val) => {
  renovationIdRef.value = val;
});

const { impressions, loading } = useImpressions(renovationIdRef);

const renovation = ref<Renovation | null>(null);
const scrollContainer = ref<HTMLElement | null>(null);

// Load renovation document
async function loadRenovation() {
  if (!currentUser.value) return;
  const uid = currentUser.value.uid;
  const renoDoc = await getDoc(
    doc(db, "users", uid, "renovations", renovationId.value),
  );
  if (renoDoc.exists()) {
    renovation.value = { id: renoDoc.id, ...renoDoc.data() } as Renovation;
  }
}

// Re-read renovation on impression changes + scroll
watch(
  impressions,
  async (_items, _oldValue, onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    // Re-read renovation to keep afterImpressionId in sync
    if (currentUser.value) {
      const renoDoc = await getDoc(
        doc(
          db,
          "users",
          currentUser.value.uid,
          "renovations",
          renovationId.value,
        ),
      );
      if (renoDoc.exists() && !cancelled) {
        renovation.value = { id: renoDoc.id, ...renoDoc.data() } as Renovation;
      }
    }

    if (!cancelled) {
      // Scroll to starred impression, or bottom if none starred
      await nextTick();
      if (scrollContainer.value) {
        const starred =
          scrollContainer.value.querySelector(".btn-star.starred");
        if (starred) {
          const item = starred.closest(".timeline-item");
          if (item) {
            (item as HTMLElement).scrollIntoView({ block: "center" });
          }
        } else {
          scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
        }
      }
    }
  },
  { immediate: true },
);

async function handleStar(impressionId: string) {
  await setAfterImpression(renovationId.value, impressionId);
  // Update local renovation object
  if (renovation.value) {
    renovation.value = { ...renovation.value, afterImpressionId: impressionId };
  }
}

async function handleDeleteImpression(impressionId: string) {
  await deleteImpression(renovationId.value, impressionId);
}

async function handleDeleteRenovation() {
  if (!confirm("Delete this renovation and all its impressions?")) return;
  await deleteRenovation(renovationId.value);
  router.push("/");
}

function navigateToNewImpression(source: string) {
  router.push(`/renovation/${renovationId.value}/new?source=${source}`);
}

onMounted(() => {
  loadRenovation();
});
</script>

<template>
  <div class="timeline-page">
    <header class="page-header">
      <button class="btn-back" @click="router.push('/')">← Back</button>
      <h1>Renovation Details</h1>
      <button
        class="btn-delete-renovation"
        @click="handleDeleteRenovation"
        title="Delete renovation"
      >
        🗑
      </button>
    </header>

    <main ref="scrollContainer" class="content">
      <div v-if="loading" class="state-message">
        <p>Loading...</p>
      </div>

      <div v-else class="timeline-list">
        <!-- Original "before" image (pinned first) -->
        <div
          v-if="renovation?.originalImagePath"
          class="timeline-item timeline-original"
          @click="navigateToNewImpression('before')"
        >
          <div class="image-container">
            <StorageImage
              :path="renovation.originalImagePath"
              :fallback-url="renovation.originalImageUrl"
              alt="Original"
              class="timeline-image"
            />
            <span class="image-label">Original</span>
          </div>
        </div>

        <!-- Impressions -->
        <div
          v-for="impression in impressions"
          :key="impression.id"
          class="timeline-item"
        >
          <div class="image-container">
            <!-- Completed: show result image -->
            <template
              v-if="
                impression.status === 'completed' &&
                (impression.resultImagePath || impression.resultImageUrl)
              "
            >
              <StorageImage
                :path="impression.resultImagePath"
                :fallback-url="impression.resultImageUrl"
                alt="Result"
                class="timeline-image clickable"
                @click="navigateToNewImpression(impression.id)"
              />
            </template>
            <!-- Processing -->
            <template v-else-if="impression.status === 'processing'">
              <div class="status-placeholder">
                <div class="spinner"></div>
                <p>Processing...</p>
              </div>
            </template>
            <!-- Failed -->
            <template v-else-if="impression.status === 'failed'">
              <div class="status-placeholder status-error">
                <p>Failed: {{ impression.error }}</p>
              </div>
            </template>
            <!-- Pending -->
            <template v-else>
              <div class="status-placeholder">
                <p>Pending...</p>
              </div>
            </template>

            <!-- Star toggle (top-right) -->
            <button
              v-if="impression.status === 'completed'"
              class="btn-star"
              :class="{
                starred: renovation?.afterImpressionId === impression.id,
              }"
              @click.stop="handleStar(impression.id)"
              title="Set as after image"
            >
              {{ renovation?.afterImpressionId === impression.id ? "★" : "☆" }}
            </button>

            <!-- Trash button (top-left) -->
            <button
              class="btn-trash"
              @click.stop="handleDeleteImpression(impression.id)"
              title="Delete impression"
            >
              🗑
            </button>
          </div>

          <p class="prompt-text">{{ impression.prompt }}</p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.timeline-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: #f8f9fa;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: #1a1a2e;
  color: #fff;
  flex-shrink: 0;
}

.page-header h1 {
  margin: 0;
  font-size: 1.25rem;
  flex: 1;
}

.btn-delete-renovation {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0.25rem 0.5rem;
}

.btn-delete-renovation:hover {
  color: #e74c3c;
}

.btn-back {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem 0.5rem;
}

.btn-back:hover {
  color: #fff;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.state-message {
  text-align: center;
  padding: 3rem 1rem;
  color: #666;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 600px;
  margin: 0 auto;
}

.timeline-item {
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.image-container {
  position: relative;
}

.timeline-image {
  width: 100%;
  display: block;
}

.timeline-image.clickable {
  cursor: pointer;
}

.timeline-original {
  cursor: pointer;
}

.image-label {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 0.2rem 0.6rem;
  border-radius: 0.25rem;
  font-size: 0.8rem;
}

.btn-star {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: #fff;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  line-height: 1;
}

.btn-star.starred {
  color: #f1c40f;
}

.btn-star:hover {
  background: rgba(0, 0, 0, 0.7);
}

.btn-trash {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: #fff;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  line-height: 1;
}

.btn-trash:hover {
  background: rgba(192, 57, 43, 0.8);
}

.prompt-text {
  padding: 0.5rem 1rem;
  margin: 0;
  font-size: 0.85rem;
  color: #666;
}

.status-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  color: #666;
  padding: 2rem;
}

.status-error {
  color: #c0392b;
}

.spinner {
  border: 4px solid #eee;
  border-top: 4px solid #0f3460;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 0.5rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
