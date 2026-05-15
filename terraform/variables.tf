variable "project_id" {
  description = "GCP / Firebase project ID"
  type        = string

  # Cross-checks project_id against environment. Catches the case where someone
  # runs `terraform apply` with the wrong -var-file but a correctly-initialized
  # backend (or vice versa). Requires Terraform 1.9+ for cross-variable refs.
  validation {
    condition = (
      (var.environment == "sandbox" && var.project_id == "prepaid-ai-sandbox") ||
      (var.environment == "dev" && var.project_id == "prepaid-ai-dev") ||
      (var.environment == "production" && var.project_id == "payasyougo-production")
    )
    error_message = "project_id must match environment (sandbox→prepaid-ai-sandbox, dev→prepaid-ai-dev, production→payasyougo-production). Did you mix -var-file with the wrong backend prefix?"
  }
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
# AI / Image generation
# ---------------------------------------------------------------------------
variable "ai_backend" {
  description = "AI backend for image generation: vertex, google-ai, or dummy"
  type        = string
  default     = "google-ai"

  validation {
    condition     = contains(["vertex", "google-ai", "dummy"], var.ai_backend)
    error_message = "Must be one of: vertex, google-ai, dummy."
  }
}

variable "ai_region" {
  description = "GCP region for AI / Vertex AI workloads (may differ from main region)"
  type        = string
  default     = "global"
}

# ---------------------------------------------------------------------------
# Stripe payments
# ---------------------------------------------------------------------------
variable "stripe_backend" {
  description = "Stripe payment backend: stripe (real Checkout) or dummy (adds credits directly, no Stripe call)"
  type        = string
  default     = "dummy"

  validation {
    condition     = contains(["stripe", "dummy"], var.stripe_backend)
    error_message = "Must be one of: stripe, dummy."
  }
}

# ---------------------------------------------------------------------------
# Public URLs
# ---------------------------------------------------------------------------
variable "public_url" {
  description = "Primary public URL for this environment (used for CORS and display)"
  type        = string
}
