export type ExplainedFlowScenario =
  | "apply-yaml-journey"
  | "controller-reconciliation"
  | "deploy-app"
  | "scale-deployment"
  | "delete-pod"
  | "break-readiness"
  | "rollout-new-version";

export interface ExplainedFlowStep {
  id: string;
  title: string;
  detail: string;
}

export interface ExplainedFlowScenarioDefinition {
  key: ExplainedFlowScenario;
  label: string;
  summary: string;
  steps: ExplainedFlowStep[];
}

export type ExplainedFlowRunStatus = "selected" | "running" | "success" | "error";

export interface ExplainedFlowRun {
  scenario: ExplainedFlowScenario;
  status: ExplainedFlowRunStatus;
  actionLabel: string;
  startedAt: string;
  finishedAt?: string;
  message?: string;
}

export const explainedFlowScenarios: ExplainedFlowScenarioDefinition[] = [
  {
    key: "apply-yaml-journey",
    label: "Apply YAML journey",
    summary: "Teaching walkthrough of what happens after submitting a Deployment: desired state is declared, then reconciliation makes actual state match.",
    steps: [
      {
        id: "yaml-1",
        title: "kube-apiserver receives and validates request",
        detail: "A Deployment manifest is submitted and validated by the API server before being accepted."
      },
      {
        id: "yaml-2",
        title: "Desired state is stored",
        detail: "Accepted Deployment spec is persisted in etcd as source-of-truth desired state."
      },
      {
        id: "yaml-3",
        title: "Deployment controller observes desired state",
        detail: "Controller loop sees the new Deployment and starts reconciliation."
      },
      {
        id: "yaml-4",
        title: "ReplicaSet is created or updated",
        detail: "Deployment controller creates or updates a ReplicaSet that matches pod template intent."
      },
      {
        id: "yaml-5",
        title: "Pods are created",
        detail: "ReplicaSet controller creates Pod objects to meet desired replica count."
      },
      {
        id: "yaml-6",
        title: "kube-scheduler assigns Pods to nodes",
        detail: "Pending pods are bound to worker nodes based on scheduling decisions."
      },
      {
        id: "yaml-7",
        title: "Pods move through Pending, Running, and Ready",
        detail: "kubelet starts containers; readiness probes determine when pods are marked Ready."
      },
      {
        id: "yaml-8",
        title: "Service routes traffic once pods are Ready",
        detail: "Service endpoints include ready pods, so traffic flows only to pods that passed readiness."
      }
    ]
  },
  {
    key: "controller-reconciliation",
    label: "Controller reconciliation",
    summary: "A pod is deleted, desired replicas stay the same, and controllers self-heal by creating a replacement pod until actual state matches desired state again.",
    steps: [
      {
        id: "reconcile-1",
        title: "Running Pod is deleted",
        detail: "A pod deletion request is accepted by kube-apiserver and the pod begins termination."
      },
      {
        id: "reconcile-2",
        title: "Desired replicas remain unchanged",
        detail: "Deployment/ReplicaSet desired replica count in desired state does not decrease."
      },
      {
        id: "reconcile-3",
        title: "Controller detects drift",
        detail: "ReplicaSet controller sees fewer actual pods than desired replicas."
      },
      {
        id: "reconcile-4",
        title: "Replacement Pod is created",
        detail: "Controller creates a new pod object to close the gap."
      },
      {
        id: "reconcile-5",
        title: "kube-scheduler places replacement",
        detail: "New pod is assigned to a worker node."
      },
      {
        id: "reconcile-6",
        title: "Readiness gates Service traffic",
        detail: "Service includes the replacement pod only when readiness is true."
      },
      {
        id: "reconcile-7",
        title: "System returns to desired count",
        detail: "Actual running/ready pods converge back to desired replicas."
      }
    ]
  },
  {
    key: "deploy-app",
    label: "Deploy app",
    summary: "New Deployment intent is declared, then controllers and scheduler turn it into running Pods.",
    steps: [
      {
        id: "deploy-1",
        title: "Request hits kube-apiserver",
        detail: "Frontend action triggers backend API call, which writes Deployment and Service intent via Kubernetes API."
      },
      {
        id: "deploy-2",
        title: "Desired state is recorded in etcd",
        detail: "Deployment spec, replica target, and related objects are persisted as desired state."
      },
      {
        id: "deploy-3",
        title: "Deployment and ReplicaSet controllers reconcile",
        detail: "Controllers detect missing Pods and create ReplicaSet/Pod resources to match desired replicas."
      },
      {
        id: "deploy-4",
        title: "kube-scheduler assigns Pods to worker nodes",
        detail: "Pending Pods get node assignments based on scheduler decisions."
      },
      {
        id: "deploy-5",
        title: "kubelet starts containers",
        detail: "Node-local kubelet pulls image if needed and starts the pod sandbox and containers."
      },
      {
        id: "deploy-6",
        title: "Readiness gates Service traffic",
        detail: "Pods may be Running before they are Ready; Service should only send traffic to Ready endpoints."
      }
    ]
  },
  {
    key: "scale-deployment",
    label: "Scale deployment",
    summary: "Replica target changes first, then reconciliation creates or removes Pods until counts match.",
    steps: [
      {
        id: "scale-1",
        title: "Scale request to kube-apiserver",
        detail: "Backend patches Deployment replica count through Kubernetes API."
      },
      {
        id: "scale-2",
        title: "Updated desired replica count stored",
        detail: "New `.spec.replicas` becomes the desired state in etcd."
      },
      {
        id: "scale-3",
        title: "Deployment/ReplicaSet detect drift",
        detail: "Controller loop compares desired count with current Pod count."
      },
      {
        id: "scale-4",
        title: "Pods created or terminated",
        detail: "ReplicaSet adjusts Pod resources to close the gap."
      },
      {
        id: "scale-5",
        title: "Scheduler and kubelet act for new Pods",
        detail: "If scaling up, scheduler places Pods and kubelet starts them."
      },
      {
        id: "scale-6",
        title: "Readiness updates Service endpoints",
        detail: "Service endpoint set expands or shrinks based on Pod readiness."
      }
    ]
  },
  {
    key: "delete-pod",
    label: "Delete pod",
    summary: "Manual pod deletion creates drift; controllers self-heal back to desired replicas.",
    steps: [
      {
        id: "delete-1",
        title: "Pod delete request to kube-apiserver",
        detail: "Backend sends Pod deletion request for selected or chosen demo Pod."
      },
      {
        id: "delete-2",
        title: "Current state changes in etcd",
        detail: "Pod object enters termination and is removed from observed Pod set."
      },
      {
        id: "delete-3",
        title: "ReplicaSet detects missing replica",
        detail: "Desired replica count is unchanged, so controller sees drift."
      },
      {
        id: "delete-4",
        title: "Replacement Pod is created",
        detail: "ReplicaSet requests a new Pod to restore desired count."
      },
      {
        id: "delete-5",
        title: "Scheduler and kubelet realize replacement",
        detail: "New Pod is assigned to a node and started by kubelet."
      },
      {
        id: "delete-6",
        title: "Readiness restores traffic participation",
        detail: "Service routes to replacement pod only after readiness becomes true."
      }
    ]
  },
  {
    key: "break-readiness",
    label: "Break readiness",
    summary: "One pod can stay Running while failing readiness; Service traffic shifts to the remaining healthy endpoints.",
    steps: [
      {
        id: "ready-1",
        title: "Readiness-toggle request to kube-apiserver",
        detail: "Backend picks one running pod and calls its admin readiness endpoint without changing the Deployment template."
      },
      {
        id: "ready-2",
        title: "Desired replica count stays the same",
        detail: "Deployment and ReplicaSet intent remain at the same size; this is a live pod health change, not a rollout."
      },
      {
        id: "ready-3",
        title: "Running pods stay on the same ReplicaSet",
        detail: "No new Pod is created; the chosen pod keeps running on its worker node while readiness changes in place."
      },
      {
        id: "ready-4",
        title: "Other pods remain healthy",
        detail: "kubelet keeps the unhealthy pod alive unless liveness fails; the other replicas stay Ready."
      },
      {
        id: "ready-5",
        title: "One pod drops out of readiness",
        detail: "Only the selected Pod flips to NotReady during probe checks."
      },
      {
        id: "ready-6",
        title: "Service removes that endpoint",
        detail: "Traffic bypasses the unready Pod even though its process is still Running."
      }
    ]
  },
  {
    key: "rollout-new-version",
    label: "Rollout new version",
    summary: "Deployment template change triggers rolling replacement while preserving Service continuity.",
    steps: [
      {
        id: "rollout-1",
        title: "Version update request to kube-apiserver",
        detail: "Backend patches image/version config for the Deployment."
      },
      {
        id: "rollout-2",
        title: "New desired template recorded",
        detail: "etcd stores updated pod template hash and version intent."
      },
      {
        id: "rollout-3",
        title: "Deployment controller starts RollingUpdate",
        detail: "A new ReplicaSet is created and old/new pods coexist temporarily."
      },
      {
        id: "rollout-4",
        title: "Scheduler and kubelet start new-version Pods",
        detail: "New Pods are placed and started before full old-pod termination."
      },
      {
        id: "rollout-5",
        title: "Readiness gates progression",
        detail: "Rollout advances as new pods become Ready according to strategy limits."
      },
      {
        id: "rollout-6",
        title: "Service continues routing to Ready Pods",
        detail: "Traffic remains stable because Service targets ready endpoints across old/new sets."
      }
    ]
  }
];

export function findExplainedFlowScenario(
  scenario: ExplainedFlowScenario
): ExplainedFlowScenarioDefinition {
  return explainedFlowScenarios.find((item) => item.key === scenario) ?? explainedFlowScenarios[0];
}

/**
 * Maps a dashboard action label (e.g. "Deploy app") to the matching
 * explained-flow scenario key so the teaching page can auto-switch
 * when the presenter triggers an action on the dashboard.
 */
export function actionLabelToScenario(label: string): ExplainedFlowScenario | null {
  const lower = label.toLowerCase();
  if (lower === "deploy app") return "deploy-app";
  if (lower.startsWith("scale to")) return "scale-deployment";
  if (lower === "delete pod") return "delete-pod";
  if (lower === "break readiness") return "break-readiness";
  if (lower === "restore readiness") return "break-readiness";
  if (lower.startsWith("rollout")) return "rollout-new-version";
  if (lower === "reset demo") return "deploy-app";
  return null;
}
