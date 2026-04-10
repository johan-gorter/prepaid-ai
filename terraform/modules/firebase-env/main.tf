# ---------------------------------------------------------------------------
# APIs
# ---------------------------------------------------------------------------
locals {
  required_apis = [
    "firebase.googleapis.com",
    "firestore.googleapis.com",
    "cloudfunctions.googleapis.com",
    "secretmanager.googleapis.com",
    "firebasehosting.googleapis.com",
    "firebasestorage.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "run.googleapis.com",
    "cloudbilling.googleapis.com",
    "eventarc.googleapis.com",
    "pubsub.googleapis.com",
    "storage.googleapis.com",
    "firebaseextensions.googleapis.com",
    "identitytoolkit.googleapis.com",
    "aiplatform.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.required_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# Firebase project + web app
# ---------------------------------------------------------------------------
resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.apis]
}

resource "google_firebase_web_app" "default" {
  provider     = google-beta
  project      = var.project_id
  display_name = "Prepaid AI (${var.environment})"

  depends_on = [google_firebase_project.default]
}

data "google_firebase_web_app_config" "default" {
  provider   = google-beta
  project    = var.project_id
  web_app_id = google_firebase_web_app.default.app_id
}

# ---------------------------------------------------------------------------
# Firestore
# ---------------------------------------------------------------------------
resource "google_firestore_database" "default" {
  provider    = google-beta
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------------------
# Firebase Storage — default bucket is created by Firebase CLI on first deploy
# (the .firebasestorage.app domain is Firebase-managed and cannot be created via GCS API)
# ---------------------------------------------------------------------------

# Set CORS on the Storage bucket so the web app can fetch images cross-origin.
# Uses gsutil because the Firebase-managed bucket cannot be imported into a
# google_storage_bucket resource without risking conflicts.
resource "null_resource" "storage_cors" {
  triggers = {
    cors_hash = filemd5("${path.module}/cors.json")
  }

  provisioner "local-exec" {
    command = "gcloud storage buckets update gs://${var.project_id}.firebasestorage.app --cors-file=${path.module}/cors.json"
  }
}

# ---------------------------------------------------------------------------
# Secret Manager — GEMINI_API_KEY
# ---------------------------------------------------------------------------
resource "google_secret_manager_secret" "gemini_api_key" {
  project   = var.project_id
  secret_id = "GEMINI_API_KEY"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.apis]
}

# Grant the default Cloud Functions service account access to read the secret
resource "google_secret_manager_secret_iam_member" "functions_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.gemini_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.project_id}@appspot.gserviceaccount.com"
}

# CI deployer needs to read secret payloads at function runtime
resource "google_secret_manager_secret_iam_member" "ci_deployer_secret_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.gemini_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.ci_deployer.email}"
}

# CI deployer needs secretmanager.versions.get to validate secret versions during firebase deploy
resource "google_secret_manager_secret_iam_member" "ci_deployer_secret_viewer" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.gemini_api_key.secret_id
  role      = "roles/secretmanager.viewer"
  member    = "serviceAccount:${google_service_account.ci_deployer.email}"
}

# ---------------------------------------------------------------------------
# CI deployer service account
# ---------------------------------------------------------------------------
resource "google_service_account" "ci_deployer" {
  project      = var.project_id
  account_id   = "ci-deployer"
  display_name = "CI Deployer (${var.environment})"
}

locals {
  ci_roles = [
    "roles/firebasehosting.admin",
    "roles/cloudfunctions.admin",
    "roles/datastore.owner",
    "roles/storage.admin",
    "roles/iam.serviceAccountUser",
    "roles/firebaserules.admin",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/firebasestorage.admin",
    "roles/firebaseextensions.admin",
    "roles/run.admin",
    "roles/artifactregistry.repoAdmin",
  ]
}

resource "google_project_iam_member" "ci_deployer" {
  for_each = toset(local.ci_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.ci_deployer.email}"
}

# ---------------------------------------------------------------------------
# Identity Platform (Firebase Auth) — authorized domains + sign-in providers
# ---------------------------------------------------------------------------
locals {
  # Extract hostname from public_url (strip scheme and trailing slash)
  public_host = replace(replace(var.public_url, "/^https?:\\/\\//", ""), "/\\/$/", "")

  # Default Firebase Hosting domains
  default_domains = [
    "localhost",
    "${var.project_id}.firebaseapp.com",
    "${var.project_id}.web.app",
  ]

  # Add public_host only when it differs from the default .web.app domain
  authorized_domains = distinct(concat(local.default_domains, [local.public_host]))
}

resource "google_identity_platform_config" "auth" {
  provider = google-beta
  project  = var.project_id

  authorized_domains = local.authorized_domains

  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = true
      password_required  = true
    }
  }

  depends_on = [google_project_service.apis]
}

# Google sign-in (auto-configured OAuth client from Firebase project)
resource "google_identity_platform_default_supported_idp_config" "google" {
  provider = google-beta
  project  = var.project_id
  idp_id   = "google.com"

  client_id     = var.google_oauth_client_id
  client_secret = var.google_oauth_client_secret

  enabled = true

  depends_on = [google_identity_platform_config.auth]
}

# Microsoft sign-in
resource "google_identity_platform_default_supported_idp_config" "microsoft" {
  count    = var.microsoft_oauth_client_id != "" ? 1 : 0
  provider = google-beta
  project  = var.project_id
  idp_id   = "microsoft.com"

  client_id     = var.microsoft_oauth_client_id
  client_secret = var.microsoft_oauth_client_secret

  enabled = true

  depends_on = [google_identity_platform_config.auth]
}

# Apple sign-in
resource "google_identity_platform_default_supported_idp_config" "apple" {
  count    = var.apple_services_id != "" ? 1 : 0
  provider = google-beta
  project  = var.project_id
  idp_id   = "apple.com"

  client_id     = var.apple_services_id
  client_secret = var.apple_private_key

  enabled = true

  depends_on = [google_identity_platform_config.auth]
}
