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
	handler := newHandler(nil, directory)
	for _, tc := range []struct {
		method, path string
		code         int
	}{
		{"GET", "/", 200}, {"GET", "/healthz", 204}, {"GET", "/v1/missing", 404},
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
