#!/usr/bin/env bash
# One-time (idempotent) setup for push reminders: VAPID keys, secret, Firestore TTL and the once-a-minute Cloud Scheduler job.
# Run as a project owner. Secrets are never printed.
set -euo pipefail
PROJECT=${PROJECT:-planb-solo-90824}; REGION=${REGION:-asia-south1}; SERVICE=${SERVICE:-planb}
URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format='value(status.url)')
RUNTIME_SA=$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format='value(spec.template.spec.serviceAccountName)')

gcloud services enable cloudscheduler.googleapis.com routes.googleapis.com --project="$PROJECT"

# 1. VAPID private key (the public key is a plain env var in deploy.yml)
if ! gcloud secrets describe vapid-private-key --project="$PROJECT" >/dev/null 2>&1; then
  gcloud secrets create vapid-private-key --replication-policy=automatic --project="$PROJECT"
  node -e "const w=require('web-push');const k=w.generateVAPIDKeys();process.stdout.write(k.privateKey);console.error('PUBLIC KEY (put in deploy.yml VAPID_PUBLIC_KEY): '+k.publicKey)" \
    | gcloud secrets versions add vapid-private-key --data-file=- --project="$PROJECT"
fi
gcloud secrets add-iam-policy-binding vapid-private-key --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor --project="$PROJECT" >/dev/null

# 2. Firestore TTL so shares, recaps and reminders delete themselves
for c in shares recaps reminders; do gcloud firestore fields ttls update expireAt --collection-group=$c --enable-ttl --project="$PROJECT" --async >/dev/null || true; done

# 3. Scheduler: every minute, calls /api/push/dispatch with a token derived from PLAN_SIGNING_KEY (HMAC of "push-cron")
TOKEN=$(gcloud secrets versions access latest --secret=plan-signing-key --project="$PROJECT" | node -e "let k='';process.stdin.on('data',d=>k+=d).on('end',()=>process.stdout.write(require('crypto').createHmac('sha256',k.trim()).update('push-cron').digest('base64url')))")
ARGS=(--location="$REGION" --project="$PROJECT" --schedule='* * * * *' --time-zone=UTC --uri="$URL/api/push/dispatch" --http-method=POST --update-headers="x-cron-token=$TOKEN" --attempt-deadline=30s)
if gcloud scheduler jobs describe planb-push-dispatch --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud scheduler jobs update http planb-push-dispatch "${ARGS[@]}"
else
  gcloud scheduler jobs create http planb-push-dispatch "${ARGS[@]/--update-headers/--headers}"
fi
echo "Reminders ready. Job: planb-push-dispatch (every minute)."
