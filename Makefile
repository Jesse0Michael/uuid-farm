gen:
	docker run -v ${PWD}:/uuid  openapitools/openapi-generator-cli generate -i /uuid/openapi.yaml -g go-server -o /uuid/pkg -c /uuid/config.json --git-user-id jesse0michael --git-repo-id uuid-farm --enable-post-process-file
	# GO_POST_PROCESS_FILE="gofmt -w"    -t /uuid/server/.openapi-generator/templates

build:
	docker build -t uuid-server server

run:
	docker run -p 8080:8080 uuid-server
