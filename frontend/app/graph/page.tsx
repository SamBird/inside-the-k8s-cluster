"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Background,
  Controls,
  Edge,
  Node,
  ReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { PageNav } from "../../components/PageNav";
import { getState, subscribeToState } from "../../lib/api";
import {
  buildClusterGraph,
  ClusterGraphEdgeData,
  ClusterGraphEdgeKind,
  ClusterGraphNodeData
} from "../../lib/clusterGraph";
import { ClusterState, ConnectionState } from "../../lib/types";

function metadataForNode(node: Node<ClusterGraphNodeData> | undefined): string[] {
  if (!node) {
    return [];
  }
  return node.data.metadata ?? [];
}

type GraphFocusMode = "overview" | "control-loop" | "traffic-readiness";

const focusModeConfig: Record<
  GraphFocusMode,
  {
    label: string;
    description: string;
    edgeKinds: ClusterGraphEdgeKind[];
  }
> = {
  overview: {
    label: "Overview",
    description: "Clean default view of control-plane, ownership, and placement relationships.",
    edgeKinds: [
      "conceptual-control",
      "reconciliation",
      "ownership",
      "placement"
    ]
  },
  "control-loop": {
    label: "Control Loop",
    description: "Focus on desired-state and reconciliation paths (de-emphasizes service traffic).",
    edgeKinds: ["conceptual-control", "reconciliation", "ownership", "scheduling", "placement"]
  },
  "traffic-readiness": {
    label: "Traffic + Readiness",
    description: "Focus on service routing to ready/unready pods and node placement.",
    edgeKinds: ["ownership", "placement", "traffic-ready", "traffic-blocked"]
  }
};

