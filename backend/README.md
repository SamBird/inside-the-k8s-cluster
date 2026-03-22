# Backend

FastAPI control service for local Kubernetes demo orchestration.

## Responsibilities

- expose current demo state in a frontend-friendly shape
- stream live state updates using server-sent events (SSE)
- run safe, explicit demo actions against Kubernetes using the official Python client

## Run locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## API overview

- `GET /healthz`
- `GET /api/state`
- `GET /api/events` (SSE)
- `POST /api/actions/deploy`
- `POST /api/actions/scale` with `{ "replicas": 3 }`
- `POST /api/actions/delete-pod` with `{ "pod_name": "..." }` or `{}`
- `POST /api/actions/rollout` with `{ "version": "v2" }`
- `POST /api/actions/toggle-readiness` with `{ "fail": true|false }`
- `POST /api/actions/reset`

## Example responses

State snapshot (truncated):

```json
GET /api/state
{
  "namespace": "inside-k8s-demo",
  "nodes": [{"name": "inside-k8s-control-plane", "ready": true, "role": "control-plane", ...}],
  "deployment": {"name": "demo-app", "exists": true, "replicas": 1, "ready_replicas": 1, ...},
  "pods": [{"name": "demo-app-abc12", "phase": "Running", "ready": true, "node_name": "inside-k8s-worker", ...}],
  "service": {"name": "demo-app", "exists": true, "type": "ClusterIP", ...},
  "config": {"app_version": "v1", "initial_readiness": true},
  "updated_at": "2025-03-22T10:00:00Z"
}
```

Traffic info (proxied from in-cluster service):

```json
GET /api/traffic/info
{
  "podName": "demo-app-abc12",
  "nodeName": "inside-k8s-worker",
  "imageVersion": "v1",
  "readiness": true,
  "requestCount": 5,
  "source": "service-proxy"
}
```

Action response (all POST actions return this shape):

```json
POST /api/actions/scale  {"replicas": 3}
{
  "action": "scale",
  "message": "Scaled deployment to 3 replicas",
  "state": { ... full ClusterState snapshot ... }
}
```

Error response:

```json
HTTP 409 / 502 / 503
{"detail": "description of what went wrong"}
```

## Notes on safety and predictability

- actions are namespace-scoped to `inside-k8s-demo`
- scale requests are validated (`1..10`)
- reset uses Deployment annotation patch (same as `kubectl rollout restart` semantics)
- readiness toggle marks one running pod NotReady for teaching traffic flow, without a rollout or ReplicaSet change
