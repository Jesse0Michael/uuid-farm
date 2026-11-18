#!/bin/sh
set -eu

# Limit the idempotent update to the stream-wide enhanced measurement switch.
curl --fail-with-body --silent --show-error --max-time 30 --retry 3 \
  --header "Authorization: Bearer ${GOOGLE_OAUTH_ACCESS_TOKEN:?Missing analytics.edit access token}" \
  --header 'Content-Type: application/json' \
  --request PATCH --data '{"streamEnabled":false}' \
  "https://analyticsadmin.googleapis.com/v1alpha/${GA_STREAM}/enhancedMeasurementSettings?updateMask=stream_enabled"
