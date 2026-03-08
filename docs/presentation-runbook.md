# Presentation Runbook

Use this as the primary live-demo guide.

## Startup Commands (Exact)

Fast path:

```bash
make demo-all VERSION=v1
```

Restore known-good baseline before rehearsal/live run:

```bash
make golden-reset
```

Optional readiness automation:

```bash
make rehearsal-check
```

## Golden Reset Path

`make golden-reset` guarantees:
- cluster exists and is ready
- demo image `demo-app:v1` is built and loaded
- deployment image is `demo-app:v1`
- `APP_VERSION=v1`
- `INITIAL_READINESS=true`
- replicas set to `1`
- rollout completed

Use it before every rehearsal block and before going on stage.

## Talk Sequence (Exact)

### 1) Cluster Overview
- Action:
  Show live cluster context in the control-plane panel.
- Presenter words:
  "We start with what the cluster looks like right now: nodes, workload context, and readiness."
- Audience should notice:
  Real discovered local context, including whether control-plane node labels are discoverable.
- Fallback if step fails:
  Run `kubectl --context kind-inside-k8s get nodes` and `curl -s http://localhost:8000/api/state`.

### 2) Control-Plane Overview
- Action:
  Point to conceptual cards (`kube-apiserver`, `etcd`, `kube-scheduler`, `kube-controller-manager`).
- Presenter words:
  "These are role-based teaching models, paired with live state, not low-level process telemetry."
- Audience should notice:
  Distinction between conceptual explanation and discovered live metadata.
- Fallback if step fails:
  Use the architecture one-liner:
  "API server accepts intent, etcd stores it, controllers reconcile it, scheduler places pods."

### 3) Apply YAML Journey
- Action:
  Click `Apply YAML journey`, then `Deploy app` if needed.
- Presenter words:
  "Apply YAML means declare intent; reconciliation turns that into running, ready pods."
- Audience should notice:
  Sequence from request -> desired state -> controllers -> scheduler/kubelet -> readiness -> service traffic.
- Fallback if step fails:
  Run `curl -X POST http://localhost:8000/api/actions/deploy`.

### 4) Controller Reconciliation
- Action:
  Click `Controller reconciliation`, then `Delete pod`.
- Presenter words:
  "Desired replicas do not change; controllers detect drift and self-heal."
- Audience should notice:
  Desired vs running vs ready counts diverge briefly, then converge.
- Fallback if step fails:
  Run `curl -X POST http://localhost:8000/api/actions/delete-pod -H 'Content-Type: application/json' -d '{}'`.

### 5) Readiness vs Running
- Action:
  Click `Break readiness`, then `Restore readiness`.
- Presenter words:
  "Running means process exists; Ready means safe for service traffic."
- Audience should notice:
  Running pods can be excluded from service traffic while unready.
- Fallback if step fails:
  Run:
  `curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":true}'`
  then:
  `curl -X POST http://localhost:8000/api/actions/toggle-readiness -H 'Content-Type: application/json' -d '{"fail":false}'`

### 6) Scaling
- Action:
  Click `Scale to 3`, then `Scale to 1`.
- Presenter words:
  "Desired replica target changes first, actual state catches up."
- Audience should notice:
  Reconciliation and scheduling behavior across worker nodes.
- Fallback if step fails:
  `curl -X POST http://localhost:8000/api/actions/scale -H 'Content-Type: application/json' -d '{"replicas":3}'`

### 7) Rollout Behaviour
- Action:
  Build/load `v2`, then click `Rollout new version`.
- Presenter words:
  "Rolling update replaces pods while keeping service continuity through readiness."
- Audience should notice:
  Controlled old/new pod transition and stable service behavior.
- Fallback if step fails:
  `make demo-image VERSION=v2 && make demo-load VERSION=v2` then rollout action via UI/API.

### 8) Optional Traffic Panel
- Action:
  Click `Generate traffic`.
- Presenter words:
  "Responses show which pod/node/version handled each request."
- Audience should notice:
  Live request-level metadata and changing pod identity.
- Fallback if step fails:
  Run:
  `curl -s http://localhost:8000/api/traffic/info`
  then:
  `kubectl --context kind-inside-k8s -n inside-k8s-demo rollout status deployment/demo-app`.

### 9) Reset
- Action:
  Click `Reset demo`.
- Presenter words:
  "Reset returns us to a deterministic baseline."
- Audience should notice:
  Rapid return to `v1`, replicas `1`, readiness healthy.
- Fallback if step fails:
  Run `make golden-reset`.

## Live Demo Risks and Mitigations

- Risk: cluster/runtime not ready.
  Mitigation: run `make demo-all`; if uncertain run `make rehearsal-check`.
- Risk: traffic endpoint errors due no ready service endpoints.
  Mitigation: wait for rollout readiness; verify with `kubectl rollout status deployment/demo-app`.
- Risk: control-plane node labels not discoverable in local distro.
  Mitigation: use conceptual cards and explain discovery limitations explicitly.
- Risk: image tag mismatch for rollout.
  Mitigation: pre-build/load `v2` before stage segment.
- Risk: UI transient glitches during live run.
  Mitigation: use terminal fallback commands listed in `docs/demo-script.md`.
