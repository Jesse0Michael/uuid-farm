package main

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	contract "github.com/jesse0michael/uuid-farm/api"
)

func TestSeed(t *testing.T) {
	// Check the path and success status against the source-of-truth contract.
	spec, err := contract.Load()
	if err != nil {
		t.Fatal(err)
	}
	operation := spec.Paths.Value("/uuids/{id}").Post
	if operation.OperationID != "surrenderUUID" || operation.Responses.Status(201) == nil {
		t.Fatal("surrender contract changed")
	}
	for _, count := range []string{"0", "5"} {
		t.Run(count, func(t *testing.T) {
			ids := map[uuid.UUID]bool{}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/healthz" {
					w.WriteHeader(204)
					return
				}
				if r.Method != http.MethodPost {
					t.Errorf("method=%s", r.Method)
				}
				prefix := spec.Servers[0].URL + "/uuids/"
				if !strings.HasPrefix(r.URL.Path, prefix) {
					t.Errorf("path=%s", r.URL.Path)
				}
				id, err := uuid.Parse(strings.TrimPrefix(r.URL.Path, prefix))
				if err != nil || id.Version() != 4 || id.Variant() != uuid.RFC4122 || ids[id] {
					t.Errorf("invalid or duplicate UUID: %s", id)
				}
				ids[id] = true
				w.WriteHeader(201)
			}))
			defer server.Close()
			var output bytes.Buffer
			if err := run(t.Context(), []string{"-url", server.URL, count}, &output); err != nil {
				t.Fatal(err)
			}
			expected := 5
			if count == "0" {
				expected = 0
			}
			if len(ids) != expected {
				t.Errorf("surrenders=%d want=%d", len(ids), expected)
			}
		})
	}
}

func TestInvalidArguments(t *testing.T) {
	for _, args := range [][]string{{}, {"-1"}, {"abc"}, {"1", "2"}, {"-url", "ftp://example.com", "1"}, {"-url", "https://example.com?x=1", "1"}, {"-url", "https://user:pass@example.com", "1"}, {"-wait", "0s", "1"}} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			if err := run(t.Context(), args, io.Discard); err == nil {
				t.Fatal("invalid arguments accepted")
			}
		})
	}
}

func TestStopsOnFailureWithoutRetry(t *testing.T) {
	for _, status := range []int{409, 500, 302} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/healthz" {
					w.WriteHeader(204)
					return
				}
				calls++
				if calls == 1 {
					w.WriteHeader(201)
					return
				}
				w.Header().Set("Location", "/redirect")
				w.WriteHeader(status)
			}))
			defer server.Close()
			err := run(t.Context(), []string{"-url", server.URL, "5"}, io.Discard)
			if err == nil || !strings.Contains(err.Error(), "1 of 5 confirmed") {
				t.Fatalf("error=%v", err)
			}
			if calls != 2 {
				t.Errorf("requests=%d; retried or continued after failure", calls)
			}
		})
	}
}

func TestReadiness(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(503)
			return
		}
		w.WriteHeader(204)
	}))
	defer server.Close()
	if err := run(t.Context(), []string{"-url", server.URL, "-wait", "2s", "0"}, io.Discard); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatalf("readiness calls=%d", calls.Load())
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	start := time.Now()
	if err := run(ctx, []string{"-url", server.URL, "0"}, io.Discard); err == nil {
		t.Fatal("cancellation ignored")
	}
	if time.Since(start) > time.Second {
		t.Fatal("cancellation was not prompt")
	}
}
