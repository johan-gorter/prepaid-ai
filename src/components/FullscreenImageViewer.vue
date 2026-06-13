<script setup lang="ts">
/**
 * Dependency-free fullscreen image viewer with pinch-zoom + pan (#90).
 *
 * Driven entirely by Pointer Events on a `touch-action: none` surface:
 *  - pinch (two pointers) zooms around the gesture midpoint;
 *  - one-finger drag pans while zoomed in;
 *  - one-finger drag down while at 1× swipes the viewer closed;
 *  - double-tap toggles between fit and a 2.5× zoom centred on the tap;
 *  - an X button and the browser back button (history state) both close it.
 *
 * Zoom is clamped to 1×–5× and panning is clamped to the image bounds so the
 * picture can never be flung off-screen. The component is deliberately generic
 * (src + labels as props) so the renovation detail page can reuse it later
 * (#90 scope note) without touching this file.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  src: string | null;
  alt: string;
  closeLabel: string;
}>();

const emit = defineEmits<{ close: [] }>();

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const TAP_MOVE_TOLERANCE = 10;
const SWIPE_CLOSE_THRESHOLD = 110;

const surfaceRef = ref<HTMLDivElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);

const scale = ref(1);
const tx = ref(0);
const ty = ref(0);
// Extra downward offset applied during a one-finger swipe-to-close drag.
const dragY = ref(0);
// Disables the CSS transition while a gesture is in flight so pinch/pan track
// the finger 1:1; re-enabled for the snap-back / double-tap animations.
const animating = ref(true);

const transform = computed(
  () =>
    `translate(${tx.value}px, ${ty.value + dragY.value}px) scale(${scale.value})`,
);
// Fade the backdrop as the user swipes down, as a "you're dismissing" cue.
const backdropOpacity = computed(() => Math.max(0.4, 1 - dragY.value / 320));

// Measured at gesture start: the surface (viewport) size and the image's
// rendered fit size at 1×. Pan clamping and the zoom-around-point maths both
// need these in surface-local pixels.
let surfaceW = 0;
let surfaceH = 0;
let baseW = 0;
let baseH = 0;

const pointers = new Map<number, { x: number; y: number }>();
let prevDist = 0;
let prevMid = { x: 0, y: 0 };
let singleStart = { x: 0, y: 0 };
let singleStartT = { tx: 0, ty: 0 };
let moved = false;
let lastTapTime = 0;
let lastTapPos = { x: 0, y: 0 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function measure(): void {
  const surface = surfaceRef.value;
  const img = imgRef.value;
  if (!surface) return;
  const rect = surface.getBoundingClientRect();
  surfaceW = rect.width;
  surfaceH = rect.height;
  if (img && img.naturalWidth > 0) {
    const ar = img.naturalWidth / img.naturalHeight;
    let w = surfaceW;
    let h = w / ar;
    if (h > surfaceH) {
      h = surfaceH;
      w = h * ar;
    }
    baseW = w;
    baseH = h;
  }
}

function clampPan(): void {
  const sw = baseW * scale.value;
  const sh = baseH * scale.value;
  const maxX = Math.max(0, (sw - surfaceW) / 2);
  const maxY = Math.max(0, (sh - surfaceH) / 2);
  tx.value = clamp(tx.value, -maxX, maxX);
  ty.value = clamp(ty.value, -maxY, maxY);
}

// Scale by factor k while keeping the surface point `m` pinned under the same
// image content (origin is the surface centre, matching transform-origin).
function zoomAround(m: { x: number; y: number }, k: number): void {
  const cx = surfaceW / 2;
  const cy = surfaceH / 2;
  const icx = cx + tx.value;
  const icy = cy + ty.value;
  tx.value = m.x - k * (m.x - icx) - cx;
  ty.value = m.y - k * (m.y - icy) - cy;
  scale.value = scale.value * k;
}

function resetTransform(): void {
  scale.value = 1;
  tx.value = 0;
  ty.value = 0;
  dragY.value = 0;
}

function relPos(e: PointerEvent): { x: number; y: number } {
  const rect = surfaceRef.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function distance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function onPointerDown(e: PointerEvent): void {
  surfaceRef.value?.setPointerCapture(e.pointerId);
  const p = relPos(e);
  pointers.set(e.pointerId, p);
  animating.value = false;
  moved = false;
  if (pointers.size === 1) {
    measure();
    singleStart = p;
    singleStartT = { tx: tx.value, ty: ty.value };
  } else if (pointers.size === 2) {
    const pts = [...pointers.values()];
    const a = pts[0]!;
    const b = pts[1]!;
    prevDist = distance(a, b);
    prevMid = midpoint(a, b);
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!pointers.has(e.pointerId)) return;
  const p = relPos(e);
  pointers.set(e.pointerId, p);

  if (pointers.size >= 2) {
    const pts = [...pointers.values()];
    const a = pts[0]!;
    const b = pts[1]!;
    const d = distance(a, b);
    const m = midpoint(a, b);
    if (prevDist > 0) {
      const target = clamp(scale.value * (d / prevDist), MIN_SCALE, MAX_SCALE);
      // Pan by the midpoint movement first, then zoom around the new midpoint.
      tx.value += m.x - prevMid.x;
      ty.value += m.y - prevMid.y;
      zoomAround(m, target / scale.value);
      clampPan();
    }
    prevDist = d;
    prevMid = m;
    moved = true;
  } else if (pointers.size === 1) {
    const dx = p.x - singleStart.x;
    const dy = p.y - singleStart.y;
    if (
      Math.abs(dx) > TAP_MOVE_TOLERANCE ||
      Math.abs(dy) > TAP_MOVE_TOLERANCE
    ) {
      moved = true;
    }
    if (scale.value > 1.001) {
      tx.value = singleStartT.tx + dx;
      ty.value = singleStartT.ty + dy;
      clampPan();
    } else {
      // At fit scale a downward drag arms swipe-to-close.
      dragY.value = Math.max(0, dy);
    }
  }
}

function onPointerUp(e: PointerEvent): void {
  const wasSize = pointers.size;
  const released = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (surfaceRef.value?.hasPointerCapture(e.pointerId)) {
    surfaceRef.value.releasePointerCapture(e.pointerId);
  }

  if (pointers.size === 1) {
    // One finger lifted mid-pinch — re-anchor the surviving pointer so the
    // follow-up pan doesn't jump.
    const remaining = [...pointers.values()][0]!;
    singleStart = remaining;
    singleStartT = { tx: tx.value, ty: ty.value };
    prevDist = 0;
    return;
  }

  if (pointers.size === 0) {
    animating.value = true;
    if (wasSize === 1 && !moved && released) {
      handleTap(released);
    } else if (scale.value <= 1.001) {
      if (dragY.value > SWIPE_CLOSE_THRESHOLD) {
        close();
        return;
      }
      dragY.value = 0;
    }
  }
}

function handleTap(p: { x: number; y: number }): void {
  const now = Date.now();
  if (now - lastTapTime < DOUBLE_TAP_MS && distance(p, lastTapPos) < 40) {
    measure();
    if (scale.value > 1.001) {
      resetTransform();
    } else {
      zoomAround(p, DOUBLE_TAP_SCALE / scale.value);
      clampPan();
    }
    lastTapTime = 0;
  } else {
    lastTapTime = now;
    lastTapPos = p;
  }
}

// --- open/close lifecycle + browser history -------------------------------
// Opening pushes a history entry so the hardware/browser back button closes
// the viewer instead of leaving the page; closing pops that entry back off.
let pushedState = false;

function handlePop(): void {
  // Our pushed entry was already popped (back button, or our own close()).
  pushedState = false;
  teardownListeners();
  emit("close");
}

function handleKey(e: KeyboardEvent): void {
  if (e.key === "Escape") close();
}

function teardownListeners(): void {
  window.removeEventListener("popstate", handlePop);
  window.removeEventListener("keydown", handleKey);
}

function close(): void {
  if (pushedState) {
    // Pop our entry; handlePop emits close once the history change lands.
    history.back();
  } else {
    teardownListeners();
    emit("close");
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetTransform();
      pointers.clear();
      // Measure after the overlay has painted so the surface has a size.
      requestAnimationFrame(measure);
      if (!pushedState) {
        history.pushState({ __fsViewer: true }, "");
        pushedState = true;
      }
      window.addEventListener("popstate", handlePop);
      window.addEventListener("keydown", handleKey);
    } else {
      teardownListeners();
    }
  },
);

onBeforeUnmount(teardownListeners);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && src"
      class="fsv-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="alt"
      data-testid="fullscreen-viewer"
      :style="{ backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})` }"
    >
      <button
        type="button"
        class="fsv-close circle transparent"
        :aria-label="closeLabel"
        data-testid="fullscreen-close"
        @click="close"
      >
        <i aria-hidden="true">close</i>
      </button>

      <div
        ref="surfaceRef"
        class="fsv-surface"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <img
          ref="imgRef"
          class="fsv-image"
          :class="{ 'fsv-image--animated': animating }"
          :src="src"
          :alt="alt"
          :style="{ transform }"
          draggable="false"
          @load="measure"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fsv-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fsv-close {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 0.5rem);
  right: calc(env(safe-area-inset-right, 0px) + 0.5rem);
  z-index: 1;
  color: #fff;
}

.fsv-surface {
  position: absolute;
  inset: 0;
  /* All zoom/pan is handled by pointer events — never let the browser scroll
     or trigger native pinch-zoom on top of ours. */
  touch-action: none;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fsv-image {
  max-width: 100%;
  max-height: 100%;
  transform-origin: center center;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  will-change: transform;
}

.fsv-image--animated {
  transition: transform 0.2s ease-out;
}
</style>
