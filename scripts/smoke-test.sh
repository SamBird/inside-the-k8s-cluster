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
  local label="$1" path="$2"
  local default_body='{}'
  local body="${3:-$default_body}"
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

timed_post_action() {
  # Like post_action but asserts response arrives within MAX_ACTION_SECONDS.
  local label="$1" path="$2"
  local default_body='{}'
  local body="${3:-$default_body}"
  local max_seconds="${MAX_ACTION_SECONDS:-10}"
  local start_time end_time elapsed status
  start_time=$(python3 -c "import time; print(time.time())")
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$max_seconds" -X POST \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${BACKEND_URL}${path}" 2>/dev/null || echo "timeout")
  end_time=$(python3 -c "import time; print(time.time())")
  elapsed=$(python3 -c "print(f'{$end_time - $start_time:.1f}')")
  if [[ "$status" == "200" ]]; then
    pass "$label (${elapsed}s)"
  elif [[ "$status" == "timeout" ]]; then
    fail "$label" "timed out after ${max_seconds}s"
  else
    fail "$label" "HTTP $status (${elapsed}s)"
  fi
}

poll_state_field() {
  # Polls get_state_field until expected value or timeout.
  # Usage: poll_state_field 'expression' 'expected_value' timeout_seconds label
  local expression="$1" expected="$2" timeout="$3" label="$4"
  local deadline=$((SECONDS + timeout))
  while [[ $SECONDS -lt $deadline ]]; do
    local value
    value=$(get_state_field "$expression")
    if [[ "$value" == "$expected" ]]; then
      pass "$label"
      return 0
    fi
    sleep 2
  done
  fail "$label" "expected $expected, got $(get_state_field "$expression") after ${timeout}s"
  return 1
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
timed_post_action "Deploy app" "/api/actions/deploy"

# Step 4 — Poll for deployment ready
poll_state_field 'd["deployment"]["exists"]' "True" 15 "Deployment exists after deploy"
poll_state_field 'd["deployment"]["ready_replicas"]' "1" 20 "At least 1 pod ready after deploy"

# Step 5 — Scale to 3
timed_post_action "Scale to 3" "/api/actions/scale" '{"replicas": 3}'

# Step 6 — Poll for 3 ready pods
poll_state_field 'd["deployment"]["ready_replicas"]' "3" 30 "3 pods ready after scale"

# Step 7 — Generate traffic (3 calls)
traffic_ok=true
for i in 1 2 3; do
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${BACKEND_URL}/api/traffic/info")
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

# Step 8 — Delete a pod (no body = backend picks oldest)
timed_post_action "Delete a pod" "/api/actions/delete-pod" '{}'

# Step 9 — Poll for replacement (3 ready pods again)
poll_state_field 'd["deployment"]["ready_replicas"]' "3" 20 "Pod replacement complete (3 ready)"

# Step 10 — Break readiness
timed_post_action "Break readiness" "/api/actions/toggle-readiness" '{"fail": true}'

# Step 11 — Verify at least one pod is NotReady
info "Waiting for readiness probe to detect failure..."
not_ready_found=false
deadline=$((SECONDS + 15))
while [[ $SECONDS -lt $deadline ]]; do
  ready_count=$(get_state_field 'd["deployment"]["ready_replicas"]')
  if [[ "$ready_count" != "3" && -n "$ready_count" ]]; then
    not_ready_found=true
    break
  fi
  sleep 2
done
if $not_ready_found; then
  pass "Ready count dropped after break readiness (ready=$ready_count)"
else
  fail "Break readiness effect" "ready_replicas still 3 after 15s"
fi

# Step 12 — Restore readiness
timed_post_action "Restore readiness" "/api/actions/toggle-readiness" '{"fail": false}'

# Step 13 — Poll for all 3 ready again
poll_state_field 'd["deployment"]["ready_replicas"]' "3" 15 "All pods ready after restore"

# Step 14 — Rollout to v2 (skip if image not loaded)
v2_present=$(docker exec inside-k8s-control-plane crictl images 2>/dev/null | grep demo-app | grep v2 || true)
if [[ -n "$v2_present" ]]; then
  timed_post_action "Rollout to v2" "/api/actions/rollout" '{"version": "v2"}'

  # Poll for version to propagate
  poll_state_field 'd["config"]["app_version"]' "v2" 30 "Version is v2 after rollout"
else
  echo "[SKIP] Rollout to v2: demo-app:v2 not found in kind cluster"
  echo "       Run: make demo-image VERSION=v2 && make demo-load VERSION=v2"
fi

# Step 15 — Reset
timed_post_action "Reset demo" "/api/actions/reset"

# Step 16 — Poll for reset completeness: deployment exists, replicas=1, version=v1, pod ready
poll_state_field 'd["deployment"]["exists"]' "True" 15 "Deployment exists after reset"
poll_state_field 'd["deployment"]["replicas"]' "1" 15 "Replicas target is 1 after reset"
poll_state_field 'd.get("config", {}).get("app_version", "")' "v1" 15 "Version is v1 after reset"
poll_state_field 'd["deployment"]["ready_replicas"]' "1" 30 "1 pod ready after reset"

echo ""
echo "================================================"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "================================================"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
