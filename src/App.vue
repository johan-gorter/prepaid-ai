<script setup lang="ts">
import NotificationModal from "./components/NotificationModal.vue";
import { useKeyboardInset } from "./composables/useKeyboardInset";

useKeyboardInset();
</script>

<template>
  <router-view />
  <NotificationModal />
</template>
