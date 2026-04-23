<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useBalance } from "../composables/useBalance";
import { useColorScheme } from "../composables/useColorScheme";

const { currentUser, signOut } = useAuth();
const { balance } = useBalance();
const { colorScheme, setColorScheme } = useColorScheme();
const router = useRouter();

const showMenu = ref(false);
const systemPrefersDark = ref(
  typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === true,
);

let mediaQuery: MediaQueryList | null = null;
function onSystemChange(e: MediaQueryListEvent) {
  systemPrefersDark.value = e.matches;
}

const isDark = computed(() =>
  colorScheme.value === "system"
    ? systemPrefersDark.value
    : colorScheme.value === "dark",
);

function onDocumentClick(e: MouseEvent) {
  if (showMenu.value) {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-user-menu]")) {
      showMenu.value = false;
    }
  }
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick, true);
  if (typeof window !== "undefined" && window.matchMedia) {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", onSystemChange);
  }
});
onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick, true);
  mediaQuery?.removeEventListener("change", onSystemChange);
});

async function handleSignOut() {
  await signOut();
  router.push("/login");
}

function toggleScheme() {
  setColorScheme(isDark.value ? "light" : "dark");
  showMenu.value = false;
}
</script>

<template>
  <div
    v-if="currentUser"
    class="user-menu-root"
    style="display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0"
  >
    <router-link
      to="/balance"
      class="transparent"
      style="
        display: flex;
        align-items: center;
        gap: 0.25rem;
        text-decoration: none;
        color: inherit;
        font-weight: 600;
        font-size: 1.1rem;
      "
      data-testid="header-balance"
    >
      <span style="font-size: 1.25rem">🪙</span>
      <span>{{ balance }}</span>
    </router-link>
    <div style="position: relative" data-user-menu>
      <button
        class="transparent circle"
        aria-label="User menu"
        @click="showMenu = !showMenu"
      >
        <i>account_circle</i>
      </button>
      <menu
        :class="{ active: showMenu }"
        class="no-wrap"
        style="right: 0; left: auto"
      >
        <li v-if="currentUser.displayName">
          <span>{{ currentUser.displayName }}</span>
        </li>
        <li class="divider"></li>
        <li>
          <a @click="toggleScheme">
            <i>{{ isDark ? "light_mode" : "dark_mode" }}</i>
            <span>Switch to {{ isDark ? "light" : "dark" }}</span>
          </a>
        </li>
        <li class="divider"></li>
        <li>
          <a
            @click="
              router.push('/account');
              showMenu = false;
            "
          >
            <i>manage_accounts</i>
            <span>Account</span>
          </a>
        </li>
        <li>
          <a @click="handleSignOut">
            <i>logout</i>
            <span>Sign out</span>
          </a>
        </li>
      </menu>
    </div>
  </div>
</template>
