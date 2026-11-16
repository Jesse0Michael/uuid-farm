// Command seed surrenders randomly generated UUIDv4 residents through the API.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:], os.Stdout); err != nil {
		slog.Error("seed failed", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, output io.Writer) error {
	flags := flag.NewFlagSet("seed", flag.ContinueOnError)
	flags.SetOutput(output)
	address := flags.String("url", "http://localhost:8080", "server base URL, without /v1")
	wait := flags.Duration("wait", 30*time.Second, "maximum wait for server readiness")
	flags.Usage = func() {
		_, _ = fmt.Fprintln(output, "Usage: seed [-url http://localhost:8080] [-wait 30s] COUNT\nCOUNT must be nonnegative; 0 checks readiness without writing.")
		flags.PrintDefaults()
	}
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 1 {
		return fmt.Errorf("provide exactly one integer count; see seed -help")
	}
	count, err := strconv.Atoi(flags.Arg(0))
	if err != nil || count < 0 {
		return fmt.Errorf("count must be a nonnegative integer")
	}
	if *wait <= 0 {
		return fmt.Errorf("wait must be positive")
	}
	base, err := url.Parse(*address)
	if err != nil || base == nil || (base.Scheme != "http" && base.Scheme != "https") || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return fmt.Errorf("url must be an http(s) server base URL without credentials, query, or fragment")
	}
	client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	if err := ready(ctx, client, base.JoinPath("health").String(), *wait); err != nil {
		return err
	}
	for i := 0; i < count; i++ {
		id, err := uuid.NewRandom()
		if err != nil {
			return fmt.Errorf("generate UUID after %d of %d confirmed surrenders: %w", i, count, err)
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, base.JoinPath("v1", "uuids", id.String()).String(), nil)
		if err != nil {
			return fmt.Errorf("create surrender request: %w", err)
		}
		request.Header.Set("Accept", "application/json")
		response, err := client.Do(request)
		if err != nil {
			return fmt.Errorf("%d of %d confirmed; surrender %s may have reached the server (not retried): %w", i, count, id, err)
		}
		body, readErr := io.ReadAll(io.LimitReader(response.Body, 4096))
		_ = response.Body.Close()
		if response.StatusCode != http.StatusCreated {
			return fmt.Errorf("%d of %d confirmed; surrender %s returned HTTP %d: %s", i, count, id, response.StatusCode, strings.TrimSpace(string(body)))
		}
		// The status confirms creation even if the optional response body was interrupted.
		if readErr != nil {
			return fmt.Errorf("%d of %d confirmed; read response for %s: %w", i+1, count, id, readErr)
		}
	}
	if count > 0 {
		_, err = fmt.Fprintf(output, "Surrendered %d UUIDs to %s\n", count, base.String())
	}
	return err
}

func ready(ctx context.Context, client *http.Client, address string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	for {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
		if err != nil {
			return fmt.Errorf("create readiness request: %w", err)
		}
		response, err := client.Do(request)
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusNoContent {
				return nil
			}
		}
		timer := time.NewTimer(200 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return fmt.Errorf("wait for server %s: %w", address, ctx.Err())
		case <-timer.C:
		}
	}
}
