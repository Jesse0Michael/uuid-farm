package store

import (
	"testing"

	"github.com/jesse0michael/uuid-farm/internal/farm"
)

func TestLegacyDates(t *testing.T) {
	for _, tc := range []struct{ input, want string }{
		{"2019-10-25 12:13:14.123456789 +0000 UTC", "2019-10-25T12:13:14.123456789Z"},
		{"2026-01-01T12:00:00Z", "2026-01-01T12:00:00Z"},
		{"", ""},
	} {
		t.Run(tc.input, func(t *testing.T) {
			got := normalizeDates(farm.Uuid{SurrenderDate: tc.input}).SurrenderDate
			if got != tc.want {
				t.Errorf("got=%q want=%q", got, tc.want)
			}
		})
	}
}
