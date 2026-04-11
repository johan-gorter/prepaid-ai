<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useBalance } from "../composables/useBalance";
import { useColorScheme } from "../composables/useColorScheme";

const { currentUser, signOut } = useAuth();
const { balance } = useBalance();
const { colorScheme, setColorScheme } = useColorScheme();
const router = useRouter();

const showMenu = ref(false);

function onDocumentClick(e: MouseEvent) {
  if (showMenu.value) {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-user-menu]")) {
      showMenu.value = false;
    }
  }
}

onMounted(() => document.addEventListener("click", onDocumentClick, true));
onUnmounted(() => document.removeEventListener("click", onDocumentClick, true));

async function handleSignOut() {
  await signOut();
  router.push("/login");
}

function chooseScheme(scheme: "light" | "dark") {
  setColorScheme(scheme);
  showMenu.value = false;
}
</script>

<template>
  <div
    v-if="currentUser"
    style="display: flex; align-items: center; gap: 0.25rem"
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
        <img
          v-if="currentUser.photoURL"
          :src="currentUser.photoURL"
          :alt="currentUser.displayName ?? 'User'"
          class="circle"
          style="width: 2rem; height: 2rem"
        />
        <i v-else>account_circle</i>
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
          <a @click="chooseScheme('light')">
            <i>{{ colorScheme === "light" ? "check" : "light_mode" }}</i>
            <span>Light</span>
          </a>
        </li>
        <li>
          <a @click="chooseScheme('dark')">
            <i>{{ colorScheme === "dark" ? "check" : "dark_mode" }}</i>
            <span>Dark</span>
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
