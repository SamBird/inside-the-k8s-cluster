# Inside the Kubernetes Cluster

Local-first teaching demo for the talk:
"Inside the Kubernetes Cluster: What Really Happens After You Apply YAML"

## Project Purpose

This project gives a live, visual explanation of Kubernetes control-loop behavior. The audience sees how desired state, actual state, readiness, scaling, and rollouts change in real time.

## Architecture Summary

- `frontend/`: Next.js + TypeScript dashboard with dedicated presenter views:
  - `/` live demo controls + live cluster state panels
  - `/teaching` conceptual control-plane overview + explained-flow teaching panels
- `backend/`: FastAPI service that watches Kubernetes state and exposes actions
- `demo-app/`: intentionally simple HTTP app used to demonstrate pod identity, readiness, and traffic behavior
- `k8s/`: local manifests and `kind` cluster config
- `scripts/`: cluster create/destroy and metrics-server install scripts

Detailed architecture is documented in [docs/architecture.md](docs/architecture.md).

## Control Plane Overview

The demo teaches four core control-plane components:

- `kube-apiserver`: validates API requests and writes accepted object state.
- `etcd`: stores cluster desired/current object state.
- `kube-scheduler`: assigns unscheduled Pods to worker nodes.
- `kube-controller-manager`: runs controllers that reconcile desired and actual state.

In the UI:
- conceptual component cards are educational explanations.
- discovered node/cluster context is live metadata from Kubernetes API snapshots.
- no per-process telemetry is claimed for control-plane binaries.

## Quick Start

Prerequisites: Docker, `kubectl`, `kind`, `make`, Node.js 20+, Python 3.11+.
Full details in [docs/prerequisites.md](docs/prerequisites.md).

One-command setup (creates cluster, builds image, deploys app, starts backend + frontend):

```bash
make demo-all VERSION=v1
```

Or step by step:

```bash
make preflight        # verify local toolchain
make cluster-up       # create kind cluster + metrics-server
make demo-up VERSION=v1  # build, load, deploy demo app
make backend-install && make backend-run    # terminal 1
make frontend-install && make frontend-run  # terminal 2
```

For the full step-by-step guide, environment variable reference, and teardown options, see [docs/setup.md](docs/setup.md).

## Verify Setup

After setup, confirm everything works:

```bash
make rehearsal-check   # automated pre-talk readiness checks
make smoke-test        # end-to-end API smoke test
```

See [docs/rehearsal-checklist.md](docs/rehearsal-checklist.md) for the full manual checklist.

## Demo Walkthrough

Revised talk flow:

1. Cluster overview (live node/resource context).
2. Control-plane overview (conceptual component roles).
3. `Apply YAML journey` (what happens after submission).
4. `Controller reconciliation` (delete pod, watch self-healing).
5. Readiness vs Running.
6. Scaling behavior.
7. Rollout behavior.
8. Optional traffic/load-balancing demonstration.
9. Reset.

Full operator script is in [docs/presentation-guide.md](docs/presentation-guide.md).

## Reset Steps

Use dashboard `Reset demo`, or from terminal:

```bash
curl -X POST http://localhost:8000/api/actions/reset
```

If environment needs a full reset:

```bash
make cluster-reset
```

## Known Limitations and Future Enhancements

See [docs/troubleshooting.md](docs/troubleshooting.md) for the full list of known limitations, future enhancements, and common issue fixes.

## Git Workflow

For repository contributors and Codex-assisted changes:

- Commit after coherent milestones (feature slice, meaningful fix, or docs update aligned with code).
- Do not commit broken/half-finished work or unrelated mixed changes.
- Check `git status` and run relevant validation before committing where practical.
- Prefer several small, reviewable commits over one large mixed commit.
- Use clear commit messages (conventional style is preferred).
- If commit creation is blocked by permissions/approval constraints, continue safely and report the limitation.

## Talk Assets

- Setup guide: [docs/setup.md](docs/setup.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Presentation guide: [docs/presentation-guide.md](docs/presentation-guide.md)
- Rehearsal checklist: [docs/rehearsal-checklist.md](docs/rehearsal-checklist.md)
- Troubleshooting: [docs/troubleshooting.md](docs/troubleshooting.md)
