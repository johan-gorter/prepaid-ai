provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

module "firebase_env" {
  source = "./modules/firebase-env"

  project_id         = var.project_id
  environment        = var.environment
  region             = var.region
  firestore_location = var.firestore_location
}
