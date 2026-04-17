import { ref } from "vue";

declare function ui(cmd: string, val?: string): string | undefined;

export type ColorScheme = "light" | "dark" | "system";

const STORAGE_KEY = "colorScheme";

function applyScheme(scheme: ColorScheme) {
  ui("mode", scheme === "system" ? "auto" : scheme);
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
