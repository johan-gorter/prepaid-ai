import type { Timestamp } from "firebase/firestore";

export interface Renovation {
  id: string;
  title: string;
  originalImagePath: string;
  originalImageUrl?: string;
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
}
