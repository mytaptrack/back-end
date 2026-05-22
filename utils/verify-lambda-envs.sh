#!/usr/bin/env bash
# verify-lambda-envs.sh
# Checks all 9 event-publishing Lambdas post-deploy for Phase 2 CDKW-07
# Usage: bash back-end/utils/verify-lambda-envs.sh [STAGE] [REGION]
# Defaults: STAGE=dev, REGION=us-west-2

set -euo pipefail

STAGE="${1:-dev}"
REGION="${2:-us-west-2}"

LAMBDAS=(
  "mytaptrack-graphql-api-${STAGE}-${REGION}-ProcessDataInReport"
  "mytaptrack-graphql-api-${STAGE}-${REGION}-UpdateDataInReport"
  "mytaptrack-devices-api-${STAGE}-${REGION}-IoTTrack20ClickHandler"
  "mytaptrack-devices-api-${STAGE}-${REGION}-IoTTrack20AudioHandler"
  "mytaptrack-devices-api-${STAGE}-${REGION}-appTokenTrack"
  "mytaptrack-devices-api-${STAGE}-${REGION}-devicePutDataV2"
  "mytaptrack-devices-api-${STAGE}-${REGION}-devicePutAudioV2"
  "mytaptrack-devices-api-${STAGE}-${REGION}-processButtonV2"
  "mytaptrack-data-prop-${STAGE}-${REGION}-dataToEventBus"
)

PASS=0
FAIL=0
ERRORS=()

for FN in "${LAMBDAS[@]}"; do
  echo "=== Checking: $FN ==="
  VARS=$(aws lambda get-function-configuration \
    --function-name "$FN" \
    --query 'Environment.Variables' \
    --output json 2>&1) || { echo "  ERROR: Could not retrieve config for $FN"; FAIL=$((FAIL+1)); ERRORS+=("$FN: retrieval failed"); continue; }

  if echo "$VARS" | jq -e 'has("USE_LOCAL")' > /dev/null 2>&1; then
    echo "  FAIL: USE_LOCAL is present"
    FAIL=$((FAIL+1))
    ERRORS+=("$FN: USE_LOCAL present")
  elif echo "$VARS" | jq -e 'has("DYNAMODB_ENDPOINT")' > /dev/null 2>&1; then
    echo "  FAIL: DYNAMODB_ENDPOINT is present"
    FAIL=$((FAIL+1))
    ERRORS+=("$FN: DYNAMODB_ENDPOINT present")
  elif echo "$VARS" | jq -e 'has("EVENT_BUS")' > /dev/null 2>&1; then
    echo "  PASS: EVENT_BUS present, local vars absent"
    PASS=$((PASS+1))
  else
    echo "  FAIL: EVENT_BUS is missing"
    FAIL=$((FAIL+1))
    ERRORS+=("$FN: EVENT_BUS missing")
  fi
done

echo ""
echo "======================================="
echo "Results: $PASS PASS, $FAIL FAIL"
if [ ${#ERRORS[@]} -gt 0 ]; then
  echo "Failures:"
  for ERR in "${ERRORS[@]}"; do
    echo "  - $ERR"
  done
  exit 1
fi
echo "All 9 event-publishing Lambdas verified: EVENT_BUS present, no local vars."
exit 0
