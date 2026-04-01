import { ref } from "vue";

export type ColorScheme = "light" | "dark" | "system";

const STORAGE_KEY = "colorScheme";

function applyScheme(scheme: ColorScheme) {
  document.body.classList.remove("light", "dark");
  if (scheme !== "system") {
    document.body.classList.add(scheme);
  }
}

const stored = localStorage.getItem(STORAGE_KEY) as ColorScheme | null;
const initial: ColorScheme =
  stored === "light" || stored === "dark" ? stored : "system";

applyScheme(initial);

const colorScheme = ref<ColorScheme>(initial);

export function useColorScheme() {
  function setColorScheme(scheme: ColorScheme) {
    colorScheme.value = scheme;
    applyScheme(scheme);
    if (scheme === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, scheme);
    }
  }

  return { colorScheme, setColorScheme };
}
