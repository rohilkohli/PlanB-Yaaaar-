#!/usr/bin/env bash
# Creates a Google Cloud project for PlanB, enables the APIs it uses and writes a restricted key to .env.
# Usage: gcloud auth login && ./scripts/setup-gcp.sh [project-id] [billing-account-id]
# Billing is only linked if you pass a billing account id (Maps Platform bills past the free monthly credit).
set -euo pipefail
PROJECT_ID="${1:-planb-solo-$(date +%s | tail -c 6)}"
BILLING="${2:-}"

gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 || gcloud projects create "$PROJECT_ID" --name="PlanB Solo Travel"
[ -n "$BILLING" ] && gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING"

gcloud services enable places.googleapis.com geocoding-backend.googleapis.com timezone-backend.googleapis.com \
  weather.googleapis.com --project="$PROJECT_ID"

KEY=$(gcloud services api-keys create --project="$PROJECT_ID" --display-name="planb-server-key" \
  --api-target=service=places.googleapis.com --api-target=service=geocoding-backend.googleapis.com \
  --api-target=service=timezone-backend.googleapis.com --api-target=service=weather.googleapis.com \
  --format="value(response.keyString)")

printf "GOOGLE_PLACES_API_KEY=%s\nGOOGLE_CLOUD_PROJECT=%s\n" "$KEY" "$PROJECT_ID" >> .env
echo "Project $PROJECT_ID ready. Key written to .env (gitignored). Set a quota cap: https://console.cloud.google.com/apis/dashboard?project=$PROJECT_ID"
