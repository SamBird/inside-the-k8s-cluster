#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME="${CLUSTER_NAME:-inside-k8s}"
TUNNEL_PID_FILE="${ROOT_DIR}/.demo/pids/kind-${CLUSTER_NAME}-api-tunnel.pid"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $1" >&2
    exit 1
  }
}

pid_is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1

  kill -0 "$pid" >/dev/null 2>&1
}

stop_managed_tunnel() {
  if pid_is_running "$TUNNEL_PID_FILE"; then
    echo "Stopping managed cluster API tunnel"
    kill "$(cat "$TUNNEL_PID_FILE")" >/dev/null 2>&1 || true
  fi
  rm -f "$TUNNEL_PID_FILE"
}

usage() {
  cat <<USAGE
Usage: CLUSTER_NAME=<name> ./scripts/destroy-cluster.sh

Deletes the local kind cluster if it exists.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd kind
require_cmd docker

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: docker daemon is not reachable. Start Docker/Colima and retry." >&2
  exit 1
fi

if kind get clusters | grep -Fxq "$CLUSTER_NAME"; then
  echo "Deleting kind cluster '$CLUSTER_NAME'"
  kind delete cluster --name "$CLUSTER_NAME"
  stop_managed_tunnel
  echo "Cluster '$CLUSTER_NAME' deleted."
else
  stop_managed_tunnel
  echo "Cluster '$CLUSTER_NAME' does not exist; nothing to delete."
fi
