<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { storage } from "../firebase";
import { useRenovations } from "../composables/useRenovations";
import { useAuth } from "../composables/useAuth";

const router = useRouter();
const { createRenovation, createImpression } = useRenovations();
const { currentUser } = useAuth();

const title = ref("");
const prompt = ref("");
const selectedFile = ref<File | null>(null);
const imagePreview = ref<string | null>(null);
const submitting = ref(false);
const errorMessage = ref<string | null>(null);

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    errorMessage.value = "Please select an image file.";
    return;
  }
  selectedFile.value = file;
  errorMessage.value = null;
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.value = e.target?.result as string;
  };
  reader.readAsDataURL(file);
}

async function handleSubmit() {
  if (!selectedFile.value || !title.value.trim() || !prompt.value.trim()) {
    errorMessage.value = "Please fill in all fields and select an image.";
    return;
  }
  if (!currentUser.value) {
    errorMessage.value = "You must be signed in.";
    return;
  }

  submitting.value = true;
  errorMessage.value = null;

  try {
    const uid = currentUser.value.uid;
    const timestamp = Date.now();
    const imageRef = storageRef(
      storage,
      `users/${uid}/originals/${timestamp}.png`,
    );

    await uploadBytes(imageRef, selectedFile.value);
    const downloadUrl = await getDownloadURL(imageRef);

    const renovationId = await createRenovation({
      title: title.value.trim(),
      originalImageUrl: downloadUrl,
    });

    await createImpression(renovationId, {
      sourceImageUrl: downloadUrl,
      prompt: prompt.value.trim(),
    });

    router.push(`/renovation/${renovationId}`);
  } catch (err: unknown) {
    errorMessage.value =
      err instanceof Error ? err.message : "An unknown error occurred.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="new-renovation-page">
    <header class="page-header">
      <button class="btn-back" @click="router.push('/')">← Back</button>
      <h1>New Renovation</h1>
    </header>

    <main class="content">
      <form class="renovation-form" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="title">Title</label>
          <input
            id="title"
            v-model="title"
            type="text"
            placeholder="e.g. Kitchen remodel"
            :disabled="submitting"
          />
        </div>

        <div class="form-group">
          <label for="photo">Photo (PNG)</label>
          <input
            id="photo"
            type="file"
            accept="image/png"
            :disabled="submitting"
            @change="onFileSelected"
          />
          <img
            v-if="imagePreview"
            :src="imagePreview"
            alt="Preview"
            class="image-preview"
          />
        </div>

        <div class="form-group">
          <label for="prompt">Describe your renovation</label>
          <textarea
            id="prompt"
            v-model="prompt"
            rows="3"
            placeholder="e.g. Replace countertops with white marble"
            :disabled="submitting"
          ></textarea>
        </div>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

        <button type="submit" class="btn-primary" :disabled="submitting">
          {{ submitting ? "Creating..." : "Create Renovation" }}
        </button>
      </form>
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

.renovation-form {
  background: #fff;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #1a1a2e;
}

.form-group input[type="text"],
.form-group textarea {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-family: inherit;
  box-sizing: border-box;
}

.form-group input[type="text"]:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #0f3460;
  box-shadow: 0 0 0 2px rgba(15, 52, 96, 0.15);
}

.image-preview {
  margin-top: 0.75rem;
  max-width: 100%;
  max-height: 300px;
  border-radius: 0.5rem;
  border: 1px solid #eee;
}

.error-text {
  color: #c0392b;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.btn-primary {
  display: inline-block;
  background: #0f3460;
  color: #fff;
  padding: 0.7rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background: #1a1a2e;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
