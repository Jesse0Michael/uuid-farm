package app

import (
	"fmt"

	httpserver "github.com/jesse0michael/pkg/http/server"
	"github.com/jesse0michael/pkg/logger"
)

// Config preserves the existing environment variables. Nested helper configs
// opt out of CLI parsing because go-arg only supports flat fields.
type Config struct {
	HTTP    httpserver.Config `arg:"-"`
	Logger  logger.Config     `arg:"-"`
	Project string            `envconfig:"GOOGLE_CLOUD_PROJECT" default:"uuid-farm"`
	UIDir   string            `envconfig:"UI_DIR" default:"ui/dist"`
}

func (c Config) Validate() error {
	if c.HTTP.Port < 1 || c.HTTP.Port > 65535 {
		return fmt.Errorf("PORT must be between 1 and 65535")
	}
	if c.Project == "" {
		return fmt.Errorf("GOOGLE_CLOUD_PROJECT must not be empty")
	}
	if c.UIDir == "" {
		return fmt.Errorf("UI_DIR must not be empty")
	}
	return nil
}
