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

## Timing Guide (30-Minute Slot)

| Step | Topic | Est. Time | Notes |
|------|-------|-----------|-------|
| 0 | Introduction | 2 min | Context-setting, no clicks needed |
| 1 | Cluster overview | 2 min | Quick orientation |
| 2 | Control-plane overview | 2 min | Shorten to 1 min if pressed for time |
| 3 | Apply YAML journey | 3–4 min | Core concept, don't rush |
| 4 | Controller reconciliation | 3–4 min | Self-healing is a crowd favourite |
| 5 | Readiness, traffic & service routing | 5 min | Combined centerpiece demo |
| 6 | Scaling | 3 min | Quick — audience gets the pattern by now |
| 7 | Rollout | 3–4 min | Show old/new pods coexisting |
| 8 | Wrap-up & takeaways | 2 min | Three key points |
| | **Total** | **~27–30 min** | |

**If running late:**
- Shorten or skip step 2 (control-plane overview) — say the one-liner instead: "API server accepts intent, etcd stores it, controllers reconcile it, scheduler places pods."
- In step 5, do the full three-beat readiness+traffic flow but skip the restore step — just narrate it.
- In step 6, scale to 3 only (skip scaling back to 1).
- **5 minutes remaining checkpoint:** If you're still on step 5 or earlier, skip to Rollout (step 7) then Wrap-up (step 8).

## Talk Sequence

### 0. Introduction

| | |
|---|---|
| **Action** | No clicks. Ensure dashboard is visible on the projector screen. |
| **Presenter words** | "Kubernetes is a desired-state system. You tell it what you want, and internal loops make it happen. Today we'll look inside the cluster to see exactly what happens after you apply YAML — how controllers, the scheduler, and readiness probes work together to turn your intent into running, traffic-serving pods." |
| **Audience focus** | Set expectations: this is a live demo against a real local cluster, not slides. |
| **Duration** | ~2 minutes |

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

### 5. Readiness, Traffic & Service Routing

This is the centerpiece demo — it proves that Running and Ready are different signals, and that Service routing responds to readiness in real time.

**Three-beat flow (requires 3 replicas — scale up first if not already at 3):**

| Beat | Action | What the audience sees |
|------|--------|----------------------|
| **Beat 1: Baseline traffic** | Click `Generate Traffic` (12 requests). | Traffic distributes across all 3 pods. All pods show "Ready" pills. |
| **Beat 2: Break one pod** | Click `Break readiness`, wait 5s, then `Generate Traffic` again. | One pod shows "Not Ready" in topology. Traffic only hits the 2 remaining ready pods. The broken pod is Running but receives zero requests. |
| **Beat 3: Restore** | Click `Restore readiness`, wait 5s, then `Generate Traffic` again. | All 3 pods are Ready again. Traffic redistributes across all 3. |

| | |
|---|---|
| **Presenter words** | "Running means the process exists. Ready means safe for traffic. Watch — I'll break one pod's readiness without killing it. The pod stays Running, but the Service stops sending it requests. This is how Kubernetes protects users from unhealthy backends." |
| **Audience focus** | The traffic panel pills are the key visual: pod distribution shifts when readiness changes. |
| **K8s principle** | Running and Ready are different signals. Service routing uses readiness, not process existence. |
| **Likely questions** | "Does liveness behave the same way?" (No — liveness failure restarts the pod.) / "What causes readiness flapping?" / "How quickly does the endpoint update?" |
| **Terminal fallback** | `curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":true}'` then `curl -s http://localhost:8000/api/traffic/info` (repeat a few times) then `curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":false}'` |

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

### 8. Wrap-up & Takeaways

| | |
|---|---|
| **Action** | Click `Reset demo` to return to baseline. Leave the dashboard visible. |
| **Presenter words** | "Three things to take away: (1) Kubernetes is a desired-state system — you declare intent, controllers make it real. (2) Reconciliation is continuous — delete a pod, and the system self-heals. (3) Running and Ready are different — readiness gates traffic, and that distinction keeps your users safe." |
| **Audience focus** | Reinforce the mental model: desired state → reconciliation → readiness. |
| **K8s principle** | The control loop is the core abstraction. Everything else follows from it. |
| **Likely questions** | "What exactly does reset modify?" / "Where can I learn more?" / "Can I run this demo myself?" |
| **Terminal fallback** | `curl -X POST http://localhost:8000/api/actions/reset` or `make golden-reset` |

For deeper terminal exploration (etcd internals, pod inspection, JSONPath tricks), see [kubectl-cheatsheet.md](kubectl-cheatsheet.md).

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
