# Troubleshooting

## Quick Health Checks

Set context shortcut:

```bash
export KCTX=kind-inside-k8s
```

```bash
kubectl --context "$KCTX" get nodes
kubectl --context "$KCTX" -n inside-k8s-demo get pods,svc,deploy,cm
curl -s http://localhost:8000/healthz
curl -s http://localhost:8000/api/state
```

## Common Issues

## 1) `kind` cluster not found

Symptoms:
- backend actions fail
- `kubectl` cannot find context/resources

Fix:

```bash
make cluster-up
kubectl --context "$KCTX" cluster-info
```

## 2) `kubectl top nodes` fails

Symptoms:
- metrics unavailable

Fix:

```bash
make metrics-server
kubectl --context "$KCTX" -n kube-system get pods | grep metrics-server
```

Wait until metrics-server is Ready.

## 3) Demo app image pull errors during rollout

Symptoms:
- pods in `ImagePullBackOff`
- rollout stuck

Cause:
- image tag (e.g., `demo-app:v2`) was not built/loaded into kind

Fix:

```bash
make demo-image VERSION=v2
make demo-load VERSION=v2
curl -X POST http://localhost:8000/api/actions/rollout -H 'Content-Type: application/json' -d '{"version":"v2"}'
```

## 4) Frontend cannot reach backend

Symptoms:
- dashboard shows degraded connection
- action calls fail immediately

Fix:

- confirm backend is running on `:8000`
- set `NEXT_PUBLIC_BACKEND_URL` in `frontend/.env.local`
- restart frontend after env changes

## 5) Traffic panel shows request failures

Symptoms:
- errors in traffic table

Fix:

```bash
kubectl --context "$KCTX" -n inside-k8s-demo port-forward svc/demo-app 8080:80
```

Ensure `NEXT_PUBLIC_DEMO_APP_BASE_URL=http://localhost:8080`.

## 6) Readiness stays false after restore

Symptoms:
- pods remain Not Ready

Fix:

```bash
curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":false}'
kubectl --context "$KCTX" -n inside-k8s-demo rollout status deployment/demo-app
kubectl --context "$KCTX" -n inside-k8s-demo get pods
```

## 7) Need a hard reset before next run

Fix:

```bash
make cluster-reset
make demo-image VERSION=v1
make demo-load VERSION=v1
make demo-deploy
```

## Known Limitations

- Designed for local single-user demo, not multi-tenant production.
- No authentication or authorization model in frontend/backend.
- Uses service port-forward for browser traffic tests (not ingress).
- SSE stream is state-oriented and does not persist historical event logs.

## Future Enhancements

- Add one-command preflight script for all prerequisites and checks.
- Add automated smoke tests for the full demo sequence.
- Add rollback button with explicit previous-version selection.
- Add richer pod lifecycle event decoding (Scheduled, Pulled, Started, etc.).
