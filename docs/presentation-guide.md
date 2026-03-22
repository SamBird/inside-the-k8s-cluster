# Presentation Guide

Single-source runbook for the live demo. Covers startup, each talk step, risks, and shutdown.

## Startup

Fast path (creates cluster, builds images, starts backend + frontend):

```bash
make demo-all VERSION=v1
```

This preloads `demo-app:v2` by default so the rollout step is stage-ready.

Restore known-good baseline before rehearsal or live run:

```bash
make golden-reset
```

Optional automated readiness checks:

```bash
make rehearsal-check
```

Set a terminal shortcut for fallback commands:

```bash
export KCTX=kind-inside-k8s
```

## Talk Sequence

### 1. Cluster Overview

| | |
|---|---|
| **Action** | Show live cluster context in the control-plane panel (namespace, node counts, deployment/service/pod context). |
| **Presenter words** | "Before actions, let's anchor ourselves in live cluster context: what nodes exist, what workload objects exist, and how many pods are currently running and ready." |
| **Audience focus** | Real discovered local context, including whether control-plane node labels are discoverable. |
| **K8s principle** | Kubernetes is a desired-state system, but we can still observe current cluster context in real time. |
| **Likely questions** | "Is this data live from the cluster?" / "Why might control-plane details differ across environments?" |
| **Terminal fallback** | `kubectl --context $KCTX get nodes` and `curl -s http://localhost:8000/api/state` |

### 2. Control-Plane Overview

| | |
|---|---|
| **Action** | Point to conceptual cards (`kube-apiserver`, `etcd`, `kube-scheduler`, `kube-controller-manager`). |
| **Presenter words** | "These cards are teaching models: API server accepts intent, etcd stores it, controllers reconcile it, and scheduler places pods." |
| **Audience focus** | Distinction between conceptual explanation and discovered live metadata. |
| **K8s principle** | Control-plane loops reconcile desired state into actual state. |
| **Likely questions** | "Are these per-component metrics?" / "Where is controller logic actually running?" |
| **Terminal fallback** | Use the architecture one-liner: "API server accepts intent, etcd stores it, controllers reconcile it, scheduler places pods." |

### 3. Apply YAML Journey

| | |
|---|---|
| **Action** | Click `Apply YAML journey` in explained-flow panel. Optionally click `Deploy app` to tie the flow to an immediate action. |
| **Presenter words** | "Applying YAML means declaring intent. Kubernetes accepts, stores, reconciles, schedules, and only serves traffic when readiness passes." |
| **Audience focus** | Clear sequence from submission to serviceable ready pods: request -> desired state -> controllers -> scheduler/kubelet -> readiness -> service traffic. |
| **K8s principle** | Declarative submission starts a reconciliation workflow, not a direct process launch. |
| **Likely questions** | "Which step is synchronous versus asynchronous?" / "How quickly do these transitions happen in real clusters?" |
| **Terminal fallback** | `curl -X POST http://localhost:8000/api/actions/deploy` |

### 4. Controller Reconciliation

| | |
|---|---|
| **Action** | Click `Controller reconciliation`, then `Delete pod`. |
| **Presenter words** | "I removed a pod, but not the intent. The controller sees drift and recreates a pod until the counts converge again." |
| **Audience focus** | Desired replicas remain steady while actual running/ready counts dip and recover. |
| **K8s principle** | Controllers continuously detect drift and self-heal to restore desired state. |
| **Likely questions** | "What if multiple pods fail at once?" / "How does Kubernetes pick which replacement pod to create?" |
| **Terminal fallback** | `curl -X POST http://localhost:8000/api/actions/delete-pod -H 'Content-Type: application/json' -d '{}'` |

### 5. Readiness vs Running

| | |
|---|---|
| **Action** | Click `Break readiness`, optionally `Generate traffic`, then `Restore readiness`. |
| **Presenter words** | "Running means process exists. Ready means safe for traffic. Kubernetes routes based on readiness, not just process existence." |
| **Audience focus** | Pods can be Running while still excluded from Service traffic until Ready. |
| **K8s principle** | Running and Ready are different signals with different meanings. |
| **Likely questions** | "Does liveness behave the same way?" / "What causes readiness flapping?" |
| **Terminal fallback** | `curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":true}'` then `curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":false}'` |

