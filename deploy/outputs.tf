output "service_url" {
  description = "Public HTTPS URL serving the UI and API at the same origin."
  value       = google_cloud_run_v2_service.farm.uri
}

output "service_name" {
  value = google_cloud_run_v2_service.farm.name
}

output "measurement_id" {
  description = "Public GA4 web stream measurement ID configured for the browser."
  value       = googleanalytics_data_stream.web.measurement_id
}

output "analytics_site_url" {
  description = "Public origin instrumented by the UUID Farm browser."
  value       = local.analytics_site_url
}

output "analytics_property" {
  description = "GA4 property resource name."
  value       = googleanalytics_property.farm.name
}
