import { beforeMount } from "@playwright/experimental-ct-vue/hooks";
import { createMemoryHistory, createRouter } from "vue-router";

// Install a minimal in-memory router so components using useRouter() don't
// get undefined.  No real routes are needed for component tests.
beforeMount(async ({ app }) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div/>" } }],
  });
  app.use(router);
});
