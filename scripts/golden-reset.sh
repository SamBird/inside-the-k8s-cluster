#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CLUSTER_NAME="${CLUSTER_NAME:-inside-k8s}"
KUBE_CONTEXT="${KUBE_CONTEXT:-kind-${CLUSTER_NAME}}"
NAMESPACE="${NAMESPACE:-inside-k8s-demo}"
VERSION="${VERSION:-v1}"

step() {
  printf '\n==> %s\n' "$1"
}

ok() {
  printf '[ok] %s\n' "$1"
}

info() {
  printf '[info] %s\n' "$1"
}

step "Ensuring cluster baseline is available"
make cluster-up

step "Preparing demo image baseline (demo-app:${VERSION})"
make demo-image VERSION="$VERSION"
make demo-load VERSION="$VERSION"

step "Applying base manifests"
kubectl --context "$KUBE_CONTEXT" apply -k k8s/demo-app >/dev/null

step "Forcing golden configuration (v1, replicas=1, readiness healthy)"
kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" patch configmap demo-app-config --type merge \
  -p '{"data":{"APP_VERSION":"'"$VERSION"'","INITIAL_READINESS":"true"}}' >/dev/null
kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" set image deployment/demo-app demo-app="demo-app:${VERSION}" >/dev/null
kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" scale deployment/demo-app --replicas=1 >/dev/null
kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" rollout restart deployment/demo-app >/dev/null

step "Waiting for rollout"
kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" rollout status deployment/demo-app --timeout=240s >/dev/null

step "Golden reset summary"
kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" get deploy,pods,svc,cm
ok "Golden reset complete."
info "Baseline: deployment=demo-app, version=${VERSION}, replicas=1, INITIAL_READINESS=true"
