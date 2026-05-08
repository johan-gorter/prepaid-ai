import { onMounted, onUnmounted } from "vue";

let activeListeners = 0;
let raf = 0;

function setInset(inset: number) {
  document.documentElement.style.setProperty("--kb-inset", `${inset}px`);
  document.documentElement.classList.toggle("kb-open", inset > 0);
}

function updateInset() {
  const vv = window.visualViewport;
  if (!vv) {
    setInset(0);
    return;
  }
  const raw = window.innerHeight - vv.height - vv.offsetTop;
  const inset = raw > 80 ? Math.round(raw) : 0;
  setInset(inset);
}

function scheduleUpdate() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    updateInset();
  });
}

export function useKeyboardInset() {
  onMounted(() => {
    activeListeners++;
    if (activeListeners > 1) return;

    setInset(0);

    updateInset();
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
  });

  onUnmounted(() => {
    activeListeners = Math.max(0, activeListeners - 1);
    if (activeListeners > 0) return;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    window.visualViewport?.removeEventListener("resize", scheduleUpdate);
    window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
    window.removeEventListener("orientationchange", scheduleUpdate);
    setInset(0);
  });
}
