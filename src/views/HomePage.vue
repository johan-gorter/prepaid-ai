<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useRenovations } from "../composables/useRenovations";
import { resolveStorageUrl } from "../composables/useStorageUrl";

const { renovations, loading: renovationsLoading, error } = useRenovations();
const { currentUser, signOut } = useAuth();
const router = useRouter();
const thumbnailUrls = ref<Record<string, string>>({});

watch(
  renovations,
  async (items, _oldValue, onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    const urlEntries = await Promise.all(
      items.map(async (renovation) => {
        if (renovation.originalImagePath) {
          try {
            return [
              renovation.id,
              await resolveStorageUrl(renovation.originalImagePath),
            ] as const;
          } catch {
            return [renovation.id, renovation.originalImageUrl ?? ""] as const;
          }
        }

        return [renovation.id, renovation.originalImageUrl ?? ""] as const;
      }),
    );

    if (!cancelled) {
      thumbnailUrls.value = Object.fromEntries(
        urlEntries.filter(([, url]) => Boolean(url)),
      );
    }
  },
  { immediate: true },
);

async function handleSignOut() {
  await signOut();
  router.push("/login");
}
</script>

<template>
  <div class="home-page">
    <header class="app-header">
      <h1>Prepaid AI</h1>
      <div class="user-info" v-if="currentUser">
        <img
          v-if="currentUser.photoURL"
          :src="currentUser.photoURL"
          :alt="currentUser.displayName ?? 'User'"
          class="avatar"
        />
        <span class="user-name">{{ currentUser.displayName }}</span>
        <button class="btn-text" @click="handleSignOut">Sign out</button>
      </div>
    </header>

    <main class="content">
      <div class="section-header">
        <h2>My Renovations</h2>
        <router-link to="/renovation/new" class="btn-primary">
          + New Renovation
        </router-link>
      </div>

      <div v-if="renovationsLoading" class="state-message">
        <p>Loading renovations…</p>
      </div>

      <div v-else-if="error" class="state-message error">
        <p>Error loading renovations: {{ error }}</p>
      </div>

      <div v-else-if="renovations.length === 0" class="empty-state">
        <div class="empty-icon">📷</div>
        <h3>No renovations yet</h3>
        <p>Take or upload a photo of your space and let AI reimagine it.</p>
        <router-link to="/renovation/new" class="btn-primary">
          Start your first renovation
        </router-link>
      </div>

      <div v-else class="renovation-list">
        <div
          v-for="renovation in renovations"
          :key="renovation.id"
          class="renovation-card"
          @click="router.push(`/renovation/${renovation.id}`)"
        >
          <img
            :src="
              thumbnailUrls[renovation.id] ?? renovation.originalImageUrl ?? ''
            "
            :alt="renovation.title"
            class="renovation-thumbnail"
          />
          <div class="renovation-info">
            <h3>{{ renovation.title }}</h3>
            <p class="renovation-date">
              {{ renovation.createdAt?.toDate?.()?.toLocaleDateString() ?? "" }}
            </p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f8f9fa;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: #1a1a2e;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.app-header h1 {
  font-size: 1.25rem;
  margin: 0;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
}

.user-name {
  font-size: 0.9rem;
}

.btn-text {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 0.85rem;
  text-decoration: underline;
}

.btn-text:hover {
  color: #fff;
}

.content {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.section-header h2 {
  margin: 0;
  color: #1a1a2e;
}

.btn-primary {
  display: inline-block;
  background: #0f3460;
  color: #fff;
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background: #1a1a2e;
}

.state-message {
  text-align: center;
  padding: 3rem 1rem;
  color: #666;
}

.state-message.error {
  color: #c0392b;
}

.empty-state {
  text-align: center;
  padding: 4rem 1rem;
  background: #fff;
  border-radius: 1rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: #1a1a2e;
}

.empty-state p {
  color: #666;
  margin-bottom: 1.5rem;
}

.renovation-list {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.renovation-card {
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.renovation-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.renovation-thumbnail {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
}

.renovation-info {
  padding: 0.75rem 1rem;
}

.renovation-info h3 {
  margin: 0;
  font-size: 1rem;
  color: #1a1a2e;
}

.renovation-date {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  color: #999;
}
</style>
