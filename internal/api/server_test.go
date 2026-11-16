package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jesse0michael/uuid-farm/internal/farm"
)

const testID = "123e4567-e89b-12d3-a456-426614174000"

type stubService struct {
	Service
	surrender func(context.Context, string) (farm.Uuid, error)
	update    func(context.Context, string, farm.Metadata) (farm.Uuid, error)
	list      func(context.Context, int, string) (farm.Page, error)
}

func (s stubService) SurrenderUUID(ctx context.Context, id string) (farm.Uuid, error) {
	return s.surrender(ctx, id)
}
func (s stubService) UpdateUUID(ctx context.Context, id string, m farm.Metadata) (farm.Uuid, error) {
	return s.update(ctx, id, m)
}
func (s stubService) GetUUIDs(ctx context.Context, limit int, cursor string) (farm.Page, error) {
	return s.list(ctx, limit, cursor)
}

func TestSurrenderHTTP(t *testing.T) {
	for _, tc := range []struct {
		name, id string
		err      error
		code     int
	}{
		{"created", strings.ToUpper(testID), nil, 201},
		{"duplicate", testID, farm.ErrConflict, 409},
		{"wrapped duplicate", testID, errors.Join(errors.New("storage"), farm.ErrConflict), 409},
		{"invalid", "invalid", nil, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service := stubService{surrender: func(ctx context.Context, id string) (farm.Uuid, error) {
				if id != testID {
					t.Errorf("id=%s", id)
				}
				if _, ok := ctx.Deadline(); !ok {
					t.Error("missing request deadline")
				}
				return farm.Uuid{Id: id}, tc.err
			}}
			response := httptest.NewRecorder()
			NewRouter(service).ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/v1/uuids/"+tc.id, nil))
			if response.Code != tc.code {
				t.Fatalf("code=%d body=%s", response.Code, response.Body)
			}
			if tc.code == 201 && response.Header().Get("Location") != "/v1/uuids/"+testID {
				t.Error("missing location")
			}
		})
	}
}
func TestMetadataValidation(t *testing.T) {
	for _, tc := range []struct {
		name, body, contentType string
		code                    int
	}{
		{"valid", `{"name":" Mabel "}`, "application/json", 200},
		{"clear", `{"name":""}`, "application/json", 200},
		{"lifecycle", `{"name":"Mabel","adoptionDate":"now"}`, "application/json", 400},
		{"null", `null`, "application/json", 400},
		{"missing", `{}`, "application/json", 400},
		{"null name", `{"name":null}`, "application/json", 400},
		{"multiple values", `{"name":"Mabel"} {}`, "application/json", 400},
		{"malformed", `{`, "application/json", 400},
		{"long name", `{"name":"` + strings.Repeat("x", 81) + `"}`, "application/json", 400},
		{"oversized", `{"name":"` + strings.Repeat("x", 5000) + `"}`, "application/json", 400},
		{"content type", `{"name":"Mabel"}`, "text/plain", 415},
	} {
		t.Run(tc.name, func(t *testing.T) {
			called := false
			service := stubService{update: func(ctx context.Context, id string, m farm.Metadata) (farm.Uuid, error) {
				called = true
				if m.Name != "Mabel" && m.Name != "" {
					t.Errorf("name=%q", m.Name)
				}
				return farm.Uuid{Id: id, Name: m.Name}, nil
			}}
			request := httptest.NewRequestWithContext(t.Context(), http.MethodPut, "/v1/uuids/"+testID, strings.NewReader(tc.body))
			request.Header.Set("Content-Type", tc.contentType)
			response := httptest.NewRecorder()
			NewRouter(service).ServeHTTP(response, request)
			if response.Code != tc.code {
				t.Fatalf("code=%d body=%s", response.Code, response.Body)
			}
			if called != (tc.code == 200) {
				t.Errorf("service called=%v", called)
			}
		})
	}
}
func TestPaginationValidation(t *testing.T) {
	for _, query := range []string{"?limit=0", "?limit=101", "?limit=no", "?cursor=invalid"} {
		t.Run(query, func(t *testing.T) {
			response := httptest.NewRecorder()
			NewRouter(stubService{}).ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/v1/uuids"+query, nil))
			if response.Code != 400 {
				t.Errorf("code=%d", response.Code)
			}
		})
	}
	response := httptest.NewRecorder()
	service := stubService{list: func(ctx context.Context, limit int, cursor string) (farm.Page, error) {
		if limit != 25 || cursor != "" {
			t.Error("wrong defaults")
		}
		return farm.Page{Items: []farm.Uuid{}}, nil
	}}
	NewRouter(service).ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/v1/uuids", nil))
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"items":[]`) {
		t.Errorf("response=%s", response.Body)
	}
}
