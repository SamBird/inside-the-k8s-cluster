#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-inside-k8s}"
KUBE_CONTEXT="${KUBE_CONTEXT:-kind-${CLUSTER_NAME}}"
KIND_CONFIG="${KIND_CONFIG:-k8s/kind-config.yaml}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $1" >&2
    exit 1
  }
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
