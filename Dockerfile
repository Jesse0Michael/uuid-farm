FROM golang:1.12-alpine AS build

# Install git + SSL ca certificates.
# Git is required for fetching the dependencies.
# Ca-certificates is required to call HTTPS endpoints.
RUN apk update && apk add --no-cache git ca-certificates && update-ca-certificates

# Copy project files
WORKDIR /go/src
COPY . .

# Fetch dependencies (go get)
# RUN go get -d -v ./...

# Fetch dependencies (go mod)
ENV GO111MODULE=on
RUN go mod download
RUN go mod verify


# Build project
ENV CGO_ENABLED=0
RUN go build -a -installsuffix cgo -o uuids .

FROM scratch AS runtime

# Copy dependent files
COPY --from=build /go/src/uuids ./
COPY --from=build /go/src/secrets/ ./
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

ENV GOOGLE_APPLICATION_CREDENTIALS=uuid-farm-firebase-adminsdk-dtm40-eeed54aa7d.json
EXPOSE 8080/tcp

ENTRYPOINT ["./uuids"]
