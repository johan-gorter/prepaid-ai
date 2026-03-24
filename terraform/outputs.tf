output "web_app_config" {
  description = "Firebase client-side config values (VITE_FIREBASE_* env vars)"
  value       = module.firebase_env.web_app_config
}

output "ci_service_account_email" {
  description = "Service account email for CI deployments"
  value       = module.firebase_env.ci_service_account_email
}

output "gemini_secret_id" {
  description = "Secret Manager secret ID for GEMINI_API_KEY"
  value       = module.firebase_env.gemini_secret_id
}
