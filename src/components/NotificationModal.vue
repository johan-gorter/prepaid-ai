<script setup lang="ts">
import { useNotifications } from "../composables/useNotifications";

const { current, responding, respond } = useNotifications();
</script>

<template>
  <!-- Full-screen scrim: makes the dialog truly modal by blocking clicks on
       the page underneath. We intentionally do NOT dismiss on scrim click —
       a credit gift requires an explicit Accept/Decline. -->
  <div v-if="current" class="overlay active" data-testid="notification-overlay" />

  <dialog
    :class="{ active: !!current }"
    data-testid="notification-modal"
    v-if="current"
  >
    <!-- Plain message -->
    <template v-if="current.type === 'message'">
      <h5>Notification</h5>
      <p data-testid="notification-text">{{ current.text }}</p>
      <nav class="right-align">
        <button
          :disabled="responding"
          data-testid="notification-dismiss"
          @click="respond(current.id, 'dismiss')"
        >
          <i aria-hidden="true">check</i>
          <span>Dismiss</span>
        </button>
      </nav>
    </template>

    <!-- Credits gift -->
    <template v-else-if="current.type === 'credits-gift'">
      <h5>You received a gift!</h5>
      <p data-testid="notification-gift">
        <strong>{{ current.senderName }}</strong> sent you
        <strong>{{ current.amount }} credits</strong>.
      </p>
      <nav>
        <button
          class="border"
          :disabled="responding"
          data-testid="notification-decline"
          @click="respond(current.id, 'decline')"
        >
          <i aria-hidden="true">close</i>
          <span>Decline</span>
        </button>
        <button
          :disabled="responding"
          data-testid="notification-accept"
          @click="respond(current.id, 'accept')"
        >
          <i aria-hidden="true">redeem</i>
          <span>Accept</span>
        </button>
      </nav>
    </template>
  </dialog>
</template>
