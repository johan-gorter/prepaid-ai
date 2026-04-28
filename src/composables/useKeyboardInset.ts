import { onMounted, onUnmounted } from "vue";

let activeListeners = 0;
let onResize: (() => void) | null = null;
let onScroll: (() => void) | null = null;

function updateInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty("--kb-inset", `${inset}px`);
}

export function useKeyboardInset() {
  onMounted(() => {
    activeListeners++;
    if (activeListeners > 1) return;

    document.documentElement.style.setProperty("--kb-inset", "0px");

    if (!window.visualViewport) return;

    onResize = updateInset;
    onScroll = updateInset;
    window.visualViewport.addEventListener("resize", onResize);
    window.visualViewport.addEventListener("scroll", onScroll);
    updateInset();
  });

  onUnmounted(() => {
    activeListeners = Math.max(0, activeListeners - 1);
    if (activeListeners > 0) return;
    if (window.visualViewport) {
      if (onResize) window.visualViewport.removeEventListener("resize", onResize);
      if (onScroll) window.visualViewport.removeEventListener("scroll", onScroll);
    }
    onResize = null;
    onScroll = null;
    document.documentElement.style.setProperty("--kb-inset", "0px");
  });
}