export default function ClusterGraphPage() {
  const [state, setState] = useState<ClusterState | null>(null);
  const [graph, setGraph] = useState<{
    nodes: Node<ClusterGraphNodeData>[];
    edges: Edge<ClusterGraphEdgeData>[];
  }>({
    nodes: [],
    edges: []
  });
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<GraphFocusMode>("overview");

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const initial = await getState();
        if (cancelled) {
          return;
        }
        setState(initial);
        setConnection("live");
      } catch {
        if (cancelled) {
          return;
        }
        setConnection("degraded");
      }
    };

    bootstrap();

    const unsubscribe = subscribeToState({
      onState: (incoming) => {
        setState(incoming);
        setConnection("live");
      },
      onError: () => {
        setConnection("degraded");
      },
      onOpen: () => {
        setConnection("live");
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyLayout = async () => {
      try {
        const nextGraph = await buildClusterGraph(state);
        if (cancelled) {
          return;
        }
        setGraph(nextGraph);
      } catch {
        if (cancelled) {
          return;
        }
        setGraph({ nodes: [], edges: [] });
      }
    };

    applyLayout();
    return () => {
      cancelled = true;
    };
  }, [state]);

  const activeFocus = focusModeConfig[focusMode];

  const filteredEdges = useMemo(() => {
    const allowedKinds = new Set(activeFocus.edgeKinds);
    return graph.edges.filter((edge) => {
      const kind = edge.data?.kind;
      return Boolean(kind && allowedKinds.has(kind as ClusterGraphEdgeKind));
    });
  }, [graph.edges, activeFocus.edgeKinds]);

  const visibleNodeIds = useMemo(() => {
    const visible = new Set<string>(["group-control", "group-desired", "group-workers"]);
    for (const edge of filteredEdges) {
      visible.add(edge.source);
      visible.add(edge.target);
    }
    return visible;
  }, [filteredEdges]);

  useEffect(() => {
    if (selectedNodeId && !visibleNodeIds.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, visibleNodeIds]);

  const selectedNode = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId && visibleNodeIds.has(node.id)),
    [graph.nodes, selectedNodeId, visibleNodeIds]
  );

  const relatedNodeIds = useMemo(() => {
    const related = new Set<string>();
    if (!selectedNodeId) {
      return related;
    }

    related.add(selectedNodeId);
    for (const edge of filteredEdges) {
      if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
        related.add(edge.source);
        related.add(edge.target);
      }
    }
    return related;
  }, [filteredEdges, selectedNodeId]);

  const displayNodes = useMemo(() => {
    return graph.nodes.filter((node) => visibleNodeIds.has(node.id)).map((node) => {
      const isSelected = node.id === selectedNodeId;
      const isRelated = relatedNodeIds.has(node.id);
      const shouldDim = Boolean(selectedNodeId) && !isRelated;
      return {
        ...node,
        style: {
          ...node.style,
          opacity: shouldDim ? 0.25 : 1,
          boxShadow: isSelected ? "0 0 0 3px rgba(15,139,141,0.35)" : node.style?.boxShadow
        }
      } as Node<ClusterGraphNodeData>;
    });
  }, [graph.nodes, relatedNodeIds, selectedNodeId, visibleNodeIds]);

  const displayEdges = useMemo(() => {
    return filteredEdges.map((edge) => {
      const isRelated = selectedNodeId
        ? edge.source === selectedNodeId || edge.target === selectedNodeId
        : true;
      return {
        ...edge,
        label: selectedNodeId && isRelated ? edge.label : undefined,
        style: {
          ...edge.style,
          opacity: isRelated ? 1 : 0.15
        }
      } as Edge<ClusterGraphEdgeData>;
    });
  }, [filteredEdges, selectedNodeId]);

  const onNodeClick = (_event: unknown, node: Node<ClusterGraphNodeData>) => {
    setSelectedNodeId(node.id);
  };

  return (
    <main className="page-shell">
      <header className="hero-header reveal-1">
        <div>
          <h1>Inside the Kubernetes Cluster</h1>
          <p>
            Graph view for live demo storytelling. Conceptual control-plane relationships are explicitly labeled and
            separated from live discovered resources.
          </p>
        </div>
        <div className="hero-status">
          <span className={`connection-pill connection-${connection}`}>Backend: {connection}</span>
          <span className="connection-pill">Last update: {state ? new Date(state.updated_at).toLocaleTimeString() : "n/a"}</span>
        </div>
      </header>
      <PageNav current="graph" />

      <section className="panel graph-legend-panel reveal-2">
        <h2>Graph Legend</h2>
        <div className="graph-focus-controls">
          {(["overview", "control-loop", "traffic-readiness"] as GraphFocusMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`focus-chip${focusMode === mode ? " focus-chip-active" : ""}`}
              onClick={() => setFocusMode(mode)}
            >
              {focusModeConfig[mode].label}
            </button>
          ))}
        </div>
        <p className="panel-subtitle graph-focus-note">{activeFocus.description}</p>
        <div className="graph-legend-grid">
          <span className="legend-chip legend-conceptual-node">Conceptual control-plane component</span>
          <span className="legend-chip legend-live-resource">Live desired-state resource</span>
          <span className="legend-chip legend-live-node">Live worker node</span>
          <span className="legend-chip legend-live-workload">Live pod/workload object</span>
          <span className="legend-chip legend-conceptual-edge">Conceptual control/reconciliation path</span>
          <span className="legend-chip legend-live-traffic">Live service traffic path (Ready pods)</span>
          <span className="legend-chip legend-live-blocked">Readiness blocked path (Not Ready pods)</span>
        </div>
        <p className="panel-subtitle">
          Live objects are discovered from backend state snapshots. Dashed amber control-plane edges are teaching
          relationships rather than direct process telemetry.
        </p>
      </section>

      <section className="graph-layout reveal-3">
        <div className="panel graph-canvas-panel">
          <h2>Cluster Relationship Graph</h2>
          <div className="graph-canvas">
            <ReactFlow
              key={`${displayNodes.length}-${displayEdges.length}-${focusMode}`}
              nodes={displayNodes}
              edges={displayEdges}
              fitView
              fitViewOptions={{ padding: 0.18, minZoom: 0.25, maxZoom: 1 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelectedNodeId(null)}
              minZoom={0.35}
              maxZoom={1.2}
            >
              <Background color="#d3dee8" gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </div>

        <aside className="panel graph-side-panel">
          <h2>Selection Detail</h2>
          {selectedNode ? (
            <>
              <p>
                <strong>{selectedNode.data.label}</strong>
              </p>
              <p>{selectedNode.data.detail ?? "No additional detail."}</p>
              <p>
                <strong>Source:</strong>{" "}
                {selectedNode.data.source === "conceptual" ? "Conceptual teaching model" : "Live discovered state"}
              </p>
              <ul className="graph-meta-list">
                {metadataForNode(selectedNode).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p>Select a node to inspect metadata and highlight related relationships.</p>
              <p className="panel-subtitle">
                Tip: click `Service` to highlight traffic edges, or click `kube-controller-manager` to highlight the
                reconciliation path.
              </p>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
