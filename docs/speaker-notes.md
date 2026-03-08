# Speaker Notes

Use these notes during the live demo. Language is designed for a mixed technical audience and emphasizes clear mental models over deep internals.

## 1) Cluster Overview

- Action:
  Open the dashboard and point to the discovered cluster context (namespace, node counts, deployment/service/pod context).
- What the audience should notice:
  They are seeing live local-cluster metadata, including whether a control-plane node is discoverable.
- Key Kubernetes principle:
  Kubernetes is a desired-state system, but we can still observe current cluster context in real time.
- Suggested presenter words:
  "Before actions, let’s anchor ourselves in live cluster context: what nodes exist, what workload objects exist, and how many pods are currently running and ready."
- Likely audience questions:
  - "Is this data live from the cluster?"
  - "Why might control-plane details differ across environments?"

## 2) Control-Plane Overview

- Action:
  Point to the conceptual control-plane component cards.
- What the audience should notice:
  `kube-apiserver`, `etcd`, `kube-scheduler`, and `kube-controller-manager` each have a distinct role.
- Key Kubernetes principle:
  Control-plane loops reconcile desired state into actual state.
- Suggested presenter words:
  "These cards are teaching models: API server accepts intent, etcd stores it, controllers reconcile it, and scheduler places pods."
- Likely audience questions:
  - "Are these per-component metrics?"
  - "Where is controller logic actually running?"

## 3) Apply YAML Journey

- Action:
  Click `Apply YAML journey`; optionally click `Deploy app`.
- What the audience should notice:
  A clear sequence from submission to serviceable ready pods.
- Key Kubernetes principle:
  Declarative submission starts a reconciliation workflow, not a direct process launch.
- Suggested presenter words:
  "Applying YAML means declaring intent. Kubernetes accepts, stores, reconciles, schedules, and only serves traffic when readiness passes."
- Likely audience questions:
  - "Which step is synchronous versus asynchronous?"
  - "How quickly do these transitions happen in real clusters?"

## 4) Controller Reconciliation

- Action:
  Click `Controller reconciliation`, then click `Delete pod`.
- What the audience should notice:
  Desired replicas remain steady while actual running/ready counts dip and recover.
- Key Kubernetes principle:
  Controllers continuously detect drift and self-heal to restore desired state.
- Suggested presenter words:
  "I removed a pod, but not the intent. The controller sees drift and recreates a pod until the counts converge again."
- Likely audience questions:
  - "What if multiple pods fail at once?"
  - "How does Kubernetes pick which replacement pod to create?"

## 5) Readiness vs Running

- Action:
  Click `Break readiness`, then `Restore readiness`.
- What the audience should notice:
  Pods can be Running while still excluded from Service traffic until Ready.
- Key Kubernetes principle:
  Running and Ready are different signals with different meanings.
- Suggested presenter words:
  "Running means process exists. Ready means safe for traffic. Kubernetes routes based on readiness, not just process existence."
- Likely audience questions:
  - "Does liveness behave the same way?"
  - "What causes readiness flapping?"

## 6) Scaling

- Action:
  Click `Scale to 3`, then optionally `Scale to 1`.
- What the audience should notice:
  Desired count changes first; actual running/ready counts converge after scheduling and startup.
- Key Kubernetes principle:
  Replica controllers converge actual state toward desired replica targets.
- Suggested presenter words:
  "Scaling changes intent first. Then reconciliation and scheduling bring the cluster into alignment."
- Likely audience questions:
  - "Why do pods not become ready instantly?"
  - "How does placement across nodes get decided?"

## 7) Rollout Behaviour

- Action:
  Ensure `demo-app:v2` is loaded, then click `Rollout new version`.
- What the audience should notice:
  Old and new pods can coexist briefly while readiness preserves traffic continuity.
- Key Kubernetes principle:
  Rolling updates reconcile template changes while attempting to maintain availability.
- Suggested presenter words:
  "Rollout is controlled replacement: Kubernetes shifts from old to new pods while keeping traffic on ready endpoints."
- Likely audience questions:
  - "How do I tune rollout pace?"
  - "How is rollback handled?"

## 8) Reset

- Action:
  Click `Reset demo`.
- What the audience should notice:
  Demo returns to baseline quickly and predictably.
- Key Kubernetes principle:
  Repeatable desired-state operations make live demonstrations reliable.
- Suggested presenter words:
  "A good demo is reproducible. Reset re-applies the baseline so we can rerun scenarios confidently."
- Likely audience questions:
  - "What exactly does reset modify?"
  - "Can reset be done entirely with kubectl?"

## Teaching Boundary Reminder

- Conceptual:
  Control-plane role cards and explained-flow step sequences.
- Live discovered:
  Node context, control-plane node discovery, workload counts, readiness/replica signals.
- Presenter line:
  "We intentionally combine conceptual flow with live observed state. We are not claiming low-level process telemetry."
