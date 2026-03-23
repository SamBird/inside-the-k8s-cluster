# Rehearsal Checklist

Run this before each rehearsal and before live presentation.

## Quick Commands

```bash
make demo-all VERSION=v1
make golden-reset
make rehearsal-check
```

## Manual Confirmation Checklist

- [ ] Cluster is healthy:
  - `kubectl --context kind-inside-k8s get nodes`
  - all nodes `Ready`
- [ ] Backend is healthy:
  - `curl -s http://localhost:8000/healthz`
  - `{"ok":true}` returned
- [ ] Frontend is healthy:
  - open `http://localhost:3000`
  - dashboard loads without degraded banner
- [ ] Traffic endpoint works:
  - `curl -s http://localhost:8000/api/traffic/info`
  - returns pod/node/version/readiness payload or clear readiness warning
- [ ] Rollout image (v2) is pre-loaded in cluster:
  - `docker exec inside-k8s-control-plane crictl images | grep demo-app`
  - both `v1` and `v2` tags should be listed
- [ ] Control-plane overview renders:
  - conceptual cards visible
  - discovered cluster context visible (or explicit discovery warning)
- [ ] Key scenario order is ready:
  1. Cluster overview
  2. Control-plane overview
  3. Apply YAML journey
  4. Controller reconciliation
  5. Readiness, traffic & service routing (requires 3 replicas)
  6. Scaling
  7. Rollout behavior

## If Something Fails

- Reset to baseline:

```bash
make golden-reset
```

- Start full stack if backend/frontend checks fail:

```bash
make demo-all VERSION=v1
```

- Full environment restart:

```bash
make demo-all-down
make demo-all VERSION=v1
```
