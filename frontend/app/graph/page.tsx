"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node, Options } from "vis-network";

import { PageNav } from "../../components/PageNav";
import { getState, subscribeToState } from "../../lib/api";
import { buildVisGraph, ClusterGraphEdgeKind, GraphNodeData } from "../../lib/visGraph";
import { ClusterState, ConnectionState } from "../../lib/types";

type GraphFocusMode = "overview" | "control-loop" | "traffic-readiness";

type NetworkInstance = import("vis-network").Network;

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
    edgeKinds: ["conceptual-control", "reconciliation", "ownership", "placement"]
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

const nodePalette: Record<
  GraphNodeData["category"],
  {
    bg: string;
    border: string;
    text: string;
    dashed: boolean;
  }
> = {
  group: {
    bg: "#f4f7fa",
    border: "#8fa5b4",
    text: "#2b4656",
    dashed: true
  },
  conceptual: {
    bg: "#fff6de",
    border: "#915f00",
    text: "#3f2b00",
    dashed: true
  },
  "live-resource": {
    bg: "#f2ecff",
    border: "#5f4a91",
    text: "#2d2050",
    dashed: false
  },
  "live-node": {
    bg: "#e8f7ef",
    border: "#2f8e63",
    text: "#164932",
    dashed: false
  },
  "live-workload": {
    bg: "#eef7ff",
    border: "#2d6f95",
    text: "#16384d",
    dashed: false
  }
};

const edgePalette: Record<
  ClusterGraphEdgeKind,
  {
    color: string;
    width: number;
    dashed: boolean;
  }
> = {
  "conceptual-control": {
    color: "#915f00",
    width: 2,
    dashed: true
  },
  reconciliation: {
    color: "#d48a00",
    width: 2,
    dashed: true
  },
  ownership: {
    color: "#2d6f95",
    width: 2,
    dashed: false
  },
  scheduling: {
    color: "#7d6f00",
    width: 2,
    dashed: true
  },
  placement: {
    color: "#1f9d6a",
    width: 2,
    dashed: false
  },
  "traffic-ready": {
    color: "#168b5f",
    width: 3,
    dashed: false
  },
  "traffic-blocked": {
    color: "#c03a2b",
    width: 2,
    dashed: true
  }
};

const networkOptions: Options = {
  autoResize: true,
  physics: {
    enabled: false
  },
  interaction: {
    dragNodes: false,
    hover: true,
    multiselect: false,
    navigationButtons: true,
    keyboard: false
  },
  layout: {
    improvedLayout: false
  },
  edges: {
    arrows: {
      to: {
        enabled: true,
        scaleFactor: 0.6
      }
    },
    smooth: {
      enabled: true,
      type: "cubicBezier",
      forceDirection: "horizontal",
      roundness: 0.28
    }
  },
  nodes: {
    shape: "box"
  }
};

function metadataForNode(node: GraphNodeData | undefined): string[] {
  if (!node) {
    return [];
  }
  return node.metadata ?? [];
}

function collectRelated(selectedNodeId: string | null, edges: { source: string; target: string; id: string }[]): {
  relatedNodeIds: Set<string>;
  relatedEdgeIds: Set<string>;
} {
  if (!selectedNodeId) {
    return {
      relatedNodeIds: new Set<string>(),
      relatedEdgeIds: new Set<string>()
    };
  }

  const relatedNodeIds = new Set<string>([selectedNodeId]);
  const relatedEdgeIds = new Set<string>();

  for (const edge of edges) {
    if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
      relatedEdgeIds.add(edge.id);
      relatedNodeIds.add(edge.source);
      relatedNodeIds.add(edge.target);
    }
  }

  return {
    relatedNodeIds,
    relatedEdgeIds
  };
}

function toVisNode(node: GraphNodeData, selectedNodeId: string | null, relatedNodeIds: Set<string>): Node {
  const palette = nodePalette[node.category];
  const isSelected = node.id === selectedNodeId;
  const hasSelection = selectedNodeId !== null;
  const isRelated = !hasSelection || relatedNodeIds.has(node.id);
  const faded = hasSelection && !isRelated;

  const background = faded ? "#f4f7f9" : palette.bg;
  const border = isSelected ? "#0f8b8d" : faded ? "#c3d1da" : palette.border;
  const text = faded ? "#8ca1ad" : palette.text;

  return {
    id: node.id,
    label: node.label,
    x: node.x,
    y: node.y,
    fixed: {
      x: true,
      y: true
    },
    physics: false,
    color: {
      background,
      border,
      highlight: {
        background,
        border: "#0f8b8d"
      },
      hover: {
        background,
        border
      }
    },
    borderWidth: isSelected ? 4 : node.isSection ? 1 : 2,
    widthConstraint: node.isSection
      ? {
          minimum: 220,
          maximum: 245
        }
      : {
          minimum: 210,
          maximum: 250
        },
    margin: node.isSection
      ? {
          top: 10,
          bottom: 10,
          left: 14,
          right: 14
        }
      : {
          top: 10,
          bottom: 10,
          left: 10,
          right: 10
        },
    font: {
      color: text,
      size: node.isSection ? 13 : 12,
      face: '"Sora", "Gill Sans", "Trebuchet MS", sans-serif',
      multi: "md"
    },
    shapeProperties: {
      borderDashes: node.isSection || palette.dashed
    }
  };
}

