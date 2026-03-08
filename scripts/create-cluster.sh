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
  echo "Cluster '$CLUSTER_NAME' already exists; skipping creation."
else
  echo "Creating kind cluster '$CLUSTER_NAME' using $KIND_CONFIG"
  kind create cluster --name "$CLUSTER_NAME" --config "$KIND_CONFIG"
fi

if ! kubectl config get-contexts -o name | grep -Fxq "$KUBE_CONTEXT"; then
  echo "ERROR: expected kube context '$KUBE_CONTEXT' was not found after cluster creation." >&2
  exit 1
fi

kubectl config use-context "$KUBE_CONTEXT" >/dev/null

echo "Waiting for nodes to become Ready..."
kubectl --context "$KUBE_CONTEXT" wait --for=condition=Ready node --all --timeout=180s

echo "Installing metrics-server..."
CLUSTER_NAME="$CLUSTER_NAME" KUBE_CONTEXT="$KUBE_CONTEXT" "$(dirname "$0")/install-metrics-server.sh"

echo "Cluster '$CLUSTER_NAME' is ready."
kubectl --context "$KUBE_CONTEXT" get nodes -o wide
