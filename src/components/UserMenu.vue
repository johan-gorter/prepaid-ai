<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useColorScheme } from "../composables/useColorScheme";

const { currentUser, signOut } = useAuth();
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
onUnmounted(() =>
  document.removeEventListener("click", onDocumentClick, true),
);

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
  <div v-if="currentUser" style="position: relative" data-user-menu>
    <button class="transparent circle" @click="showMenu = !showMenu">
      <img
        v-if="currentUser.photoURL"
        :src="currentUser.photoURL"
        :alt="currentUser.displayName ?? 'User'"
        class="circle"
        style="width: 2rem; height: 2rem"
      />
      <i v-else>account_circle</i>
    </button>
    <menu :class="{ active: showMenu }" class="no-wrap" style="right: 0; left: auto">
      <li v-if="currentUser.displayName">
        <span>{{ currentUser.displayName }}</span>
      </li>
      <li class="divider"></li>
      <li>
        <a @click="chooseScheme('light')">
          <i>{{ colorScheme === 'light' ? 'check' : 'light_mode' }}</i>
          <span>Light</span>
        </a>
      </li>
      <li>
        <a @click="chooseScheme('dark')">
          <i>{{ colorScheme === 'dark' ? 'check' : 'dark_mode' }}</i>
          <span>Dark</span>
        </a>
      </li>
      <li class="divider"></li>
      <li>
        <a @click="handleSignOut">
          <i>logout</i>
          <span>Sign out</span>
        </a>
      </li>
    </menu>
  </div>
</template>
