import { beforeMount } from "@playwright/experimental-ct-vue/hooks";
import "beercss";
import "material-dynamic-colors";
import { createMemoryHistory, createRouter } from "vue-router";
import { i18n } from "../src/i18n";

// Seed the BeerCSS theme so the global ui() function is available for
// composables like useColorScheme that call it at module-load time.
declare function ui(cmd: string, val?: string): Promise<unknown> | unknown;
void ui("theme", "#9a25ae");

// Install a minimal in-memory router so components using useRouter() don't
// get undefined.  No real routes are needed for component tests.  Also install
// vue-i18n so mounted components that use $t / useI18n render their strings.
beforeMount(async ({ app }) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div/>" } }],
  });
  app.use(router);
  app.use(i18n);
});
