#!/usr/bin/env bash
# verify-stack-status.sh
# Checks all 5 CloudFormation stacks report CREATE_COMPLETE or UPDATE_COMPLETE
# Usage: bash back-end/utils/verify-stack-status.sh [STAGE]
# Default: STAGE=dev

set -euo pipefail

STAGE="${1:-dev}"

STACKS=(
  "mytaptrack-${STAGE}"
  "mytaptrack-graphql-api-${STAGE}"
  "mytaptrack-api-${STAGE}"
  "mytaptrack-devices-api-${STAGE}"
  "mytaptrack-data-prop-${STAGE}"
)

PASS=0
FAIL=0
ERRORS=()

for STACK in "${STACKS[@]}"; do
  echo "=== Checking: $STACK ==="
  STATUS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>&1) || { echo "  ERROR: Stack not found or describe failed"; FAIL=$((FAIL+1)); ERRORS+=("$STACK: describe failed"); continue; }

  if [ "$STATUS" = "CREATE_COMPLETE" ] || [ "$STATUS" = "UPDATE_COMPLETE" ]; then
    echo "  PASS: $STATUS"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $STATUS"
    FAIL=$((FAIL+1))
    ERRORS+=("$STACK: $STATUS")
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
echo "All 5 CloudFormation stacks are in COMPLETE status."
exit 0
