package store

import (
	"errors"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jesse0michael/uuid-farm/internal/farm"
)

func historyStore(t *testing.T) (*Firestore, *firestore.Client) {
	t.Helper()
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("set FIRESTORE_EMULATOR_HOST for isolated Firestore integration tests")
	}
	client, err := firestore.NewClient(t.Context(), "demo-history-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	return New(client), client
}

func TestRepeatedLifecycle(t *testing.T) {
	service, client := historyStore(t)
	for visit := range 3 {
		resident, err := service.SurrenderUUID(t.Context(), strings.ToUpper(testID))
		if err != nil || resident.Id != testID || resident.AdoptionDate != "" {
			t.Fatalf("visit %d surrender: %+v %v", visit, resident, err)
		}
		if visit == 0 {
			if _, err := client.Collection(collection).Doc(testID).Update(t.Context(), []firestore.Update{
				{Path: "Name", Value: "Mabel"}, {Path: "Tag", Value: "Handle with care"},
			}); err != nil {
				t.Fatal(err)
			}
		} else if resident.Name != "Mabel" || resident.Tag != "Handle with care" {
			t.Fatalf("metadata lost on return: %+v", resident)
		}
		if _, err := service.SurrenderUUID(t.Context(), testID); !errors.Is(err, farm.ErrConflict) {
			t.Fatalf("duplicate surrender: %v", err)
		}
		stats, err := service.GetFarm(t.Context())
		if err != nil || stats != (farm.Farm{Uuids: 1, Surrendered: 1}) {
			t.Fatalf("waiting stats: %+v %v", stats, err)
		}
		adopted, err := service.AdoptUUID(t.Context())
		if err != nil || adopted.Id != testID || adopted.AdoptionDate == "" || adopted.SurrenderDate != resident.SurrenderDate {
			t.Fatalf("visit %d adoption: %+v %v", visit, adopted, err)
		}
		if _, err := service.AdoptUUID(t.Context()); !errors.Is(err, farm.ErrNotFound) {
			t.Fatalf("duplicate adoption: %v", err)
		}
		stats, err = service.GetFarm(t.Context())
		if err != nil || stats != (farm.Farm{Uuids: 1, Adopted: 1}) {
			t.Fatalf("adopted stats: %+v %v", stats, err)
		}
		history, err := service.GetUUIDHistory(t.Context(), testID, 100, "")
		if err != nil || len(history.Items) != (visit+1)*2 {
			t.Fatalf("history: %+v %v", history, err)
		}
		if history.Items[0].Type != "adopted" || history.Items[0].Date != adopted.AdoptionDate ||
			history.Items[1].Type != "surrendered" || history.Items[1].Date != resident.SurrenderDate {
			t.Fatalf("latest history does not match state: %+v", history)
		}
	}
	var events []farm.HistoryEvent
	cursor := ""
	for {
		page, err := service.GetUUIDHistory(t.Context(), testID, 2, cursor)
		if err != nil || len(page.Items) != 2 {
			t.Fatalf("page: %+v %v", page, err)
		}
		events = append(events, page.Items...)
		if page.NextCursor == "" {
			break
		}
		if page.NextCursor == cursor || len(events) > 6 {
			t.Fatal("history pagination did not advance")
		}
		cursor = page.NextCursor
	}
	if len(events) != 6 {
		t.Fatalf("event count: %d", len(events))
	}
	for i, event := range events {
		if event.Id != eventID(uint64(6-i)) {
			t.Fatalf("event %d is out of lifecycle order: %+v", i, event)
		}
	}
	page, err := service.GetUUIDHistory(t.Context(), testID, 2, events[len(events)-1].Id)
	if err != nil || len(page.Items) != 0 || page.NextCursor != "" {
		t.Fatalf("past end: %+v %v", page, err)
	}
	if _, err := service.GetUUIDHistory(t.Context(), uuid.NewString(), 25, ""); !errors.Is(err, farm.ErrNotFound) {
		t.Fatalf("unknown resident: %v", err)
	}
}

