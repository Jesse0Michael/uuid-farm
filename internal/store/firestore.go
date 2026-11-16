package store

import (
	"context"

	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	pb "cloud.google.com/go/firestore/apiv1/firestorepb"
	"github.com/jesse0michael/uuid-farm/internal/farm"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const collection = "uuids"

type Firestore struct{ client *firestore.Client }

func New(client *firestore.Client) *Firestore {
	return &Firestore{client: client}
}

// AdoptUUID selects the first available resident. Claiming is atomic, including
// when concurrent requests select the same document. The ordering is deliberately
// document ID order, not a promise of uniform randomness or intake-date order.
func (s *Firestore) AdoptUUID(ctx context.Context) (farm.Uuid, error) {
	var adopted farm.Uuid
	err := s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		docs, err := tx.Documents(s.client.Collection(collection).Where("AdoptionDate", "==", "").OrderBy(firestore.DocumentID, firestore.Asc).Limit(1)).GetAll()
		if err != nil {
			return err
		}
		if len(docs) == 0 {
			return farm.ErrNotFound
		}
		var resident farm.Uuid
		if err := docs[0].DataTo(&resident); err != nil {
			return err
		}
		resident.AdoptionDate = time.Now().UTC().Format(time.RFC3339Nano)
		if err := tx.Update(docs[0].Ref, []firestore.Update{{Path: "AdoptionDate", Value: resident.AdoptionDate}}); err != nil {
			return err
		}
		adopted = resident
		return nil
	})
	if err != nil {
		return farm.Uuid{}, fmt.Errorf("adopt UUID: %w", err)
	}
	return normalizeDates(adopted), nil
}

func (s *Firestore) GetFarm(ctx context.Context) (farm.Farm, error) {
	// Both counts share a read-only transaction so the totals describe one snapshot.
	var stats farm.Farm
	err := s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		total, err := s.client.Collection(collection).NewAggregationQuery().WithCount("count").Transaction(tx).Get(ctx)
		if err != nil {
			return err
		}
		availableQuery := s.client.Collection(collection).Where("AdoptionDate", "==", "")
		available, err := availableQuery.NewAggregationQuery().WithCount("count").Transaction(tx).Get(ctx)
		if err != nil {
			return err
		}
		stats.Uuids = total["count"].(*pb.Value).GetIntegerValue()
		stats.Surrendered = available["count"].(*pb.Value).GetIntegerValue()
		stats.Adopted = stats.Uuids - stats.Surrendered
		return nil
	}, firestore.ReadOnly)
	if err != nil {
		return farm.Farm{}, fmt.Errorf("count residents: %w", err)
	}
	return stats, nil
}

func (s *Firestore) GetUUID(ctx context.Context, id string) (farm.Uuid, error) {
	id, err := farm.NormalizeID(id)
	if err != nil {
		return farm.Uuid{}, err
	}
	doc, err := s.client.Collection(collection).Doc(id).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return farm.Uuid{}, farm.ErrNotFound
	}
	if err != nil {
		return farm.Uuid{}, fmt.Errorf("get UUID: %w", err)
	}
	var resident farm.Uuid
	if err := doc.DataTo(&resident); err != nil {
		return farm.Uuid{}, fmt.Errorf("decode UUID: %w", err)
	}
	return normalizeDates(resident), nil
}

func (s *Firestore) GetUUIDs(ctx context.Context, limit int, cursor string) (farm.Page, error) {
	q := s.client.Collection(collection).OrderBy(firestore.DocumentID, firestore.Asc).Limit(limit + 1)
	if cursor != "" {
		normalized, err := farm.NormalizeID(cursor)
		if err != nil || normalized != cursor {
			return farm.Page{}, farm.ErrInvalidInput
		}
		q = q.StartAfter(cursor)
	}
	docs, err := q.Documents(ctx).GetAll()
	if err != nil {
		return farm.Page{}, fmt.Errorf("list UUIDs: %w", err)
	}
	page := farm.Page{Items: []farm.Uuid{}}
	for i, doc := range docs {
		if i == limit {
			page.NextCursor = docs[i-1].Ref.ID
			break
		}
		var resident farm.Uuid
		if err := doc.DataTo(&resident); err != nil {
			return farm.Page{}, fmt.Errorf("decode UUID: %w", err)
		}
		page.Items = append(page.Items, normalizeDates(resident))
	}
	return page, nil
}

func (s *Firestore) SurrenderUUID(ctx context.Context, id string) (farm.Uuid, error) {
	id, err := farm.NormalizeID(id)
	if err != nil {
		return farm.Uuid{}, err
	}
	resident := farm.Uuid{Id: id, SurrenderDate: time.Now().UTC().Format(time.RFC3339Nano)}
	_, err = s.client.Collection(collection).Doc(id).Create(ctx, resident)
	if status.Code(err) == codes.AlreadyExists {
		return farm.Uuid{}, farm.ErrConflict
	}
	if err != nil {
		return farm.Uuid{}, fmt.Errorf("surrender UUID: %w", err)
	}
	return resident, nil
}

func (s *Firestore) UpdateUUID(ctx context.Context, id string, metadata farm.Metadata) (farm.Uuid, error) {
	id, err := farm.NormalizeID(id)
	if err != nil {
		return farm.Uuid{}, err
	}
	var resident farm.Uuid
	err = s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		ref := s.client.Collection(collection).Doc(id)
		doc, err := tx.Get(ref)
		if err != nil {
			return err
		}
		if err := doc.DataTo(&resident); err != nil {
			return err
		}
		resident.Name = metadata.Name
		return tx.Update(ref, []firestore.Update{{Path: "Name", Value: metadata.Name}})
	})
	if status.Code(err) == codes.NotFound {
		return farm.Uuid{}, farm.ErrNotFound
	}
	if err != nil {
		return farm.Uuid{}, fmt.Errorf("update UUID: %w", err)
	}
	return normalizeDates(resident), nil
}

// Read old Go time strings without rewriting existing Firestore documents.
func normalizeDates(resident farm.Uuid) farm.Uuid {
	for _, value := range []*string{&resident.SurrenderDate, &resident.AdoptionDate} {
		if *value == "" {
			continue
		}
		for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05.999999999 -0700 MST"} {
			if parsed, err := time.Parse(layout, *value); err == nil {
				*value = parsed.UTC().Format(time.RFC3339Nano)
				break
			}
		}
	}
	return resident
}
