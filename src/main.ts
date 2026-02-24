import { createPinia } from "pinia";
import { createApp } from "vue";
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
