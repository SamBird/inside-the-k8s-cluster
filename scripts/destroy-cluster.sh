#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-inside-k8s}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $1" >&2
    exit 1
  }
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
  echo "Cluster '$CLUSTER_NAME' deleted."
else
  echo "Cluster '$CLUSTER_NAME' does not exist; nothing to delete."
fi
