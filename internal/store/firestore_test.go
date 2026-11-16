package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/jesse0michael/uuid-farm/internal/farm"

	"cloud.google.com/go/firestore"
)

const testID = "123e4567-e89b-12d3-a456-426614174000"

// Uses a unique demo project in the emulator; never connects to production.
func TestFirestoreLifecycle(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("set FIRESTORE_EMULATOR_HOST for isolated Firestore integration tests")
	}
	client, err := firestore.NewClient(t.Context(), "demo-uuid-farm-"+strings.ReplaceAll(testID, "-", ""))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	docs, err := client.Collection(collection).Documents(t.Context()).GetAll()
	if err != nil {
		t.Fatal(err)
	}
	for _, doc := range docs {
		if _, err := doc.Ref.Delete(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	service := New(client)
	if _, err := service.AdoptUUID(t.Context()); !errors.Is(err, farm.ErrNotFound) {
		t.Fatalf("empty adoption: %v", err)
	}
	if _, err := service.SurrenderUUID(t.Context(), strings.ToUpper(testID)); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SurrenderUUID(t.Context(), testID); !errors.Is(err, farm.ErrConflict) {
		t.Fatalf("duplicate: %v", err)
	}
	// Existing Go timestamps remain readable without changing stored fields.
	if _, err := client.Collection(collection).Doc(testID).Update(t.Context(), []firestore.Update{{Path: "SurrenderDate", Value: "2019-10-25 12:13:14 +0000 UTC"}}); err != nil {
		t.Fatal(err)
	}
	resident, err := service.GetUUID(t.Context(), testID)
	if err != nil || resident.SurrenderDate != "2019-10-25T12:13:14Z" {
		t.Fatalf("legacy date: %+v %v", resident, err)
	}
	// Racing requests must never both succeed for the only available resident.
	var wg sync.WaitGroup
	outcomes := make(chan error, 2)
	for range 2 {
		wg.Go(func() { _, err := service.AdoptUUID(t.Context()); outcomes <- err })
	}
	wg.Wait()
	close(outcomes)
	successes := 0
	for err := range outcomes {
		if err == nil {
			successes++
		} else if !errors.Is(err, farm.ErrNotFound) {
			t.Fatal(err)
		}
	}
	if successes != 1 {
		t.Fatalf("successful adoptions=%d", successes)
	}
	if _, err := service.UpdateUUID(t.Context(), testID, farm.Metadata{Name: "Mabel"}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.UpdateUUID(t.Context(), testID, farm.Metadata{}); err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 3; i++ {
		if _, err := service.SurrenderUUID(t.Context(), fmt.Sprintf("00000000-0000-4000-8000-%012d", i)); err != nil {
			t.Fatal(err)
		}
	}
	page, err := service.GetUUIDs(t.Context(), 2, "")
	if err != nil || len(page.Items) != 2 || page.NextCursor == "" {
		t.Fatalf("first page: %+v %v", page, err)
	}
	next, err := service.GetUUIDs(t.Context(), 2, page.NextCursor)
	if err != nil || len(next.Items) != 2 || next.NextCursor != "" {
		t.Fatalf("next page: %+v %v", next, err)
	}
	if page.Items[1].Id >= next.Items[0].Id {
		t.Fatal("overlapping pages")
	}
	farm, err := service.GetFarm(t.Context())
	if err != nil || farm.Uuids != 4 || farm.Adopted != 1 || farm.Surrendered != 3 {
		t.Fatalf("counts: %+v %v", farm, err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := service.GetUUID(ctx, testID); err == nil {
		t.Error("canceled context succeeded")
	}
}
