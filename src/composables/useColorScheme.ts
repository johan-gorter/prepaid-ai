import { ref } from "vue";
import { idbDelete, idbGet, idbSet } from "./useIdbStorage";

declare function ui(cmd: string, val?: string): string | undefined;

export type ColorScheme = "light" | "dark" | "system";

const STORAGE_KEY = "colorScheme";

function applyScheme(scheme: ColorScheme) {
  ui("mode", scheme === "system" ? "auto" : scheme);
}

const colorScheme = ref<ColorScheme>("system");

// Load the persisted scheme asynchronously and re-apply once we have it.
// Until it resolves we keep the default ("system") which already matches
// what the OS exposes via prefers-color-scheme.
applyScheme("system");
idbGet<ColorScheme>(STORAGE_KEY).then((stored) => {
  if (stored === "light" || stored === "dark") {
    colorScheme.value = stored;
    applyScheme(stored);
  }
});

export function useColorScheme() {
  function setColorScheme(scheme: ColorScheme) {
    colorScheme.value = scheme;
    applyScheme(scheme);
    if (scheme === "system") {
      void idbDelete(STORAGE_KEY);
    } else {
      void idbSet(STORAGE_KEY, scheme);
    }
  }

  return { colorScheme, setColorScheme };
}
