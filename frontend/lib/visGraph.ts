import { ClusterState, NodeState, PodState } from "./types";

export type GraphNodeCategory = "group" | "conceptual" | "live-resource" | "live-node" | "live-workload";

export type ClusterGraphEdgeKind =
  | "conceptual-control"
  | "reconciliation"
  | "ownership"
  | "scheduling"
  | "placement"
  | "traffic-ready"
  | "traffic-blocked";

export interface GraphNodeData {
  id: string;
  label: string;
  category: GraphNodeCategory;
  source: "conceptual" | "live";
  detail?: string;
  metadata?: string[];
  x: number;
  y: number;
  isSection?: boolean;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: ClusterGraphEdgeKind;
  sourceType: "conceptual" | "live";
}

export interface GraphModel {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  nodeMap: Record<string, GraphNodeData>;
}

const LANE_X = {
  control: 170,
  desired: 520,
  workers: 870,
  pods: 1220
} as const;

const MAX_PODS_RENDERED = 8;

function podReplicaSetName(podName: string): string {
  const parts = podName.split("-");
  if (parts.length < 3) {
    return "unknown-replicaset";
  }
  return parts.slice(0, -1).join("-");
}

function isWorkerNode(node: NodeState): boolean {
  if (node.role === "control-plane") {
    return false;
  }
  const roles = node.roles ?? [];
  return !roles.includes("control-plane") && !roles.includes("master");
}

function sortPods(pods: PodState[]): PodState[] {
  return [...pods].sort((a, b) => {
    const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return createdA - createdB || a.name.localeCompare(b.name);
  });
}

function clampPodsForPresentation(pods: PodState[], maxPods: number): {
  visiblePods: PodState[];
  omittedCount: number;
} {
  if (pods.length <= maxPods) {
    return { visiblePods: pods, omittedCount: 0 };
  }

  return {
    visiblePods: pods.slice(pods.length - maxPods),
    omittedCount: pods.length - maxPods
  };
}

