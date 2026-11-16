package main

import (
	"os"
	"strings"
	"testing"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMigration(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires local Firestore emulator")
	}
	const project = "demo-uuid-farm-migration"
	const id = "123e4567-e89b-12d3-a456-426614174000"
	legacy := strings.ToUpper(id)
	client, err := firestore.NewClient(t.Context(), project)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	docs, err := client.Collection("uuids").Documents(t.Context()).GetAll()
	if err != nil {
		t.Fatal(err)
	}
	for _, doc := range docs {
		if _, err := doc.Ref.Delete(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	source := client.Collection("uuids").Doc(legacy)
	target := client.Collection("uuids").Doc(id)
	if _, err := source.Create(t.Context(), map[string]any{"Id": legacy, "Name": "Mabel", "AdoptionDate": "", "Extra": "preserved"}); err != nil {
		t.Fatal(err)
	}
	if err := run(project, false); err != nil {
		t.Fatal(err)
	}
	if _, err := source.Get(t.Context()); err != nil {
		t.Fatal("dry-run deleted source", err)
	}
	if _, err := target.Get(t.Context()); status.Code(err) != codes.NotFound {
		t.Fatal("dry-run created target", err)
	}
	// Refuse all work if spellings collide, even when their metadata differs.
	if _, err := target.Create(t.Context(), map[string]any{"Id": id}); err != nil {
		t.Fatal(err)
	}
	if err := run(project, true); err == nil {
		t.Fatal("collision accepted")
	}
	if _, err := source.Get(t.Context()); err != nil {
		t.Fatal("collision changed source", err)
	}
	if _, err := target.Delete(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := run(project, true); err != nil {
		t.Fatal(err)
	}
	if _, err := source.Get(t.Context()); status.Code(err) != codes.NotFound {
		t.Fatal("source retained", err)
	}
	doc, err := target.Get(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if doc.Data()["Id"] != id || doc.Data()["Extra"] != "preserved" || doc.Data()["Name"] != "Mabel" {
		t.Fatalf("data lost: %+v", doc.Data())
	}
	if err := run(project, true); err != nil {
		t.Fatal("repeat migration failed", err)
	}
}
