package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/getkin/kin-openapi/openapi3"

	contract "github.com/jesse0michael/uuid-farm/api"
	"github.com/jesse0michael/uuid-farm/internal/farm"
)

// Service allows HTTP behavior to be tested without production credentials.
type Service interface {
	AdoptUUID(context.Context) (farm.Uuid, error)
	GetFarm(context.Context) (farm.Farm, error)
	GetUUID(context.Context, string) (farm.Uuid, error)
	GetUUIDs(context.Context, int, string) (farm.Page, error)
	SurrenderUUID(context.Context, string) (farm.Uuid, error)
	UpdateUUID(context.Context, string, farm.Metadata) (farm.Uuid, error)
}

func NewRouter(service Service) *http.ServeMux {
	mux := http.NewServeMux()
	spec, err := contract.Load()
	if err != nil {
		panic(err)
	} // Invalid embedded build input: caught by contract tests.
	var constraints *openapi3.Schema
	for _, parameter := range spec.Paths.Value("/uuids").Get.Parameters {
		if parameter.Value.Name == "limit" && parameter.Value.In == "query" {
			constraints = parameter.Value.Schema.Value
		}
	}
	if constraints == nil || constraints.Min == nil || constraints.Max == nil {
		panic("OpenAPI limit parameter requires bounds")
	}
	defaultLimit := int(constraints.Default.(float64))
	minLimit, maxLimit := int(*constraints.Min), int(*constraints.Max)
	maxName := int(*spec.Components.Schemas["Metadata"].Value.Properties["name"].Value.MaxLength)
	operations := map[string]http.HandlerFunc{}
	handle := func(id string, fn http.HandlerFunc) { operations[id] = fn }
	handle("getFarm", func(w http.ResponseWriter, r *http.Request) {
		result, err := service.GetFarm(r.Context())
		respond(w, result, err, 200)
	})
	handle("getUUIDs", func(w http.ResponseWriter, r *http.Request) {
		limit := defaultLimit
		if raw := r.URL.Query().Get("limit"); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil || parsed < minLimit || parsed > maxLimit {
				EncodeErrorResponse(farm.ErrInvalidInput, w)
				return
			}
			limit = parsed
		}
		cursor := r.URL.Query().Get("cursor")
		if cursor != "" {
			normalized, err := farm.NormalizeID(cursor)
			if err != nil || normalized != cursor {
				EncodeErrorResponse(farm.ErrInvalidInput, w)
				return
			}
		}
		result, err := service.GetUUIDs(r.Context(), limit, cursor)
		respond(w, result, err, 200)
	})
	handle("adoptUUID", func(w http.ResponseWriter, r *http.Request) {
		result, err := service.AdoptUUID(r.Context())
		respond(w, result, err, 200)
	})
	handle("getUUID", func(w http.ResponseWriter, r *http.Request) {
		id, err := farm.NormalizeID(r.PathValue("id"))
		if err != nil {
			EncodeErrorResponse(err, w)
			return
		}
		result, err := service.GetUUID(r.Context(), id)
		respond(w, result, err, 200)
	})
	handle("surrenderUUID", func(w http.ResponseWriter, r *http.Request) {
		id, err := farm.NormalizeID(r.PathValue("id"))
		if err != nil {
			EncodeErrorResponse(err, w)
			return
		}
		result, err := service.SurrenderUUID(r.Context(), id)
		if err == nil {
			w.Header().Set("Location", "/v1/uuids/"+result.Id)
		}
		respond(w, result, err, 201)
	})
	handle("updateUUID", func(w http.ResponseWriter, r *http.Request) {
		id, err := farm.NormalizeID(r.PathValue("id"))
		if err != nil {
			EncodeErrorResponse(err, w)
			return
		}
		if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
			EncodeJSONResponse(ApiError{Code: 415, Message: "Expected application/json"}, 415, w)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		// Pointer distinguishes null and an absent name from a request to clear it.
		var input *struct {
			Name *string `json:"name"`
		}
		if err := decoder.Decode(&input); err != nil || input == nil || input.Name == nil {
			EncodeErrorResponse(farm.ErrInvalidInput, w)
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF || !utf8.ValidString(*input.Name) || utf8.RuneCountInString(*input.Name) > maxName {
			EncodeErrorResponse(farm.ErrInvalidInput, w)
			return
		}
		result, err := service.UpdateUUID(r.Context(), id, farm.Metadata{Name: strings.TrimSpace(*input.Name)})
		respond(w, result, err, 200)
	})
	// Bind by operation ID: adding or removing an operation requires an implementation.
	for path, item := range spec.Paths.Map() {
		for method, operation := range item.Operations() {
			fn, ok := operations[operation.OperationID]
			if !ok {
				panic(fmt.Sprintf("unimplemented API operation %q", operation.OperationID))
			}
			delete(operations, operation.OperationID)
			pattern := method + " " + spec.Servers[0].URL + path
			if strings.HasSuffix(path, "/") {
				pattern += "{$}"
			}
			mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
				ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
				defer cancel()
				w.Header().Set("Cache-Control", "no-store")
				fn(w, r.WithContext(ctx))
			})
		}
	}
	if len(operations) != 0 {
		panic("handlers exist without OpenAPI operations")
	}
	// Unknown API paths must never fall through to the static UI.
	mux.HandleFunc("/v1/", func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
	return mux
}
func respond(w http.ResponseWriter, result any, err error, code int) {
	if err != nil {
		EncodeErrorResponse(err, w)
		return
	}
	EncodeJSONResponse(result, code, w)
}
