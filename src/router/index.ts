import { createRouter, createWebHistory } from "vue-router";
import { getCurrentUser } from "vuefire";
import HomePage from "../views/HomePage.vue";
import LoginPage from "../views/LoginPage.vue";
import NewRenovationPage from "../views/NewRenovationPage.vue";

const routes = [
  {
    path: "/",
    name: "home",
    component: HomePage,
    meta: { requiresAuth: true },
  },
  {
    path: "/login",
    name: "login",
    component: LoginPage,
    meta: { requiresAuth: false },
  },
  {
    path: "/renovation/new",
    name: "new-renovation",
    component: NewRenovationPage,
    meta: { requiresAuth: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const currentUser = await getCurrentUser();

  if (to.meta.requiresAuth && !currentUser) {
    return { name: "login", query: { redirect: to.fullPath } };
  }

  // Redirect authenticated users away from login page
  if (to.name === "login" && currentUser) {
    return { name: "home" };
  }
});

export default router;
