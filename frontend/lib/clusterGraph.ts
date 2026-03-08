import { MarkerType } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";

import { ClusterState, NodeState, PodState } from "./types";

export type ClusterGraphNodeCategory =
  | "group"
  | "conceptual"
  | "live-resource"
  | "live-node"
  | "live-workload";

export type ClusterGraphEdgeKind =
  | "conceptual-control"
  | "reconciliation"
  | "ownership"
  | "scheduling"
  | "placement"
  | "traffic-ready"
  | "traffic-blocked";

export interface ClusterGraphNodeData {
  [key: string]: unknown;
  label: string;
  category: ClusterGraphNodeCategory;
  source: "conceptual" | "live";
  detail?: string;
  metadata?: string[];
}

export interface ClusterGraphEdgeData {
  [key: string]: unknown;
  kind: ClusterGraphEdgeKind;
  source: "conceptual" | "live";
  detail?: string;
}

function nodeStyle(category: ClusterGraphNodeCategory): Node["style"] {
  if (category === "group") {
    return {
      width: 240,
      border: "none",
      background: "transparent",
      color: "#1b3a4b",
      fontWeight: 800,
      fontSize: "0.95rem",
      boxShadow: "none",
      padding: 0
    };
  }

  if (category === "conceptual") {
    return {
      width: 210,
      border: "2px dashed #915f00",
      borderRadius: 12,
      background: "#fff6de",
      color: "#2b2f32",
      fontWeight: 700,
      padding: "10px 12px",
      lineHeight: 1.3,
      whiteSpace: "pre-line",
      fontSize: "0.9rem"
    };
  }

  if (category === "live-node") {
    return {
      width: 230,
      border: "2px solid #2f8e63",
      borderRadius: 12,
      background: "#e8f7ef",
      color: "#143627",
      fontWeight: 700,
      padding: "10px 12px",
      whiteSpace: "pre-line",
      fontSize: "0.9rem"
    };
  }

  if (category === "live-workload") {
    return {
      width: 210,
      border: "2px solid #2d6f95",
      borderRadius: 12,
      background: "#eef7ff",
      color: "#173446",
      fontWeight: 700,
      padding: "10px 12px",
      whiteSpace: "pre-line",
      fontSize: "0.9rem"
    };
  }

  return {
    width: 220,
    border: "2px solid #5f4a91",
    borderRadius: 12,
    background: "#f2ecff",
    color: "#2b2052",
    fontWeight: 700,
    padding: "10px 12px",
    whiteSpace: "pre-line",
    fontSize: "0.9rem"
  };
}

function edgeStyle(kind: ClusterGraphEdgeKind): {
  style: Edge["style"];
  markerColor: string;
  animated?: boolean;
  baseOffset: number;
} {
  if (kind === "conceptual-control") {
    return {
      style: { stroke: "#915f00", strokeDasharray: "6 4", strokeWidth: 2 },
      markerColor: "#915f00",
      baseOffset: 24
    };
  }
  if (kind === "reconciliation") {
    return {
      style: { stroke: "#d48a00", strokeDasharray: "6 4", strokeWidth: 2 },
      markerColor: "#d48a00",
      animated: true,
      baseOffset: 38
    };
  }
  if (kind === "scheduling") {
    return {
      style: { stroke: "#7d6f00", strokeDasharray: "5 4", strokeWidth: 2 },
      markerColor: "#7d6f00",
      baseOffset: 44
    };
  }
  if (kind === "placement") {
    return {
      style: { stroke: "#1f9d6a", strokeWidth: 2 },
      markerColor: "#1f9d6a",
      baseOffset: 12
    };
  }
  if (kind === "traffic-ready") {
    return {
      style: { stroke: "#168b5f", strokeWidth: 2.4 },
      markerColor: "#168b5f",
      animated: true,
      baseOffset: 56
    };
  }
  if (kind === "traffic-blocked") {
    return {
      style: { stroke: "#c03a2b", strokeDasharray: "5 4", strokeWidth: 2 },
      markerColor: "#c03a2b",
      baseOffset: 60
    };
  }

  return {
    style: { stroke: "#2d6f95", strokeWidth: 2 },
    markerColor: "#2d6f95",
    baseOffset: 28
  };
}

function edgeOffsetForId(id: string, baseOffset: number): number {
  let hash = 0;
  for (const character of id) {
    hash = (hash << 5) - hash + character.charCodeAt(0);
    hash |= 0;
  }
  return baseOffset + (Math.abs(hash) % 4) * 9;
}

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

function createNode(
  id: string,
  x: number,
  y: number,
  data: ClusterGraphNodeData
): Node<ClusterGraphNodeData> {
  return {
    id,
    position: { x, y },
    data,
    draggable: false,
    selectable: true,
    style: nodeStyle(data.category)
  };
}

