# Demo App

Intentionally simple HTTP app used to demonstrate Kubernetes behavior.

## What it exposes

- `GET /` and `GET /info`: pod identity and state payload
- `GET /healthz/live`: liveness endpoint (always healthy)
- `GET /healthz/ready`: readiness endpoint (healthy/unhealthy based on internal state)
- `POST /admin/readiness/fail`: flips readiness to `false`
- `POST /admin/readiness/restore`: flips readiness to `true`
- `POST /admin/reset-counter`: resets request counter for clean demos

Response payload includes:

- `podName`
- `nodeName`
- `imageVersion`
- `requestCount`
- `readiness`

## Local run

```bash
python3 app.py
```

## Local build

```bash
docker build -t demo-app:v1 .
```
