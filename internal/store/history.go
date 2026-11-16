package store

import (
	"context"
	"fmt"
	"math"
	"strconv"

	"cloud.google.com/go/firestore"
	"github.com/jesse0michael/uuid-farm/internal/farm"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const historyCollection = "history"

// History is ordered by a transaction-assigned sequence, so clock adjustments
// and events in the same instant cannot reorder a resident's lifecycle.
func eventID(sequence uint64) string { return fmt.Sprintf("%020d", sequence) }

func legacyHistory(resident farm.Uuid) []farm.HistoryEvent {
	resident = normalizeDates(resident)
	events := []farm.HistoryEvent{}
	for _, entry := range []struct{ kind, date string }{
		{"surrendered", resident.SurrenderDate}, {"adopted", resident.AdoptionDate},
	} {
		if entry.date != "" {
			events = append(events, farm.HistoryEvent{Id: eventID(uint64(len(events) + 1)), Type: entry.kind, Date: entry.date})
		}
	}
	return events
}

// Read before any transaction writes. Legacy records are upgraded additively on
// their first lifecycle change, before replacing either current-state date.
func prepareHistory(tx *firestore.Transaction, ref *firestore.DocumentRef, resident farm.Uuid) (uint64, []farm.HistoryEvent, error) {
	docs, err := tx.Documents(ref.Collection(historyCollection).OrderBy("Id", firestore.Desc).Limit(1)).GetAll()
	if err != nil {
		return 0, nil, err
	}
	if len(docs) == 0 {
		legacy := legacyHistory(resident)
		return uint64(len(legacy)), legacy, nil
	}
	sequence, err := strconv.ParseUint(docs[0].Ref.ID, 10, 64)
	if err != nil {
		return 0, nil, fmt.Errorf("decode history sequence: %w", err)
	}
	return sequence, nil, nil
}

func appendHistory(tx *firestore.Transaction, ref *firestore.DocumentRef, previous uint64, legacy []farm.HistoryEvent, kind, date string) error {
	if previous == math.MaxUint64 {
		return fmt.Errorf("history sequence exhausted")
	}
	event := farm.HistoryEvent{Id: eventID(previous + 1), Type: kind, Date: date}
	for _, entry := range append(legacy, event) {
		if err := tx.Create(ref.Collection(historyCollection).Doc(entry.Id), entry); err != nil {
			return err
		}
	}
	return nil
}

func (s *Firestore) GetUUIDHistory(ctx context.Context, id string, limit int, cursor string) (farm.HistoryPage, error) {
	id, err := farm.NormalizeID(id)
	if err != nil {
		return farm.HistoryPage{}, err
	}
	if cursor != "" {
		if _, err := strconv.ParseUint(cursor, 10, 64); err != nil || len(cursor) != 20 {
			return farm.HistoryPage{}, farm.ErrInvalidInput
		}
	}
	var page farm.HistoryPage
	err = s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		page = farm.HistoryPage{Items: []farm.HistoryEvent{}}
		ref := s.client.Collection(collection).Doc(id)
		doc, err := tx.Get(ref)
		if err != nil {
			return err
		}
		q := ref.Collection(historyCollection).OrderBy("Id", firestore.Desc)
		// Always check for persisted history before applying a cursor, since an
		// empty page at the end must not resurrect a legacy snapshot.
		first, err := tx.Documents(q.Limit(1)).GetAll()
		if err != nil {
			return err
		}
		if len(first) == 0 {
			var resident farm.Uuid
			if err := doc.DataTo(&resident); err != nil {
				return err
			}
			legacy := legacyHistory(resident)
			for i := len(legacy) - 1; i >= 0; i-- {
				if cursor == "" || legacy[i].Id < cursor {
					page.Items = append(page.Items, legacy[i])
				}
			}
		} else {
			if cursor != "" {
				q = q.StartAfter(cursor)
			}
			docs, err := tx.Documents(q.Limit(limit + 1)).GetAll()
			if err != nil {
				return err
			}
			for _, doc := range docs {
				var event farm.HistoryEvent
				if err := doc.DataTo(&event); err != nil {
					return err
				}
				page.Items = append(page.Items, event)
			}
		}
		if len(page.Items) > limit {
			page.Items = page.Items[:limit]
			page.NextCursor = page.Items[limit-1].Id
		}
		return nil
	}, firestore.ReadOnly)
	if status.Code(err) == codes.NotFound {
		return farm.HistoryPage{}, farm.ErrNotFound
	}
	if err != nil {
		return farm.HistoryPage{}, fmt.Errorf("read UUID history: %w", err)
	}
	return page, nil
}
