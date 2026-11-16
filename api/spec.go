// Package contract owns the embedded OpenAPI contract. The same file drives
// HTTP registration, request constraints, TypeScript types, and documentation.
package contract

import (
	"context"
	_ "embed"
	"fmt"

	"github.com/getkin/kin-openapi/openapi3"
)

//go:embed openapi.yaml
var document []byte

// Load returns an independent, resolved document so tests can validate or mutate
// their copy without changing the running server's contract.
func Load() (*openapi3.T, error) {
	spec, err := openapi3.NewLoader().LoadFromData(document)
	if err != nil {
		return nil, fmt.Errorf("load API contract: %w", err)
	}
	if err := spec.Validate(context.Background()); err != nil {
		return nil, fmt.Errorf("validate API contract: %w", err)
	}
	return spec, nil
}
