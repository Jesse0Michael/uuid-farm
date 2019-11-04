
CREDS = $(shell base64 secrets/firebase_credentials.json)

gen:
	# docker run -v ${PWD}:/uuid  openapitools/openapi-generator-cli generate -i /uuid/api/openapi.yaml -g go-server -o /uuid -c /uuid/config.json --git-user-id jesse0michael --git-repo-id uuid-farm --enable-post-process-file
	# GO_POST_PROCESS_FILE="gofmt -w"    -t /uuid/server/.openapi-generator/templates

	# docker run -v ${PWD}:/uuid  openapitools/openapi-generator-cli generate -i /uuid/api/openapi.yaml -g javascript -o /uuid/client/js/ 

	docker run -v ${PWD}:/uuid  openapitools/openapi-generator-cli generate -i /uuid/api/openapi.yaml -g typescript-node -o /uuid/client/ts/ --git-user-id jesse0michael --git-repo-id uuid-farm --additional-properties=npmName=@jesse0michael/uuid-farm,npmVersion=1.0.0

build:
	docker build -t uuid-server .

run:
	docker run -e GOOGLE_APPLICATION_CREDENTIALS=creds.json -e GOOGLE_CREDENTIALS="$(CREDS)" -p 8080:8080 uuid-server
