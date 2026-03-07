# Local Setup Guide

## 1. Install dependencies

Install dependencies listed in `docs/prerequisites.md`.

## 2. Run preflight checks

```bash
make preflight
```

## 3. Create cluster

```bash
make cluster-up
```

If you want a custom cluster name/context:

```bash
make CLUSTER_NAME=my-demo KUBE_CONTEXT=kind-my-demo cluster-up
```

## 4. Build and deploy demo app

```bash
make demo-image VERSION=v1
make demo-load VERSION=v1
make demo-deploy
make demo-status
```

Equivalent shortcut:

```bash
make demo-up VERSION=v1
```

## 5. Run backend and frontend

Terminal 1:

```bash
make backend-install
make backend-run
```

Terminal 2:

```bash
make frontend-install
make frontend-run
```

Terminal 3 (for traffic panel):

```bash
kubectl -n inside-k8s-demo port-forward svc/demo-app 8080:80
```

## 6. Validate cluster health

```bash
kubectl --context kind-inside-k8s get nodes
kubectl --context kind-inside-k8s -n inside-k8s-demo get pods,svc,deploy,cm
kubectl --context kind-inside-k8s top nodes
```

If `kubectl top nodes` fails initially, wait briefly and retry while metrics-server finishes startup.

## 7. Tear down

```bash
make cluster-down
```
