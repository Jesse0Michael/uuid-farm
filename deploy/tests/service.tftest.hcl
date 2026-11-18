# Terraform's mock provider never contacts Google Cloud or changes resources.
mock_provider "google" {}
mock_provider "googleanalytics" {}

variables {
  analytics_account_id = "123456789"
  analytics_site_url   = "https://farm.example.com/"
  project_id           = "demo-uuid-farm"
  region               = "us-central1"
  image                = "us-central1-docker.pkg.dev/demo-uuid-farm/uuid-farm/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

run "public_service_uses_runtime_identity_and_immutable_image" {
  command = plan

  assert {
    condition = (
      google_cloud_run_v2_service.farm.invoker_iam_disabled &&
      google_cloud_run_v2_service.farm.ingress == "INGRESS_TRAFFIC_ALL" &&
      google_cloud_run_v2_service.farm.deletion_protection
    )
    error_message = "The public shelter must be reachable while protecting the service against accidental deletion."
  }

  assert {
    condition = (
      google_cloud_run_v2_service.farm.template[0].service_account == "uuid-farm-runtime@demo-uuid-farm.iam.gserviceaccount.com" &&
      google_cloud_run_v2_service.farm.template[0].containers[0].image == var.image
    )
    error_message = "Cloud Run must use the runtime identity and the exact built digest."
  }

  assert {
    condition = tomap({
      for entry in google_cloud_run_v2_service.farm.template[0].containers[0].env : entry.name => entry.value if entry.name != "GA_MEASUREMENT_ID"
      }) == tomap({
      GOOGLE_CLOUD_PROJECT = var.project_id
      ANALYTICS_HOSTNAME   = "farm.example.com"
      UI_DIR               = "/ui/dist"
      LOG_FORMAT           = "JSON"
    })
    error_message = "Production uses native ADC and the built UI, with no emulator or credential-file environment."
  }

  # Google assigns the ID when the stream is created.
  assert {
    condition = contains([
      for entry in google_cloud_run_v2_service.farm.template[0].containers[0].env : entry.name
    ], "GA_MEASUREMENT_ID")
    error_message = "Cloud Run must receive the web stream measurement ID."
  }

  assert {
    condition = (
      google_cloud_run_v2_service.farm.template[0].scaling[0].min_instance_count == 0 &&
      google_cloud_run_v2_service.farm.template[0].scaling[0].max_instance_count == 1 &&
      google_cloud_run_v2_service.farm.template[0].containers[0].startup_probe[0].tcp_socket[0].port == 8080 &&
      google_cloud_run_v2_service.farm.template[0].containers[0].liveness_probe[0].http_get[0].path == "/health"
    )
    error_message = "Keep scale-to-zero, the one-instance limit, and process health probes aligned with the container."
  }
}

run "reject_mutable_image_tag" {
  command = plan

  variables {
    image = "us-central1-docker.pkg.dev/demo-uuid-farm/uuid-farm/app:latest"
  }

  expect_failures = [var.image]
}

run "reject_wrong_project_image" {
  command = plan

  variables {
    image = "us-central1-docker.pkg.dev/another-project/uuid-farm/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }

  expect_failures = [var.image]
}

run "analytics_schema_and_stream" {
  command = plan

  assert {
    condition = (
      googleanalytics_property.farm.account_id == var.analytics_account_id &&
      googleanalytics_data_stream.web.default_uri == "https://farm.example.com" &&
      googleanalytics_data_stream.web.type == "WEB_DATA_STREAM" &&
      googleanalytics_data_retention_settings.farm.event_data_retention == "FOURTEEN_MONTHS"
    )
    error_message = "Use a web stream on the canonical origin and retain event data for fourteen months."
  }

  assert {
    condition = (
      toset([for dim in googleanalytics_custom_dimension.farm : dim.parameter_name]) == toset(["service", "failure_reason", "screen_name"]) &&
      alltrue([for dim in googleanalytics_custom_dimension.farm : dim.scope == "EVENT"]) &&
      toset([for event in googleanalytics_key_event.completed : event.event_name]) == toset(["adoption_completed", "surrender_completed"]) &&
      alltrue([for event in googleanalytics_key_event.completed : event.counting_method == "ONCE_PER_EVENT"])
    )
    error_message = "Report service requests, failures, screens, and completed adoptions and surrenders."
  }
}

run "reject_measurement_id_as_account" {
  command = plan
  variables {
    analytics_account_id = "G-TEST123456"
  }
  expect_failures = [var.analytics_account_id]
}

run "reject_private_path_in_site_url" {
  command = plan
  variables {
    analytics_site_url = "https://farm.example.com/record?name=Sam"
  }
  expect_failures = [var.analytics_site_url]
}
