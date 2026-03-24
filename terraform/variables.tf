variable "project_id" {
  description = "GCP / Firebase project ID"
  type        = string
}

variable "environment" {
  description = "Environment label (experimental, dev, production)"
  type        = string

  validation {
    condition     = contains(["experimental", "dev", "production"], var.environment)
    error_message = "Must be one of: experimental, dev, production."
  }
}

variable "region" {
  description = "GCP region for Cloud Functions and Storage"
  type        = string
  default     = "europe-west1"
}

variable "firestore_location" {
  description = "Firestore multi-region or region (e.g. eur3, nam5, europe-west1)"
  type        = string
  default     = "eur3"
}
