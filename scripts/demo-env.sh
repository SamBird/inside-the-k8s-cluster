#!/usr/bin/env bash
# Source this file to set up shell aliases and variables for the live demo.
#
# Usage:
#   source scripts/demo-env.sh
#
# After sourcing, you can use:
#   k get pods              instead of  kubectl --context kind-inside-k8s get pods
#   k -n $NS get pods       instead of  kubectl --context kind-inside-k8s -n inside-k8s-demo get pods
#   etcdctl get /registry/...  to query etcd directly inside the control-plane node

export KCTX="${KCTX:-kind-inside-k8s}"
export NS="${NS:-inside-k8s-demo}"

alias k="kubectl --context $KCTX"

# Resolve the etcd pod and set up the etcdctl alias
ETCD_POD=$(kubectl --context "$KCTX" -n kube-system get pods -l component=etcd -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -n "$ETCD_POD" ]; then
  export ETCD_POD
  alias etcdctl="kubectl --context $KCTX -n kube-system exec $ETCD_POD -- etcdctl \
    --cacert=/etc/kubernetes/pki/etcd/ca.crt \
    --cert=/etc/kubernetes/pki/etcd/server.crt \
    --key=/etc/kubernetes/pki/etcd/server.key \
    --endpoints=https://127.0.0.1:2379"
  echo "demo-env: ready  (KCTX=$KCTX  NS=$NS  ETCD_POD=$ETCD_POD)"
else
  echo "demo-env: ready  (KCTX=$KCTX  NS=$NS)  [etcd pod not found — etcdctl alias not set]"
fi
