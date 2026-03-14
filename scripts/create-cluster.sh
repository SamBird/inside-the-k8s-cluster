#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME="${CLUSTER_NAME:-inside-k8s}"
KUBE_CONTEXT="${KUBE_CONTEXT:-kind-${CLUSTER_NAME}}"
KIND_CONFIG="${KIND_CONFIG:-k8s/kind-config.yaml}"
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

using_colima() {
  local docker_context
  docker_context="$(docker context show 2>/dev/null || true)"
  [[ "$docker_context" == "colima" ]] || [[ "${DOCKER_HOST:-}" == *".colima/"* ]]
}

cluster_server_url() {
  kubectl config view --raw -o jsonpath="{.clusters[?(@.name==\"${KUBE_CONTEXT}\")].cluster.server}"
}

parse_cluster_server() {
  local server_url
  server_url="$(cluster_server_url)"
  [[ "$server_url" =~ ^https://([^:/]+):([0-9]+)$ ]] || return 1

  CLUSTER_SERVER_URL="$server_url"
  CLUSTER_SERVER_HOST="${BASH_REMATCH[1]}"
  CLUSTER_SERVER_PORT="${BASH_REMATCH[2]}"
}

server_readyz_reachable() {
  local server_url="$1"
  curl -sk --max-time 2 "${server_url}/readyz" >/dev/null 2>&1
}

stop_managed_tunnel() {
  if pid_is_running "$TUNNEL_PID_FILE"; then
    kill "$(cat "$TUNNEL_PID_FILE")" >/dev/null 2>&1 || true
  fi
  rm -f "$TUNNEL_PID_FILE"
}

ensure_cluster_api_access() {
  parse_cluster_server || return 0

  if server_readyz_reachable "$CLUSTER_SERVER_URL"; then
    return 0
  fi

  if ! using_colima; then
    return 0
  fi

  require_cmd colima
  require_cmd ssh
  require_cmd lsof

  if ! colima ssh -- curl -sk --max-time 2 "https://${CLUSTER_SERVER_HOST}:${CLUSTER_SERVER_PORT}/readyz" >/dev/null 2>&1; then
    return 0
  fi

  mkdir -p "$(dirname "$TUNNEL_PID_FILE")"
  stop_managed_tunnel

  echo "Opening Colima tunnel for cluster API on ${CLUSTER_SERVER_HOST}:${CLUSTER_SERVER_PORT}"
  ssh -F "${HOME}/.colima/ssh_config" colima \
    -o ControlMaster=no \
    -o ControlPath=none \
    -o ExitOnForwardFailure=yes \
    -f -N \
    -L "${CLUSTER_SERVER_HOST}:${CLUSTER_SERVER_PORT}:${CLUSTER_SERVER_HOST}:${CLUSTER_SERVER_PORT}"

  local tunnel_pid
  tunnel_pid="$(lsof -tiTCP:"${CLUSTER_SERVER_PORT}" -sTCP:LISTEN -c ssh 2>/dev/null | head -n 1 || true)"
  if [[ -n "$tunnel_pid" ]]; then
    echo "$tunnel_pid" >"$TUNNEL_PID_FILE"
  fi
}

cluster_reachable() {
  kubectl --context "$KUBE_CONTEXT" --request-timeout='10s' get --raw='/readyz' >/dev/null 2>&1
}

wait_for_cluster_api() {
  local attempts="${1:-30}"
  local sleep_seconds="${2:-2}"

  for ((i = 1; i <= attempts; i++)); do
    if cluster_reachable; then
      return 0
    fi
    sleep "$sleep_seconds"
  done

  return 1
}

recreate_cluster() {
  echo "Recreating kind cluster '$CLUSTER_NAME' using $KIND_CONFIG"
  kind delete cluster --name "$CLUSTER_NAME" >/dev/null 2>&1 || true
  kind create cluster --name "$CLUSTER_NAME" --config "$KIND_CONFIG"
}

usage() {
  cat <<USAGE
Usage: CLUSTER_NAME=<name> KUBE_CONTEXT=<ctx> KIND_CONFIG=<path> ./scripts/create-cluster.sh

Creates a local kind cluster with 1 control-plane and 2 workers,
then installs metrics-server.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd kind
require_cmd kubectl
require_cmd docker

"$(dirname "$0")/ensure-container-runtime.sh"

if kind get clusters | grep -Fxq "$CLUSTER_NAME"; then
  echo "Cluster '$CLUSTER_NAME' already exists; refreshing kubeconfig and checking API availability."
  kind export kubeconfig --name "$CLUSTER_NAME" >/dev/null
  ensure_cluster_api_access
  if cluster_reachable; then
    echo "Cluster '$CLUSTER_NAME' API server is reachable."
  else
    echo "Existing cluster '$CLUSTER_NAME' is unreachable; deleting and recreating it."
    recreate_cluster
  fi
else
  recreate_cluster
fi

kind export kubeconfig --name "$CLUSTER_NAME" >/dev/null

if ! kubectl config get-contexts -o name | grep -Fxq "$KUBE_CONTEXT"; then
  echo "ERROR: expected kube context '$KUBE_CONTEXT' was not found after cluster creation." >&2
  exit 1
fi

kubectl config use-context "$KUBE_CONTEXT" >/dev/null
ensure_cluster_api_access

if ! wait_for_cluster_api 30 2; then
  echo "ERROR: kube context '$KUBE_CONTEXT' exists but the API server is still unreachable after bootstrap." >&2
  echo "The kind control-plane container may be running without a working host port forward." >&2
  echo "Check Docker/Colima status, then retry 'make cluster-reset'." >&2
  exit 1
fi

echo "Waiting for nodes to become Ready..."
kubectl --context "$KUBE_CONTEXT" wait --for=condition=Ready node --all --timeout=180s

echo "Installing metrics-server..."
CLUSTER_NAME="$CLUSTER_NAME" KUBE_CONTEXT="$KUBE_CONTEXT" "$(dirname "$0")/install-metrics-server.sh"

echo "Cluster '$CLUSTER_NAME' is ready."
kubectl --context "$KUBE_CONTEXT" get nodes -o wide
