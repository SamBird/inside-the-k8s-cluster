#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CLUSTER_NAME="${CLUSTER_NAME:-inside-k8s}"
KUBE_CONTEXT="${KUBE_CONTEXT:-kind-${CLUSTER_NAME}}"
NAMESPACE="${NAMESPACE:-inside-k8s-demo}"
VERSION="${VERSION:-v1}"
PRELOAD_ROLLOUT_VERSIONS="${PRELOAD_ROLLOUT_VERSIONS:-v2}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"
DEMO_HEALTH_PORT="${DEMO_HEALTH_PORT:-18080}"

DEMO_DIR="${ROOT_DIR}/.demo"
PID_DIR="${DEMO_DIR}/pids"
LOG_DIR="${DEMO_DIR}/logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

BACKEND_PID_FILE="${PID_DIR}/backend.pid"
FRONTEND_PID_FILE="${PID_DIR}/frontend.pid"
BACKEND_LOG_FILE="${LOG_DIR}/backend.log"
FRONTEND_LOG_FILE="${LOG_DIR}/frontend.log"
PRELOADED_TAGS=()

step() {
  printf '\n==> %s\n' "$1"
}

info() {
  printf '[info] %s\n' "$1"
}

ok() {
  printf '[ok] %s\n' "$1"
}

warn() {
  printf '[warn] %s\n' "$1"
}

fail() {
  printf '[fail] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "Required command not found: $cmd"
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-45}"
  local sleep_seconds="${3:-1}"

  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$sleep_seconds"
  done
  return 1
}

pid_is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

start_backend_if_needed() {
  step "Ensuring backend service is running"

  if wait_for_http "${BACKEND_URL}/healthz" 2 1; then
    local traffic_status
    traffic_status="$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/traffic/info" || true)"
    if [[ "$traffic_status" == "404" ]]; then
      warn "Backend is healthy but missing /api/traffic/info (likely stale process)."
      if ! pid_is_running "$BACKEND_PID_FILE"; then
        fail "Backend appears outdated and is not managed by demo-all. Restart backend and rerun."
      fi
      warn "Restarting managed backend process to load latest routes."
      kill "$(cat "$BACKEND_PID_FILE")" >/dev/null 2>&1 || true
      rm -f "$BACKEND_PID_FILE"
      sleep 1
    else
      ok "Backend already healthy at ${BACKEND_URL}/healthz"
      return 0
    fi
  fi

  [[ -x "${ROOT_DIR}/backend/.venv/bin/uvicorn" ]] || fail "backend virtualenv is missing. Run 'make backend-install'."

  if pid_is_running "$BACKEND_PID_FILE"; then
    warn "Backend process exists (pid $(cat "$BACKEND_PID_FILE")) but health check is failing. Restarting it."
    kill "$(cat "$BACKEND_PID_FILE")" >/dev/null 2>&1 || true
    rm -f "$BACKEND_PID_FILE"
    sleep 1
  fi

  info "Starting backend (logs: ${BACKEND_LOG_FILE})"
  (
    cd backend
    nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 >"$BACKEND_LOG_FILE" 2>&1 &
    echo $! >"$BACKEND_PID_FILE"
  )

  if wait_for_http "${BACKEND_URL}/healthz" 45 1; then
    ok "Backend is healthy"
  else
    warn "Backend log tail:"
    tail -n 60 "$BACKEND_LOG_FILE" || true
    fail "Backend failed to become healthy at ${BACKEND_URL}/healthz"
  fi
}

start_frontend_if_needed() {
  step "Ensuring frontend service is running"

  if wait_for_http "${FRONTEND_URL}" 2 1; then
    ok "Frontend already reachable at ${FRONTEND_URL}"
    return 0
  fi

  require_cmd node
  require_cmd npm

  if [[ ! -d "${ROOT_DIR}/frontend/node_modules" ]]; then
    info "Installing frontend dependencies"
    make frontend-install
  else
    ok "Frontend dependencies already present"
  fi

  if pid_is_running "$FRONTEND_PID_FILE"; then
    warn "Frontend process exists (pid $(cat "$FRONTEND_PID_FILE")) but endpoint is failing. Restarting it."
    kill "$(cat "$FRONTEND_PID_FILE")" >/dev/null 2>&1 || true
    rm -f "$FRONTEND_PID_FILE"
    sleep 1
  fi

  info "Starting frontend (logs: ${FRONTEND_LOG_FILE})"
  (
    cd frontend
    nohup npm run dev -- --hostname 0.0.0.0 --port 3000 >"$FRONTEND_LOG_FILE" 2>&1 &
    echo $! >"$FRONTEND_PID_FILE"
  )

  if wait_for_http "${FRONTEND_URL}" 90 1; then
    ok "Frontend is reachable"
  else
    warn "Frontend log tail:"
    tail -n 80 "$FRONTEND_LOG_FILE" || true
    fail "Frontend failed to start at ${FRONTEND_URL}"
  fi
}

