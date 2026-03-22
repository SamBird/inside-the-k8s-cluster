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

## 3) Control-plane node context is missing in UI

Symptoms:
- control-plane overview shows warning about no discovered control-plane node
- live context looks incomplete

Cause:
- local distro may not expose standard role labels
- kube context may point to a different cluster than expected

Fix:

```bash
kubectl --context "$KCTX" get nodes --show-labels | grep "node-role.kubernetes.io"
kubectl config current-context
curl -s http://localhost:8000/api/state | jq '.nodes'
```

If role labels are absent, the conceptual control-plane section still teaches behavior; this is expected.

## 4) Demo app image pull errors during rollout

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

## 5) Frontend cannot reach backend

Symptoms:
- dashboard shows degraded connection
- action calls fail immediately

Fix:

- confirm backend is running on `:8000`
- confirm the state endpoint works, not just `/healthz`:

```bash
curl -s http://localhost:8000/healthz
curl -s http://localhost:8000/api/state | jq '.deployment'
```

- if `/healthz` works but `/api/state` fails after recreating kind, restart the demo-managed services:

```bash
make demo-stop
make demo-all
```

- set `NEXT_PUBLIC_BACKEND_URL` in `frontend/.env.local`
- restart frontend after env changes

Cause:
- older backend processes may keep talking to a stale kind API endpoint after the cluster is recreated
- newer `demo-all` runs now verify `/api/state` and restart stale demo backend processes automatically

## 6) Traffic panel shows request failures

Symptoms:
- errors in traffic table

Fix:

- ensure backend is reachable (`curl -s http://localhost:8000/healthz`)
- verify service + endpoints exist:

```bash
kubectl --context "$KCTX" -n inside-k8s-demo get svc demo-app
kubectl --context "$KCTX" -n inside-k8s-demo get endpoints demo-app
```

- if no ready endpoints yet, wait for readiness/rollout:

```bash
kubectl --context "$KCTX" -n inside-k8s-demo rollout status deployment/demo-app
```

Optional manual direct check via port-forward:

```bash
kubectl --context "$KCTX" -n inside-k8s-demo port-forward svc/demo-app 8080:80
curl -s http://localhost:8080/info
```

## 7) Controller reconciliation scenario does not recover

Symptoms:
- after `Delete pod`, counts do not return to desired quickly

Fix:

```bash
kubectl --context "$KCTX" -n inside-k8s-demo get deploy,pods
kubectl --context "$KCTX" -n inside-k8s-demo rollout status deployment/demo-app
curl -X POST http://localhost:8000/api/actions/delete-pod -H 'Content-Type: application/json' -d '{}'
```

If no pods exist, deploy first:

```bash
curl -X POST http://localhost:8000/api/actions/deploy
```

## 8) Readiness stays false after restore

Symptoms:
- pods remain Not Ready

Fix:

```bash
curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":false}'
kubectl --context "$KCTX" -n inside-k8s-demo get pods
kubectl --context "$KCTX" -n inside-k8s-demo get endpoints demo-app
```

## 9) Need a hard reset before next run

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
- SSE stream is state-oriented and does not persist historical event logs.
- Control-plane component cards and explained flow are educational models, not low-level process telemetry.
- Control-plane node discovery depends on labels visible in the current cluster and context.
- Rollout to a new version expects the image tag to exist locally and be loadable into kind.
- Traffic panel depends on backend `GET /api/traffic/info`; it returns a clear warning until demo-app has ready endpoints.
- Local clusters do not expose rich per-component control-plane telemetry; control-plane internals are taught conceptually and paired with discovered cluster metadata.

## Future Enhancements

- Add rollback button with explicit previous-version selection.
- Add richer pod lifecycle event decoding (Scheduled, Pulled, Started, etc.).
- Add saved demo "scenes" for one-click transitions between teaching moments.
- Add exportable timeline snapshots for post-talk review.
