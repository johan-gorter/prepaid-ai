<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

const lastPage = localStorage.getItem("prepaid-ai-last-page") ?? "main";
const redirectMap: Record<string, string> = {
  renovations: "/renovations",
  chat: "/chat",
};
router.replace(redirectMap[lastPage] ?? "/main");
</script>

<template>
  <div class="center-align" style="padding-top: 40vh">
    <progress class="circle"></progress>
  </div>
</template>