preload_rollout_images() {
  step "Preparing rollout image tags"

  if [[ -z "${PRELOAD_ROLLOUT_VERSIONS}" ]]; then
    info "No extra rollout tags requested; skipping preload."
    return 0
  fi

  local raw_tag
  IFS=',' read -r -a rollout_tags <<<"$PRELOAD_ROLLOUT_VERSIONS"
  for raw_tag in "${rollout_tags[@]}"; do
    local tag="$raw_tag"
    tag="${tag#"${tag%%[![:space:]]*}"}"
    tag="${tag%"${tag##*[![:space:]]}"}"
    [[ -n "$tag" ]] || continue

    if [[ "$tag" == "$VERSION" ]]; then
      info "Skipping preload for base tag '${tag}' (already built via demo-up)."
      continue
    fi

    info "Preloading demo-app:${tag} for rollout demos"
    make demo-image VERSION="$tag"
    make demo-load VERSION="$tag"
    PRELOADED_TAGS+=("$tag")
  done

  if [[ "${#PRELOADED_TAGS[@]}" -gt 0 ]]; then
    ok "Rollout image preloading complete (${PRELOADED_TAGS[*]})"
  else
    info "No additional rollout tags preloaded."
  fi
}

check_demo_app_http() {
  step "Running demo app HTTP health check"

  local pf_log
  pf_log="${LOG_DIR}/demo-port-forward.log"
  local pf_pid

  kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" port-forward svc/demo-app "${DEMO_HEALTH_PORT}:80" >"$pf_log" 2>&1 &
  pf_pid=$!

  cleanup_pf() {
    kill "$pf_pid" >/dev/null 2>&1 || true
    wait "$pf_pid" 2>/dev/null || true
  }
  trap cleanup_pf RETURN

  for _ in {1..20}; do
    if curl -fsS "http://127.0.0.1:${DEMO_HEALTH_PORT}/info" >/dev/null 2>&1; then
      ok "Demo app responds over HTTP"
      trap - RETURN
      cleanup_pf
      return 0
    fi
    sleep 1
  done

  warn "Port-forward log tail:"
  tail -n 40 "$pf_log" || true
  trap - RETURN
  cleanup_pf
  fail "Demo app HTTP health check failed via port-forward on ${DEMO_HEALTH_PORT}"
}

print_summary() {
  step "Demo-all completed successfully"
  local preload_summary="none"
  if [[ "${#PRELOADED_TAGS[@]}" -gt 0 ]]; then
    preload_summary="${PRELOADED_TAGS[*]}"
  fi
  cat <<SUMMARY
Presenter summary:
- Cluster: ${CLUSTER_NAME}
- Context: ${KUBE_CONTEXT}
- Namespace: ${NAMESPACE}
- Demo image prepared: demo-app:${VERSION}
- Extra rollout images preloaded: ${preload_summary}
- Demo resources: deployed and rollout complete
- Backend: ${BACKEND_URL} (healthz ok)
- Frontend: ${FRONTEND_URL} (reachable)
- Demo app: HTTP /info check passed via temporary port-forward

Suggested next steps:
1. Open ${FRONTEND_URL}
2. Keep one terminal ready for port-forward during traffic demo:
   kubectl --context ${KUBE_CONTEXT} -n ${NAMESPACE} port-forward svc/demo-app 8080:80
3. Use dashboard action controls to run the talk flow.
SUMMARY
}

main() {
  step "Running prerequisite checks"
  require_cmd make
  require_cmd kubectl
  require_cmd kind
  require_cmd docker
  require_cmd curl
  require_cmd python3

  make preflight

  "${ROOT_DIR}/scripts/ensure-container-runtime.sh"

  if wait_for_http "${FRONTEND_URL}" 2 1; then
    ok "Frontend already reachable at ${FRONTEND_URL}; node/npm checks skipped"
  else
    require_cmd node
    require_cmd npm
  fi

  step "Ensuring cluster and addons"
  make cluster-up

  step "Building and deploying demo app"
  make demo-up VERSION="$VERSION"
  preload_rollout_images

  step "Ensuring backend dependencies"
  if [[ ! -x "${ROOT_DIR}/backend/.venv/bin/uvicorn" ]]; then
    make backend-install
  else
    ok "Backend virtualenv already present"
  fi

  start_backend_if_needed
  start_frontend_if_needed

  step "Kubernetes resource health checks"
  kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" rollout status deployment/demo-app --timeout=180s >/dev/null
  kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" get deploy,po,svc,cm

  check_demo_app_http
  print_summary
}

main "$@"
