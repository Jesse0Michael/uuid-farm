locals {
  analytics_site_url = trimsuffix(var.analytics_site_url, "/")
}

resource "googleanalytics_property" "farm" {
  account_id    = var.analytics_account_id
  display_name  = "UUID Farm"
  time_zone     = "America/Phoenix"
  currency_code = "USD"

  lifecycle {
    prevent_destroy = true
  }
}

resource "googleanalytics_data_stream" "web" {
  parent       = googleanalytics_property.farm.name
  type         = "WEB_DATA_STREAM"
  display_name = "UUID Farm web"
  default_uri  = local.analytics_site_url

  lifecycle {
    prevent_destroy = true
  }
}

resource "googleanalytics_custom_dimension" "farm" {
  for_each = {
    service        = "Requested service"
    failure_reason = "Failure reason"
    screen_name    = "App screen"
  }

  parent         = googleanalytics_property.farm.name
  parameter_name = each.key
  display_name   = each.value
  scope          = "EVENT"
}

resource "googleanalytics_key_event" "completed" {
  for_each        = toset(["adoption_completed", "surrender_completed"])
  parent          = googleanalytics_property.farm.name
  event_name      = each.key
  counting_method = "ONCE_PER_EVENT"
}

resource "googleanalytics_data_retention_settings" "farm" {
  parent                          = googleanalytics_property.farm.name
  event_data_retention            = "FOURTEEN_MONTHS"
  reset_user_data_on_new_activity = true
}

# The GA4 provider has no resource for enhanced measurement. Switch it off so
# GA cannot independently collect form interactions, search terms, or URLs.
resource "terraform_data" "enhanced_measurement" {
  triggers_replace = [
    googleanalytics_data_stream.web.name,
    filesha256("${path.module}/disable-enhanced-measurement.sh"),
  ]

  provisioner "local-exec" {
    command = "sh \"${path.module}/disable-enhanced-measurement.sh\""
    environment = {
      GA_STREAM = googleanalytics_data_stream.web.name
    }
  }
}
