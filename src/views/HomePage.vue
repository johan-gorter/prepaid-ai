<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

const lastPage = localStorage.getItem("prepaid-ai-last-page") ?? "main";
router.replace(lastPage === "renovations" ? "/renovations" : "/main");
</script>

<template>
  <div class="center-align" style="padding-top: 40vh">
    <progress class="circle"></progress>
  </div>
</template>
