#!/usr/bin/env bash
# Pre-demo smoke test — exercises every action endpoint in sequence.
# Usage: ./scripts/smoke-test.sh
# Override backend: BACKEND_URL=http://localhost:8000 ./scripts/smoke-test.sh

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
PASS=0
FAIL=0

pass() { echo "[PASS] $1"; PASS=$((PASS + 1)); }
fail() { echo "[FAIL] $1: $2"; FAIL=$((FAIL + 1)); }
info() { echo "       $1"; }

check_http() {
  local label="$1" url="$2" expected_status="${3:-200}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [[ "$status" == "$expected_status" ]]; then
    pass "$label"
  else
    fail "$label" "expected HTTP $expected_status, got $status"
  fi
}

post_action() {
  local label="$1" path="$2" body="${3:-{}}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${BACKEND_URL}${path}")
  if [[ "$status" == "200" ]]; then
    pass "$label"
  else
    fail "$label" "HTTP $status"
  fi
}

get_state_field() {
  # Returns the value of a jq path from GET /api/state, empty string on failure.
  curl -s "${BACKEND_URL}/api/state" | python3 -c "import sys,json; d=json.load(sys.stdin); print($1)" 2>/dev/null || echo ""
}

echo "================================================"
echo "  Inside-the-k8s-cluster pre-demo smoke test"
echo "  Backend: ${BACKEND_URL}"
echo "================================================"
echo ""

# Step 1 — Backend health
check_http "Backend health" "${BACKEND_URL}/healthz"

# Step 2 — Initial state
check_http "Get initial state" "${BACKEND_URL}/api/state"

# Step 3 — Deploy
post_action "Deploy app" "/api/actions/deploy"

# Step 4 — Wait for pods
info "Waiting 8s for pods to start..."
sleep 8

# Step 5 — State check: deployment exists
deployment_exists=$(get_state_field 'd["deployment"]["exists"]')
if [[ "$deployment_exists" == "True" ]]; then
  pass "Deployment exists after deploy"
else
  fail "Deployment exists after deploy" "deployment.exists=$deployment_exists"
fi

# Step 6 — Scale to 3
post_action "Scale to 3" "/api/actions/scale" '{"replicas": 3}'

# Step 7 — Wait for all pods
info "Waiting 10s for scaled pods..."
sleep 10

# Step 8 — Generate traffic (3 calls)
traffic_ok=true
for i in 1 2 3; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/traffic/info")
  if [[ "$status" != "200" ]]; then
    traffic_ok=false
    break
  fi
done
if $traffic_ok; then
  pass "Traffic generation (3 requests)"
else
  fail "Traffic generation" "one or more requests did not return 200"
fi

# Step 9 — Delete a pod (no body = backend picks oldest)
post_action "Delete a pod" "/api/actions/delete-pod" '{}'

# Step 10 — Wait for replacement
info "Waiting 8s for pod replacement..."
sleep 8

# Step 11 — Break readiness
post_action "Break readiness" "/api/actions/toggle-readiness" '{"fail": true}'

# Step 12 — Wait
info "Waiting 5s..."
sleep 5

# Step 13 — Restore readiness
post_action "Restore readiness" "/api/actions/toggle-readiness" '{"fail": false}'

# Step 14 — Wait
info "Waiting 5s..."
sleep 5

# Step 15 — Rollout to v2 (skip if image not loaded)
v2_present=$(docker exec inside-k8s-control-plane crictl images 2>/dev/null | grep demo-app | grep v2 || true)
if [[ -n "$v2_present" ]]; then
  post_action "Rollout to v2" "/api/actions/rollout" '{"version": "v2"}'
  info "Waiting 15s for rollout..."
  sleep 15

  # Step 17 — Verify v2
  app_version=$(get_state_field 'd["config"]["app_version"]')
  if [[ "$app_version" == "v2" ]]; then
    pass "Version is v2 after rollout"
  else
    fail "Version is v2 after rollout" "config.app_version=$app_version"
  fi
else
  echo "[SKIP] Rollout to v2: demo-app:v2 not found in kind cluster"
  echo "       Run: make demo-image VERSION=v2 && make demo-load VERSION=v2"
fi

# Step 18 — Reset
post_action "Reset demo" "/api/actions/reset"

# Step 19 — Wait
info "Waiting 10s for reset..."
sleep 10

# Step 20 — Verify reset: deployment exists, replicas target is 1
deploy_exists_after=$(get_state_field 'd["deployment"]["exists"]')
replicas_after=$(get_state_field 'd["deployment"]["replicas"]')

if [[ "$deploy_exists_after" == "True" ]]; then
  pass "Deployment exists after reset"
else
  fail "Deployment exists after reset" "deployment.exists=$deploy_exists_after"
fi

if [[ "$replicas_after" == "1" ]]; then
  pass "Replicas target is 1 after reset"
else
  fail "Replicas target is 1 after reset" "deployment.replicas=$replicas_after"
fi

echo ""
echo "================================================"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "================================================"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
