package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jesse0michael/pkg/config"
	httpserver "github.com/jesse0michael/pkg/http/server"
	"github.com/jesse0michael/pkg/logger"
	"github.com/jesse0michael/uuid-farm/internal/api"
	"github.com/jesse0michael/uuid-farm/internal/store"
)

func Run() error {
	cfg, err := config.New[Config]()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return err
	}
	logger.NewLogger(cfg.Logger)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	client, err := firestore.NewClient(ctx, cfg.Project)
	if err != nil {
		return fmt.Errorf("create Firestore client: %w", err)
	}
	defer func() {
		if err := client.Close(); err != nil {
			slog.Warn("close Firestore client", "err", err)
		}
	}()
	router := newHandler(store.New(client), cfg)
	server := httpserver.New(cfg.HTTP, routeProvider{router})
	server.ReadHeaderTimeout = 5 * time.Second
	server.ReadTimeout = 15 * time.Second
	server.WriteTimeout = 30 * time.Second
	server.IdleTimeout = 60 * time.Second
	server.MaxHeaderBytes = 16 << 10
	done := make(chan error, 1)
	go func() { done <- server.ListenAndServe() }()
	slog.Info("server listening", "port", cfg.HTTP.Port, "project", cfg.Project)
	select {
	case err := <-done:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve HTTP: %w", err)
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown HTTP: %w", err)
		}
	}
	return nil
}

// Mount static files with an all-method fallback; a GET-only root pattern
// conflicts with the API's all-method /v1/ fallback in net/http.ServeMux.
func newHandler(service api.Service, cfg Config) *http.ServeMux {
	router := api.NewRouter(service)
	// Cloud Run reserves paths ending in z at its public frontend.
	router.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	// The same UI image can serve different Analytics streams across deployments.
	settings, _ := json.Marshal(cfg.Analytics) // Both fields are strings.
	script := append([]byte("window.uuidFarmAnalytics = "), settings...)
	script = append(script, ';', '\n')
	router.HandleFunc("GET /analytics-config.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		http.ServeContent(w, r, "analytics-config.js", time.Time{}, bytes.NewReader(script))
	})
	files := http.FileServer(http.Dir(cfg.UIDir))
	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		files.ServeHTTP(w, r)
	})
	return router
}

type routeProvider struct{ mux *http.ServeMux }

func (r routeProvider) Routes() *http.ServeMux { return r.mux }
