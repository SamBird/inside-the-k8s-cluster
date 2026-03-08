import ELK from "elkjs/lib/elk.bundled.js";
import { MarkerType, Position } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";

import { ClusterState, NodeState, PodState } from "./types";

const elk = new ELK();

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

type ClusterGraphLane = "control" | "desired" | "workers" | "workloads";

const LANE_X: Record<ClusterGraphLane, number> = {
  control: 20,
  desired: 300,
  workers: 560,
  workloads: 840
};

const LANE_MIN_Y: Record<ClusterGraphLane, number> = {
  control: 90,
  desired: 100,
  workers: 120,
  workloads: 100
};

const LANE_GAP: Record<ClusterGraphLane, number> = {
  control: 92,
  desired: 108,
  workers: 120,
  workloads: 82
};

interface NodeDimensions {
  width: number;
  height: number;
}

function nodeDimensions(category: ClusterGraphNodeCategory): NodeDimensions {
  if (category === "group") {
    return { width: 240, height: 40 };
  }
  if (category === "conceptual") {
    return { width: 210, height: 64 };
  }
  if (category === "live-node") {
    return { width: 230, height: 68 };
  }
  if (category === "live-workload") {
    return { width: 210, height: 70 };
  }
  return { width: 220, height: 70 };
}

function nodeStyle(category: ClusterGraphNodeCategory): Node["style"] {
  const dims = nodeDimensions(category);

  if (category === "group") {
    return {
      width: dims.width,
      border: "none",
      background: "transparent",
      color: "#1b3a4b",
      fontWeight: 800,
      fontSize: "0.95rem",
      boxShadow: "none",
      padding: 0,
      pointerEvents: "none"
    };
  }

  if (category === "conceptual") {
    return {
      width: dims.width,
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
      width: dims.width,
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
      width: dims.width,
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
    width: dims.width,
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
      baseOffset: 22
    };
  }

  if (kind === "reconciliation") {
    return {
      style: { stroke: "#d48a00", strokeDasharray: "6 4", strokeWidth: 2 },
      markerColor: "#d48a00",
      animated: true,
      baseOffset: 34
    };
  }

  if (kind === "scheduling") {
    return {
      style: { stroke: "#7d6f00", strokeDasharray: "5 4", strokeWidth: 2 },
      markerColor: "#7d6f00",
      baseOffset: 40
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
      baseOffset: 52
    };
  }

  if (kind === "traffic-blocked") {
    return {
      style: { stroke: "#c03a2b", strokeDasharray: "5 4", strokeWidth: 2 },
      markerColor: "#c03a2b",
      baseOffset: 56
    };
  }

  return {
    style: { stroke: "#2d6f95", strokeWidth: 2 },
    markerColor: "#2d6f95",
    baseOffset: 24
  };
}

function edgeOffsetForId(id: string, baseOffset: number): number {
  let hash = 0;
  for (const character of id) {
    hash = (hash << 5) - hash + character.charCodeAt(0);
    hash |= 0;
  }
  return baseOffset + (Math.abs(hash) % 4) * 8;
}

function nodeLane(id: string): ClusterGraphLane {
  if (id.startsWith("cp-")) {
    return "control";
  }
  if (id === "dep" || id === "rs" || id === "svc") {
    return "desired";
  }
  if (id.startsWith("worker:")) {
    return "workers";
  }
  return "workloads";
}

function laneOrder(id: string): number {
  const fixedOrder: Record<string, number> = {
    "cp-apiserver": 1,
    "cp-etcd": 2,
    "cp-controller-manager": 3,
    "cp-scheduler": 4,
    dep: 1,
    rs: 2,
    svc: 3,
    "pod-overflow": 999
  };

  if (fixedOrder[id] !== undefined) {
    return fixedOrder[id];
  }

  return 100;
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

function createNode(id: string, data: ClusterGraphNodeData): Node<ClusterGraphNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data,
    draggable: false,
    selectable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: nodeStyle(data.category)
  };
}

