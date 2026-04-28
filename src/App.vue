<script setup lang="ts">
import { useKeyboardInset } from "./composables/useKeyboardInset";

useKeyboardInset();
</script>

<template>
  <router-view />
</template>