export function buildVisGraph(state: ClusterState | null, allowedKinds: Set<ClusterGraphEdgeKind>): GraphModel {
  const nodes: GraphNodeData[] = [];
  const edges: GraphEdgeData[] = [];
  const nodeMap: Record<string, GraphNodeData> = {};

  const pushNode = (node: GraphNodeData) => {
    nodes.push(node);
    nodeMap[node.id] = node;
  };

  const pushEdge = (edge: GraphEdgeData) => {
    edges.push(edge);
  };

  pushNode({
    id: "section-control",
    label: "Control Plane\n(Conceptual)",
    category: "group",
    source: "conceptual",
    x: LANE_X.control,
    y: 38,
    isSection: true,
    detail: "Teaching layer only. Relationships are conceptual, not process telemetry."
  });
  pushNode({
    id: "section-desired",
    label: "Desired-State Resources\n(Live Objects)",
    category: "group",
    source: "live",
    x: LANE_X.desired,
    y: 38,
    isSection: true,
    detail: "Live resources discovered from backend Kubernetes snapshots."
  });
  pushNode({
    id: "section-workers",
    label: "Worker Nodes\n(Live Objects)",
    category: "group",
    source: "live",
    x: LANE_X.workers,
    y: 38,
    isSection: true,
    detail: "Worker node inventory and readiness from live cluster state."
  });
  pushNode({
    id: "section-pods",
    label: "Pods + Service Traffic\n(Live Objects)",
    category: "group",
    source: "live",
    x: LANE_X.pods,
    y: 38,
    isSection: true,
    detail: "Live pod readiness and service routing relationships."
  });

  const conceptualNodes: Array<{ id: string; label: string; detail: string; y: number }> = [
    {
      id: "cp-apiserver",
      label: "kube-apiserver",
      y: 140,
      detail: "Validates requests and persists object changes."
    },
    {
      id: "cp-etcd",
      label: "etcd",
      y: 230,
      detail: "Stores desired and current cluster object state."
    },
    {
      id: "cp-controller-manager",
      label: "kube-controller-manager",
      y: 320,
      detail: "Runs reconciliation loops for Deployment and ReplicaSet behavior."
    },
    {
      id: "cp-scheduler",
      label: "kube-scheduler",
      y: 410,
      detail: "Assigns pending Pods to worker nodes."
    }
  ];

  for (const entry of conceptualNodes) {
    pushNode({
      id: entry.id,
      label: entry.label,
      category: "conceptual",
      source: "conceptual",
      x: LANE_X.control,
      y: entry.y,
      detail: entry.detail
    });
  }

  const deploymentExists = state?.deployment.exists ?? false;
  const desiredReplicas = state?.deployment.replicas ?? 0;
  const readyReplicas = state?.deployment.ready_replicas ?? 0;
  const availableReplicas = state?.deployment.available_replicas ?? 0;
  const serviceExists = state?.service.exists ?? false;
  const serviceIp = state?.service.cluster_ip ?? "n/a";
  const servicePorts = state?.service.ports.map((port) => `${port.port}/${port.protocol}`).join(", ") || "n/a";

  const allPods = sortPods(state?.pods ?? []);
  const podDisplay = clampPodsForPresentation(allPods, MAX_PODS_RENDERED);
  const pods = podDisplay.visiblePods;
  const omittedPodCount = podDisplay.omittedCount;

  const observedReplicaSets = Array.from(new Set(allPods.map((pod) => podReplicaSetName(pod.name))));

  pushNode({
    id: "dep",
    label: `Deployment\n${state?.deployment.name ?? "demo-app"}`,
    category: "live-resource",
    source: "live",
    x: LANE_X.desired,
    y: 155,
    detail: deploymentExists ? "Live discovered object." : "Missing from current live state.",
    metadata: [
      `exists: ${deploymentExists}`,
      `desired replicas: ${desiredReplicas}`,
      `ready replicas: ${readyReplicas}`,
      `available replicas: ${availableReplicas}`
    ]
  });

  pushNode({
    id: "rs",
    label: "ReplicaSet\n(live inferred)",
    category: "live-resource",
    source: "live",
    x: LANE_X.desired,
    y: 270,
    detail: "Observed from pod ownership naming; direct ReplicaSet watch is not exposed by backend yet.",
    metadata: [
      `observed sets: ${observedReplicaSets.length || 0}`,
      `pod objects (all): ${allPods.length}`,
      `pods rendered in graph: ${pods.length}${omittedPodCount > 0 ? ` (+${omittedPodCount} omitted)` : ""}`,
      ...(observedReplicaSets.length ? observedReplicaSets.map((name) => `- ${name}`) : ["- none observed"])
    ]
  });

  pushNode({
    id: "svc",
    label: `Service\n${state?.service.name ?? "demo-app"}`,
    category: "live-resource",
    source: "live",
    x: LANE_X.desired,
    y: 385,
    detail: "Routes traffic to Ready pods only.",
    metadata: [`exists: ${serviceExists}`, `cluster IP: ${serviceIp}`, `ports: ${servicePorts}`]
  });

  pushEdge({
    id: "cp-api-etcd",
    source: "cp-apiserver",
    target: "cp-etcd",
    label: "store object state",
    kind: "conceptual-control",
    sourceType: "conceptual"
  });
  pushEdge({
    id: "cp-api-controller",
    source: "cp-apiserver",
    target: "cp-controller-manager",
    label: "watch + reconcile",
    kind: "conceptual-control",
    sourceType: "conceptual"
  });
  pushEdge({
    id: "cp-api-scheduler",
    source: "cp-apiserver",
    target: "cp-scheduler",
    label: "pending pod queue",
    kind: "conceptual-control",
    sourceType: "conceptual"
  });
  pushEdge({
    id: "cp-controller-dep",
    source: "cp-controller-manager",
    target: "dep",
    label: "reconciliation loop",
    kind: "reconciliation",
    sourceType: "conceptual"
  });
  pushEdge({
    id: "cp-controller-rs",
    source: "cp-controller-manager",
    target: "rs",
    label: "manage replicas",
    kind: "reconciliation",
    sourceType: "conceptual"
  });
  pushEdge({
    id: "dep-rs",
    source: "dep",
    target: "rs",
    label: "owns",
    kind: "ownership",
    sourceType: "live"
  });

  const workerNodes = (state?.nodes ?? []).filter(isWorkerNode);
  const workers = workerNodes.length
    ? workerNodes
    : [
        {
          name: "worker (discovery pending)",
          role: "worker",
          ready: false,
          labels: {}
        } as NodeState
      ];

  const podsByWorker = new Map<string, PodState[]>();
  for (const pod of pods) {
    const nodeName = pod.node_name ?? "unscheduled";
    const existing = podsByWorker.get(nodeName) ?? [];
    existing.push(pod);
    podsByWorker.set(nodeName, existing);
  }

  for (const podNodeName of podsByWorker.keys()) {
    if (!workers.find((worker) => worker.name === podNodeName)) {
      workers.push({
        name: podNodeName,
        role: "worker",
        ready: false,
        labels: {}
      } as NodeState);
    }
  }

  const workerYStart = 160;
  const workerYGap = 220;

  let lastWorkerY = workerYStart;

  for (const [index, worker] of workers.entries()) {
    const roles = (worker.roles ?? [worker.role]).join(", ");
    const workerNodeId = `worker:${worker.name}`;
    const workerY = workerYStart + index * workerYGap;
    lastWorkerY = workerY;

    pushNode({
      id: workerNodeId,
      label: `Worker\n${worker.name}`,
      category: "live-node",
      source: "live",
      x: LANE_X.workers,
      y: workerY,
      detail: "Live discovered node metadata.",
      metadata: [`ready: ${worker.ready}`, `roles: ${roles}`, `kubelet: ${worker.kubelet_version ?? "unknown"}`]
    });

    pushEdge({
      id: `sched-node-${worker.name}`,
      source: "cp-scheduler",
      target: workerNodeId,
      label: "assign pending pods",
      kind: "scheduling",
      sourceType: "conceptual"
    });

    const workerPods = sortPods(podsByWorker.get(worker.name) ?? []);
    const podCount = workerPods.length;

    for (const [podIndex, pod] of workerPods.entries()) {
      const podId = `pod:${pod.name}`;
      const readiness = pod.ready ? "Ready" : "Not Ready";
      const offset = (podIndex - (podCount - 1) / 2) * 74;
      const podY = workerY + offset;

      pushNode({
        id: podId,
        label: `Pod\n${pod.name}`,
        category: "live-workload",
        source: "live",
        x: LANE_X.pods,
        y: podY,
        detail: "Live discovered workload state.",
        metadata: [
          `phase: ${pod.phase ?? "unknown"}`,
          `readiness: ${readiness}`,
          `image: ${pod.image ?? "unknown"}`,
          `node: ${pod.node_name ?? "unscheduled"}`,
          `restarts: ${pod.restart_count}`
        ]
      });

      pushEdge({
        id: `rs-pod-${pod.name}`,
        source: "rs",
        target: podId,
        label: "creates/manages",
        kind: "ownership",
        sourceType: "live"
      });
      pushEdge({
        id: `node-pod-${pod.name}`,
        source: workerNodeId,
        target: podId,
        label: "runs on",
        kind: "placement",
        sourceType: "live"
      });
      pushEdge({
        id: `svc-pod-${pod.name}`,
        source: "svc",
        target: podId,
        label: pod.ready ? "traffic allowed" : "traffic blocked",
        kind: pod.ready ? "traffic-ready" : "traffic-blocked",
        sourceType: "live"
      });
    }
  }

  if (omittedPodCount > 0) {
    pushNode({
      id: "pod-overflow",
      label: `Additional Pods\n+${omittedPodCount} omitted`,
      category: "live-workload",
      source: "live",
      x: LANE_X.pods,
      y: lastWorkerY + 150,
      detail: "Graph intentionally caps pod nodes for projector readability.",
      metadata: [`total pods observed: ${allPods.length}`, `pods drawn in graph: ${pods.length}`]
    });

    pushEdge({
      id: "rs-overflow",
      source: "rs",
      target: "pod-overflow",
      label: "more pods",
      kind: "ownership",
      sourceType: "live"
    });
  }

  const filteredEdges = edges.filter((edge) => allowedKinds.has(edge.kind));

  const alwaysVisible = new Set(["section-control", "section-desired", "section-workers", "section-pods"]);
  const visibleNodeIds = new Set<string>(alwaysVisible);

  for (const edge of filteredEdges) {
    visibleNodeIds.add(edge.source);
    visibleNodeIds.add(edge.target);
  }

  const visibleNodes = nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .sort((a, b) => {
      if (a.isSection && !b.isSection) {
        return -1;
      }
      if (!a.isSection && b.isSection) {
        return 1;
      }
      return a.y - b.y || a.label.localeCompare(b.label);
    });

  const visibleNodeMap: Record<string, GraphNodeData> = {};
  for (const node of visibleNodes) {
    visibleNodeMap[node.id] = node;
  }

  return {
    nodes: visibleNodes,
    edges: filteredEdges,
    nodeMap: visibleNodeMap
  };
}
