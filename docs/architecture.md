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
  - `/` live demo controls + live state (desired/actual, topology, lineage/endpoints, traffic, timeline)
  - `/teaching` conceptual control-plane overview + explained-flow teaching panel
- explained-flow sequence panel for `Apply YAML journey`, `Controller reconciliation`, deploy/scale/readiness/rollout actions
- operator action buttons for demo flow (live demo view)

## Data Flow

1. Frontend requests `GET /api/state` for initial snapshot.
2. Frontend subscribes to `GET /api/events` SSE.
3. Backend watches demo pods and emits updated state snapshots.
4. Frontend updates topology, workload lineage, service endpoints, and timeline from each new snapshot.
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
- `ReplicaSet` objects owned by `Deployment/demo-app`
- `Service/demo-app`
- `Endpoints/demo-app`
- `ConfigMap/demo-app-config`

Readiness behavior for the live demo is changed through direct admin calls on currently running pods, so one pod can become `NotReady` without creating a new ReplicaSet or changing future pod startup policy.

## Safety and Predictability Choices

- Namespace-scoped actions only.
- Scale input validation in backend.
- Pod deletion constrained to current demo-app pods.
- Rollout action validates version tag format.
- Reset action returns app to known baseline (`v1`, replicas `1`, readiness healthy).

## Orchestration

`make demo-all` is the one-command entry point for the full demo stack. It delegates to `scripts/demo-all.sh`, which:

1. Ensures a container runtime is available (auto-starts Colima if needed)
2. Creates or verifies the kind cluster (`scripts/create-cluster.sh`)
3. Builds and loads the demo-app image
4. Applies Kubernetes manifests
5. Starts backend and frontend as background processes via `scripts/launch-detached.py`
6. Runs health checks to confirm the stack is live

`scripts/launch-detached.py` launches a command in a new session, writes its PID to a file for later cleanup, and redirects output to a log file. This allows `demo-stop` and `demo-all-down` to reliably stop services by PID.

## Local-First Assumptions

- Docker daemon is local.
- images are loaded into kind locally (`kind load docker-image`).
- no cloud dependencies, ingress controllers, or external managed services are required.
