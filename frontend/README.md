# Frontend Dashboard

Projector-friendly Next.js + TypeScript dashboard for the Kubernetes live demo.

## Features

- control-plane overview (kube-apiserver, etcd, kube-scheduler, kube-controller-manager)
- explained control-plane flow panel for core demo actions
- worker-node topology view (node readiness and pod placement)
- workload resources panel (Deployment, ReplicaSet, Pods, Service)
- desired vs actual state panel
- SSE-driven live event timeline
- traffic response panel showing pod/node/version/readiness
- action controls for core demo operations

## Run

```bash
cd frontend
npm install
npm run dev
```

Set optional environment variables in `frontend/.env.local`:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_DEMO_APP_BASE_URL=http://localhost:8080
```

## Notes

- `NEXT_PUBLIC_BACKEND_URL` points to FastAPI backend.
- `NEXT_PUBLIC_DEMO_APP_BASE_URL` should point to demo-app HTTP endpoint.
- control-plane cards are explanatory teaching content, not per-component telemetry.
- explained flow steps are inferred teaching sequences, combined with separate live state signals.
  For local cluster usage, port-forward service first:

```bash
kubectl --context kind-inside-k8s -n inside-k8s-demo port-forward svc/demo-app 8080:80
```
