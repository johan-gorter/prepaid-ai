provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project                     = var.project_id
  region                      = var.region
  user_project_override       = true
  billing_project             = var.project_id
}

module "firebase_env" {
  source = "./modules/firebase-env"

  project_id         = var.project_id
  environment        = var.environment
  region             = var.region
  firestore_location = var.firestore_location

  # OAuth providers
  google_oauth_client_id     = var.google_oauth_client_id
  google_oauth_client_secret = var.google_oauth_client_secret
  microsoft_oauth_client_id  = var.microsoft_oauth_client_id
  microsoft_oauth_client_secret = var.microsoft_oauth_client_secret
  apple_services_id          = var.apple_services_id
  apple_private_key          = var.apple_private_key

  # Public URL
  public_url = var.public_url
}
