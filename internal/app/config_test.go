package app

import (
	"testing"

	"github.com/jesse0michael/pkg/config"
)

func TestConfig(t *testing.T) {
	for _, tc := range []struct {
		port  string
		valid bool
	}{{"8089", true}, {"0", false}, {"65536", false}, {"invalid", false}} {
		t.Run(tc.port, func(t *testing.T) {
			t.Setenv("PORT", tc.port)
			t.Setenv("GOOGLE_CLOUD_PROJECT", "demo-config")
			t.Setenv("UI_DIR", "test-ui")
			t.Setenv("LOG_LEVEL", "DEBUG")
			cfg, err := config.New[Config]()
			if err == nil {
				err = cfg.Validate()
			}
			if (err == nil) != tc.valid {
				t.Fatalf("config error=%v", err)
			}
			if tc.valid && (cfg.Project != "demo-config" || cfg.UIDir != "test-ui" || cfg.Logger.Level != "DEBUG" || cfg.HTTP.Port != 8089) {
				t.Fatalf("environment not preserved: %+v", cfg)
			}
		})
	}
}
