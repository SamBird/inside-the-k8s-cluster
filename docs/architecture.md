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
- node discovery metadata for talk context (control-plane detection from node role labels + selected node labels)

4. Presentation layer (`frontend`):
- Next.js split-view dashboard:
  - `/` live demo controls + live state (desired/actual, topology, resources, traffic, timeline)
  - `/teaching` conceptual control-plane overview + explained-flow teaching panel
- `/graph` Cytoscape visualization of control-plane concepts plus live discovered resources/nodes/pods/traffic readiness links
- explained-flow sequence panel for `Apply YAML journey`, `Controller reconciliation`, deploy/scale/readiness/rollout actions
- operator action buttons for demo flow (live demo view)

## Data Flow

1. Frontend requests `GET /api/state` for initial snapshot.
2. Frontend subscribes to `GET /api/events` SSE.
3. Backend watches demo pods and emits updated state snapshots.
4. Frontend updates topology and timeline from each new snapshot.
5. User actions call backend action routes, backend patches Kubernetes resources, and updated state is reflected in UI.

## Control Plane Teaching Model

The demo intentionally uses two layers:

1. Conceptual teaching layer:
- `kube-apiserver`
- `etcd`
- `kube-scheduler`
- `kube-controller-manager`

2. Discovered live layer:
- control-plane node detection from node role labels
- node role/label metadata from Kubernetes API
- live deployment/pod/service context relevant to reconciliation

Control-plane component cards and explained-flow sequences are educational/inferred models.  
Live node/resource context is discovered from Kubernetes API snapshots and is labeled separately.  
This avoids implying process-level telemetry for control-plane binaries.

The graph view follows the same boundary:
- conceptual control-plane edges are clearly marked as teaching relationships
- resource/node/pod/traffic edges are derived from live backend state snapshots

## Revised Talk Sequence

1. Cluster overview (live discovered context)
2. Control-plane overview (conceptual roles)
3. `Apply YAML journey`
4. `Controller reconciliation`
5. Readiness vs Running
6. Scaling behavior
7. Rollout behavior

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
