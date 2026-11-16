# Terraform's mock provider never contacts Google Cloud or changes resources.
mock_provider "google" {}

variables {
  project_id = "demo-uuid-farm"
  region     = "us-central1"
  image      = "us-central1-docker.pkg.dev/demo-uuid-farm/uuid-farm/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
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
      for entry in google_cloud_run_v2_service.farm.template[0].containers[0].env : entry.name => entry.value
      }) == tomap({
      GOOGLE_CLOUD_PROJECT = var.project_id
      UI_DIR               = "/ui/dist"
      LOG_FORMAT           = "JSON"
    })
    error_message = "Production uses native ADC and the built UI, with no emulator or credential-file environment."
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
