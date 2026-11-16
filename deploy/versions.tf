terraform {
  required_version = ">= 1.9, < 2.0"

  # Supply the bootstrap bucket at init; this state owns the running service.
  backend "gcs" {
    prefix = "uuid-farm/service"
  }

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
}
