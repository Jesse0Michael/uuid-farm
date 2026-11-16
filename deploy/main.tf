# Bootstrap owns identity, registry, APIs, and optional database creation. This
# state owns the complete Cloud Run configuration, including the deployed digest.
resource "google_cloud_run_v2_service" "farm" {
  name                 = "uuid-farm"
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  deletion_protection  = true

  template {
    service_account                  = "uuid-farm-runtime@${var.project_id}.iam.gserviceaccount.com"
    timeout                          = "30s"
    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      dynamic "env" {
        for_each = {
          GOOGLE_CLOUD_PROJECT = var.project_id
          UI_DIR               = "/ui/dist"
          LOG_FORMAT           = "JSON"
        }
        content {
          name  = env.key
          value = env.value
        }
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 1
        period_seconds        = 3
        failure_threshold     = 20

        tcp_socket {
          port = 8080
        }
      }

      # Process health only: database availability must not cause restart loops.
      liveness_probe {
        timeout_seconds   = 1
        period_seconds    = 30
        failure_threshold = 3

        http_get {
          path = "/health"
          port = 8080
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}
