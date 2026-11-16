package farm

import (
	"errors"

	"github.com/google/uuid"
)

var (
	ErrNotFound     = errors.New("no UUIDs available")
	ErrInvalidUUID  = errors.New("invalid UUID")
	ErrConflict     = errors.New("UUID already exists")
	ErrInvalidInput = errors.New("invalid request")
)

func NormalizeID(id string) (string, error) {
	parsed, err := uuid.Parse(id)
	if err != nil {
		return "", ErrInvalidUUID
	}
	return parsed.String(), nil
}

// Uuid retains historical Firestore field names. Dates are serialized as RFC3339.
type Uuid struct {
	Id            string `json:"id"`
	Name          string `json:"name,omitempty"`
	Tag           string `json:"tag,omitempty"`
	SurrenderDate string `json:"surrenderDate,omitempty"`
	AdoptionDate  string `json:"adoptionDate,omitempty"`
}

type Farm struct {
	Uuids       int64 `json:"uuids"`
	Adopted     int64 `json:"adopted"`
	Surrendered int64 `json:"surrendered"`
}
type Page struct {
	Items      []Uuid `json:"items"`
	NextCursor string `json:"nextCursor,omitempty"`
}

type Metadata struct {
	Name string `json:"name"`
}