function createGroupNode(id: string, label: string, x: number): Node<ClusterGraphNodeData> {
  return {
    id,
    position: { x, y: 20 },
    data: {
      label,
      category: "group",
      source: "conceptual"
    },
    draggable: false,
    selectable: false,
    style: nodeStyle("group")
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
      borderRadius: 16
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

interface ClusterGraphShape {
  nodes: Node<ClusterGraphNodeData>[];
  edges: Edge<ClusterGraphEdgeData>[];
}

function baseGraphFromState(state: ClusterState | null): ClusterGraphShape {
  const nodes: Node<ClusterGraphNodeData>[] = [];
  const edges: Edge<ClusterGraphEdgeData>[] = [];

  const conceptualNodes: Array<{ id: string; label: string; detail: string }> = [
    {
      id: "cp-apiserver",
      label: "kube-apiserver",
      detail: "Validates requests and persists object changes."
    },
    {
      id: "cp-etcd",
      label: "etcd",
      detail: "Stores desired and current cluster object state."
    },
    {
      id: "cp-controller-manager",
      label: "kube-controller-manager",
      detail: "Runs reconciliation loops for Deployment/ReplicaSet behavior."
    },
    {
      id: "cp-scheduler",
      label: "kube-scheduler",
      detail: "Assigns pending Pods to worker nodes."
    }
  ];

  for (const entry of conceptualNodes) {
    nodes.push(
      createNode(entry.id, {
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
    createNode("dep", {
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
    createNode("rs", {
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
    createNode("svc", {
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

  const scheduledWorkerNodes = new Set<string>();
  for (const worker of workers) {
    const roles = (worker.roles ?? [worker.role]).join(", ");
    const workerNodeId = `worker:${worker.name}`;

    nodes.push(
      createNode(workerNodeId, {
        label: `Worker\n${worker.name}`,
        category: "live-node",
        source: "live",
        detail: "Live discovered node metadata.",
        metadata: [`ready: ${worker.ready}`, `roles: ${roles}`, `kubelet: ${worker.kubelet_version ?? "unknown"}`]
      })
    );

    if (!scheduledWorkerNodes.has(workerNodeId)) {
      edges.push(
        createEdge(
          `sched-node-${worker.name}`,
          "cp-scheduler",
          workerNodeId,
          "assign pending pods to node",
          "scheduling",
          "conceptual"
        )
      );
      scheduledWorkerNodes.add(workerNodeId);
    }
  }

  const knownWorkers = new Set(workers.map((worker) => worker.name));
  for (const pod of pods) {
    const podId = `pod:${pod.name}`;
    const nodeName = pod.node_name ?? "unscheduled";
    const workerNodeId = `worker:${nodeName}`;
    const readiness = pod.ready ? "Ready" : "Not Ready";

    if (!knownWorkers.has(nodeName)) {
      knownWorkers.add(nodeName);
      nodes.push(
        createNode(workerNodeId, {
          label: `Worker\n${nodeName}`,
          category: "live-node",
          source: "live",
          detail: "Node label inferred from pod placement.",
          metadata: ["ready: unknown", "roles: unknown"]
        })
      );

      edges.push(
        createEdge(
          `sched-node-${nodeName}`,
          "cp-scheduler",
          workerNodeId,
          "assign pending pods to node",
          "scheduling",
          "conceptual"
        )
      );
    }

    nodes.push(
      createNode(podId, {
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
      createEdge(`node-pod-${pod.name}`, workerNodeId, podId, "runs on", "placement", "live"),
      createEdge(
        `svc-pod-${pod.name}`,
        "svc",
        podId,
        pod.ready ? "traffic allowed (Ready)" : "traffic blocked (Not Ready)",
        pod.ready ? "traffic-ready" : "traffic-blocked",
        "live"
      )
    );
  }

  if (omittedPodCount > 0) {
    nodes.push(
      createNode("pod-overflow", {
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

async function layoutGraphNodes(nodes: Node<ClusterGraphNodeData>[], edges: Edge<ClusterGraphEdgeData>[]): Promise<Node<ClusterGraphNodeData>[]> {
  const elkChildren = nodes.map((node) => {
    const dims = nodeDimensions(node.data.category);

    return {
      id: node.id,
      width: dims.width,
      height: dims.height
    };
  });

  const elkGraph = {
    id: "cluster-graph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.nodeNodeBetweenLayers": "140",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP"
    },
    children: elkChildren,
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target]
    }))
  };

  const layout = await elk.layout(elkGraph);
  const positions = new Map(
    (layout.children ?? []).map((child) => [
      child.id,
      {
        x: child.x ?? 0,
        y: child.y ?? 0
      }
    ])
  );

  const positioned = nodes.map((node) => {
    const pos = positions.get(node.id) ?? { x: 0, y: 0 };
    return {
      ...node,
      position: {
        x: pos.x,
        y: pos.y + 70
      }
    };
  });

  for (const lane of ["control", "desired", "workers", "workloads"] as ClusterGraphLane[]) {
    const laneNodes = positioned
      .filter((node) => nodeLane(node.id) === lane)
      .sort((a, b) => {
        const orderA = laneOrder(a.id);
        const orderB = laneOrder(b.id);

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return a.position.y - b.position.y;
      });

    const firstY = laneNodes.length > 0 ? laneNodes[0].position.y : 0;
    let cursorY = LANE_MIN_Y[lane];
    for (const laneNode of laneNodes) {
      laneNode.position.x = LANE_X[lane];
      const normalizedY = LANE_MIN_Y[lane] + (laneNode.position.y - firstY);
      laneNode.position.y = Math.max(normalizedY, cursorY);
      cursorY = laneNode.position.y + LANE_GAP[lane];
    }
  }

  return positioned;
}

function groupNodes(): Node<ClusterGraphNodeData>[] {
  return [
    createGroupNode("group-control", "Control Plane (Conceptual Teaching Layer)", LANE_X.control),
    createGroupNode("group-desired", "Desired-State Resources (Live Objects)", LANE_X.desired),
    createGroupNode("group-workers", "Worker Nodes + Running Workloads (Live Objects)", LANE_X.workers)
  ];
}

export async function buildClusterGraph(state: ClusterState | null): Promise<ClusterGraphShape> {
  const baseGraph = baseGraphFromState(state);
  const positionedNodes = await layoutGraphNodes(baseGraph.nodes, baseGraph.edges);

  return {
    nodes: [...groupNodes(), ...positionedNodes],
    edges: baseGraph.edges
  };
}
