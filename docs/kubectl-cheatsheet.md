# kubectl Cheatsheet

Terminal commands for exploring Kubernetes internals during the live demo. Organised to follow the talk sequence — use these alongside or instead of the web UI.

## Setup

Source the demo environment script once per terminal session:

```bash
source scripts/demo-env.sh
```

This sets `KCTX`, `NS`, a `k` alias for kubectl, `ETCD_POD`, and an `etcdctl` alias. All commands below assume these are set.

---

## 1. Cluster Overview

```bash
# Nodes and their roles
k get nodes -o wide

# Resource usage per node (requires metrics-server)
k top nodes

# Cluster info summary
k cluster-info --context $KCTX

# Control-plane component health
k get componentstatuses

# All workload objects in the demo namespace
k -n $NS get deploy,rs,pods,svc,cm,endpoints
```

---

## 2. Control Plane Internals — etcd

Peek inside etcd to see how Kubernetes stores objects. These commands use the `etcdctl` alias set up in the Setup section above.

### List all keys for a resource type

```bash
# All pod keys in the demo namespace
etcdctl get /registry/pods/$NS --prefix --keys-only

# All deployment keys
etcdctl get /registry/deployments/$NS --prefix --keys-only

# All service keys
etcdctl get /registry/services/specs/$NS --prefix --keys-only

# All endpoints keys
etcdctl get /registry/services/endpoints/$NS --prefix --keys-only

# All configmap keys
etcdctl get /registry/configmaps/$NS --prefix --keys-only

# All ReplicaSet keys
etcdctl get /registry/replicasets/$NS --prefix --keys-only
```

### Read a specific key (raw protobuf — shows that data exists)

```bash
# Read the demo-app deployment object from etcd
etcdctl get /registry/deployments/$NS/demo-app

# Read the demo-app service
etcdctl get /registry/services/specs/$NS/demo-app

# Read the demo-app configmap
etcdctl get /registry/configmaps/$NS/demo-app-config
```

### etcd cluster health

```bash
etcdctl endpoint health
etcdctl endpoint status --write-out=table
```

---

## 3. Apply YAML Journey

Watch the full lifecycle of pod creation in real time.

```bash
# Terminal 1: watch pods appear (leave running)
k -n $NS get pods -w

# Terminal 2: watch events as they happen
k -n $NS get events --watch --sort-by=.lastTimestamp

# After deploy, inspect the deployment
k -n $NS describe deployment demo-app

# See the YAML Kubernetes actually stored (with defaults filled in)
k -n $NS get deployment demo-app -o yaml

# Check the ConfigMap driving the app
k -n $NS get configmap demo-app-config -o yaml
```

---

## 4. Controller Reconciliation

Delete a pod and watch the ReplicaSet controller recreate it.

```bash
# Terminal 1: watch pods (leave running)
k -n $NS get pods -w

# Delete a pod (picks the first one)
POD=$(k -n $NS get pods -l app.kubernetes.io/name=demo-app -o jsonpath='{.items[0].metadata.name}')
k -n $NS delete pod $POD

# Watch the ReplicaSet respond
k -n $NS get rs -w

# See events showing controller decisions
k -n $NS get events --sort-by=.lastTimestamp | tail -20

# Describe the ReplicaSet to see its status
k -n $NS describe rs -l app.kubernetes.io/name=demo-app
```

---

## 5. Readiness vs Running

Show that Running and Ready are different signals.

```bash
# Check pod conditions (look for Ready vs ContainersReady)
k -n $NS get pods -o wide
k -n $NS get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.phase}{"\t"}{range .status.conditions[*]}{.type}={.status} {end}{"\n"}{end}'

# Detailed probe status
POD=$(k -n $NS get pods -l app.kubernetes.io/name=demo-app -o jsonpath='{.items[0].metadata.name}')
k -n $NS describe pod $POD | grep -A 5 "Conditions\|Readiness\|Liveness"

# View endpoints — shows which pod IPs receive traffic
k -n $NS get endpoints demo-app

# Detailed endpoint view (shows ready vs not-ready addresses)
k -n $NS get endpoints demo-app -o yaml

# Break readiness via the backend API, then re-check
curl -X POST http://localhost:8000/api/actions/toggle-readiness \
  -H 'Content-Type: application/json' -d '{"fail":true}'

# Now compare: pod is Running but endpoints exclude it
k -n $NS get pods -o wide
k -n $NS get endpoints demo-app

# Restore readiness
curl -X POST http://localhost:8000/api/actions/toggle-readiness \
  -H 'Content-Type: application/json' -d '{"fail":false}'
```

---

## 6. Scaling

```bash
# Terminal 1: watch pods
k -n $NS get pods -w

# Scale up
k -n $NS scale deployment demo-app --replicas=3

# Watch pods spread across nodes
k -n $NS get pods -o wide

# Check the deployment converge
k -n $NS rollout status deployment/demo-app

# See which nodes got pods
k -n $NS get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.nodeName}{"\n"}{end}'

# Scale back down
k -n $NS scale deployment demo-app --replicas=1
```

---

## 7. Rollout

```bash
# Terminal 1: watch pods (shows old terminating, new creating)
k -n $NS get pods -w

# Terminal 2: watch ReplicaSets (old scales down, new scales up)
k -n $NS get rs -w

# Trigger rollout to v2
k -n $NS set image deployment/demo-app demo-app=demo-app:v2

# Track rollout progress
k -n $NS rollout status deployment/demo-app

# See both ReplicaSets (old and new)
k -n $NS get rs -o wide

# Rollout history
k -n $NS rollout history deployment/demo-app

# Check which version is running
k -n $NS get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'
```

---

## 8. Traffic and Service Routing

```bash
# View the service
k -n $NS get svc demo-app -o wide

# Which pods are behind the service right now
k -n $NS get endpoints demo-app

# Port-forward to hit the service directly
k -n $NS port-forward svc/demo-app 8080:80 &

# Hit the app — shows pod name, node, version per request
curl -s http://localhost:8080/info | jq .

# Multiple requests show load distribution across pods
for i in $(seq 1 10); do
  curl -s http://localhost:8080/info | jq -r '"pod=\(.podName) node=\(.nodeName) version=\(.imageVersion)"'
done

# Clean up port-forward
kill %1
```

---

## 9. Reset

```bash
# Via the backend API
curl -X POST http://localhost:8000/api/actions/reset

# Or via make
make golden-reset

# Verify baseline
k -n $NS get deploy,pods,svc,cm
k -n $NS get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'
```

---

## Bonus: Debug and Inspect

```bash
# Pod logs (follow mode)
POD=$(k -n $NS get pods -l app.kubernetes.io/name=demo-app -o jsonpath='{.items[0].metadata.name}')
k -n $NS logs $POD -f

# Exec into a running pod
k -n $NS exec -it $POD -- sh

# From inside the pod, check readiness endpoint
wget -qO- http://localhost:8080/healthz/ready
wget -qO- http://localhost:8080/healthz/live

# All events in the namespace (recent first)
k -n $NS get events --sort-by=.metadata.creationTimestamp

# Watch all events across the cluster in real time
k get events -A --watch

# JSONPath: extract specific fields
k -n $NS get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.podIP}{"\t"}{.status.phase}{"\n"}{end}'

# Node labels (shows topology zones set by kind config)
k get nodes --show-labels

# What's running in kube-system (control-plane components)
k -n kube-system get pods -o wide
```
