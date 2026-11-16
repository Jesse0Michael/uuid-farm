package api

import (
	"errors"
	"log/slog"
	"net/http"

	httpserver "github.com/jesse0michael/pkg/http/server"
	"github.com/jesse0michael/uuid-farm/internal/farm"
)

func EncodeJSONResponse(value any, code int, w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if err := httpserver.Encode(w, code, value); err != nil {
		slog.Warn("write response", "err", err)
	}
}
func EncodeErrorResponse(err error, w http.ResponseWriter) {
	code, message := http.StatusInternalServerError, "Unexpected error"
	switch {
	case errors.Is(err, farm.ErrNotFound):
		code, message = 404, "No UUID found"
	case errors.Is(err, farm.ErrConflict):
		code, message = 409, "UUID already exists"
	case errors.Is(err, farm.ErrInvalidUUID):
		code, message = 400, "Invalid UUID"
	case errors.Is(err, farm.ErrInvalidInput):
		code, message = 400, "Invalid request"
	default:
		slog.Error("request failed", "err", err)
	}
	EncodeJSONResponse(ApiError{Code: int32(code), Message: message}, code, w)
}
