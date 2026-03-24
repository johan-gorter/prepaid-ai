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
    "roles/cloudfunctions.developer",
    "roles/datastore.owner",
    "roles/storage.admin",
    "roles/iam.serviceAccountUser",
    "roles/firebaserules.admin",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/firebasestorage.admin",
  ]
}

resource "google_project_iam_member" "ci_deployer" {
  for_each = toset(local.ci_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.ci_deployer.email}"
}
