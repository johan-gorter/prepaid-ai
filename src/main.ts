import { createPinia } from "pinia";
import { createApp } from "vue";
import { VueFire, VueFireAuth } from "vuefire";
import App from "./App.vue";
import { firebaseApp } from "./firebase";
import router from "./router";
import "./style.css";

const app = createApp(App);

app.use(createPinia());
app.use(VueFire, {
  firebaseApp,
  modules: [VueFireAuth()],
});
app.use(router);

app.mount("#app");
