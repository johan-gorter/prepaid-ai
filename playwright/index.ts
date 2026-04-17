import { beforeMount } from "@playwright/experimental-ct-vue/hooks";
import "beercss";
import "material-dynamic-colors";
import { createMemoryHistory, createRouter } from "vue-router";

// Seed the BeerCSS theme so the global ui() function is available for
// composables like useColorScheme that call it at module-load time.
declare function ui(cmd: string, val?: string): Promise<unknown> | unknown;
void ui("theme", "#9a25ae");

// Install a minimal in-memory router so components using useRouter() don't
// get undefined.  No real routes are needed for component tests.
beforeMount(async ({ app }) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div/>" } }],
  });
  app.use(router);
});
