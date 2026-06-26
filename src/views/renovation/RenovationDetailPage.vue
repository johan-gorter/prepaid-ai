<script setup lang="ts">
import { doc, getDoc } from "firebase/firestore";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppBar from "../../components/AppBar.vue";
import StorageImage from "../../components/StorageImage.vue";
import { useAuth } from "../../composables/useAuth";
import { useImpressions } from "../../composables/useImpressions";
import {
  clearImpressionDraft,
  clearImpressionMask,
  clearImpressionSource,
} from "../../composables/useImpressionStore";
import {
  deleteRenovation,
  setAfterImpression,
} from "../../data/renovationRepo";
import { db } from "../../firebase";
import type { Renovation } from "../../types";

const route = useRoute();
const router = useRouter();
const { currentUser } = useAuth();

const renovationId = computed(() => route.params.id as string);
const renovationIdRef = ref(renovationId.value);
watch(renovationId, (val) => {
  renovationIdRef.value = val;
});

const { impressions, loading } = useImpressions(renovationIdRef);

const renovation = ref<Renovation | null>(null);
const scrollContainer = ref<HTMLElement | null>(null);
const showDeleteDialog = ref(false);
const showRenovationMenu = ref(false);

const SET_AFTER_LONG_PRESS_MS = 750;
const SET_AFTER_LONG_PRESS_MOVE_TOLERANCE_PX = 10;
let setAfterLongPressTimer: number | undefined;
let setAfterLongPressStart:
  | {
      kind: "pointer";
      impressionId: string;
      pointerId: number;
      clientX: number;
      clientY: number;
    }
  | {
      kind: "touch";
      impressionId: string;
      identifier: number;
      clientX: number;
      clientY: number;
    }
  | undefined;
const suppressResultClickImpressionId = ref<string | null>(null);

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
        const starred = scrollContainer.value.querySelector(".starred");
        if (starred) {
          const item = starred.closest("article");
          if (item) {
            (item as HTMLElement).scrollIntoView({ block: "center" });
          }
        } else {
          window.scrollTo({ top: document.documentElement.scrollHeight });
        }
      }
    }
  },
  { immediate: true },
);

async function handleStar(impressionId: string) {
  if (!currentUser.value) return;
  const previousAfterImpressionId = renovation.value?.afterImpressionId;

  if (renovation.value) {
    renovation.value = { ...renovation.value, afterImpressionId: impressionId };
  }

  try {
    await setAfterImpression(
      currentUser.value.uid,
      renovationId.value,
      impressionId,
    );
  } catch (error) {
    if (renovation.value) {
      renovation.value = {
        ...renovation.value,
        afterImpressionId: previousAfterImpressionId,
      };
    }
    throw error;
  }
}

function clearSetAfterLongPress() {
  if (setAfterLongPressTimer !== undefined) {
    window.clearTimeout(setAfterLongPressTimer);
    setAfterLongPressTimer = undefined;
  }

  setAfterLongPressStart = undefined;
}

function clearPointerSetAfterLongPress(event: PointerEvent) {
  if (
    setAfterLongPressStart?.kind !== "pointer" ||
    event.pointerId !== setAfterLongPressStart.pointerId
  ) {
    return;
  }

  clearSetAfterLongPress();
}

function clearTouchSetAfterLongPress(event: TouchEvent) {
  if (setAfterLongPressStart?.kind !== "touch") return;

  for (const touch of Array.from(event.changedTouches)) {
    if (touch.identifier === setAfterLongPressStart.identifier) {
      clearSetAfterLongPress();
      return;
    }
  }
}

function commitSetAfterLongPress(impressionId: string) {
  setAfterLongPressTimer = undefined;
  setAfterLongPressStart = undefined;
  suppressResultClickImpressionId.value = impressionId;
  void handleStar(impressionId);
}

function startSetAfterLongPress(event: PointerEvent, impressionId: string) {
  suppressResultClickImpressionId.value = null;

  if (
    event.pointerType !== "touch" ||
    renovation.value?.afterImpressionId === impressionId
  ) {
    return;
  }

  clearSetAfterLongPress();
  setAfterLongPressStart = {
    kind: "pointer",
    impressionId,
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
  };

  setAfterLongPressTimer = window.setTimeout(() => {
    commitSetAfterLongPress(impressionId);
  }, SET_AFTER_LONG_PRESS_MS);
}

function moveSetAfterLongPress(event: PointerEvent) {
  if (
    event.pointerType !== "touch" ||
    setAfterLongPressStart?.kind !== "pointer" ||
    event.pointerId !== setAfterLongPressStart.pointerId
  ) {
    return;
  }

  const distance = Math.hypot(
    event.clientX - setAfterLongPressStart.clientX,
    event.clientY - setAfterLongPressStart.clientY,
  );

  if (distance > SET_AFTER_LONG_PRESS_MOVE_TOLERANCE_PX) {
    clearSetAfterLongPress();
  }
}

