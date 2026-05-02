import { ref } from "vue";
import { idbDelete, idbGet, idbSet } from "./useIdbStorage";

declare function ui(cmd: string, val?: string): string | undefined;

export type ColorScheme = "light" | "dark" | "system";

const STORAGE_KEY = "colorScheme";

function applyScheme(scheme: ColorScheme) {
  ui("mode", scheme === "system" ? "auto" : scheme);
}

const colorScheme = ref<ColorScheme>("system");
// Tracks whether the user has explicitly chosen a scheme since module load.
// Without this, an in-flight `idbGet` resolving after the user toggles would
// clobber their choice with the persisted value.
let userSelected = false;

applyScheme("system");
idbGet<ColorScheme>(STORAGE_KEY)
  .then((stored) => {
    if (userSelected) return;
    if (stored === "light" || stored === "dark") {
      colorScheme.value = stored;
      applyScheme(stored);
    }
  })
  .catch(() => {
    // ignore: a failed read just leaves us on the default "system" scheme
  });

export function useColorScheme() {
  function setColorScheme(scheme: ColorScheme) {
    userSelected = true;
    colorScheme.value = scheme;
    applyScheme(scheme);
    const persist = scheme === "system" ? idbDelete(STORAGE_KEY) : idbSet(STORAGE_KEY, scheme);
    persist.catch(() => {
      // ignore: persistence is best-effort
    });
  }

  return { colorScheme, setColorScheme };
}