func TestLegacyLifecycleHistory(t *testing.T) {
	for _, tc := range []struct {
		name, adopted string
		known         int
	}{
		{name: "waiting", known: 1},
		{name: "adopted", adopted: "2020-01-01 12:00:00 +0000 UTC", known: 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service, client := historyStore(t)
			ref := client.Collection(collection).Doc(testID)
			original := farm.Uuid{Id: testID, Name: "Mabel", Tag: "Older resident", SurrenderDate: "2019-10-25 12:13:14 +0000 UTC", AdoptionDate: tc.adopted}
			if _, err := ref.Create(t.Context(), original); err != nil {
				t.Fatal(err)
			}
			before, err := service.GetUUIDHistory(t.Context(), testID, 1, "")
			if err != nil || len(before.Items) != 1 {
				t.Fatalf("legacy history: %+v %v", before, err)
			}
			if tc.known == 2 {
				if before.Items[0].Type != "adopted" || before.Items[0].Date != "2020-01-01T12:00:00Z" || before.NextCursor == "" {
					t.Fatalf("legacy adoption: %+v", before)
				}
				second, err := service.GetUUIDHistory(t.Context(), testID, 1, before.NextCursor)
				if err != nil || len(second.Items) != 1 || second.Items[0].Date != "2019-10-25T12:13:14Z" || second.NextCursor != "" {
					t.Fatalf("legacy page two: %+v %v", second, err)
				}
			} else if before.Items[0].Date != "2019-10-25T12:13:14Z" {
				t.Fatalf("legacy surrender: %+v", before)
			}
			doc, err := ref.Get(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			var unchanged farm.Uuid
			if err := doc.DataTo(&unchanged); err != nil || unchanged != original {
				t.Fatalf("history read changed legacy fields: %+v %v", unchanged, err)
			}
			docs, err := ref.Collection(historyCollection).Documents(t.Context()).GetAll()
			if err != nil || len(docs) != 0 {
				t.Fatalf("history read must not write: %d events %v", len(docs), err)
			}
			if tc.adopted != "" {
				if _, err := service.SurrenderUUID(t.Context(), testID); err != nil {
					t.Fatal(err)
				}
			}
			resident, err := service.AdoptUUID(t.Context())
			if err != nil || resident.Name != original.Name || resident.Tag != original.Tag {
				t.Fatalf("legacy transition: %+v %v", resident, err)
			}
			history, err := service.GetUUIDHistory(t.Context(), testID, 100, "")
			wantCount := 2
			if tc.adopted != "" {
				wantCount = 4
			}
			if err != nil || len(history.Items) != wantCount {
				t.Fatalf("migrated history: %+v %v", history, err)
			}
			if history.Items[len(history.Items)-1].Date != "2019-10-25T12:13:14Z" {
				t.Fatalf("original arrival lost: %+v", history)
			}
			if before.NextCursor != "" {
				continued, err := service.GetUUIDHistory(t.Context(), testID, 1, before.NextCursor)
				if err != nil || len(continued.Items) != 1 || continued.Items[0].Date != "2019-10-25T12:13:14Z" || continued.NextCursor != "" {
					t.Fatalf("legacy cursor after migration: %+v %v", continued, err)
				}
			}
			// The virtual event ID remains valid after the additive migration.
			for _, event := range history.Items {
				if event.Id == before.Items[0].Id && !reflect.DeepEqual(event, before.Items[0]) {
					t.Fatalf("legacy event changed after migration: %+v", event)
				}
			}
		})
	}
}

func TestConcurrentLifecycleHistory(t *testing.T) {
	service, _ := historyStore(t)
	for _, tc := range []struct {
		name string
		kind string
		want error
	}{
		{"first surrender", "surrendered", farm.ErrConflict},
		{"first adoption", "adopted", farm.ErrNotFound},
		{"return", "surrendered", farm.ErrConflict},
		{"second adoption", "adopted", farm.ErrNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var wg sync.WaitGroup
			results := make(chan error, 2)
			for range 2 {
				wg.Go(func() {
					var err error
					if tc.kind == "surrendered" {
						_, err = service.SurrenderUUID(t.Context(), testID)
					} else {
						_, err = service.AdoptUUID(t.Context())
					}
					results <- err
				})
			}
			wg.Wait()
			close(results)
			successes := 0
			for err := range results {
				if err == nil {
					successes++
				} else if !errors.Is(err, tc.want) {
					t.Fatal(err)
				}
			}
			if successes != 1 {
				t.Fatalf("successful transitions: %d", successes)
			}
		})
	}
	history, err := service.GetUUIDHistory(t.Context(), testID, 100, "")
	if err != nil || len(history.Items) != 4 {
		t.Fatalf("concurrent history: %+v %v", history, err)
	}
	for i, event := range history.Items {
		if event.Id != eventID(uint64(4-i)) {
			t.Fatalf("duplicate or missing event: %+v", history)
		}
	}
}
