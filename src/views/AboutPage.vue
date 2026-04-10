<script setup lang="ts">
import UserMenu from "../components/UserMenu.vue";
import { useAuth } from "../composables/useAuth";

const { currentUser } = useAuth();
</script>

<template>
  <header class="fixed primary">
    <nav>
      <router-link to="/main" class="breadcrumb-root">Prepaid AI</router-link>
      <span class="breadcrumb-sep">&gt;</span>
      <h5 class="max">About</h5>
      <UserMenu />
    </nav>
  </header>

  <main
    class="responsive"
    style="max-width: 700px; margin: 0 auto; padding-top: 4.5rem"
  >
    <h4>About Prepaid AI</h4>
    <p>
      Prepaid AI helps you visualize renovation ideas by combining your photos
      with AI-powered image editing. Upload a photo of your space, highlight the
      area you want to change, describe your vision, and receive an AI-generated
      preview of the result.
    </p>

    <h5>Acceptable Use</h5>
    <p>
      You are responsible for the images you upload. Uploaded images
      <strong>must not</strong> contain:
    </p>
    <ul>
      <li>Harmful, hateful, violent, or otherwise objectionable content</li>
      <li>Personal or private information (PII) of any individual</li>
      <li>Recognizable persons without their explicit consent</li>
      <li>Readable license plates or other identifying markers</li>
    </ul>
    <p>
      We reserve the right to remove any content that violates these guidelines
      without prior notice.
    </p>

    <h5>Data Retention</h5>
    <p>
      Uploaded images and generated results will be retained for a minimum of
      <strong>12 months</strong> and a maximum of <strong>24 months</strong>
      from the date of upload. After the retention period, images may be
      permanently deleted. You can delete your images at any time from the
      renovation detail page, or delete your entire account from the
      <router-link to="/account">Account</router-link> page.
    </p>

    <h5>Privacy</h5>
    <p>
      We collect only the information necessary to provide the service: your
      authentication identity (via Google, Microsoft, or Apple sign-in) and the
      images and prompts you submit. We do not sell or share your data with
      third parties. Image processing is performed by Google's Gemini AI
      service.
    </p>

    <h5>Terms of Service</h5>
    <p>
      By using Prepaid AI, you agree to these terms. The service is provided "as
      is" without warranty of any kind. We may modify or discontinue the service
      at any time. Continued use after changes constitutes acceptance of the
      updated terms.
    </p>

    <div style="padding-top: 1rem">
      <router-link :to="currentUser ? '/main' : '/login'" class="button">
        <i>arrow_back</i>
        <span>Back</span>
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
