FROM node:24-alpine AS ui
WORKDIR /src/ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
COPY docs/index.html /src/docs/index.html
COPY api/openapi.yaml /src/api/openapi.yaml
RUN npm test && npm run build

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /bin/uuid-server ./cmd/server
RUN CGO_ENABLED=0 go build -trimpath -o /bin/seed ./cmd/seed

FROM scratch AS seed
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /bin/seed /seed
USER 65532:65532
ENTRYPOINT ["/seed"]

FROM scratch AS app
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /bin/uuid-server /uuid-server
COPY --from=build /bin/seed /seed
COPY --from=ui /src/ui/dist /ui/dist
USER 65532:65532
ENV PORT=8080 UI_DIR=/ui/dist
EXPOSE 8080
ENTRYPOINT ["/uuid-server"]
