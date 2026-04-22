<script setup lang="ts">
import { deleteUser } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import UserMenu from "../components/UserMenu.vue";
import { useAuth } from "../composables/useAuth";
import { getLastActivity } from "../composables/useLastActivity";
import { functions } from "../firebase";

const router = useRouter();
const { currentUser } = useAuth();

const lastActivity = ref<string | null>(null);
const showDeleteConfirm = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

onMounted(async () => {
  const date = await getLastActivity();
  if (date) {
    lastActivity.value = new Intl.DateTimeFormat(undefined, {
      dateStyle: "long",
      timeStyle: "short",
    }).format(date);
  }
});

async function handleDeleteAccount() {
  if (!currentUser.value) return;

  deleting.value = true;
  deleteError.value = null;

  try {
    const deleteAccountFn = httpsCallable(functions, "deleteUserAccount");
    await deleteAccountFn();
    await deleteUser(currentUser.value);
    router.replace("/login");
  } catch (err: unknown) {
    deleteError.value =
      err instanceof Error ? err.message : "Failed to delete account";
    deleting.value = false;
  }
}
</script>

<template>
  <header class="fixed">
    <nav>
      <router-link to="/main" class="breadcrumb-root">payasyougo</router-link>
      <span class="breadcrumb-sep">&gt;</span>
      <h1 class="max">Account</h1>
      <UserMenu />
    </nav>
  </header>

  <main
    class="responsive"
    style="max-width: 800px; margin: 0 auto; padding-top: 4.5rem"
  >
    <h4>Account</h4>

    <article class="border round small-padding">
      <h6>Last Activity</h6>
      <p v-if="lastActivity">{{ lastActivity }}</p>
      <p v-else class="secondary-text">No activity recorded yet.</p>
    </article>

    <h5 style="margin-top: 2rem">Danger Zone</h5>
    <article class="border round small-padding">
      <h6>Delete Account</h6>
      <p>
        Permanently delete your account and all associated data, including all
        renovations, impressions, and uploaded images. This action cannot be
        undone.
      </p>

      <div v-if="deleteError" class="small-padding">
        <p class="error">{{ deleteError }}</p>
      </div>

      <div v-if="!showDeleteConfirm">
        <button class="error" @click="showDeleteConfirm = true">
          <i>delete_forever</i>
          <span>Delete my account</span>
        </button>
      </div>

      <div v-else>
        <p>
          <strong>Are you sure?</strong> This will permanently delete
          everything.
        </p>
        <div class="row">
          <button
            class="error"
            :disabled="deleting"
            @click="handleDeleteAccount"
          >
            <progress v-if="deleting" class="circle small"></progress>
            <i v-else>delete_forever</i>
            <span>{{
              deleting ? "Deleting..." : "Yes, delete everything"
            }}</span>
          </button>
          <button
            class="border"
            :disabled="deleting"
            @click="showDeleteConfirm = false"
          >
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </article>

    <div style="padding-top: 1rem">
      <router-link to="/main" class="button">
        <i>arrow_back</i>
        <span>Back to Main</span>
      </router-link>
    </div>
  </main>
</template>

<style scoped>
.breadcrumb-root {
  text-decoration: underline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 1.25rem;
  font-weight: 500;
  color: inherit;
  min-width: 0;
}

.breadcrumb-sep {
  margin: 0 0.25rem;
  flex-shrink: 0;
}

@media (max-width: 360px) {
  .breadcrumb-root {
    max-width: 5rem;
  }
}
</style>
