<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useImpressions } from "../composables/useImpressions";

const route = useRoute();
const router = useRouter();
const renovationId = computed(() => route.params.id as string);
const renovationIdRef = ref(renovationId.value);

// Keep ref in sync with route param
import { watch } from "vue";
watch(renovationId, (val) => {
  renovationIdRef.value = val;
});

const { impressions, loading } = useImpressions(renovationIdRef);
</script>

<template>
  <div class="detail-page">
    <header class="page-header">
      <button class="btn-back" @click="router.push('/')">← Back</button>
      <h1>Renovation</h1>
    </header>

    <main class="content">
      <div v-if="loading" class="state-message">
        <p>Loading impressions…</p>
      </div>

      <div v-else-if="impressions.length === 0" class="state-message">
        <p>No impressions yet.</p>
      </div>

      <div v-else class="impressions-list">
        <div
          v-for="impression in impressions"
          :key="impression.id"
          class="impression-card"
        >
          <div class="impression-header">
            <span class="prompt-text">{{ impression.prompt }}</span>
            <span
              class="status-badge"
              :class="'status-' + impression.status"
            >
              {{ impression.status }}
            </span>
          </div>

          <div v-if="impression.status === 'completed' && impression.resultImageUrl" class="result-section">
            <img
              :src="impression.resultImageUrl"
              alt="Result"
              class="result-image"
            />
          </div>

          <div v-else-if="impression.status === 'processing'" class="processing-section">
            <p>Processing your renovation…</p>
          </div>

          <div v-else-if="impression.status === 'failed'" class="error-section">
            <p>Processing failed: {{ impression.error }}</p>
          </div>

          <div v-else class="pending-section">
            <p>Waiting to be processed…</p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.detail-page {
  min-height: 100vh;
  background: #f8f9fa;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: #1a1a2e;
  color: #fff;
}

.page-header h1 {
  margin: 0;
  font-size: 1.25rem;
}

.btn-back {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem 0.5rem;
}

.btn-back:hover {
  color: #fff;
}

.content {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
}

.state-message {
  text-align: center;
  padding: 3rem 1rem;
  color: #666;
}

.impressions-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.impression-card {
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.impression-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #f0f0f0;
}

.prompt-text {
  font-weight: 500;
  color: #1a1a2e;
}

.status-badge {
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  border-radius: 1rem;
  font-weight: 500;
  text-transform: capitalize;
}

.status-pending {
  background: #fff3cd;
  color: #856404;
}

.status-processing {
  background: #cce5ff;
  color: #004085;
}

.status-completed {
  background: #d4edda;
  color: #155724;
}

.status-failed {
  background: #f8d7da;
  color: #721c24;
}

.result-image {
  width: 100%;
  display: block;
}

.processing-section,
.pending-section,
.error-section {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.error-section {
  color: #c0392b;
}
</style>
