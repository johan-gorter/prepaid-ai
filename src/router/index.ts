import { createRouter, createWebHistory, START_LOCATION } from "vue-router";
import { getCurrentUser } from "../composables/useAuth";
import { idbGetFast } from "../composables/useIdbStorage";

// Pages the user can be resumed to on a cold app start. Keyed by the value
// each page writes to the "lastPage" IndexedDB key in its onMounted hook.
const RESUME_ROUTES: Record<string, string> = {
  renovations: "/renovations",
  chat: "/chat",
};

const routes = [
  {
    path: "/",
    name: "home",
    component: () => import("../views/MainPage.vue"),
    meta: { requiresAuth: false },
  },
  {
    // Legacy home URL. The app now serves MainPage on "/"; keep this as a
    // redirect so old bookmarks and PWA shortcuts still resolve. Arriving via
    // this redirect deliberately does NOT trigger the cold-start resume.
    path: "/main",
    redirect: "/",
  },
  {
    path: "/renovations",
    name: "renovations",
    component: () => import("../views/renovation/RenovationsPage.vue"),
    meta: { requiresAuth: false },
  },
  {
    // First-time, signed-out renovation experience. Signed-in users are
    // redirected to the gallery (/renovations) in the navigation guard below,
    // so there is no separate "has seen intro" state.
    path: "/first-renovation",
    name: "first-renovation",
    component: () => import("../views/renovation/FirstRenovationPage.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/balance",
    name: "balance",
    component: () => import("../views/BalancePage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/balance/success",
    name: "checkout-success",
    component: () => import("../views/CheckoutSuccessPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/buy-credits",
    name: "buy-credits",
    component: () => import("../views/BuyCreditsPage.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/send-credits",
    name: "send-credits",
    component: () => import("../views/SendCreditsPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/chat",
    name: "chat",
    component: () => import("../views/PrivateChatPage.vue"),
    meta: { requiresAuth: false },
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
    component: () => import("../views/renovation/PhotoCapturePage.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/crop",
    name: "crop",
    component: () => import("../views/renovation/CropImagePage.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/new-impression",
    name: "new-impression",
    component: () => import("../views/renovation/NewImpressionPage.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/share/:token",
    name: "share",
    component: () => import("../views/renovation/NewImpressionPage.vue"),
    meta: { requiresAuth: false },
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

router.beforeEach(async (to, from) => {
  const currentUser = await getCurrentUser();

  if (to.meta.requiresAuth && !currentUser) {
    return { name: "login", query: { redirect: to.fullPath } };
  }

  // Redirect authenticated users away from login page
  if (to.name === "login" && currentUser) {
    return { name: "home" };
  }

  // The first-renovation page is the signed-out first-time experience. A
  // signed-in user has a real gallery, so send them straight to it.
  if (to.name === "first-renovation" && currentUser) {
    return { name: "renovations" };
  }

  // Resume the last visited page on a cold app start (PWA/browser launch or a
  // refresh) that lands directly on "/". Explicit navigation to the home route
  // from within the app, or via the legacy "/main" redirect, keeps the user on
  // MainPage. The lookup is time-bounded, so a stalled IndexedDB read can never
  // strand the app on a redirect — it falls through to MainPage.
  if (to.name === "home" && from === START_LOCATION && !to.redirectedFrom) {
    const lastPage = await idbGetFast<string>("lastPage");
    const target = lastPage ? RESUME_ROUTES[lastPage] : undefined;
    if (target) return target;
  }
});

export default router;
