"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { Core as CytoscapeCore, CytoscapeOptions, LayoutOptions } from "cytoscape";

import { PageNav } from "../../components/PageNav";
import { getState, subscribeToState } from "../../lib/api";
import {
  buildClusterGraph,
  ClusterGraphEdgeData,
  ClusterGraphEdgeKind,
  ClusterGraphNodeData
} from "../../lib/clusterGraph";
import { ClusterState, ConnectionState } from "../../lib/types";

type GraphFocusMode = "overview" | "control-loop" | "traffic-readiness";

type GraphModel = {
  nodes: Node<ClusterGraphNodeData>[];
  edges: Edge<ClusterGraphEdgeData>[];
};

type CytoscapeElement = {
  data: Record<string, string | number | boolean>;
  position?: { x: number; y: number };
  classes?: string;
};

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

function metadataForNode(node: Node<ClusterGraphNodeData> | undefined): string[] {
  if (!node) {
    return [];
  }
  return node.data.metadata ?? [];
}

function nodeHeight(category: ClusterGraphNodeData["category"]): number {
  if (category === "group") {
    return 36;
  }
  if (category === "live-workload") {
    return 72;
  }
  return 68;
}

function numericWidth(node: Node<ClusterGraphNodeData>): number {
  const width = node.style?.width;
  if (typeof width === "number") {
    return width;
  }
  if (typeof width === "string") {
    const parsed = Number(width.replace("px", ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 220;
}

function edgeClass(kind: ClusterGraphEdgeKind): string {
  return `edge-${kind}`;
}

export default function ClusterGraphPage() {
  const [state, setState] = useState<ClusterState | null>(null);
  const [graph, setGraph] = useState<GraphModel>({ nodes: [], edges: [] });
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<GraphFocusMode>("overview");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<CytoscapeCore | null>(null);

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

  const relatedEdgeIds = useMemo(() => {
    const related = new Set<string>();
    if (!selectedNodeId) {
      return related;
    }
    for (const edge of filteredEdges) {
      if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
        related.add(edge.id);
      }
    }
    return related;
  }, [filteredEdges, selectedNodeId]);

  const elements = useMemo(() => {
    const nextElements: CytoscapeElement[] = [];

    for (const node of graph.nodes) {
      if (!visibleNodeIds.has(node.id)) {
        continue;
      }

      const isSelected = node.id === selectedNodeId;
      const isRelated = selectedNodeId ? relatedNodeIds.has(node.id) : true;
      const isFaded = Boolean(selectedNodeId) && !isRelated;
      const width = numericWidth(node);
      const height = nodeHeight(node.data.category);

      const classes = [
        "graph-node",
        `node-${node.data.category}`,
        `source-${node.data.source}`,
        isSelected ? "is-selected" : "",
        isFaded ? "is-faded" : ""
      ]
        .filter(Boolean)
        .join(" ");

      nextElements.push({
        data: {
          id: node.id,
          label: node.data.label,
          width,
          height
        },
        position: {
          x: node.position.x + width / 2,
          y: node.position.y + height / 2
        },
        classes
      });
    }

    for (const edge of filteredEdges) {
      const kind = (edge.data?.kind ?? "ownership") as ClusterGraphEdgeKind;
      const isRelated = selectedNodeId ? relatedEdgeIds.has(edge.id) : true;
      const isFaded = Boolean(selectedNodeId) && !isRelated;
      const edgeLabel =
        typeof edge.label === "string" || typeof edge.label === "number" ? String(edge.label) : "";

      const classes = [
        "graph-edge",
        edgeClass(kind),
        selectedNodeId && isRelated ? "edge-show-label" : "",
        isFaded ? "is-faded" : ""
      ]
        .filter(Boolean)
        .join(" ");

      nextElements.push({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edgeLabel,
          kind
        },
        classes
      });
    }

    return nextElements;
  }, [graph.nodes, filteredEdges, visibleNodeIds, selectedNodeId, relatedEdgeIds, relatedNodeIds]);

  useEffect(() => {
    let disposed = false;
    let instance: CytoscapeCore | null = null;

    const renderGraph = async () => {
      if (!containerRef.current) {
        return;
      }

      const cytoscape = (await import("cytoscape")).default;

      if (disposed || !containerRef.current) {
        return;
      }

      const style: CytoscapeOptions["style"] = [
        {
          selector: "node",
          style: {
            label: "data(label)",
            width: "data(width)",
            height: "data(height)",
            shape: "round-rectangle",
            "border-width": 2,
            "border-color": "#45687d",
            "text-wrap": "wrap",
            "text-max-width": "200px",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 13,
            "font-weight": 700,
            color: "#183240",
            "background-color": "#eef7ff"
          }
        },
        {
          selector: "node.node-group",
          style: {
            shape: "round-rectangle",
            "border-width": 0,
            "background-opacity": 0,
            "font-size": 16,
            "font-weight": 800,
            color: "#1b3a4b",
            "text-wrap": "wrap",
            "text-max-width": "260px"
          }
        },
        {
          selector: "node.node-conceptual",
          style: {
            "background-color": "#fff6de",
            "border-color": "#915f00",
            "border-style": "dashed"
          }
        },
        {
          selector: "node.node-live-resource",
          style: {
            "background-color": "#f2ecff",
            "border-color": "#5f4a91"
          }
        },
        {
          selector: "node.node-live-node",
          style: {
            "background-color": "#e8f7ef",
            "border-color": "#2f8e63"
          }
        },
        {
          selector: "node.node-live-workload",
          style: {
            "background-color": "#eef7ff",
            "border-color": "#2d6f95"
          }
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "curve-style": "bezier",
            "control-point-step-size": 44,
            "line-color": "#2d6f95",
            "target-arrow-color": "#2d6f95",
            "target-arrow-shape": "triangle",
            label: "",
            color: "#173041",
            "font-size": 10,
            "text-background-color": "#ffffff",
            "text-background-opacity": 0.94,
            "text-background-padding": "3px",
            "text-border-opacity": 0
          }
        },
        {
          selector: "edge.edge-show-label",
          style: {
            label: "data(label)"
          }
        },
        {
          selector: "edge.edge-conceptual-control",
          style: {
            "line-color": "#915f00",
            "target-arrow-color": "#915f00",
            "line-style": "dashed"
          }
        },
        {
          selector: "edge.edge-reconciliation",
          style: {
            "line-color": "#d48a00",
            "target-arrow-color": "#d48a00",
            "line-style": "dashed"
          }
        },
        {
          selector: "edge.edge-scheduling",
          style: {
            "line-color": "#7d6f00",
            "target-arrow-color": "#7d6f00",
            "line-style": "dashed"
          }
        },
        {
          selector: "edge.edge-placement",
          style: {
            "line-color": "#1f9d6a",
            "target-arrow-color": "#1f9d6a"
          }
        },
        {
          selector: "edge.edge-traffic-ready",
          style: {
            width: 2.8,
            "line-color": "#168b5f",
            "target-arrow-color": "#168b5f"
          }
        },
        {
          selector: "edge.edge-traffic-blocked",
          style: {
            "line-color": "#c03a2b",
            "target-arrow-color": "#c03a2b",
            "line-style": "dashed"
          }
        },
        {
          selector: ".is-selected",
          style: {
            "border-width": 4,
            "border-color": "#0f8b8d"
          }
        },
        {
          selector: ".is-faded",
          style: {
            opacity: 0.2
          }
        }
      ];

      const layout = {
        name: "preset",
        fit: false,
        padding: 24
      } as LayoutOptions;

      instance = cytoscape({
        container: containerRef.current,
        elements,
        style,
        layout
      });

      instance.on("tap", "node", (event) => {
        const target = event.target;
        const id = String(target.id());
        setSelectedNodeId(id.startsWith("group-") ? null : id);
      });

      instance.on("tap", (event) => {
        if (event.target === instance) {
          setSelectedNodeId(null);
        }
      });

      cyRef.current = instance;
      instance.fit(instance.nodes(), 24);
      instance.center();
    };

    renderGraph();

    return () => {
      disposed = true;
      if (instance) {
        instance.destroy();
      }
      if (cyRef.current === instance) {
        cyRef.current = null;
      }
    };
  }, [elements]);

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
              const instance = cyRef.current;
              if (!instance) {
                return;
              }
              instance.fit(instance.nodes(), 24);
              instance.center();
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
            <div ref={containerRef} className="cy-graph" />
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
                <strong>Source:</strong> {selectedNode.data.source === "conceptual" ? "Conceptual teaching model" : "Live discovered state"}
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
