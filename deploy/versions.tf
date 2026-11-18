terraform {
  required_version = ">= 1.9, < 2.0"

  # Supply the bootstrap bucket at init; this state owns the running service.
  backend "gcs" {
    prefix = "uuid-farm/service"
  }

  required_providers {
    googleanalytics = {
      source  = "breymander/google-analytics"
      version = "= 0.1.0"
    }
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

provider "googleanalytics" {}
