<script setup lang="ts">
import { deleteUser } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AppBar from "../components/AppBar.vue";
import { useAuth } from "../composables/useAuth";
import { getLastActivity } from "../composables/useLastActivity";
import { functions } from "../firebase";

const { t } = useI18n();
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
      err instanceof Error ? err.message : t("account.deleteFailed");
    deleting.value = false;
  }
}
</script>

<template>
  <AppBar :title="$t('account.title')" />

  <main
    class="responsive"
    style="
      max-width: 800px;
      margin: 0 auto;
      padding-top: var(--app-bar-clearance);
    "
  >
    <h4>{{ $t("account.title") }}</h4>

    <article class="border small-padding">
      <h6>{{ $t("account.lastActivity") }}</h6>
      <p v-if="lastActivity">{{ lastActivity }}</p>
      <p v-else class="secondary-text">{{ $t("account.noActivity") }}</p>
    </article>

    <h5 style="margin-top: 2rem">{{ $t("account.dangerZone") }}</h5>
    <article class="border small-padding">
      <h6>{{ $t("account.deleteAccount") }}</h6>
      <p>
        {{ $t("account.deleteDescription") }}
      </p>

      <div v-if="deleteError" class="small-padding">
        <p class="error">{{ deleteError }}</p>
      </div>

      <div v-if="!showDeleteConfirm">
        <button class="error" @click="showDeleteConfirm = true">
          <i>delete_forever</i>
          <span>{{ $t("account.deleteButton") }}</span>
        </button>
      </div>

      <div v-else>
        <p>
          <strong>{{ $t("account.areYouSure") }}</strong>
          {{ $t("account.areYouSureDetail") }}
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
              deleting ? $t("account.deleting") : $t("account.confirmDelete")
            }}</span>
          </button>
          <button
            class="border"
            :disabled="deleting"
            @click="showDeleteConfirm = false"
          >
            <span>{{ $t("common.cancel") }}</span>
          </button>
        </div>
      </div>
    </article>

    <div style="padding-top: 1rem">
      <router-link to="/" class="button">
        <i>arrow_back</i>
        <span>{{ $t("common.backToMain") }}</span>
      </router-link>
    </div>
  </main>
</template>
