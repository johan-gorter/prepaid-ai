import type { Timestamp } from "firebase/firestore";

// ---------------------------------------------------------------------------
// Credit packages — keep in sync with CREDIT_PACKAGES in functions/src/credits.ts
// ---------------------------------------------------------------------------

export interface CreditPackage {
  id: CreditPackageId;
  credits: number;
  priceCents: number;
}

export type CreditPackageId =
  | "credits_100"
  | "credits_500"
  | "credits_1000"
  | "credits_5000";

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "credits_100", credits: 100, priceCents: 100 },
  { id: "credits_500", credits: 500, priceCents: 500 },
  { id: "credits_1000", credits: 1000, priceCents: 1000 },
  { id: "credits_5000", credits: 5000, priceCents: 5000 },
];

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
