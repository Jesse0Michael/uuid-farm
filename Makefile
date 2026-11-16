.PHONY: build build-seed build-docker run test gen gen-docs ui up down logs seed

COUNT ?= 25

up:
	docker compose up --build --wait
	@docker compose port app 8080 | sed 's|^|UUID Farm: http://|'

down:
	docker compose down

logs:
	docker compose logs -f

seed:
	docker compose run --build --rm seed "$(COUNT)"

build-seed:
	go build -o bin/seed ./cmd/seed

build:
	go build -o bin/uuid-server ./cmd/server

build-docker:
	docker build -t uuid-server .

run:
	go run ./cmd/server

ui:
	cd ui && npm ci && npm run build

test:
	go test -race ./...
	cd ui && npm test && npm run build && npm run lint:api

gen:
	cd ui && npm run generate && npm run docs

gen-docs:
	cd ui && npm run docs