function startTouchSetAfterLongPress(event: TouchEvent, impressionId: string) {
  suppressResultClickImpressionId.value = null;

  if (
    event.touches.length !== 1 ||
    renovation.value?.afterImpressionId === impressionId
  ) {
    return;
  }

  const touch = event.changedTouches[0];
  if (!touch) return;

  clearSetAfterLongPress();
  setAfterLongPressStart = {
    kind: "touch",
    impressionId,
    identifier: touch.identifier,
    clientX: touch.clientX,
    clientY: touch.clientY,
  };

  setAfterLongPressTimer = window.setTimeout(() => {
    commitSetAfterLongPress(impressionId);
  }, SET_AFTER_LONG_PRESS_MS);
}

function moveTouchSetAfterLongPress(event: TouchEvent) {
  if (setAfterLongPressStart?.kind !== "touch") return;

  const touchIdentifier = setAfterLongPressStart.identifier;
  const activeTouch = Array.from(event.touches).find(
    (touch) => touch.identifier === touchIdentifier,
  );
  if (!activeTouch) return;

  const distance = Math.hypot(
    activeTouch.clientX - setAfterLongPressStart.clientX,
    activeTouch.clientY - setAfterLongPressStart.clientY,
  );

  if (distance > SET_AFTER_LONG_PRESS_MOVE_TOLERANCE_PX) {
    clearSetAfterLongPress();
  }
}

function handleResultImageClick(event: MouseEvent, impressionId: string) {
  if (suppressResultClickImpressionId.value === impressionId) {
    event.preventDefault();
    event.stopPropagation();
    suppressResultClickImpressionId.value = null;
    return;
  }

  void navigateToNewImpression(impressionId);
}

async function handleDeleteRenovation() {
  showDeleteDialog.value = false;
  if (!currentUser.value) return;
  await deleteRenovation(currentUser.value.uid, renovationId.value);
  router.push("/renovations");
}

async function navigateToNewImpression(target: "original" | string) {
  const reno = renovationId.value;
  // Clear any stale source from a previous session so the wizard re-fetches
  // the correct image from Storage on this device.
  await Promise.all([
    clearImpressionSource(),
    clearImpressionMask(),
    clearImpressionDraft(),
  ]);
  if (target === "original") {
    router.push({
      path: "/new-impression",
      query: { source: "original", renovation: reno },
    });
  } else {
    router.push({
      path: "/new-impression",
      query: { source: "impression", renovation: reno, impression: target },
    });
  }
}

onMounted(() => {
  loadRenovation();
});
</script>

