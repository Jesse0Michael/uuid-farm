# AGENTS.md

UUID Farm is satire played straight: people surrender unwanted UUIDs and others adopt
those same UUIDs. Keep user-facing copy appropriate for an earnest animal shelter.

## Scope

Adopt/Surrender and Firestore remain the core. The owner has approved an illustrated,
layered farm, a paper adoption record, and draggable UUID inchworms. Decorative creature
movement and dismissal are browser-only; never delete, adopt, or change a database record
when a creature is picked up or falls offscreen. Accounts and galleries remain out of scope.

## Layout

- `cmd/server/`: executable entrypoint.
- `cmd/seed/`: generate UUIDv4s and surrender through a server URL; never write directly to Firestore.
- `compose.yaml`: local app + disposable Firestore emulator and an opt-in seed service.
- `internal/app/`: helper-based config/logging/server construction and explicit shutdown.
- `internal/api/`: hand-written HTTP adapters and OpenAPI response contract tests.
- `internal/farm/`: resident models, errors, identity normalization.
- `internal/store/`: Firestore queries and transactions; independent of HTTP.
- `api/spec.go`: embeds and validates the spec for route registration and constraints.
- `api/openapi.yaml`: source of truth for the HTTP contract.
- `ui/public/art/`: generated transparent farm layers; prompts in `assets/art-direction.md`.
- `ui/src/creatures.ts`: browser-only inchworm animation and drag/drop physics.
- `ui/src/history.ts`: paginated arrival/adoption history on the adoption paper.
- `ui/src/music.ts`: browser-only looping farm music and a remembered sound preference.
- `ui/`: Vite + TypeScript; native HTML forms and same-origin fetch. No React or published
  npm client. `ui/src/api-types.ts` is generated; do not hand-edit.
- `docs/index.html`: generated standalone ReDoc docs.
- `cmd/normalize-uuids/`: legacy identity audit/migration; dry-run by default.
- `deploy/bootstrap/`: one-time Terraform for the state bucket, registry, keyless GitHub
  authentication, runtime identity, and optional creation of a new Firestore database.
- `deploy/`: Terraform for the combined Cloud Run UI/API service and image revisions.
- `.github/workflows/`: checks, tag-triggered GHCR publishing, and Cloud Run deployment
  after successful `master` checks. See `docs/deploy.md` for bootstrap and the five GitHub
  variables; use the existing Firebase project's ID for `GCP_PROJECT_ID`.

## Commands and checks

Docker Compose runs the whole stack with `make up`. For host development,
requires Go 1.27+, Node 24+, npm. Build Go binaries into `bin/`.

```sh
make up
make seed COUNT=100
make down
make build-seed
make build
make ui
make run
make test
cd ui && npm run test:e2e
make gen
make build-docker
```

`make test` runs Go race tests, frontend request tests, frontend build, and API lint.
Browser tests mock the API and require Playwright Chromium (`npx playwright install chromium`)
or installed Chrome with `PLAYWRIGHT_CHROME=1 npm run test:e2e`. Keep reduced-motion,
keyboard interactions, and narrow screen layouts working. Resident browsing is capped
at three pages; failures or an empty shelter use decorative UUIDs, never fake adoptions.
Use `go vet ./...` as well for Go changes. Run `goimports -w` on changed Go files and
`golangci-lint run --fix`. Use table-driven tests with `t.Context()`, `fmt.Errorf` with
`%w` for wrapped errors, and `slog` with the `"err"` key for logging errors.

Firestore integration tests skip unless `FIRESTORE_EMULATOR_HOST` is set. They use a
dedicated demo project and exercise real transactional behavior. Never point tests at
production. Report skipped checks. Do not deploy, publish, or access production merely
to validate local changes.

Terraform checks use `init -backend=false`, `validate`, and mocked provider tests; never
use production state or credentials for validation. Existing Firestore stays outside
Terraform management by default. Keep deployment authentication limited to this repository's
trusted branch, and never grant cloud credentials to pull-request code. Terraform owns
the Cloud Run image as well as service configuration; do not add a competing image deployer.

Use published `github.com/jesse0michael/pkg` helpers where their behavior fits the contract.
Do not add local module replacements or change sibling repos. Wails and Ent were evaluated;
keep the hosted web UI and native Firestore client (see README for rationale).

For API changes, edit OpenAPI first, update Go to implement it, then run `make gen` and commit
the regenerated TS types and docs. Routes, pagination limits, and name length derive from
the embedded spec; contract tests cover every declared operation. Do not regenerate Go handlers from OpenAPI.

## Data and compatibility

Firestore collection `uuids`, document ID = canonical lowercase hyphenated UUID. Existing
legacy IDs must be audited/migrated before deployment; see README. Do not run the migration
against production without an explicit request. Never silently merge colliding identities.

Keep Firestore field names `Id`, `Name`, `Tag`, `SurrenderDate`, `AdoptionDate` (no struct
tags). Available means `AdoptionDate == ""`. New dates are RFC3339; read old Go time strings
without mutating stored data. Do not change fields or storage formats without a migration.

Adoption is atomic, selecting the first available document in ID order. Keep lifecycle
changes server-controlled. Public metadata updates only change the name; names remain
publicly editable. Listing is paginated and statistics use aggregation queries.

Adopted residents can be surrendered again; residents already available still conflict.
Each transition appends an event to `uuids/{id}/history` atomically with the current
resident state. Preserve name/tag across visits. History uses increasing, fixed-width
event IDs and paginates newest first. Legacy dates are shown without read-time writes
and copied to history before the first transition replaces them; never invent prior
visits. Statistics count current state, not lifetime events.

The service uses standard Google Application Default Credentials. Configuration:
`GOOGLE_CLOUD_PROJECT`, `PORT`, `UI_DIR`, and optional `FIRESTORE_EMULATOR_HOST`.
The server serves `ui/dist` and the API together on Cloud Run. The original Heroku
backend is retired. Keep Firestore as the database.
