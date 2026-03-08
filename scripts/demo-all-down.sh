#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CLUSTER_NAME="${CLUSTER_NAME:-inside-k8s}"
STOP_COLIMA="${STOP_COLIMA:-0}"
COLIMA_PROFILE="${COLIMA_PROFILE:-default}"

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
  printf '[warn] %s\n' "$1" >&2
}

stop_local_services() {
  step "Stopping local backend/frontend services"
  "${ROOT_DIR}/scripts/demo-stop.sh"
}

delete_cluster_if_present() {
  step "Deleting local kind cluster if present"

  if ! command -v kind >/dev/null 2>&1; then
    warn "kind is not installed; skipping cluster deletion."
    return 0
  fi

  local clusters
  if clusters="$(kind get clusters 2>/dev/null)"; then
    :
  else
    info "Could not list kind clusters; attempting to prepare container runtime."
    "${ROOT_DIR}/scripts/ensure-container-runtime.sh"
    clusters="$(kind get clusters 2>/dev/null || true)"
  fi

  if grep -Fxq "$CLUSTER_NAME" <<<"$clusters"; then
    CLUSTER_NAME="$CLUSTER_NAME" "${ROOT_DIR}/scripts/destroy-cluster.sh"
    ok "Cluster teardown finished for '$CLUSTER_NAME'."
  else
    info "Cluster '$CLUSTER_NAME' not found; nothing to delete."
  fi
}

stop_colima_if_requested() {
  if [[ "$STOP_COLIMA" != "1" ]]; then
    return 0
  fi

  step "Stopping Colima runtime (requested)"
  if ! command -v colima >/dev/null 2>&1; then
    warn "colima command not found; skipping runtime shutdown."
    return 0
  fi

  if colima status --profile "$COLIMA_PROFILE" >/dev/null 2>&1; then
    colima stop --profile "$COLIMA_PROFILE" >/dev/null
    ok "Stopped Colima profile '$COLIMA_PROFILE'."
  else
    info "Colima profile '$COLIMA_PROFILE' is not running."
  fi
}

print_summary() {
  step "Demo environment shutdown completed"
  cat <<SUMMARY
Summary:
- Local demo-managed backend/frontend processes: stopped (if present)
- kind cluster '${CLUSTER_NAME}': deleted if it existed
- Colima runtime: $( [[ "$STOP_COLIMA" == "1" ]] && echo "stop requested" || echo "left running" )

Tip:
- Use 'make demo-all VERSION=v1' to bring the full demo stack back up.
SUMMARY
}

main() {
  stop_local_services
  delete_cluster_if_present
  stop_colima_if_requested
  print_summary
}

main "$@"
