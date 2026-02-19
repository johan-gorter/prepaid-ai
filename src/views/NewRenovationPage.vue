<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<template>
  <div class="new-renovation-page">
    <header class="page-header">
      <button class="btn-back" @click="router.push('/')">← Back</button>
      <h1>New Renovation</h1>
    </header>

    <main class="content">
      <div class="todo-placeholder">
        <div class="todo-icon">🚧</div>
        <h2>Coming Soon</h2>
        <p>
          This page will let you take or upload a photo, mark an area to change,
          and describe your renovation idea. An AI model will then generate an
          impression of your requested changes.
        </p>
        <p class="todo-label">
          TODO: Implement photo upload, mask drawing, and prompt input
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.new-renovation-page {
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
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.todo-placeholder {
  text-align: center;
  padding: 3rem 2rem;
  background: #fff;
  border-radius: 1rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.todo-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.todo-placeholder h2 {
  margin: 0 0 1rem;
  color: #1a1a2e;
}

.todo-placeholder p {
  color: #666;
  line-height: 1.6;
}

.todo-label {
  margin-top: 1.5rem;
  padding: 0.75rem 1rem;
  background: #fff3cd;
  border-radius: 0.5rem;
  color: #856404;
  font-size: 0.9rem;
  font-weight: 500;
}
</style>
