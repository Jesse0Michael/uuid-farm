variable "project_id" {
  description = "Existing Firebase project ID shared with Google Cloud, with billing enabled for Cloud Run."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Use the Firebase project ID from Project settings, not its display name or project number."
  }
}

variable "region" {
  description = "Region for the registry, state bucket, and Cloud Run. Prefer a region near the existing Firestore database."
  type        = string
  default     = "us-central1"

  validation {
    condition     = can(regex("^[a-z]+(-[a-z]+)+[0-9]$", var.region))
    error_message = "Use a Google Cloud region such as us-central1."
  }
}

variable "billing_account" {
  description = "Existing linked billing account ID for project-only email alerts. Empty disables alerts; this does not link billing or cap spending."
  type        = string
  default     = ""

  validation {
    condition     = var.billing_account == "" || can(regex("^[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$", var.billing_account))
    error_message = "Use a billing account ID such as ABCDEF-123456-7890AB, or leave empty to omit alerts."
  }
}

variable "budget_usd" {
  description = "Monthly email alert budget in whole US dollars. This is not a spending cap."
  type        = number
  default     = 1

  validation {
    condition     = var.budget_usd >= 1 && floor(var.budget_usd) == var.budget_usd
    error_message = "Use a positive whole-dollar alert budget. No value guarantees a maximum bill."
  }
}

variable "github_repo" {
  description = "GitHub owner/repository for the generated variable-setting commands."
  type        = string
  default     = "Jesse0Michael/uuid-farm"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repo))
    error_message = "Use a GitHub repository in owner/name form."
  }
}

variable "github_repository_id" {
  description = "Immutable GitHub repository ID trusted by Workload Identity Federation."
  type        = string
  default     = "204247808"

  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "Use the numeric GitHub repository ID."
  }
}

variable "github_owner_id" {
  description = "Immutable GitHub owner ID; prevents trust from following a transfer to another owner."
  type        = string
  default     = "661374"

  validation {
    condition     = can(regex("^[0-9]+$", var.github_owner_id))
    error_message = "Use the numeric GitHub owner ID."
  }
}

variable "github_branch" {
  description = "Trusted deployment branch. Keep this aligned with the workflow's branch restriction."
  type        = string
  default     = "master"

  validation {
    condition     = can(regex("^[A-Za-z0-9_./-]+$", var.github_branch))
    error_message = "Use a simple Git branch name."
  }
}

variable "create_firestore_database" {
  description = "Opt in only for a new project with no default database. Existing Firestore is left unmanaged."
  type        = bool
  default     = false
}

variable "firestore_location" {
  description = "Permanent location for an opted-in new database (for example us-central1 or nam5). Defaults to region. Never moves an existing database."
  type        = string
  default     = null

  validation {
    condition     = var.firestore_location == null ? true : can(regex("^[a-z][a-z0-9-]+$", var.firestore_location))
    error_message = "Use a Firestore region or multi-region location."
  }
}

variable "analytics_account_id" {
  description = "Numeric Google Analytics account ID under which to create the UUID Farm GA4 property."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.analytics_account_id))
    error_message = "Enter the numeric account ID from Google Analytics Account details."
  }
}

variable "analytics_site_url" {
  description = "Public HTTPS origin used by visitors. A trailing slash is optional."
  type        = string

  validation {
    condition     = can(regex("^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]([a-z0-9-]{0,61}[a-z0-9])?/?$", var.analytics_site_url))
    error_message = "Use the public HTTPS origin with a lowercase hostname, such as https://farm.example.com."
  }
}
