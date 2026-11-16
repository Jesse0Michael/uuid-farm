package main

import (
	"log/slog"
	"os"

	"github.com/jesse0michael/uuid-farm/internal/app"
)

func main() {
	if err := app.Run(); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
