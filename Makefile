
CREDS = $(shell base64 secrets/firebase_credentials.json)

gen:
	docker run -v ${PWD}:/uuid  openapitools/openapi-generator-cli generate -i /uuid/api/openapi.yaml -g go-server -o /uuid -c /uuid/config.json --git-user-id jesse0michael --git-repo-id uuid-farm --enable-post-process-file  -t /uuid/.openapi-generator/templates/go-server
	# GO_POST_PROCESS_FILE="gofmt -w"   

	docker run -v ${PWD}:/uuid  openapitools/openapi-generator-cli generate -i /uuid/api/openapi.yaml -g typescript-node -o /uuid/client/ts/ --git-user-id jesse0michael --git-repo-id uuid-farm --additional-properties=npmName=@jesse0michael/uuid-farm,npmVersion=1.0.0

build:
	go build -o bin/.

build-docker:
	docker build -t uuid-server .

run:
	docker run -e GOOGLE_APPLICATION_CREDENTIALS=creds.json -e GOOGLE_CREDENTIALS="$(CREDS)" -p 8080:8080 uuid-server
