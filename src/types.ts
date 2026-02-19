import type { Timestamp } from "firebase/firestore/lite";

export interface Renovation {
  id: string;
  title: string;
  originalImageUrl: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Impression {
  id: string;
  sourceImageUrl: string;
  resultImageUrl: string;
  maskImageUrl: string;
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
}
