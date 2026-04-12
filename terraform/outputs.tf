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

output "public_url" {
  description = "Primary public URL for this environment"
  value       = module.firebase_env.public_url
}

output "allowed_origins" {
  description = "Allowed CORS origins for Cloud Functions"
  value       = module.firebase_env.allowed_origins
}

output "ai_backend" {
  description = "AI backend for image generation"
  value       = module.firebase_env.ai_backend
}

output "ai_region" {
  description = "GCP region for AI / Vertex AI workloads"
  value       = module.firebase_env.ai_region
}
