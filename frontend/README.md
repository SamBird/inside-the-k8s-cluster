# Frontend Dashboard

Projector-friendly Next.js + TypeScript dashboard for the Kubernetes live demo.

## Features

- split views to reduce presenter scrolling:
  - `/`: live demo control room (actions + live state panels)
  - `/teaching`: conceptual teaching panels (control-plane overview + explained flow)
  - `/graph`: graph-based relationship view for control plane, resources, nodes, pods, and traffic/readiness paths
- control-plane overview (kube-apiserver, etcd, kube-scheduler, kube-controller-manager)
- explained control-plane flow panel for core demo actions, including `Apply YAML journey` and `Controller reconciliation`
- Cytoscape based graph visualization (`cytoscape`) for projector-friendly cluster relationship mapping
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
```

## Notes

- `NEXT_PUBLIC_BACKEND_URL` points to FastAPI backend.
- top navigation switches between `Live Demo` (`/`), `Teaching View` (`/teaching`), and `Graph View` (`/graph`).
- control-plane cards are explanatory teaching content, not per-component telemetry.
- control-plane panel includes discovered live node context (control-plane node name, roles, selected labels) from Kubernetes API.
- explained flow steps are inferred teaching sequences, combined with separate live state signals.
- graph view labels conceptual control edges separately from live discovered workload/resource edges.
- graph view includes presenter focus modes:
  - `Overview`
  - `Control Loop`
  - `Traffic + Readiness`
- graph view intentionally caps rendered pod nodes for readability; full pod list remains in live workload panels.
- `Apply YAML journey` is a dedicated 2-3 minute teaching walkthrough of Deployment submission and reconciliation.
- `Controller reconciliation` is tied to the delete-pod action to demonstrate self-healing and return to desired replicas.
- Assumption: there is at least one demo pod to delete; if not, deploy/scale first.
- Traffic generation uses backend service proxy by default; manual port-forward is optional for direct ad-hoc testing:

```bash
kubectl --context kind-inside-k8s -n inside-k8s-demo port-forward svc/demo-app 8080:80
```
