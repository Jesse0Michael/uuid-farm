package app

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCombinedHandler(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "index.html"), []byte("<h1>UUID Farm</h1>"), 0600); err != nil {
		t.Fatal(err)
	}
	handler := newHandler(nil, Config{UIDir: directory})
	for _, tc := range []struct {
		method, path string
		code         int
	}{
		{"GET", "/", 200}, {"GET", "/health", 204}, {"GET", "/v1/missing", 404},
		{"POST", "/", 405}, {"DELETE", "/v1/uuids", 404},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), tc.method, tc.path, nil))
			if response.Code != tc.code {
				t.Fatalf("code=%d body=%s", response.Code, response.Body)
			}
			if tc.path == "/" && tc.method == http.MethodGet && !strings.Contains(response.Body.String(), "UUID Farm") {
				t.Error("UI missing")
			}
		})
	}
}

func TestAnalyticsConfigScript(t *testing.T) {
	for _, tc := range []struct {
		name   string
		config analyticsConfig
		want   string
	}{
		{"disabled", analyticsConfig{}, `{"measurementId":"","hostname":""}`},
		{"configured", analyticsConfig{MeasurementID: "G-FARM123", Hostname: "farm.example"}, `{"measurementId":"G-FARM123","hostname":"farm.example"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler := newHandler(nil, Config{UIDir: t.TempDir(), Analytics: tc.config})
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/analytics-config.js", nil))
			if response.Code != http.StatusOK || response.Body.String() != "window.uuidFarmAnalytics = "+tc.want+";\n" {
				t.Fatalf("code=%d script=%q", response.Code, response.Body)
			}
			if response.Header().Get("Cache-Control") != "no-store" || !strings.HasPrefix(response.Header().Get("Content-Type"), "text/javascript") {
				t.Fatalf("headers=%v", response.Header())
			}
		})
	}
}
