import type { Timestamp } from "firebase/firestore";

export interface Renovation {
  id: string;
  originalImagePath: string;
  originalImageUrl?: string;
  afterImpressionId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Impression {
  id: string;
  sourceImagePath: string;
  sourceImageUrl?: string;
  resultImagePath?: string;
  resultImageUrl?: string;
  maskImagePath?: string;
  maskImageUrl?: string;
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Timestamp;
  error?: string;
  shareToken?: string;
}

export interface Share {
  ownerUid: string;
  resultImageUrl: string;
  createdAt: Timestamp;
}

export interface UserProfile {
  displayName: string;
  email: string;
  /** Rewritten by the sign-in upsert on every sign-in (useAuth.ts). */
  lastSignIn: Timestamp;
  lastActivity?: Timestamp;
  balance?: number;
}

export type TransactionReasonKey =
  | "image_generation"
  | "chat_message"
  | "credit_purchase"
  | "admin_adjustment"
  | "credit_transfer_sent"
  | "credit_transfer_received"
  | "credit_transfer_refunded";

// Human-readable labels for these reason keys live in the i18n catalogs under
// `balance.reason.*` (keyed by the same strings) so they can be localized.

/** Types of in-app notifications surfaced as a modal popup. */
export type NotificationType = "message" | "credits-gift";

/**
 * A single per-user notification (`users/{uid}/notifications/{id}`).
 * Written only by Cloud Functions; the client reads them and responds via
 * the `notificationResponse` callable.
 */
export interface AppNotification {
  id: string;
  type: NotificationType;
  createdAt: Timestamp;
  /** `message` type: the text to show with a Dismiss button. */
  text?: string;
  /** `credits-gift` type: how many credits were gifted. */
  amount?: number;
  /** `credits-gift` type: display name (or email) of the sender. */
  senderName?: string;
  /** `credits-gift` type: id of the backing `creditTransfers` doc. */
  transferId?: string;
}

export interface BalanceTransaction {
  id: string;
  reasonKey: TransactionReasonKey;
  amount: number;
  balanceAfter: number;
  createdAt: Timestamp;
}
