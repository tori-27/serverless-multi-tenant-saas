#!/bin/bash
# Run CRUD Latency Test
# This script gets JWT tokens for all tiers and runs the CRUD latency test

cd "$(dirname "$0")"

# Deployment-specific values (API URL, Cognito client, test password, API keys,
# usage plan IDs) come from load-tests/.env. See .env.example.
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
: "${BASE_URL:?Set BASE_URL in load-tests/.env}"
: "${COGNITO_CLIENT_ID:?Set COGNITO_CLIENT_ID in load-tests/.env}"
: "${TEST_USER_PASSWORD:?Set TEST_USER_PASSWORD in load-tests/.env}"
CLIENT_ID="$COGNITO_CLIENT_ID"
PASSWORD="$TEST_USER_PASSWORD"

echo "=========================================="
echo "CRUD Latency Test"
echo "=========================================="

echo ""
echo "Step 1: Resetting daily quotas..."
echo "------------------------------------------"
for PLAN_ID in $USAGE_PLAN_IDS; do
  aws apigateway update-usage-plan --usage-plan-id "$PLAN_ID" --patch-operations op=replace,path=/quota/limit,value=10000 > /dev/null 2>&1
done
echo "Quotas reset to 10000"

echo ""
echo "Step 2: Getting JWT tokens..."
echo "------------------------------------------"

# BASIC tenant: BasicCorp (t-cc327c5c)
BASIC_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id $CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters "USERNAME=tenant-admin-t-cc327c5c,PASSWORD=$PASSWORD" \
  --query 'AuthenticationResult.IdToken' \
  --output text 2>/dev/null)

# STANDARD tenant: TestStandardCorp (t-9a72f0b8)
STANDARD_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id $CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters "USERNAME=tenant-admin-t-9a72f0b8,PASSWORD=$PASSWORD" \
  --query 'AuthenticationResult.IdToken' \
  --output text 2>/dev/null)

# PREMIUM tenant: PremiumCorp (t-46d6c4c8)
PREMIUM_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id $CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters "USERNAME=tenant-admin-t-46d6c4c8,PASSWORD=$PASSWORD" \
  --query 'AuthenticationResult.IdToken' \
  --output text 2>/dev/null)

# PLATINUM tenant: qwerty Corp (t-cad5c200)
PLATINUM_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id $CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters "USERNAME=tenant-admin-t-cad5c200,PASSWORD=$PASSWORD" \
  --query 'AuthenticationResult.IdToken' \
  --output text 2>/dev/null)

echo "Token lengths:"
echo "  BASIC:    ${#BASIC_TOKEN} chars"
echo "  STANDARD: ${#STANDARD_TOKEN} chars"
echo "  PREMIUM:  ${#PREMIUM_TOKEN} chars"
echo "  PLATINUM: ${#PLATINUM_TOKEN} chars"

# Verify tokens
if [ ${#BASIC_TOKEN} -lt 100 ] || [ ${#STANDARD_TOKEN} -lt 100 ] || [ ${#PREMIUM_TOKEN} -lt 100 ] || [ ${#PLATINUM_TOKEN} -lt 100 ]; then
  echo ""
  echo "ERROR: One or more tokens failed to retrieve!"
  echo "Please check your AWS credentials and Cognito configuration."
  exit 1
fi

echo ""
echo "Step 3: Warming up Lambda functions..."
echo "------------------------------------------"
echo "Sending single GET request per tier to wake up Lambdas..."

# Warm up each tier sequentially
for TIER_KEY in "$BASIC_API_KEY:$BASIC_TOKEN" "$STANDARD_API_KEY:$STANDARD_TOKEN" "$PREMIUM_API_KEY:$PREMIUM_TOKEN" "$PLATINUM_API_KEY:$PLATINUM_TOKEN"; do
  API_KEY=$(echo "$TIER_KEY" | cut -d: -f1)
  TOKEN=$(echo "$TIER_KEY" | cut -d: -f2-)
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-api-key: $API_KEY" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/products")
  echo "  Warm-up GET /products: HTTP $STATUS"
  sleep 1
done

# Quick POST test to verify write operations work
echo ""
echo "Verifying POST /product works..."
POST_RESULT=$(curl -s -w "\n%{http_code}" \
  -X POST "$BASE_URL/product" \
  -H "x-api-key: $BASIC_API_KEY" \
  -H "Authorization: Bearer $BASIC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sku":"WARMUP-TEST","name":"Warmup","price":1,"category":{"id":"cat-1","name":"Test"}}')
POST_STATUS=$(echo "$POST_RESULT" | tail -1)
POST_BODY=$(echo "$POST_RESULT" | head -n -1)
echo "  POST /product: HTTP $POST_STATUS"
if [ "$POST_STATUS" != "200" ] && [ "$POST_STATUS" != "201" ]; then
  echo "  WARNING: POST returned $POST_STATUS - Body: $POST_BODY"
  echo "  CRUD test may not collect all metrics. Check API configuration."
else
  echo "  POST works correctly!"
fi
sleep 2

echo ""
echo "Step 4: Running k6 CRUD latency test..."
echo "------------------------------------------"
echo "Warm-up: 15s per tier (staggered), then 120s main test"
echo "Total duration: ~150 seconds"
echo ""

k6 run \
  -e BASIC_TOKEN="$BASIC_TOKEN" \
  -e STANDARD_TOKEN="$STANDARD_TOKEN" \
  -e PREMIUM_TOKEN="$PREMIUM_TOKEN" \
  -e PLATINUM_TOKEN="$PLATINUM_TOKEN" \
  crud-latency-test.js

echo ""
echo "Step 5: Generating visualizations..."
echo "------------------------------------------"

# Check if Python is available
if command -v python3 &> /dev/null; then
  # Activate virtual environment if exists
  if [ -d ".venv" ]; then
    source .venv/bin/activate
  fi
  
  python3 visualize_crud_latency.py
  
  if [ -d ".venv" ]; then
    deactivate
  fi
else
  echo "Python3 not found. Please run visualize_crud_latency.py manually."
fi

echo ""
echo "=========================================="
echo "Test Complete!"
echo "=========================================="
echo ""
echo "Generated files:"
echo "  - crud-latency-results.json (raw data)"
echo "  - crud_latency_comparison.png"
echo "  - crud_latency_by_tier.png"
echo "  - crud_pooled_vs_siloed.png"
echo "  - crud_latency_heatmap.png"
