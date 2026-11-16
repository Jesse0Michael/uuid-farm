package api

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers/legacy"
	contract "github.com/jesse0michael/uuid-farm/api"
	"github.com/jesse0michael/uuid-farm/internal/farm"
)

type contractService struct{ err error }

func (s contractService) AdoptUUID(context.Context) (farm.Uuid, error) { return specimen(), s.err }
func (s contractService) GetFarm(context.Context) (farm.Farm, error) {
	return farm.Farm{Uuids: 1, Surrendered: 1}, s.err
}
func (s contractService) GetUUID(context.Context, string) (farm.Uuid, error) {
	return specimen(), s.err
}
func (s contractService) GetUUIDs(context.Context, int, string) (farm.Page, error) {
	return farm.Page{Items: []farm.Uuid{specimen()}, NextCursor: testID}, s.err
}
func (s contractService) SurrenderUUID(context.Context, string) (farm.Uuid, error) {
	return specimen(), s.err
}
func (s contractService) UpdateUUID(context.Context, string, farm.Metadata) (farm.Uuid, error) {
	return specimen(), s.err
}
func specimen() farm.Uuid {
	return farm.Uuid{Id: testID, Name: "Mabel", Tag: "legacy", SurrenderDate: "2019-10-25T12:13:14Z", AdoptionDate: "2026-11-15T12:00:00Z"}
}

// Every operation in the spec must have a working handler and conforming success
// and error responses. Adding an operation automatically expands this test.
func TestOpenAPIResponses(t *testing.T) {
	spec, err := contract.Load()
	if err != nil {
		t.Fatal(err)
	}
	validator, err := legacy.NewRouter(spec)
	if err != nil {
		t.Fatal(err)
	}
	for path, item := range spec.Paths.Map() {
		for method, operation := range item.Operations() {
			for _, failure := range []error{nil, farm.ErrNotFound, farm.ErrConflict, farm.ErrInvalidInput, errors.New("backend failure")} {
				name := operation.OperationID + "/success"
				if failure != nil {
					name = operation.OperationID + "/" + failure.Error()
				}
				t.Run(name, func(t *testing.T) {
					body := ""
					if operation.RequestBody != nil {
						body = `{"name":"Mabel"}`
					}
					request := httptest.NewRequestWithContext(t.Context(), method, "/v1"+strings.ReplaceAll(path, "{id}", testID), strings.NewReader(body))
					if body != "" {
						request.Header.Set("Content-Type", "application/json")
					}
					route, params, err := validator.FindRoute(request)
					if err != nil {
						t.Fatal(err)
					}
					input := &openapi3filter.RequestValidationInput{Request: request, PathParams: params, Route: route}
					if err := openapi3filter.ValidateRequest(t.Context(), input); err != nil {
						t.Fatal(err)
					}
					response := httptest.NewRecorder()
					NewRouter(contractService{err: failure}).ServeHTTP(response, request)
					if failure == nil && response.Code >= 400 {
						t.Fatalf("success returned %d: %s", response.Code, response.Body)
					}
					if failure != nil && response.Code < 400 {
						t.Fatalf("failure returned %d", response.Code)
					}
					output := &openapi3filter.ResponseValidationInput{RequestValidationInput: input, Status: response.Code, Header: response.Header(), Options: &openapi3filter.Options{IncludeResponseStatus: true}}
					output.SetBodyBytes(response.Body.Bytes())
					if err := openapi3filter.ValidateResponse(t.Context(), output); err != nil {
						t.Fatal(err)
					}
				})
			}
		}
	}
}
