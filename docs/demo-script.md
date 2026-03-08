# Demo Script

This runbook is optimized for a 2-3 minute teaching segment on Kubernetes control-plane behavior, plus action demos.

Set a context shortcut once:

```bash
export KCTX=kind-inside-k8s
```

## Pre-Flight (Before Audience)

Preferred one-command setup:

```bash
make demo-all VERSION=v1
```

If you run components manually:

```bash
make cluster-up
make demo-up VERSION=v1
make backend-install && make backend-run
make frontend-install && make frontend-run
```

Optional direct manual service check:

```bash
kubectl --context "$KCTX" -n inside-k8s-demo port-forward svc/demo-app 8080:80
```

## Revised Talk Flow

1. **Cluster overview**
- Show live discovered cluster context in the control-plane panel (namespace, node counts, deployment/service/pod context).
- Call out control-plane node detection if visible.

2. **Control-plane overview**
- Use conceptual cards for:
  - `kube-apiserver`
  - `etcd`
  - `kube-scheduler`
  - `kube-controller-manager`
- Emphasize these are teaching models, not process telemetry.

3. **Apply YAML journey**
- Click `Apply YAML journey` in explained-flow panel.
- Optionally click `Deploy app` if you want to tie the flow to an immediate action.
- Walk through: request -> desired state stored -> controllers -> ReplicaSet/Pods -> scheduler -> kubelet -> readiness -> Service traffic.

4. **Controller reconciliation**
- Click `Controller reconciliation`.
- Click `Delete pod`.
- Show desired replicas unchanged while actual running/ready temporarily diverge and then converge.

5. **Readiness vs Running**
- Click `Break readiness`, then `Restore readiness`.
- Explain that Running is process state; Ready is traffic eligibility.

6. **Scaling behavior**
- Click `Scale to 3`, then `Scale to 1`.
- Highlight desired vs actual convergence and node placement changes.

7. **Rollout behavior**
- Build/load `v2` first:

```bash
make demo-image VERSION=v2
make demo-load VERSION=v2
```

- In UI, enter `v2` and click `Rollout new version`.
- Explain controlled replacement with readiness-gated traffic continuity.

8. **Optional traffic panel**
- Click `Generate traffic` to show request distribution and response metadata (`podName`, `nodeName`, `imageVersion`, `readiness`).
- Traffic generation now uses backend service proxy by default; port-forward is optional for direct manual checks.

9. **Reset**
- Click `Reset demo` to restore known baseline.

## Terminal Backup Commands (If UI Fails)

```bash
curl -X POST http://localhost:8000/api/actions/deploy
curl -X POST http://localhost:8000/api/actions/delete-pod -H 'Content-Type: application/json' -d '{}'
curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":true}'
curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":false}'
curl -X POST http://localhost:8000/api/actions/scale -H 'Content-Type: application/json' -d '{"replicas":3}'
curl -X POST http://localhost:8000/api/actions/rollout -H 'Content-Type: application/json' -d '{"version":"v2"}'
curl -X POST http://localhost:8000/api/actions/reset
```

## Post-Talk Shutdown

```bash
make demo-all-down
```

Optional:

```bash
STOP_COLIMA=1 make demo-all-down
```
