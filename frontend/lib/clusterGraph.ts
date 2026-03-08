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
      width: 280,
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
      width: 240,
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
      width: 260,
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
      width: 240,
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
    width: 250,
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

function edgeStyle(kind: ClusterGraphEdgeKind): { style: Edge["style"]; markerColor: string; animated?: boolean } {
  if (kind === "conceptual-control") {
    return {
      style: { stroke: "#915f00", strokeDasharray: "6 4", strokeWidth: 2 },
      markerColor: "#915f00"
    };
  }
  if (kind === "reconciliation") {
    return {
      style: { stroke: "#d48a00", strokeDasharray: "6 4", strokeWidth: 2 },
      markerColor: "#d48a00",
      animated: true
    };
  }
  if (kind === "scheduling") {
    return {
      style: { stroke: "#7d6f00", strokeDasharray: "5 4", strokeWidth: 2 },
      markerColor: "#7d6f00"
    };
  }
  if (kind === "placement") {
    return {
      style: { stroke: "#1f9d6a", strokeWidth: 2 },
      markerColor: "#1f9d6a"
    };
  }
  if (kind === "traffic-ready") {
    return {
      style: { stroke: "#168b5f", strokeWidth: 2.4 },
      markerColor: "#168b5f",
      animated: true
    };
  }
  if (kind === "traffic-blocked") {
    return {
      style: { stroke: "#c03a2b", strokeDasharray: "5 4", strokeWidth: 2 },
      markerColor: "#c03a2b"
    };
  }

  return {
    style: { stroke: "#2d6f95", strokeWidth: 2 },
    markerColor: "#2d6f95"
  };
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
  };
}

export function buildClusterGraph(state: ClusterState | null): {
  nodes: Node<ClusterGraphNodeData>[];
  edges: Edge<ClusterGraphEdgeData>[];
} {
  const nodes: Node<ClusterGraphNodeData>[] = [];
  const edges: Edge<ClusterGraphEdgeData>[] = [];

  nodes.push(
    createNode("group-control", 40, 20, {
      label: "Control Plane (Conceptual Teaching Layer)",
      category: "group",
      source: "conceptual"
    }),
    createNode("group-desired", 390, 20, {
      label: "Desired-State Resources (Live Objects)",
      category: "group",
      source: "live"
    }),
    createNode("group-workers", 760, 20, {
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
      createNode(entry.id, 40, entry.y, {
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
  const pods = sortPods(state?.pods ?? []);
  const observedReplicaSets = Array.from(new Set(pods.map((pod) => podReplicaSetName(pod.name))));

  nodes.push(
    createNode("dep", 420, 110, {
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
    createNode("rs", 420, 290, {
      label: "ReplicaSet (live)",
      category: "live-resource",
      source: "live",
      detail: "Observed from pod ownership naming; detailed RS watch is not currently exposed by backend.",
      metadata: [
        `observed sets: ${observedReplicaSets.length || 0}`,
        ...(observedReplicaSets.length ? observedReplicaSets.map((name) => `- ${name}`) : ["- none observed"])
      ]
    }),
    createNode("svc", 420, 470, {
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

  const workerYBase = 110;
  const workerSpacing = 170;
  const workerNodeY = new Map<string, number>();
  for (let index = 0; index < workers.length; index += 1) {
    const worker = workers[index];
    const y = workerYBase + index * workerSpacing;
    const roles = (worker.roles ?? [worker.role]).join(", ");
    workerNodeY.set(worker.name, y);
    nodes.push(
      createNode(`worker:${worker.name}`, 770, y, {
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

  for (const [nodeName, nodePods] of podsByNode.entries()) {
    let anchorNodeId = `worker:${nodeName}`;
    let anchorY = workerNodeY.get(nodeName);

    if (!anchorY) {
      anchorY = workerYBase + workers.length * workerSpacing;
      workerNodeY.set(nodeName, anchorY);
      anchorNodeId = `worker:${nodeName}`;
      nodes.push(
        createNode(anchorNodeId, 770, anchorY, {
          label: `Worker\n${nodeName}`,
          category: "live-node",
          source: "live",
          detail: "Node label inferred from pod placement.",
          metadata: ["ready: unknown", "roles: unknown"]
        })
      );
    }

    nodePods.forEach((pod, podIndex) => {
      const podId = `pod:${pod.name}`;
      const podY = anchorY + podIndex * 82;
      const readiness = pod.ready ? "Ready" : "Not Ready";
      nodes.push(
        createNode(podId, 1110, podY, {
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
          `sched-pod-${pod.name}`,
          "cp-scheduler",
          podId,
          "assign node",
          "scheduling",
          "conceptual"
        ),
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

  return { nodes, edges };
}
