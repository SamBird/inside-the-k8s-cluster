#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-inside-k8s}"
KUBE_CONTEXT="${KUBE_CONTEXT:-kind-${CLUSTER_NAME}}"
METRICS_SERVER_VERSION="${METRICS_SERVER_VERSION:-v0.7.2}"
MANIFEST_URL="https://github.com/kubernetes-sigs/metrics-server/releases/download/${METRICS_SERVER_VERSION}/components.yaml"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $1" >&2
    exit 1
  }
}

usage() {
  cat <<USAGE
Usage: CLUSTER_NAME=<name> KUBE_CONTEXT=<ctx> METRICS_SERVER_VERSION=<tag> ./scripts/install-metrics-server.sh

Installs metrics-server into kube-system and waits for rollout.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd kubectl

if ! kubectl config get-contexts -o name | grep -Fxq "$KUBE_CONTEXT"; then
  echo "ERROR: kube context '$KUBE_CONTEXT' not found." >&2
  exit 1
fi

echo "Applying metrics-server manifest (${METRICS_SERVER_VERSION})"
kubectl --context "$KUBE_CONTEXT" apply -f "$MANIFEST_URL"

# kind often requires insecure kubelet TLS for metrics collection.
echo "Ensuring kind-compatible metrics-server args are set"
current_args="$(kubectl --context "$KUBE_CONTEXT" -n kube-system get deployment metrics-server -o jsonpath='{.spec.template.spec.containers[0].args[*]}')"

if ! grep -q -- "--kubelet-insecure-tls" <<<"$current_args"; then
  kubectl --context "$KUBE_CONTEXT" -n kube-system patch deployment metrics-server --type=json \
    -p='[
      {"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}
    ]' >/dev/null
fi

if ! grep -q -- "--kubelet-preferred-address-types=InternalIP,Hostname,ExternalIP" <<<"$current_args"; then
  kubectl --context "$KUBE_CONTEXT" -n kube-system patch deployment metrics-server --type=json \
    -p='[
      {"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-preferred-address-types=InternalIP,Hostname,ExternalIP"}
    ]' >/dev/null
fi

kubectl --context "$KUBE_CONTEXT" -n kube-system rollout status deployment/metrics-server --timeout=180s
echo "metrics-server is ready."
