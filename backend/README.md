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

## Notes on safety and predictability

- actions are namespace-scoped to `inside-k8s-demo`
- scale requests are validated (`1..10`)
- reset uses Deployment annotation patch (same as `kubectl rollout restart` semantics)
- readiness toggle marks one running pod NotReady for teaching traffic flow, without a rollout or ReplicaSet change
