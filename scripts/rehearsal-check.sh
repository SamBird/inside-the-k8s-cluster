#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CLUSTER_NAME="${CLUSTER_NAME:-inside-k8s}"
KUBE_CONTEXT="${KUBE_CONTEXT:-kind-${CLUSTER_NAME}}"
NAMESPACE="${NAMESPACE:-inside-k8s-demo}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"

fail_count=0

check() {
  local label="$1"
  shift
  if "$@"; then
    printf '[ok] %s\n' "$label"
  else
    printf '[fail] %s\n' "$label" >&2
    fail_count=$((fail_count + 1))
  fi
}

check_cmd() {
  command -v "$1" >/dev/null 2>&1
}

check_http_ok() {
  curl -fsS "$1" >/dev/null 2>&1
}

check_traffic_endpoint() {
  local url="${BACKEND_URL}/api/traffic/info"
  local attempts=4
  local status=""
  local body=""

  for attempt in $(seq 1 "$attempts"); do
    local tmp_file
    tmp_file="$(mktemp)"
    status="$(curl -sS -o "$tmp_file" -w "%{http_code}" "$url" || true)"
    body="$(cat "$tmp_file")"
    rm -f "$tmp_file"

    if [[ "$status" == "200" ]]; then
      return 0
    fi

    if [[ "$status" == "409" ]]; then
      if grep -qi "no ready endpoints" <<<"$body"; then
        printf '[info] traffic endpoint reachable but no ready endpoints yet; waiting for rollout (%d/%d).\n' "$attempt" "$attempts" >&2
        kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" rollout status deployment/demo-app --timeout=90s >/dev/null 2>&1 || true
        sleep 2
        continue
      fi
      break
    fi

    break
  done

  if [[ "$status" == "404" ]]; then
    printf '[info] traffic endpoint missing on running backend. Restart backend to load latest code.\n' >&2
  elif [[ "$status" == "409" ]]; then
    printf '[info] traffic endpoint still reports no ready service endpoints after retries.\n' >&2
  else
    printf '[info] traffic endpoint returned unexpected status %s.\n' "$status" >&2
  fi
  printf '[info] response body: %s\n' "$body" >&2
  return 1
}

check_grep_url() {
  local url="$1"
  local pattern="$2"
  curl -fsS "$url" | grep -q "$pattern"
}

printf 'Rehearsal checks for context=%s namespace=%s\n' "$KUBE_CONTEXT" "$NAMESPACE"

check "kubectl installed" check_cmd kubectl
check "curl installed" check_cmd curl
check "cluster nodes reachable" kubectl --context "$KUBE_CONTEXT" get nodes >/dev/null
check "cluster nodes ready" kubectl --context "$KUBE_CONTEXT" wait --for=condition=Ready node --all --timeout=90s >/dev/null
check "demo deployment rolled out" kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" rollout status deployment/demo-app --timeout=120s >/dev/null
check "backend healthy" check_http_ok "${BACKEND_URL}/healthz"
check "frontend reachable" check_http_ok "${FRONTEND_URL}"
check "traffic endpoint works" check_traffic_endpoint
check "control-plane overview renders" check_grep_url "${FRONTEND_URL}" "Control Plane Overview"
check "Apply YAML journey present in UI bundle" grep -q "Apply YAML journey" frontend/lib/explainedFlow.ts
check "Controller reconciliation present in UI bundle" grep -q "Controller reconciliation" frontend/lib/explainedFlow.ts

printf '\nScenario order (manual run):\n'
printf '1) Cluster overview\n'
printf '2) Control-plane overview\n'
printf '3) Apply YAML journey\n'
printf '4) Controller reconciliation\n'
printf '5) Readiness vs Running\n'
printf '6) Scaling\n'
printf '7) Rollout behavior\n'

if [[ "$fail_count" -gt 0 ]]; then
  printf '\nRehearsal check finished with %d failure(s).\n' "$fail_count" >&2
  exit 1
fi

printf '\nAll rehearsal checks passed.\n'
