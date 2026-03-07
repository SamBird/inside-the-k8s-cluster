# Speaker Notes

Use this as presenter guidance during the live demo.

## Step 1: Start With Baseline

- Action:
  Keep dashboard on topology + desired/actual panels; briefly show current cluster state.
- What audience should notice:
  Kubernetes state is observable and continuously changing, even before "interesting" actions.
- Key Kubernetes principle:
  Control loops reconcile desired and actual state continuously.
- Suggested presenter words:
  "Think of Kubernetes as a set of controllers constantly comparing what we asked for with what actually exists."
- Likely audience questions:
  - "Is this polling or event-driven?"
  - "How often is the dashboard updated?"

## Step 2: Deploy App

- Action:
  Click `Deploy app`.
- What audience should notice:
  Namespace resources appear quickly; deployment/service become present.
- Key Kubernetes principle:
  Declarative resources trigger controller reconciliation.
- Suggested presenter words:
  "I’m not launching a process directly; I’m declaring desired state and letting controllers do the work."
- Likely audience questions:
  - "What exactly got created first, Deployment or Pods?"
  - "Could this be done with plain YAML apply?"

## Step 3: Scale to 3

- Action:
  Click `Scale to 3`.
- What audience should notice:
  Replica target changes immediately; pods appear soon after and become ready.
- Key Kubernetes principle:
  ReplicaSet controller drives pod count to match desired replicas.
- Suggested presenter words:
  "The desired number changes first; actual pod count catches up asynchronously."
- Likely audience questions:
  - "Why don’t all pods become ready at the exact same moment?"
  - "How does scheduler choose nodes?"

## Step 4: Generate Traffic

- Action:
  Click `Generate traffic`.
- What audience should notice:
  Traffic panel shows varying pod names and nodes; service distributes requests.
- Key Kubernetes principle:
  Service provides stable virtual endpoint over dynamic pods.
- Suggested presenter words:
  "I send traffic to one Service address, and kube-proxy routes to whichever pods are currently ready."
- Likely audience questions:
  - "Is this round-robin?"
  - "Where is load balancing implemented?"

## Step 5: Delete Pod

- Action:
  Click `Delete pod`.
- What audience should notice:
  One pod disappears, then replacement appears; replica target remains unchanged.
- Key Kubernetes principle:
  Self-healing via reconciliation to desired replica count.
- Suggested presenter words:
  "Deleting a pod does not break the app model; controllers immediately move back to the desired count."
- Likely audience questions:
  - "What if I delete all pods?"
  - "How fast is replacement in real clusters?"

## Step 6: Break Readiness

- Action:
  Click `Break readiness`.
- What audience should notice:
  Pods may still be running, but readiness flips and service endpoint participation drops.
- Key Kubernetes principle:
  Readiness gates traffic, not process existence.
- Suggested presenter words:
  "Running means process exists; Ready means safe to receive traffic. Those are different signals."
- Likely audience questions:
  - "Is liveness affected too?"
  - "Why use readiness instead of deleting pods?"

## Step 7: Restore Readiness

- Action:
  Click `Restore readiness`.
- What audience should notice:
  Ready endpoints recover and traffic behavior normalizes.
- Key Kubernetes principle:
  Probe state controls endpoint eligibility dynamically.
- Suggested presenter words:
  "As probes recover, Kubernetes adds pods back to service load balancing without changing service address."
- Likely audience questions:
  - "How long before traffic returns?"
  - "Can readiness flap under real load?"

## Step 8: Rollout New Version

- Action:
  Ensure `v2` image is loaded, then click `Rollout new version` with `v2`.
- What audience should notice:
  Transition from old to new pods while service remains stable.
- Key Kubernetes principle:
  RollingUpdate strategy gradually replaces pods to preserve availability.
- Suggested presenter words:
  "This is controlled replacement: old and new versions briefly coexist while Kubernetes maintains service continuity."
- Likely audience questions:
  - "Can I tune maxSurge/maxUnavailable?"
  - "How do I roll back quickly?"

## Step 9: Reset Demo

- Action:
  Click `Reset demo`.
- What audience should notice:
  Baseline restored: v1, replicas=1, readiness healthy.
- Key Kubernetes principle:
  Idempotent desired-state operations make demos repeatable.
- Suggested presenter words:
  "A reliable live demo depends on a reliable known-good reset path. Kubernetes declarative state makes this practical."
- Likely audience questions:
  - "What does reset change exactly?"
  - "Can reset be one kubectl command?"
