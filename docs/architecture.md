# Architecture

## Goals

- Make Kubernetes internals visible during a live demo.
- Keep setup local, repeatable, and low-risk.
- Prioritize reliability and explainability over feature depth.

## High-Level Design

The system has four layers:

1. Cluster layer (`kind`):
- 1 control-plane node and 2 worker nodes
- metrics-server installed for resource visibility

2. Workload layer (`demo-app`):
- simple HTTP service with pod metadata and readiness state endpoints
- readiness can be intentionally broken/restored for teaching

3. Control API layer (`backend`):
- FastAPI service
- Kubernetes Python client integration
- action endpoints for deploy, scale, pod delete, rollout/restart, readiness toggle, reset
- SSE endpoint to push state updates to frontend

4. Presentation layer (`frontend`):
- Next.js dashboard
- topology, state drift, timeline, traffic response views
- operator action buttons for demo flow

## Data Flow

1. Frontend requests `GET /api/state` for initial snapshot.
2. Frontend subscribes to `GET /api/events` SSE.
3. Backend watches demo pods and emits updated state snapshots.
4. Frontend updates topology and timeline from each new snapshot.
5. User actions call backend action routes, backend patches Kubernetes resources, and updated state is reflected in UI.

## Kubernetes Resources

Namespace: `inside-k8s-demo`

Resources:

- `Deployment/demo-app`
- `Service/demo-app`
- `ConfigMap/demo-app-config`

Readiness behavior is controlled by `INITIAL_READINESS` in ConfigMap and demonstrated through rollout transitions.

## Safety and Predictability Choices

- Namespace-scoped actions only.
- Scale input validation in backend.
- Pod deletion constrained to current demo-app pods.
- Rollout action validates version tag format.
- Reset action returns app to known baseline (`v1`, replicas `1`, readiness healthy).

## Local-First Assumptions

- Docker daemon is local.
- images are loaded into kind locally (`kind load docker-image`).
- no cloud dependencies, ingress controllers, or external managed services are required.
