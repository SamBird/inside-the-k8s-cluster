# Local Setup Guide

## 1. Install dependencies

Install dependencies listed in `docs/prerequisites.md`.

## 2. Run preflight checks

```bash
make preflight
```

One-command alternative for the full presenter flow:

```bash
make demo-all VERSION=v1
```

By default this also preloads `demo-app:v2` for rollout demos. Override with:

```bash
make demo-all VERSION=v1 PRELOAD_ROLLOUT_VERSIONS=v2,v3
make demo-all VERSION=v1 PRELOAD_ROLLOUT_VERSIONS=
```

If Docker is installed but not running, `demo-all` will attempt to start Colima automatically.
To disable auto-start:

```bash
AUTO_START_COLIMA=0 make demo-all VERSION=v1
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

Equivalent shortcut that also forces a clean baseline if a previous rollout was left mid-flight:

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

Optional terminal (for direct manual demo-app checks):

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

## 7. Rehearsal readiness

Return to known-good baseline:

```bash
make golden-reset
```

Run automated rehearsal checks:

```bash
make rehearsal-check
```

Run end-to-end API smoke test:

```bash
make smoke-test
```

If backend/frontend are not already running, start full stack first:

```bash
make demo-all VERSION=v1
```

## 8. Tear down

Choose the teardown level that fits your situation:

| Command | Backend/Frontend | Kind Cluster | When to use |
|---------|-----------------|--------------|-------------|
| `make demo-stop` | Stops | Keeps running | Pause between rehearsals |
| `make demo-all-down` | Stops | Deletes | Done for the day |
| `make cluster-reset` | No change | Recreates | Cluster is broken |

```bash
make demo-all-down
```

If you only want to stop local backend/frontend processes but keep cluster resources:

```bash
make demo-stop
```

If you want to stop Colima as well:

```bash
STOP_COLIMA=1 make demo-all-down
```

## Environment Variables

All variables have sensible defaults. Override them when needed:

| Variable | Default | Used by | Description |
|----------|---------|---------|-------------|
| `CLUSTER_NAME` | `inside-k8s` | Most targets | Kind cluster name |
| `KUBE_CONTEXT` | `kind-inside-k8s` | Most targets | kubectl context for the cluster |
| `NAMESPACE` | `inside-k8s-demo` | Deploy/status targets | Kubernetes namespace for demo workloads |
| `VERSION` | `v1` | `demo-image`, `demo-load`, `demo-all` | Demo app image tag to build and deploy |
| `NEW_VERSION` | `v2` | `demo-rollout` | Target version for rollout |
| `PRELOAD_ROLLOUT_VERSIONS` | `v2` | `demo-all` | Comma-separated image tags to pre-build and load for rollout demos |
| `BACKEND_URL` | `http://127.0.0.1:8000` | `demo-all`, `smoke-test` | Backend API base URL |
| `FRONTEND_URL` | `http://127.0.0.1:3000` | `demo-all` | Frontend dev server URL |
| `DEMO_HEALTH_PORT` | `18080` | `demo-all` | Port for in-cluster health checks during orchestration |
| `AUTO_START_COLIMA` | `1` | `demo-all` | Set to `0` to disable automatic Colima startup |
| `STOP_COLIMA` | _(unset)_ | `demo-all-down` | Set to `1` to stop Colima during teardown |
| `COLIMA_PROFILE` | _(default)_ | `demo-all-down` | Colima profile name if using non-default |
| `KIND_CONFIG` | `k8s/kind-config.yaml` | `cluster-up` | Path to kind cluster config |
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:8000` | Frontend | Backend URL used by Next.js (set in `frontend/.env.local`) |
