FROM golang:1.12 AS build
WORKDIR /go/src
COPY uuids ./uuids
COPY main.go .

# ENV GO111MODULE on
ENV CGO_ENABLED=0
RUN go get -d -v ./...

RUN go build -a -installsuffix cgo -o uuids .

FROM scratch AS runtime
COPY --from=build /go/src/uuids ./
EXPOSE 8080/tcp
ENTRYPOINT ["./uuids"]
