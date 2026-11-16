# Deploy UUID Farm to Cloud Run

One Cloud Run container serves the web UI and Go API. The existing Firebase Firestore
database stays in place.
The existing Go client uses the Cloud Run runtime service account through Application
Default Credentials; there is no database password or service-account JSON key to store
in GitHub. This is supported by [Cloud Run's Google Cloud integration](https://docs.cloud.google.com/run/docs/integrate/using-gcp-services).

Firebase projects and their underlying Google Cloud projects share the same project ID
and resources. Set `GCP_PROJECT_ID` to the ID shown in **Firebase Console → Project settings
→ General**. Cloud Run connects to that existing database using its runtime identity;
no database move or recreation is needed. See
[Firebase's project documentation](https://firebase.google.com/docs/projects/learn-more#relationship-between-firebase-projects-and-google-cloud).

## What Terraform manages

`deploy/bootstrap/` is applied once by a project administrator:

- Required Google APIs, a private versioned Terraform state bucket, and an Artifact
  Registry Docker repository named `uuid-farm`.
- A `uuid-farm-runtime` service account with Firestore data access and a separate
  `uuid-farm-deployer` account for GitHub Actions.
- Keyless GitHub authentication restricted to this repository's numeric ID, owner ID,
  and `refs/heads/master`. The deployer can manage Cloud Run, push to this app's registry,
  use this app's runtime identity, and access this app's state bucket.
- Optional creation of a **new** native Firestore `(default)` database. This is disabled
  by default; an existing database and its documents are not adopted into Terraform.
- Optional monthly email budget alerts scoped to this project on its existing billing
  account. Bootstrap does not link a billing account or implement a spending cutoff.

`deploy/` manages the public Cloud Run service named `uuid-farm`, including the exact
container image digest. It uses a GCS backend with the prefix `uuid-farm/service`.
The runtime receives `GOOGLE_CLOUD_PROJECT`, `UI_DIR`, and JSON logging configuration.
Cloud Run provides the port and credentials. No emulator is configured in production.

The service scales to zero, uses request-based CPU billing, and sets a maximum of one
instance per revision. These settings are **not a spending cap**; Cloud Run, Firestore,
Artifact Registry, and state storage can incur charges. The Cloud Run service, state bucket,
and new databases created by bootstrap have deletion protection. Existing database settings
stay unchanged.

## Billing and cost controls

Cloud Run requires an active billing account. Linking one upgrades the existing Firebase
project to Blaze and permits charges beyond free allowances. If a guaranteed $0 bill is
required, keep billing unlinked and do not apply this Cloud Run deployment. See
[Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

To inspect an existing project's association without changing it:

```sh
gcloud billing projects describe YOUR_FIREBASE_PROJECT_ID \
  --format='yaml(projectId,billingAccountName,billingEnabled)'
```

Reusing a billing account does not provide a separate Cloud Run free allowance for this
project: Cloud Run free usage is aggregated across projects on the account. See
[Cloud Run pricing](https://cloud.google.com/run/pricing).

For alerts, add the verified linked account to ignored `deploy/bootstrap/terraform.tfvars`:

```hcl
billing_account = "ABCDEF-123456-7890AB"
budget_usd      = 1
```

This creates a monthly USD budget scoped only to this project's costs after credits, with
email thresholds at 50% and 100% ($0.50 and $1 for the default budget). Recipients are the
billing account's administrators/users and this project's owners. The operator needs
permission to manage budgets and use the project's API quota. CI receives no billing roles.
An empty `billing_account` omits the budget and Billing Budgets API setup.

**The $1 budget is an alert, not a $1 maximum bill.** Alerts can be delayed and do not stop
services. Google also offers service-specific spend caps for Cloud Run, but enforcement is
not instant, overages remain billable, and they do not cover Firestore or retained storage.
These caps are not configured by this Terraform. See
[budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets) and
[spend-cap limitations](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps).

Images and Terraform state versions are retained for recovery; their storage can grow.
This setup neither deletes rollback images automatically nor disables billing in response
to an alert. No combination of these settings guarantees zero charges.

## One-time hosting setup

Use the existing Firebase project's ID. The application currently
connects to that project's `(default)` database; hosting and Firestore in separate projects
or using a named database would require additional configuration/code changes.

Choose a Cloud Run region near the existing database. `us-central1` is the example default;
this setting does not move or recreate Firestore. Cloud Run requires billing on this project,
which means using Firebase's Blaze plan.

From the repository root, with Terraform and the Google Cloud CLI installed:

```sh
gcloud auth login
gcloud auth application-default login

cp deploy/bootstrap/terraform.tfvars.example deploy/bootstrap/terraform.tfvars
# Set project_id to the Firebase project ID and choose the Cloud Run region.

terraform -chdir=deploy/bootstrap init
terraform -chdir=deploy/bootstrap plan -out=bootstrap.tfplan
terraform -chdir=deploy/bootstrap apply bootstrap.tfplan
```

Run bootstrap as an administrator allowed to enable services, create service accounts and
Workload Identity Federation, grant project/resource IAM roles, and create storage/registry
resources. GitHub's deployment account intentionally cannot bootstrap its own permissions.
Bootstrap state remains local at `deploy/bootstrap/terraform.tfstate`; keep a secure backup
and reuse it for subsequent bootstrap changes. State, real `.tfvars`, and plan files are ignored
by Git and excluded from the Docker build. Commit the provider lock files.

If an apply partially fails (for example, because billing is not enabled), keep its local
state. Resolve the prerequisite only if you accept its billing implications, then generate
a **new** `bootstrap.tfplan` before applying again. Do not reuse a saved plan from before
the failed apply or from before changing these settings.

For an **existing** database, leave `create_firestore_database = false`. Bootstrap does not
read resident documents, change their schema, import a database, or run a migration.
Confirm that the existing database is native Firestore and named `(default)` before deployment.

For a **new project with no database**, explicitly set `create_firestore_database = true`
and choose `firestore_location` before applying bootstrap. The database location is a
one-time choice; use the location you actually want to retain. Do not enable this option
against an already existing database. The new database starts empty; there is no automatic seed.

## Prepare existing UUID data

Before the first deployment over original UUID Farm records, follow the README's
[legacy identity audit and migration instructions](../README.md#before-deploying-over-the-original-data).
The new service relies on canonical lowercase UUID document IDs. Back up the database,
stop other writers, audit, and resolve any collisions before applying a necessary migration.
This is a separate operator task; Terraform and GitHub Actions never run it.

`/healthz` checks the HTTP process, not Firestore permissions, indexes, or legacy data.
A successful deployment smoke check does not replace database preparation.

## GitHub Actions variables

Set these under **Settings → Secrets and variables → Actions → Variables** for
`Jesse0Michael/uuid-farm`. They are repository variables, not secrets.

| Variable | Value |
| --- | --- |
| `GCP_PROJECT_ID` | The existing Firebase project ID from Project settings → General. Cloud Run uses the same project. |
| `GCP_REGION` | The same region used for bootstrap, for example `us-central1`. |
| `TF_STATE_BUCKET` | Bootstrap output `state_bucket`. |
| `WIF_PROVIDER` | Bootstrap output `workload_identity_provider`; the full `projects/…/locations/global/workloadIdentityPools/…/providers/…` name. |
| `DEPLOYER_SERVICE_ACCOUNT` | Bootstrap output `deployer_service_account`, normally `uuid-farm-deployer@PROJECT_ID.iam.gserviceaccount.com`. |

The bootstrap prints commands with all five values and the repository already
selected. With `gh` authenticated, review and run that output:

```sh
terraform -chdir=deploy/bootstrap output -raw github_variables
```

No custom GitHub secrets are required. The workflow uses GitHub's built-in token for repository
reads and its OIDC token to obtain short-lived Google credentials. See the
[Google authentication action](https://github.com/google-github-actions/auth) and
[Workload Identity Federation guidance](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).

## First deployment and subsequent releases

Complete bootstrap and the existing-data audit before the first deployment. With the five
variables configured, successful **Checks** for pushes to `master` automatically trigger
**Deploy Cloud Run**. You can also run that workflow manually on `master` after its
**Checks** workflow has passed; a manual run requires successful checks for the selected commit.

The deployment workflow:

1. Selects the commit that passed checks and verifies it is still the current `master` head.
2. Builds the existing Dockerfile and pushes the image to
   `REGION-docker.pkg.dev/PROJECT_ID/uuid-farm/app`.
3. Passes that image's immutable `sha256` digest to Terraform.
4. Initializes the GCS backend, creates a plan, and applies that saved plan to Cloud Run.
5. Records the service URL in the workflow summary and requests `/healthz` without modifying data.

The first run creates the service; later runs update its revision. One concurrency group
serializes deployments so infrastructure and image changes cannot race. Terraform owns both
the image and service configuration; do not run a separate image deployer alongside it.
The public Cloud Run URL serves both the app and `/v1` API without CORS configuration.
Custom domains are not part of this setup.

Pull requests only run local Terraform formatting, validation, and mock-provider tests.
They never receive Google credentials or access production state. The cloud deployment job
accepts successful push checks from this repository's `master`, not PR or fork checks.
If the default branch or repository ownership changes, update the workflow and bootstrap
trust configuration together before deploying again.

To roll back, revert the unwanted change on `master` and let the same checks/deployment
pipeline build and deploy the revert. This keeps source, Terraform, and the running revision
aligned. The optional `v*` GHCR publishing workflow remains separate and does not deploy.

## Local infrastructure validation

These commands use no cloud credentials or remote state. `init` downloads providers;
mock tests use their schemas without contacting Google Cloud:

```sh
terraform -chdir=deploy fmt -check -recursive
terraform -chdir=deploy init -backend=false
terraform -chdir=deploy validate
terraform -chdir=deploy test
terraform -chdir=deploy/bootstrap init -backend=false
terraform -chdir=deploy/bootstrap validate
terraform -chdir=deploy/bootstrap test
```

Do not run an authenticated Terraform plan or apply merely to validate an infrastructure
edit. Cloud resources, production data, and GitHub configuration are only changed by the
explicit bootstrap and deployment steps above.
