// normalize-uuids audits legacy IDs. Stop all writers and back up Firestore
// before using -apply. Colliding spellings require a manual decision.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jesse0michael/uuid-farm/internal/farm"
)

func main() {
	apply := flag.Bool("apply", false, "normalize document IDs and Id fields; requires writers stopped and a backup")
	project := flag.String("project", "", "required Firestore project ID (use demo-uuid-farm with emulator)")
	flag.Parse()
	if err := run(*project, *apply); err != nil {
		slog.Error("normalization failed", "err", err)
		os.Exit(1)
	}
}
func run(project string, apply bool) error {
	if project == "" {
		return fmt.Errorf("provide -project explicitly")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	client, err := firestore.NewClient(ctx, project)
	if err != nil {
		return fmt.Errorf("create Firestore client: %w", err)
	}
	defer func() {
		if err := client.Close(); err != nil {
			slog.Warn("close Firestore client", "err", err)
		}
	}()
	docs, err := client.Collection("uuids").Documents(ctx).GetAll()
	if err != nil {
		return fmt.Errorf("read residents: %w", err)
	}
	seen := map[string]string{}
	type change struct {
		doc *firestore.DocumentSnapshot
		id  string
	}
	var changes []change
	// Audit every document before allowing any writes.
	for _, doc := range docs {
		id, err := farm.NormalizeID(doc.Ref.ID)
		if err != nil {
			return fmt.Errorf("invalid document ID %q: %w", doc.Ref.ID, err)
		}
		if previous, ok := seen[id]; ok {
			return fmt.Errorf("collision: %q and %q normalize to %q; resolve manually", previous, doc.Ref.ID, id)
		}
		seen[id] = doc.Ref.ID
		data := doc.Data()
		if existing, ok := data["Id"].(string); ok && existing != "" {
			normalized, err := farm.NormalizeID(existing)
			if err != nil || normalized != id {
				return fmt.Errorf("document %q has mismatched Id %q", doc.Ref.ID, existing)
			}
		}
		if doc.Ref.ID != id || data["Id"] != id {
			changes = append(changes, change{doc, id})
			slog.Info("normalization needed", "from", doc.Ref.ID, "to", id)
		}
	}
	slog.Info("audit complete", "documents", len(docs), "changes", len(changes), "apply", apply)
	if !apply {
		return nil
	}
	for _, change := range changes {
		err := client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			current, err := tx.Get(change.doc.Ref)
			if err != nil {
				return err
			}
			if !current.UpdateTime.Equal(change.doc.UpdateTime) {
				return fmt.Errorf("document changed since audit; stop all writers and rerun")
			}
			data := current.Data()
			data["Id"] = change.id
			if change.doc.Ref.ID == change.id {
				return tx.Update(change.doc.Ref, []firestore.Update{{Path: "Id", Value: change.id}})
			}
			if err := tx.Create(client.Collection("uuids").Doc(change.id), data); err != nil {
				return err
			}
			return tx.Delete(change.doc.Ref)
		})
		if err != nil {
			return fmt.Errorf("normalize %q: %w", change.doc.Ref.ID, err)
		}
	}
	return nil
}
