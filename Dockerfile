FROM golang:1.10 AS build
WORKDIR /go/src
COPY pkg/uuids ./pkg/uuids
COPY main.go .

ENV CGO_ENABLED=0
RUN go get -d -v ./...

RUN go build -a -installsuffix cgo -o uuids .

FROM scratch AS runtime
COPY --from=build /go/src/uuids ./
EXPOSE 8080/tcp
ENTRYPOINT ["./uuids"]