function createEdge(
  id: string,
  source: string,
  target: string,
  label: string,
  kind: ClusterGraphEdgeKind,
  sourceType: "conceptual" | "live"
): Edge<ClusterGraphEdgeData> {
  const styled = edgeStyle(kind);
  return {
    id,
    source,
    target,
    label,
    type: "smoothstep",
    pathOptions: {
      offset: edgeOffsetForId(id, styled.baseOffset),
      borderRadius: 18
    },
    animated: styled.animated,
    style: styled.style,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: styled.markerColor
    },
    data: {
      kind,
      source: sourceType
    }
  } as Edge<ClusterGraphEdgeData>;
}

export function buildClusterGraph(state: ClusterState | null): {
  nodes: Node<ClusterGraphNodeData>[];
  edges: Edge<ClusterGraphEdgeData>[];
} {
  const nodes: Node<ClusterGraphNodeData>[] = [];
  const edges: Edge<ClusterGraphEdgeData>[] = [];

  nodes.push(
    createNode("group-control", 20, 20, {
      label: "Control Plane (Conceptual Teaching Layer)",
      category: "group",
      source: "conceptual"
    }),
    createNode("group-desired", 280, 20, {
      label: "Desired-State Resources (Live Objects)",
      category: "group",
      source: "live"
    }),
    createNode("group-workers", 560, 20, {
      label: "Worker Nodes + Running Workloads (Live Objects)",
      category: "group",
      source: "live"
    })
  );

  const conceptualNodes: Array<{ id: string; y: number; label: string; detail: string }> = [
    {
      id: "cp-apiserver",
      y: 90,
      label: "kube-apiserver",
      detail: "Validates requests and persists object changes."
    },
    {
      id: "cp-etcd",
      y: 220,
      label: "etcd",
      detail: "Stores desired and current cluster object state."
    },
    {
      id: "cp-controller-manager",
      y: 350,
      label: "kube-controller-manager",
      detail: "Runs reconciliation loops for Deployment/ReplicaSet behavior."
    },
    {
      id: "cp-scheduler",
      y: 480,
      label: "kube-scheduler",
      detail: "Assigns pending Pods to worker nodes."
    }
  ];

  for (const entry of conceptualNodes) {
    nodes.push(
      createNode(entry.id, 20, entry.y, {
        label: entry.label,
        category: "conceptual",
        source: "conceptual",
        detail: entry.detail
      })
    );
  }

  const deploymentExists = state?.deployment.exists ?? false;
  const desiredReplicas = state?.deployment.replicas ?? 0;
  const readyReplicas = state?.deployment.ready_replicas ?? 0;
  const availableReplicas = state?.deployment.available_replicas ?? 0;
  const serviceExists = state?.service.exists ?? false;
  const serviceIp = state?.service.cluster_ip ?? "n/a";
  const servicePorts = state?.service.ports.map((port) => `${port.port}/${port.protocol}`).join(", ") || "n/a";
  const allPods = sortPods(state?.pods ?? []);
  const podDisplay = clampPodsForPresentation(allPods, 8);
  const pods = podDisplay.visiblePods;
  const omittedPodCount = podDisplay.omittedCount;
  const observedReplicaSets = Array.from(new Set(allPods.map((pod) => podReplicaSetName(pod.name))));

  nodes.push(
    createNode("dep", 300, 110, {
      label: `Deployment\n${state?.deployment.name ?? "demo-app"}`,
      category: "live-resource",
      source: "live",
      detail: deploymentExists ? "Live discovered object." : "Missing from current live state.",
      metadata: [
        `exists: ${deploymentExists}`,
        `desired replicas: ${desiredReplicas}`,
        `ready replicas: ${readyReplicas}`,
        `available replicas: ${availableReplicas}`
      ]
    }),
    createNode("rs", 300, 290, {
      label: "ReplicaSet (live)",
      category: "live-resource",
      source: "live",
      detail: "Observed from pod ownership naming; detailed RS watch is not currently exposed by backend.",
      metadata: [
        `observed sets: ${observedReplicaSets.length || 0}`,
        `pod objects (all): ${allPods.length}`,
        `pods rendered in graph: ${pods.length}${omittedPodCount > 0 ? ` (+${omittedPodCount} omitted)` : ""}`,
        ...(observedReplicaSets.length ? observedReplicaSets.map((name) => `- ${name}`) : ["- none observed"])
      ]
    }),
    createNode("svc", 300, 470, {
      label: `Service\n${state?.service.name ?? "demo-app"}`,
      category: "live-resource",
      source: "live",
      detail: "Routes traffic to Ready pods only.",
      metadata: [`exists: ${serviceExists}`, `cluster IP: ${serviceIp}`, `ports: ${servicePorts}`]
    })
  );

  edges.push(
    createEdge("cp-api-etcd", "cp-apiserver", "cp-etcd", "store object state", "conceptual-control", "conceptual"),
    createEdge("cp-api-controller", "cp-apiserver", "cp-controller-manager", "watch + reconcile", "conceptual-control", "conceptual"),
    createEdge("cp-api-scheduler", "cp-apiserver", "cp-scheduler", "pending pod queue", "conceptual-control", "conceptual"),
    createEdge("cp-controller-dep", "cp-controller-manager", "dep", "reconciliation loop", "reconciliation", "conceptual"),
    createEdge("cp-controller-rs", "cp-controller-manager", "rs", "manage replicas", "reconciliation", "conceptual"),
    createEdge("dep-rs", "dep", "rs", "owns", "ownership", "live")
  );

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

  const workerYBase = 120;
  const workerSpacing = 160;
  const workerNodeY = new Map<string, number>();
  for (let index = 0; index < workers.length; index += 1) {
    const worker = workers[index];
    const y = workerYBase + index * workerSpacing;
    const roles = (worker.roles ?? [worker.role]).join(", ");
    workerNodeY.set(worker.name, y);
    nodes.push(
      createNode(`worker:${worker.name}`, 560, y, {
        label: `Worker\n${worker.name}`,
        category: "live-node",
        source: "live",
        detail: "Live discovered node metadata.",
        metadata: [`ready: ${worker.ready}`, `roles: ${roles}`, `kubelet: ${worker.kubelet_version ?? "unknown"}`]
      })
    );
  }

  const podsByNode = new Map<string, PodState[]>();
  for (const pod of pods) {
    const nodeName = pod.node_name ?? "unscheduled";
    if (!podsByNode.has(nodeName)) {
      podsByNode.set(nodeName, []);
    }
    podsByNode.get(nodeName)?.push(pod);
  }

  const scheduledWorkerNodes = new Set<string>();
  for (const [nodeName, nodePods] of podsByNode.entries()) {
    let anchorNodeId = `worker:${nodeName}`;
    let anchorY = workerNodeY.get(nodeName);

    if (!anchorY) {
      anchorY = workerYBase + workers.length * workerSpacing;
      workerNodeY.set(nodeName, anchorY);
      anchorNodeId = `worker:${nodeName}`;
      nodes.push(
        createNode(anchorNodeId, 560, anchorY, {
          label: `Worker\n${nodeName}`,
          category: "live-node",
          source: "live",
          detail: "Node label inferred from pod placement.",
          metadata: ["ready: unknown", "roles: unknown"]
        })
      );
    }

    if (!scheduledWorkerNodes.has(anchorNodeId)) {
      edges.push(
        createEdge(
          `sched-node-${nodeName}`,
          "cp-scheduler",
          anchorNodeId,
          "assign pending pods to node",
          "scheduling",
          "conceptual"
        )
      );
      scheduledWorkerNodes.add(anchorNodeId);
    }

    nodePods.forEach((pod, podIndex) => {
      const podId = `pod:${pod.name}`;
      const podY = anchorY + podIndex * 78;
      const readiness = pod.ready ? "Ready" : "Not Ready";
      nodes.push(
        createNode(podId, 820, podY, {
          label: `Pod\n${pod.name}`,
          category: "live-workload",
          source: "live",
          detail: "Live discovered workload state.",
          metadata: [
            `phase: ${pod.phase ?? "unknown"}`,
            `readiness: ${readiness}`,
            `image: ${pod.image ?? "unknown"}`,
            `restarts: ${pod.restart_count}`
          ]
        })
      );

      edges.push(
        createEdge(`rs-pod-${pod.name}`, "rs", podId, "creates/manages", "ownership", "live"),
        createEdge(`node-pod-${pod.name}`, anchorNodeId, podId, "runs on", "placement", "live"),
        createEdge(
          `svc-pod-${pod.name}`,
          "svc",
          podId,
          pod.ready ? "traffic allowed (Ready)" : "traffic blocked (Not Ready)",
          pod.ready ? "traffic-ready" : "traffic-blocked",
          "live"
        )
      );
    });
  }

  if (omittedPodCount > 0) {
    const overflowY = workerYBase + workers.length * workerSpacing + 120;
    nodes.push(
      createNode("pod-overflow", 820, overflowY, {
        label: `Additional Pods\n+${omittedPodCount} omitted`,
        category: "live-workload",
        source: "live",
        detail: "Graph intentionally caps pod nodes for projector readability. Full pod list is available in Workload Resources panel.",
        metadata: [`total pods observed: ${allPods.length}`, `pods drawn in graph: ${pods.length}`]
      })
    );
    edges.push(createEdge("rs-overflow", "rs", "pod-overflow", "more pods", "ownership", "live"));
  }

  return { nodes, edges };
}
