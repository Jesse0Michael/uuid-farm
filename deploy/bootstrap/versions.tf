# One-time operator setup with local state. Keep this state backed up securely.
# CI deliberately cannot change its own trust policy or Firestore permissions.
terraform {
  required_version = ">= 1.9, < 2.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # User ADC requests to the Billing Budgets API need an explicit quota project.
  user_project_override = true
  billing_project       = var.project_id
}
