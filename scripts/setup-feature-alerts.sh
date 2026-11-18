#!/usr/bin/env bash
# Log-based metrics + alert policies for sharing, reminders and Routes. Metrics are idempotent; policies are created once
# (re-running would duplicate them: delete the "PlanB: ..." policies first or skip the policy step).
set -euo pipefail
P=${PROJECT:-planb-solo-90824}; CH=${CHANNEL:?set CHANNEL to the notification channel id (gcloud beta monitoring channels list)}
mk(){ gcloud logging metrics describe "$1" --project=$P >/dev/null 2>&1 && gcloud logging metrics update "$1" --project=$P --description="$2" --log-filter="$3" || gcloud logging metrics create "$1" --project=$P --description="$2" --log-filter="$3"; }
SVC='resource.type="cloud_run_revision" AND resource.labels.service_name="planb"'
mk planb_routes_error "Routes API failures" "$SVC AND jsonPayload.event=\"routes_error\""
mk planb_share_view_404 "404s on share/recap links" "$SVC AND httpRequest.requestUrl:\"/api/share/view\" AND httpRequest.status=404"
mk planb_dispatch_fail "Reminder dispatch not 2xx" "$SVC AND httpRequest.requestUrl:\"/api/push/dispatch\" AND httpRequest.status>=400"
mk planb_share_created "Share and recap links created" "$SVC AND jsonPayload.event=\"share_created\""
echo "Metrics ready. Policies (thresholds): routes errors >10/10min, share 404 >60/10min, dispatch failures >2/10min, share creation >40/h."
echo "See the Monitoring console (or the REST call in docs/SHARING-REMINDERS-ROUTES.md) to create the threshold policies on logging.googleapis.com/user/<metric>."
