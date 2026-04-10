variable "project_id" {
  description = "GCP / Firebase project ID"
  type        = string
}

variable "environment" {
  description = "Environment label (sandbox, dev, production)"
  type        = string

  validation {
    condition     = contains(["sandbox", "dev", "production"], var.environment)
    error_message = "Must be one of: sandbox, dev, production."
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

# ---------------------------------------------------------------------------
# OAuth provider credentials
# ---------------------------------------------------------------------------
variable "google_oauth_client_id" {
  description = "Google OAuth 2.0 client ID"
  type        = string
}

variable "google_oauth_client_secret" {
  description = "Google OAuth 2.0 client secret"
  type        = string
  sensitive   = true
}

variable "microsoft_oauth_client_id" {
  description = "Microsoft (Azure AD) application client ID — leave empty to skip"
  type        = string
  default     = ""
}

variable "microsoft_oauth_client_secret" {
  description = "Microsoft application client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "apple_services_id" {
  description = "Apple Services ID — leave empty to skip"
  type        = string
  default     = ""
}

variable "apple_private_key" {
  description = "Apple private key (PEM) for Sign in with Apple"
  type        = string
  sensitive   = true
  default     = ""
}

# ---------------------------------------------------------------------------
# Public URLs
# ---------------------------------------------------------------------------
variable "public_url" {
  description = "Primary public URL for this environment (used for CORS and display)"
  type        = string
}
