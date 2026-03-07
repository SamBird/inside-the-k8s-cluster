# Frontend Dashboard

Projector-friendly Next.js + TypeScript dashboard for the Kubernetes live demo.

## Features

- topology view (cluster, service, nodes, pods)
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
  For local cluster usage, port-forward service first:

```bash
kubectl --context kind-inside-k8s -n inside-k8s-demo port-forward svc/demo-app 8080:80
```
