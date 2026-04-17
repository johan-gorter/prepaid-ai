import "beercss";
import "material-dynamic-colors";

// Apply purple/pink Material Design 3 theme from seed color
declare function ui(cmd: string, val: string): void;
ui("theme", "#9C27B0");
import { createPinia } from "pinia";
import { createApp } from "vue";
import { registerSW } from "virtual:pwa-register";
import App from "./App.vue";
import "./firebase"; // ensure Firebase is initialized
import router from "./router";
import "./style.css";

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount("#app");

// Request persistent storage so the browser won't evict cached data under storage pressure
navigator.storage?.persist?.();

// Check for new service worker every 60 seconds so deploys are detected quickly
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => registration.update(), 60_000);
    }
  },
});

// Auto-reload when a new service worker takes control after a deploy.
// The guard on .controller ensures we only reload when replacing an existing
// SW (not on the very first install where controller transitions from null).
if (navigator.serviceWorker?.controller) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}