function toVisEdge(
  edge: {
    id: string;
    source: string;
    target: string;
    label: string;
    kind: ClusterGraphEdgeKind;
  },
  selectedNodeId: string | null,
  relatedEdgeIds: Set<string>
): Edge {
  const palette = edgePalette[edge.kind];
  const hasSelection = selectedNodeId !== null;
  const isRelated = !hasSelection || relatedEdgeIds.has(edge.id);
  const faded = hasSelection && !isRelated;

  return {
    id: edge.id,
    from: edge.source,
    to: edge.target,
    label: isRelated ? edge.label : "",
    color: faded
      ? {
          color: "#c9d6de",
          highlight: palette.color,
          hover: palette.color
        }
      : {
          color: palette.color,
          highlight: palette.color,
          hover: palette.color
        },
    dashes: faded ? true : palette.dashed,
    width: faded ? 1 : isRelated && hasSelection ? palette.width + 0.6 : palette.width,
    font: {
      size: 10,
      color: "#1e3848",
      background: "#ffffff",
      strokeWidth: 0,
      align: "horizontal"
    }
  };
}

export default function ClusterGraphPage() {
  const [state, setState] = useState<ClusterState | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<GraphFocusMode>("overview");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const networkRef = useRef<NetworkInstance | null>(null);

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

  const activeFocus = focusModeConfig[focusMode];

  const graphData = useMemo(() => {
    return buildVisGraph(state, new Set(activeFocus.edgeKinds));
  }, [state, activeFocus.edgeKinds]);

  useEffect(() => {
    if (selectedNodeId && !graphData.nodeMap[selectedNodeId]) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, graphData.nodeMap]);

  const related = useMemo(() => {
    return collectRelated(selectedNodeId, graphData.edges);
  }, [selectedNodeId, graphData.edges]);

  const visNodes = useMemo(() => {
    return graphData.nodes.map((node) => toVisNode(node, selectedNodeId, related.relatedNodeIds));
  }, [graphData.nodes, selectedNodeId, related.relatedNodeIds]);

  const visEdges = useMemo(() => {
    return graphData.edges.map((edge) => toVisEdge(edge, selectedNodeId, related.relatedEdgeIds));
  }, [graphData.edges, selectedNodeId, related.relatedEdgeIds]);

  useEffect(() => {
    let disposed = false;

    const startNetwork = async () => {
      if (!containerRef.current) {
        return;
      }

      const { Network } = await import("vis-network/standalone");

      if (disposed || !containerRef.current) {
        return;
      }

      const network = new Network(containerRef.current, { nodes: visNodes, edges: visEdges }, networkOptions);
      network.on("click", (params) => {
        if (params.nodes.length > 0) {
          setSelectedNodeId(String(params.nodes[0]));
          return;
        }
        setSelectedNodeId(null);
      });

      networkRef.current = network;
      network.fit({
        animation: false,
        minZoomLevel: 0.32,
        maxZoomLevel: 1.2
      });
    };

    startNetwork();

    return () => {
      disposed = true;
      if (networkRef.current) {
        networkRef.current.destroy();
      }
      networkRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const network = networkRef.current;
    if (!network) {
      return;
    }

    network.setData({
      nodes: visNodes,
      edges: visEdges
    });

    if (selectedNodeId) {
      network.selectNodes([selectedNodeId]);
      return;
    }
    network.unselectAll();
  }, [visNodes, visEdges, selectedNodeId]);

  const selectedNode = selectedNodeId ? graphData.nodeMap[selectedNodeId] : undefined;

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
          <button
            type="button"
            className="focus-chip"
            onClick={() => {
              networkRef.current?.fit({
                animation: {
                  duration: 250,
                  easingFunction: "easeInOutCubic"
                },
                minZoomLevel: 0.32,
                maxZoomLevel: 1.2
              });
            }}
          >
            Fit Graph
          </button>
          <button type="button" className="focus-chip" onClick={() => setSelectedNodeId(null)}>
            Clear Highlight
          </button>
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
            <div ref={containerRef} className="vis-graph" />
          </div>
        </div>

        <aside className="panel graph-side-panel">
          <h2>Selection Detail</h2>
          {selectedNode ? (
            <>
              <p>
                <strong>{selectedNode.label}</strong>
              </p>
              <p>{selectedNode.detail ?? "No additional detail."}</p>
              <p>
                <strong>Source:</strong> {selectedNode.source === "conceptual" ? "Conceptual teaching model" : "Live discovered state"}
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
