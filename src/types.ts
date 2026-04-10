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
}

export interface UserProfile {
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: Timestamp;
  lastActivity?: Timestamp;
  balance?: number;
}

export type TransactionReasonKey =
  | "image_generation"
  | "chat_message"
  | "credit_purchase"
  | "admin_adjustment";

/** Translations for balance transaction reason keys. */
export const TRANSACTION_REASONS: Record<TransactionReasonKey, string> = {
  image_generation: "Image generation",
  chat_message: "Chat message",
  credit_purchase: "Credit purchase",
  admin_adjustment: "Admin adjustment",
};

export interface BalanceTransaction {
  id: string;
  reasonKey: TransactionReasonKey;
  amount: number;
  balanceAfter: number;
  createdAt: Timestamp;
}
