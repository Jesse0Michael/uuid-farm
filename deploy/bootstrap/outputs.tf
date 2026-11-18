output "state_bucket" {
  value = google_storage_bucket.state.name
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  value = google_service_account.deployer.email
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "image_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "github_variables" {
  description = "Review these commands, then run with an authenticated gh CLI to configure this repository."
  value       = <<-EOT
    gh variable set GA_ACCOUNT_ID --repo '${var.github_repo}' --body '${var.analytics_account_id}'
    gh variable set GA_SITE_URL --repo '${var.github_repo}' --body '${var.analytics_site_url}'
    gh variable set GCP_PROJECT_ID --repo '${var.github_repo}' --body '${var.project_id}'
    gh variable set GCP_REGION --repo '${var.github_repo}' --body '${var.region}'
    gh variable set TF_STATE_BUCKET --repo '${var.github_repo}' --body '${google_storage_bucket.state.name}'
    gh variable set WIF_PROVIDER --repo '${var.github_repo}' --body '${google_iam_workload_identity_pool_provider.github.name}'
    gh variable set DEPLOYER_SERVICE_ACCOUNT --repo '${var.github_repo}' --body '${google_service_account.deployer.email}'
  EOT
}
