import { createRouter, createWebHistory } from "vue-router";
import { getCurrentUser } from "../composables/useAuth";

const routes = [
  {
    path: "/",
    name: "home",
    component: () => import("../views/HomePage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/main",
    name: "main",
    component: () => import("../views/MainPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/renovations",
    name: "renovations",
    component: () => import("../views/renovation/RenovationsPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/balance",
    name: "balance",
    component: () => import("../views/BalancePage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/chat",
    name: "chat",
    component: () => import("../views/PrivateChatPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/about",
    name: "about",
    component: () => import("../views/AboutPage.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/account",
    name: "account",
    component: () => import("../views/AccountPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/login",
    name: "login",
    component: () => import("../views/LoginPage.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/photo",
    name: "photo",
    component: () => import("../views/PhotoCapturePage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/crop",
    name: "crop",
    component: () => import("../views/CropImagePage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/new-impression",
    name: "new-impression",
    component: () => import("../views/NewImpressionPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/renovation/:id",
    name: "renovation-detail",
    component: () => import("../views/renovation/RenovationDetailPage.vue"),
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
