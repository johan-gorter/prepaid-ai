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
