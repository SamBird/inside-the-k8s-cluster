# Demo Script

This script is designed for a live talk with the dashboard on screen and terminal available for backup verification.

Set a context shortcut once:

```bash
export KCTX=kind-inside-k8s
```

## Pre-Flight (Before Audience)

1. Start cluster:

```bash
make preflight
make cluster-up
```

2. Build/load/deploy demo app v1:

```bash
make demo-image VERSION=v1
make demo-load VERSION=v1
make demo-deploy
```

Equivalent shortcut:

```bash
make demo-up VERSION=v1
```

3. Start backend and frontend:

```bash
make backend-install
make backend-run
```

In another terminal:

```bash
make frontend-install
make frontend-run
```

4. Port-forward demo service for browser traffic panel:

```bash
kubectl --context "$KCTX" -n inside-k8s-demo port-forward svc/demo-app 8080:80
```

## Live Demo Walkthrough

1. **Establish baseline**
- Show topology panel and desired-vs-actual panel.
- Confirm deployment is visible and replicas at 1.

2. **Deploy app (if starting empty)**
- Click `Deploy app`.
- Optional backup:

```bash
curl -X POST http://localhost:8000/api/actions/deploy
```

3. **Scale 1 -> 3**
- Click `Scale to 3`.
- Watch new pods appear across workers.

4. **Generate traffic**
- Click `Generate traffic`.
- In traffic table, show changing `podName` / `nodeName` values.

5. **Delete pod**
- Click `Delete pod`.
- Watch one pod disappear and replacement pod appear.

6. **Break readiness**
- Click `Break readiness`.
- Show pods can be running but not ready.
- Point to service endpoint count drop.

7. **Restore readiness**
- Click `Restore readiness`.
- Show readiness recovers and service endpoints return.

8. **Roll out new version**
- Build and load v2 before action:

```bash
make demo-image VERSION=v2
make demo-load VERSION=v2
```

- In UI rollout input use `v2`, click `Rollout new version`.
- Show mixed old/new pods during rollout and final steady state.

9. **Reset demo**
- Click `Reset demo`.
- Confirm return to replicas=1, version=v1, readiness healthy.

## Terminal Backup Commands (If UI Fails)

```bash
curl -X POST http://localhost:8000/api/actions/scale -H 'Content-Type: application/json' -d '{"replicas":3}'
curl -X POST http://localhost:8000/api/actions/delete-pod -H 'Content-Type: application/json' -d '{}'
curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":true}'
curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":false}'
curl -X POST http://localhost:8000/api/actions/rollout -H 'Content-Type: application/json' -d '{"version":"v2"}'
curl -X POST http://localhost:8000/api/actions/reset
```
