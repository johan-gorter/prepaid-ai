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
    path: "/renovation/new",
    name: "new-renovation",
    component: () => import("../views/renovation/old/NewRenovationPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/renovation/camera",
    name: "camera-capture",
    component: () => import("../views/renovation/old/CameraCapturePage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/renovation/crop",
    name: "crop-image",
    component: () => import("../views/renovation/old/CropImagePage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/renovation/:id",
    name: "renovation-detail",
    component: () => import("../views/renovation/RenovationDetailPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/renovation/:id/new",
    name: "new-impression",
    component: () => import("../views/renovation/old/NewImpressionPage.vue"),
    meta: { requiresAuth: true },
  },
  // Hidden prototype route — not linked from navigation, accessible by URL only.
  {
    path: "/dev/masking-test",
    name: "masking-test",
    component: () => import("../views/renovation/old/MaskingTestPage.vue"),
    meta: { requiresAuth: false },
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
