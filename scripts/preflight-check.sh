#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-inside-k8s}"
KUBE_CONTEXT="${KUBE_CONTEXT:-kind-${CLUSTER_NAME}}"

ok() {
  printf '[ok] %s\n' "$1"
}

warn() {
  printf '[warn] %s\n' "$1"
}

fail() {
  printf '[fail] %s\n' "$1"
  exit 1
}

check_cmd() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "found command: $cmd"
  else
    warn "missing command: $cmd"
  fi
}

echo "Preflight checks for local demo environment"
echo "Cluster: $CLUSTER_NAME"
echo "Context: $KUBE_CONTEXT"

check_cmd docker
check_cmd kubectl
check_cmd kind
check_cmd make
check_cmd python3
check_cmd node
check_cmd npm

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    ok "docker daemon reachable"
  else
    warn "docker daemon is not reachable"
  fi
fi

if command -v kind >/dev/null 2>&1; then
  if kind_clusters="$(kind get clusters 2>/dev/null)"; then
    if grep -Fxq "$CLUSTER_NAME" <<<"$kind_clusters"; then
      ok "kind cluster '$CLUSTER_NAME' exists"
    else
      warn "kind cluster '$CLUSTER_NAME' not found"
    fi
  else
    warn "unable to query kind clusters (docker runtime may be unavailable)"
  fi
fi

if command -v kubectl >/dev/null 2>&1; then
  if kubectl config get-contexts -o name 2>/dev/null | grep -Fxq "$KUBE_CONTEXT"; then
    ok "kube context '$KUBE_CONTEXT' is configured"
  else
    warn "kube context '$KUBE_CONTEXT' is missing"
  fi
fi

if [[ ! -f Makefile ]]; then
  fail "Makefile not found in current directory"
fi
ok "repository root detected"
