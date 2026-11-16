output "service_url" {
  description = "Public HTTPS URL serving the UI and API at the same origin."
  value       = google_cloud_run_v2_service.farm.uri
}

output "service_name" {
  value = google_cloud_run_v2_service.farm.name
}
