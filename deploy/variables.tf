variable "project_id" {
  description = "Existing Firebase project ID shared with Google Cloud; contains the default Firestore database and bootstrap resources."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Use the Firebase project ID from Project settings, not its display name or project number."
  }
}

variable "region" {
  description = "Cloud Run region; use the same region as bootstrap's Artifact Registry."
  type        = string
  default     = "us-central1"

  validation {
    condition     = can(regex("^[a-z]+(-[a-z]+)+[0-9]$", var.region))
    error_message = "Use a Google Cloud region such as us-central1."
  }
}

variable "image" {
  description = "Built application image in this project's uuid-farm Artifact Registry repository, pinned to a SHA256 digest."
  type        = string

  validation {
    condition     = can(regex("^${var.region}-docker\\.pkg\\.dev/${var.project_id}/uuid-farm/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$", var.image))
    error_message = "Use an immutable ${var.region}-docker.pkg.dev/${var.project_id}/uuid-farm/IMAGE@sha256:DIGEST reference."
  }
}
