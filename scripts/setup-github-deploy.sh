#!/usr/bin/env bash
# One-time setup: lets GitHub Actions deploy PlanB to Cloud Run WITHOUT any stored secret (Workload Identity Federation).
# REVIEW BEFORE RUNNING — it creates a service account that can deploy to this project and trusts GitHub's OIDC tokens,
# limited by the attribute condition below to: this repo + the main branch + actor "rohilkohli".
# Usage: gcloud auth login && ./scripts/setup-github-deploy.sh
set -euo pipefail
P="${PROJECT_ID:-planb-solo-90824}"
REPO="${GITHUB_REPO:-rohilkohli/PlanB-Yaaaar-}"
ACTOR="${GITHUB_ACTOR_ALLOWED:-rohilkohli}"
PN=$(gcloud projects describe "$P" --format='value(projectNumber)')
SA="planb-deployer@$P.iam.gserviceaccount.com"

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project="$P"
gcloud iam service-accounts describe "$SA" --project="$P" >/dev/null 2>&1 || \
  gcloud iam service-accounts create planb-deployer --display-name="PlanB GitHub deployer" --project="$P"

# Deploy-only permissions (source deploys use Cloud Build + Artifact Registry + a staging bucket)
for r in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/storage.objectAdmin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:$SA" --role="$r" --condition=None -q >/dev/null
done
# Allowed to run the service as its runtime service account — on that account only
gcloud iam service-accounts add-iam-policy-binding "$PN-compute@developer.gserviceaccount.com" \
  --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser --project="$P" -q >/dev/null

gcloud iam workload-identity-pools describe github --location=global --project="$P" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions" --project="$P"
gcloud iam workload-identity-pools providers describe github-oidc --workload-identity-pool=github --location=global --project="$P" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc github-oidc --workload-identity-pool=github --location=global --project="$P" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main' && assertion.actor=='$ACTOR'"

gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$P" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" -q >/dev/null

echo "Done. Provider: projects/$PN/locations/global/workloadIdentityPools/github/providers/github-oidc"
echo "To undo: gcloud iam service-accounts delete $SA --project=$P && gcloud iam workload-identity-pools delete github --location=global --project=$P"