### 6. Scaling

| | |
|---|---|
| **Action** | Click `Scale to 3`, then optionally `Scale to 1`. |
| **Presenter words** | "Scaling changes intent first. Then reconciliation and scheduling bring the cluster into alignment." |
| **Audience focus** | Desired count changes first; actual running/ready counts converge after scheduling and startup. |
| **K8s principle** | Replica controllers converge actual state toward desired replica targets. |
| **Likely questions** | "Why do pods not become ready instantly?" / "How does placement across nodes get decided?" |
| **Terminal fallback** | `curl -X POST http://localhost:8000/api/actions/scale -H 'Content-Type: application/json' -d '{"replicas":3}'` |

### 7. Rollout Behaviour

| | |
|---|---|
| **Action** | Ensure `demo-app:v2` is loaded (automatic if you used `make demo-all`). Enter `v2` and click `Rollout new version`. |
| **Presenter words** | "Rollout is controlled replacement: Kubernetes shifts from old to new pods while keeping traffic on ready endpoints." |
| **Audience focus** | Old and new pods coexist briefly while readiness preserves traffic continuity. |
| **K8s principle** | Rolling updates reconcile template changes while attempting to maintain availability. |
| **Likely questions** | "How do I tune rollout pace?" / "How is rollback handled?" |
| **Terminal fallback** | `make demo-image VERSION=v2 && make demo-load VERSION=v2` then `curl -X POST http://localhost:8000/api/actions/rollout -H 'Content-Type: application/json' -d '{"version":"v2"}'` |

### 8. Traffic Panel (Optional)

| | |
|---|---|
| **Action** | Click `Generate traffic`. |
| **Presenter words** | "Responses show which pod, node, and version handled each request." |
| **Audience focus** | Live request-level metadata and changing pod identity. |
| **K8s principle** | Service routing distributes traffic across ready endpoints. |
| **Likely questions** | "How does Kubernetes decide which pod gets a request?" |
| **Terminal fallback** | `curl -s http://localhost:8000/api/traffic/info` |

### 9. Reset

| | |
|---|---|
| **Action** | Click `Reset demo`. |
| **Presenter words** | "A good demo is reproducible. Reset re-applies the baseline so we can rerun scenarios confidently." |
| **Audience focus** | Rapid return to `v1`, replicas `1`, readiness healthy. |
| **K8s principle** | Repeatable desired-state operations make live demonstrations reliable. |
| **Likely questions** | "What exactly does reset modify?" / "Can reset be done entirely with kubectl?" |
| **Terminal fallback** | `curl -X POST http://localhost:8000/api/actions/reset` or `make golden-reset` |

## Terminal Backup Commands (Quick Reference)

```bash
curl -X POST http://localhost:8000/api/actions/deploy
curl -X POST http://localhost:8000/api/actions/delete-pod -H 'Content-Type: application/json' -d '{}'
curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":true}'
curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":false}'
curl -X POST http://localhost:8000/api/actions/scale -H 'Content-Type: application/json' -d '{"replicas":3}'
curl -X POST http://localhost:8000/api/actions/rollout -H 'Content-Type: application/json' -d '{"version":"v2"}'
curl -X POST http://localhost:8000/api/actions/reset
```

## Teaching Boundary Reminder

- **Conceptual:** Control-plane role cards and explained-flow step sequences.
- **Live discovered:** Node context, control-plane node discovery, workload counts, readiness/replica signals.
- **Presenter line:** "We intentionally combine conceptual flow with live observed state. We are not claiming low-level process telemetry."

## Live Demo Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Cluster/runtime not ready | Run `make demo-all`; if uncertain run `make rehearsal-check` |
| Traffic endpoint errors (no ready endpoints) | Wait for rollout readiness; verify with `kubectl rollout status deployment/demo-app` |
| Control-plane node labels not discoverable | Use conceptual cards; explain discovery limitations explicitly |
| Image tag mismatch for rollout | Pre-build/load target version: `make demo-image VERSION=v2 && make demo-load VERSION=v2` |
| UI transient glitches | Use terminal fallback commands above |

## Post-Talk Shutdown

```bash
make demo-all-down
```

Optional (also stop Colima):

```bash
STOP_COLIMA=1 make demo-all-down
```