<template>
  <div class="page-layout">
    <AppBar>
      <div style="position: relative; flex-shrink: 0">
        <button
          class="transparent circle"
          @click="showRenovationMenu = !showRenovationMenu"
          :aria-label="$t('renovationDetail.menuAriaLabel')"
        >
          <i aria-hidden="true">more_vert</i>
        </button>
        <menu v-if="showRenovationMenu" class="active right no-wrap reno-menu">
          <li>
            <a
              data-testid="delete-renovation-menu-item"
              @click="
                showRenovationMenu = false;
                showDeleteDialog = true;
              "
            >
              <i aria-hidden="true">delete</i>
              <span>{{ $t("renovationDetail.deleteRenovation") }}</span>
            </a>
          </li>
        </menu>
      </div>
    </AppBar>

    <!-- Delete confirmation dialog -->
    <dialog :class="{ active: showDeleteDialog }">
      <h5>{{ $t("renovationDetail.deleteTitle") }}</h5>
      <p>{{ $t("renovationDetail.deleteConfirm") }}</p>
      <nav>
        <button class="border" @click="showDeleteDialog = false">
          {{ $t("common.cancel") }}
        </button>
        <button class="error" @click="handleDeleteRenovation">
          {{ $t("common.delete") }}
        </button>
      </nav>
    </dialog>

    <main
      ref="scrollContainer"
      class="responsive"
      style="
        max-width: 800px;
        margin: 0 auto;
        padding: var(--app-bar-clearance) 0 0;
      "
    >
      <h4 style="padding: 0 0.5rem">{{ $t("renovationDetail.title") }}</h4>
      <p
        class="small-text reno-ai-disclaimer"
        data-testid="renovation-ai-disclaimer"
      >
        {{ $t("renovationDetail.aiDisclaimer") }}
      </p>

      <div v-if="loading" class="center-align large-padding">
        <progress class="circle"></progress>
        <p>{{ $t("renovationDetail.loading") }}</p>
      </div>

      <div v-else class="detail-photo-feed">
        <!-- Original "before" image -->
        <article
          v-if="renovation?.originalImagePath"
          class="photo-item"
          @click="navigateToNewImpression('original')"
        >
          <div class="photo-frame">
            <StorageImage
              :path="renovation.originalImagePath"
              :fallback-url="renovation.originalImageUrl"
              alt="Original"
              class="responsive photo-image"
            />
          </div>
        </article>

        <!-- Impressions -->
        <article
          v-for="impression in impressions"
          :key="impression.id"
          class="photo-item impression-item"
        >
          <div
            class="photo-frame"
            @pointerdown="startSetAfterLongPress($event, impression.id)"
            @pointermove="moveSetAfterLongPress"
            @pointerup="clearPointerSetAfterLongPress"
            @pointercancel="clearPointerSetAfterLongPress"
            @pointerleave="clearPointerSetAfterLongPress"
            @touchstart="startTouchSetAfterLongPress($event, impression.id)"
            @touchmove="moveTouchSetAfterLongPress"
            @touchend="clearTouchSetAfterLongPress"
            @touchcancel="clearTouchSetAfterLongPress"
            @contextmenu.prevent
            @click="handleResultImageClick($event, impression.id)"
          >
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
                class="responsive photo-image"
              />
            </template>
            <!-- Processing -->
            <template v-else-if="impression.status === 'processing'">
              <div class="center-align medium-padding photo-status">
                <progress class="circle"></progress>
                <p>{{ $t("renovationDetail.processing") }}</p>
              </div>
            </template>
            <!-- Failed -->
            <template v-else-if="impression.status === 'failed'">
              <div class="center-align medium-padding error-text photo-status">
                <p>{{ $t("renovationDetail.failed", { error: impression.error }) }}</p>
              </div>
            </template>
            <!-- Pending -->
            <template v-else>
              <div class="center-align medium-padding photo-status">
                <p>{{ $t("renovationDetail.pending") }}</p>
              </div>
            </template>

            <template v-if="impression.status === 'completed'">
              <span
                v-if="renovation?.afterImpressionId === impression.id"
                class="circle absolute-star-indicator starred"
                role="img"
                :aria-label="$t('renovationDetail.afterImage')"
                data-testid="after-image-star"
              >
                <i aria-hidden="true">star</i>
              </span>

              <button
                v-else
                class="transparent circle absolute-btn-star"
                @click.stop="handleStar(impression.id)"
                :title="$t('renovationDetail.setAfterImage')"
                :aria-label="$t('renovationDetail.setAfterImage')"
              >
                <i aria-hidden="true">star_border</i>
              </button>
            </template>
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

/* Anchor the ⋮ menu's right edge to the button so a long item (e.g. "Delete
   renovation" / NL "Make-over verwijderen") folds leftward and never spills
   past the right viewport edge on narrow phones. */
.reno-menu {
  left: auto !important;
  right: 0 !important;
}

.reno-ai-disclaimer {
  margin: 0 0 0.5rem;
  padding: 0 0.5rem;
  opacity: 0.6;
}

.detail-photo-feed {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  align-items: start;
}

.photo-item {
  display: block;
  min-width: 0;
  margin: 0 !important;
  padding: 0 !important;
  border: 0;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  line-height: 0;
}

.photo-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 0 !important;
}

.photo-image {
  display: block;
  width: 100%;
  height: 100%;
  cursor: zoom-in;
  border-radius: 0 !important;
  overflow: hidden;
  -webkit-touch-callout: none;
  user-select: none;
}

:deep(.photo-image img) {
  width: 100%;
  height: 100%;
  border-radius: 0 !important;
  cursor: zoom-in;
  object-fit: cover;
}

.photo-status {
  min-height: 150px;
}

.absolute-btn-star,
.absolute-star-indicator {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  z-index: 2;
  background: rgba(0, 0, 0, 0.5) !important;
}

.absolute-btn-star {
  color: #fff !important;
}

.absolute-star-indicator {
  color: #f1c40f !important;
}

.absolute-btn-star i,
.absolute-star-indicator i {
  color: #f1c40f !important;
}

.absolute-btn-star i {
  font-variation-settings: "FILL" 0;
}

.absolute-star-indicator i {
  font-variation-settings: "FILL" 1;
}

.absolute-star-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  pointer-events: none;
}

.absolute-btn-star {
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--speed2);
}

.impression-item:hover .absolute-btn-star,
.impression-item:focus-within .absolute-btn-star,
.photo-frame:hover .absolute-btn-star,
.photo-frame:focus-within .absolute-btn-star {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: none) and (pointer: coarse) {
  .absolute-btn-star {
    display: none;
  }
}
</style>
