# Inside the Kubernetes Cluster

Local-first teaching demo for the talk:
"Inside the Kubernetes Cluster: What Really Happens After You Apply YAML"

## Project Purpose

This project gives a live, visual explanation of Kubernetes control-loop behavior. The audience sees how desired state, actual state, readiness, scaling, and rollouts change in real time.

## Architecture Summary

- `frontend/`: Next.js + TypeScript dashboard with conceptual control-plane overview plus discovered local-cluster context, explained action flows, worker topology, workload resources, and demo controls
- `backend/`: FastAPI service that watches Kubernetes state and exposes actions
- `demo-app/`: intentionally simple HTTP app used to demonstrate pod identity, readiness, and traffic behavior
- `k8s/`: local manifests and `kind` cluster config
- `scripts/`: cluster create/destroy and metrics-server install scripts

Detailed architecture is documented in [docs/architecture.md](docs/architecture.md).

## Local Setup

Prerequisites:

- Docker
- `kubectl`
- `kind`
- `make`
- Node.js + npm (for frontend)
- Python 3.11+ (for backend)

Create cluster and install metrics-server:

```bash
make preflight
make cluster-up
```

Or run full live-demo orchestration in one command:

```bash
make demo-all VERSION=v1
```

`demo-all` will try to start Colima automatically if Docker is installed but the daemon is not reachable.
Disable that behavior with:

```bash
AUTO_START_COLIMA=0 make demo-all VERSION=v1
```

To stop local backend/frontend processes started by `demo-all`:

```bash
make demo-stop
```

If you use a non-default cluster name:

```bash
make CLUSTER_NAME=my-demo KUBE_CONTEXT=kind-my-demo cluster-up
```

## Build and Deploy Commands

Build and load demo app image:

```bash
make demo-image VERSION=v1
make demo-load VERSION=v1
```

Or use one command:

```bash
make demo-up VERSION=v1
```

Deploy app manifests:

```bash
make demo-deploy
make demo-status
```

Run backend:

```bash
make backend-install
make backend-run
```

Run frontend (new terminal):

```bash
make frontend-install
make frontend-run
```

Expose in-cluster service for browser-based traffic generation:

```bash
kubectl --context kind-inside-k8s -n inside-k8s-demo port-forward svc/demo-app 8080:80
```

## Demo Walkthrough

Short flow:

1. Start with empty/initial cluster view.
2. Deploy app.
3. Scale 1 -> 3.
4. Generate traffic and show load balancing.
5. Delete one pod and show automatic replacement.
6. Break readiness and explain running vs ready.
7. Restore readiness.
8. Roll out `v2`.
9. Reset demo.

Full operator script is in [docs/demo-script.md](docs/demo-script.md).

## Reset Steps

Use dashboard `Reset demo`, or from terminal:

```bash
curl -X POST http://localhost:8000/api/actions/reset
```

If environment needs a full reset:

```bash
make cluster-reset
```

## Known Limitations

- No auth/RBAC abstraction in the app; this is intentionally a local teaching tool.
- Rollout to a new version expects the image tag to exist locally and be loadable into kind.
- Traffic panel depends on service port-forward (`localhost:8080`) for browser access.
- SSE timeline currently follows pod-level events and state snapshots, not full Kubernetes event history.

## Future Enhancements

- Add a dedicated Kubernetes events stream panel (`kubectl get events` style semantics).
- Add saved demo “scenes” for one-click transitions between teaching moments.
- Add lightweight backend integration tests with mocked Kubernetes API responses.
- Add exportable timeline snapshots for post-talk review.

## Git Workflow

For repository contributors and Codex-assisted changes:

- Commit after coherent milestones (feature slice, meaningful fix, or docs update aligned with code).
- Do not commit broken/half-finished work or unrelated mixed changes.
- Check `git status` and run relevant validation before committing where practical.
- Prefer several small, reviewable commits over one large mixed commit.
- Use clear commit messages (conventional style is preferred).
- If commit creation is blocked by permissions/approval constraints, continue safely and report the limitation.

## Talk Assets

- Architecture: [docs/architecture.md](docs/architecture.md)
- Demo script: [docs/demo-script.md](docs/demo-script.md)
- Speaker notes: [docs/speaker-notes.md](docs/speaker-notes.md)
- Troubleshooting: [docs/troubleshooting.md](docs/troubleshooting.md)
