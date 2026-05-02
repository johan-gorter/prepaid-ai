<script setup lang="ts">
import { useRouter } from "vue-router";
import { idbGet } from "../composables/useIdbStorage";

const router = useRouter();
const redirectMap: Record<string, string> = {
  renovations: "/renovations",
  chat: "/chat",
};

idbGet<string>("lastPage")
  .then((lastPage) => {
    router.replace(redirectMap[lastPage ?? "main"] ?? "/main");
  })
  .catch(() => {
    // If IDB is unavailable, never strand the user on the loading spinner.
    router.replace("/main");
  });
</script>

<template>
  <div class="center-align" style="padding-top: 40vh">
    <progress class="circle"></progress>
  </div>
</template>
