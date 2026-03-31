<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "../composables/useAuth";
import { useImpressions } from "../composables/useImpressions";
import { useRenovations } from "../composables/useRenovations";
import { resolveStorageUrl } from "../composables/useStorageUrl";
import { db } from "../firebase";
import type { Renovation } from "../types";

const route = useRoute();
const router = useRouter();
const { currentUser } = useAuth();
const { setAfterImpression, deleteImpression, deleteRenovation } = useRenovations();

const renovationId = computed(() => route.params.id as string);
const renovationIdRef = ref(renovationId.value);
watch(renovationId, (val) => { renovationIdRef.value = val; });

const { impressions, loading } = useImpressions(renovationIdRef);

const renovation = ref<Renovation | null>(null);
const originalImageUrl = ref<string | null>(null);
const resultImageUrls = ref<Record<string, string>>({});
const scrollContainer = ref<HTMLElement | null>(null);
const showDeleteDialog = ref(false);

// Load renovation document
async function loadRenovation() {
  if (!currentUser.value) return;
  const uid = currentUser.value.uid;
  const renoDoc = await getDoc(
    doc(db, "users", uid, "renovations", renovationId.value),
  );
  if (renoDoc.exists()) {
    renovation.value = { id: renoDoc.id, ...renoDoc.data() } as Renovation;
    if (renovation.value.originalImagePath) {
      try {
        originalImageUrl.value = await resolveStorageUrl(renovation.value.originalImagePath);
      } catch {
        originalImageUrl.value = renovation.value.originalImageUrl ?? null;
      }
    }
  }
}

// Resolve result image URLs
watch(
  impressions,
  async (items, _oldValue, onCleanup) => {
    let cancelled = false;
    onCleanup(() => { cancelled = true; });

    // Also re-read renovation to keep afterImpressionId in sync
    if (currentUser.value) {
      const renoDoc = await getDoc(
        doc(db, "users", currentUser.value.uid, "renovations", renovationId.value),
      );
      if (renoDoc.exists() && !cancelled) {
        renovation.value = { id: renoDoc.id, ...renoDoc.data() } as Renovation;
      }
    }

    const urlEntries = await Promise.all(
      items.map(async (impression) => {
        if (impression.resultImagePath) {
          try {
            return [
              impression.id,
              await resolveStorageUrl(impression.resultImagePath),
            ] as const;
          } catch {
            return [impression.id, impression.resultImageUrl ?? ""] as const;
          }
        }
        return [impression.id, impression.resultImageUrl ?? ""] as const;
      }),
    );

    if (!cancelled) {
      resultImageUrls.value = Object.fromEntries(
        urlEntries.filter(([, url]) => Boolean(url)),
      );

      // Scroll to starred impression, or bottom if none starred
      await nextTick();
      if (scrollContainer.value) {
        const starred = scrollContainer.value.querySelector('.starred');
        if (starred) {
          const item = starred.closest('article');
          if (item) {
            (item as HTMLElement).scrollIntoView({ block: 'center' });
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
  if (renovation.value) {
    renovation.value = { ...renovation.value, afterImpressionId: impressionId };
  }
}

async function handleDeleteImpression(impressionId: string) {
  await deleteImpression(renovationId.value, impressionId);
}

async function handleDeleteRenovation() {
  showDeleteDialog.value = false;
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
  <div class="page-layout">
    <header class="fixed primary">
      <nav>
        <button class="transparent circle" @click="router.push('/')">
          <i>arrow_back</i>
        </button>
        <h5 class="max">Renovation Details</h5>
        <button class="transparent circle" @click="showDeleteDialog = true" title="Delete renovation">
          <i>delete</i>
        </button>
      </nav>
    </header>

    <!-- Delete confirmation dialog -->
    <dialog :class="{ active: showDeleteDialog }">
      <h5>Delete Renovation</h5>
      <p>Delete this renovation and all its impressions?</p>
      <nav>
        <button class="border" @click="showDeleteDialog = false">Cancel</button>
        <button class="error" @click="handleDeleteRenovation">Delete</button>
      </nav>
    </dialog>

    <main ref="scrollContainer" class="responsive" style="max-width: 600px; margin: 0 auto; padding-top: 4.5rem;">
      <div v-if="loading" class="center-align large-padding">
        <progress class="circle"></progress>
        <p>Loading...</p>
      </div>

      <div v-else>
        <!-- Original "before" image -->
        <article
          v-if="originalImageUrl"
          class="round no-padding small-elevate"
          style="cursor: pointer; margin-bottom: 1rem;"
          @click="navigateToNewImpression('before')"
        >
          <div style="position: relative;">
            <img :src="originalImageUrl" alt="Original" class="responsive" crossorigin="anonymous" style="display: block;" />
            <span class="chip small" style="position: absolute; bottom: 0.5rem; left: 0.5rem;">Original</span>
          </div>
        </article>

        <!-- Impressions -->
        <article
          v-for="impression in impressions"
          :key="impression.id"
          class="round no-padding small-elevate"
          style="margin-bottom: 1rem;"
        >
          <div style="position: relative;">
            <!-- Completed: show result image -->
            <template v-if="impression.status === 'completed' && (resultImageUrls[impression.id] || impression.resultImageUrl)">
              <img
                :src="resultImageUrls[impression.id] ?? impression.resultImageUrl ?? ''"
                alt="Result"
                class="responsive"
                crossorigin="anonymous"
                style="display: block; cursor: pointer;"
                @click="navigateToNewImpression(impression.id)"
              />
            </template>
            <!-- Processing -->
            <template v-else-if="impression.status === 'processing'">
              <div class="center-align medium-padding" style="min-height: 150px;">
                <progress class="circle"></progress>
                <p>Processing...</p>
              </div>
            </template>
            <!-- Failed -->
            <template v-else-if="impression.status === 'failed'">
              <div class="center-align medium-padding error-text" style="min-height: 150px;">
                <p>Failed: {{ impression.error }}</p>
              </div>
            </template>
            <!-- Pending -->
            <template v-else>
              <div class="center-align medium-padding" style="min-height: 150px;">
                <p>Pending...</p>
              </div>
            </template>

            <!-- Star toggle (top-right) -->
            <button
              v-if="impression.status === 'completed'"
              class="transparent circle absolute-btn-star"
              :class="{ starred: renovation?.afterImpressionId === impression.id }"
              @click.stop="handleStar(impression.id)"
              title="Set as after image"
            >
              <i>{{ renovation?.afterImpressionId === impression.id ? 'star' : 'star_border' }}</i>
            </button>

            <!-- Trash button (top-left) -->
            <button
              class="transparent circle absolute-btn-trash"
              @click.stop="handleDeleteImpression(impression.id)"
              title="Delete impression"
            >
              <i>delete</i>
            </button>
          </div>

          <div class="padding">
            <p class="small-text">{{ impression.prompt }}</p>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

.absolute-btn-star {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  background: rgba(0, 0, 0, 0.5) !important;
  color: #fff;
}

.absolute-btn-star.starred i {
  color: #f1c40f;
}

.absolute-btn-trash {
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  background: rgba(0, 0, 0, 0.5) !important;
  color: #fff;
}
</style>
