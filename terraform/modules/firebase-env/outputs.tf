output "web_app_config" {
  description = "Firebase client-side configuration"
  value = {
    api_key              = data.google_firebase_web_app_config.default.api_key
    auth_domain          = "${var.project_id}.firebaseapp.com"
    project_id           = var.project_id
    storage_bucket       = "${var.project_id}.firebasestorage.app"
    messaging_sender_id  = data.google_firebase_web_app_config.default.messaging_sender_id
    app_id               = google_firebase_web_app.default.app_id
  }
}

output "ci_service_account_email" {
  description = "Email of the CI deployer service account"
  value       = google_service_account.ci_deployer.email
}

output "gemini_secret_id" {
  description = "Secret Manager resource ID for GEMINI_API_KEY"
  value       = google_secret_manager_secret.gemini_api_key.id
}

output "public_url" {
  description = "Primary public URL for this environment"
  value       = var.public_url
}

output "allowed_origins" {
  description = "Allowed CORS origins for Cloud Functions"
  value = distinct([
    "https://${var.project_id}.web.app",
    "https://${var.project_id}.firebaseapp.com",
    var.public_url,
  ])
}
