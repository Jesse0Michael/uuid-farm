gen:
	GO_POST_PROCESS_FILE="gofmt -w" openapi-generator generate -i openapi.yaml -g go-server -o server/ -c config.json -t server/.openapi-generator/templates --git-user-id jesse0michael --git-repo-id uuid-farm --enable-post-process-file

build:
	docker build -t uuid-server server
