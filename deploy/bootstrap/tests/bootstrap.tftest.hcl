# Mock-provider runs verify boundaries without inspecting a live project/database.
mock_provider "google" {
  mock_resource "google_service_account" {
    defaults = {
      name   = "projects/demo-uuid-farm/serviceAccounts/mock-account@demo-uuid-farm.iam.gserviceaccount.com"
      member = "serviceAccount:mock-account@demo-uuid-farm.iam.gserviceaccount.com"
    }
  }
}

variables {
  analytics_account_id = "123456789"
  analytics_site_url   = "https://farm.example.com"
  project_id           = "demo-uuid-farm"
  region               = "us-central1"
  billing_account      = ""
}

run "existing_database_is_unmanaged_and_access_is_scoped" {
  command = plan

  assert {
    condition     = contains(keys(google_project_service.apis), "analyticsadmin.googleapis.com")
    error_message = "Enable the Analytics Admin API for the existing deployer."
  }

  assert {
    condition     = length(google_firestore_database.default) == 0
    error_message = "Existing Firestore data must not be managed or replaced by default."
  }

  assert {
    condition = (
      length(google_billing_budget.alerts) == 0 &&
      !contains(keys(google_project_service.apis), "billingbudgets.googleapis.com")
    )
    error_message = "No billing-account access is required unless alerts are configured."
  }

  assert {
    condition = (
      google_project_iam_member.runtime_firestore.role == "roles/datastore.user" &&
      google_project_iam_member.runtime_firestore.condition[0].expression == "resource.name == \"projects/demo-uuid-farm/databases/(default)\"" &&
      toset(keys(google_project_iam_member.deployer)) == toset(["roles/run.admin", "roles/serviceusage.serviceUsageConsumer"]) &&
      google_service_account_iam_member.deployer_runtime.role == "roles/iam.serviceAccountUser"
    )
    error_message = "Only the runtime gets database access; CI may act as that runtime without project-wide identity administration."
  }

  assert {
    condition = (
      google_iam_workload_identity_pool_provider.github.attribute_condition == "assertion.repository_id == \"204247808\" && assertion.repository_owner_id == \"661374\" && assertion.ref == \"refs/heads/master\""
    )
    error_message = "Trust must require the immutable repository/owner IDs and the deployment branch."
  }

  assert {
    condition = (
      google_storage_bucket.state.public_access_prevention == "enforced" &&
      google_storage_bucket.state.uniform_bucket_level_access &&
      google_storage_bucket.state.versioning[0].enabled &&
      !google_storage_bucket.state.force_destroy &&
      google_storage_bucket_iam_member.deployer_state.role == "roles/storage.objectAdmin" &&
      google_artifact_registry_repository_iam_member.deployer_images.role == "roles/artifactregistry.writer"
    )
    error_message = "State must stay private/versioned, and CI state/image grants must be resource-scoped."
  }
}

run "budget_alerts_are_monthly_and_project_scoped" {
  # Resolve the project lookup deferred until API enablement, using mocks only.
  command = apply

  variables {
    billing_account = "ABCDEF-123456-7890AB"
    budget_usd      = 1
  }

  override_data {
    target = data.google_project.budget[0]
    values = {
      number = "123456789012"
    }
  }

  assert {
    condition = (
      google_billing_budget.alerts[0].billing_account == "ABCDEF-123456-7890AB" &&
      google_billing_budget.alerts[0].budget_filter[0].projects == toset(["projects/123456789012"]) &&
      google_billing_budget.alerts[0].budget_filter[0].calendar_period == "MONTH" &&
      google_billing_budget.alerts[0].budget_filter[0].credit_types_treatment == "INCLUDE_ALL_CREDITS" &&
      google_billing_budget.alerts[0].amount[0].specified_amount[0].units == "1" &&
      google_billing_budget.alerts[0].amount[0].specified_amount[0].currency_code == "USD"
    )
    error_message = "Budget alerts must cover only this project, with a monthly dollar amount after credits."
  }

  assert {
    condition = (
      toset([for rule in google_billing_budget.alerts[0].threshold_rules : rule.threshold_percent]) == toset([0.5, 1.0]) &&
      alltrue([for rule in google_billing_budget.alerts[0].threshold_rules : rule.spend_basis == "CURRENT_SPEND"]) &&
      !google_billing_budget.alerts[0].all_updates_rule[0].disable_default_iam_recipients &&
      google_billing_budget.alerts[0].all_updates_rule[0].enable_project_level_recipients &&
      contains(keys(google_project_service.apis), "billingbudgets.googleapis.com")
    )
    error_message = "Alerts must notify billing recipients and project owners at half and all of the budget."
  }
}

run "new_database_requires_opt_in_and_retains_deletion_protection" {
  command = plan

  variables {
    create_firestore_database = true
    firestore_location        = "nam5"
  }

  assert {
    condition = (
      length(google_firestore_database.default) == 1 &&
      google_firestore_database.default[0].name == "(default)" &&
      google_firestore_database.default[0].type == "FIRESTORE_NATIVE" &&
      google_firestore_database.default[0].location_id == "nam5" &&
      google_firestore_database.default[0].delete_protection_state == "DELETE_PROTECTION_ENABLED" &&
      google_firestore_database.default[0].deletion_policy == "ABANDON"
    )
    error_message = "An opted-in new database must retain the native default identity and deletion safeguards."
  }
}
