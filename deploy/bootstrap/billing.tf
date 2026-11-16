# Alerts only: these resources never link/disable billing or stop workloads.
# Keep the account ID in ignored terraform.tfvars, not in the public configuration.
data "google_project" "budget" {
  count      = var.billing_account == "" ? 0 : 1
  project_id = var.project_id

  depends_on = [google_project_service.apis]
}

resource "google_billing_budget" "alerts" {
  count           = var.billing_account == "" ? 0 : 1
  billing_account = var.billing_account
  display_name    = "UUID Farm monthly alerts"

  budget_filter {
    projects               = ["projects/${data.google_project.budget[0].number}"]
    calendar_period        = "MONTH"
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.budget_usd)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = []
    disable_default_iam_recipients   = false
    enable_project_level_recipients  = true
  }

  depends_on = [google_project_service.apis]
}
