variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment label"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "firestore_location" {
  description = "Firestore location"
  type        = string
}

# ---------------------------------------------------------------------------
# OAuth provider credentials
# ---------------------------------------------------------------------------
variable "google_oauth_client_id" {
  description = "Google OAuth 2.0 client ID (from GCP Console > APIs & Services > Credentials)"
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
  description = "Apple Services ID (reverse-domain, e.g. com.example.app) — leave empty to skip"
  type        = string
  default     = ""
}

variable "apple_private_key" {
  description = "Apple private key (PEM format) for Sign in with Apple"
  type        = string
  sensitive   = true
  default     = ""
}
