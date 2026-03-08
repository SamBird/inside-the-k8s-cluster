"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  ReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { PageNav } from "../../components/PageNav";
import { getState, subscribeToState } from "../../lib/api";
import {
  buildClusterGraph,
  ClusterGraphEdgeData,
  ClusterGraphNodeData
} from "../../lib/clusterGraph";
import { ClusterState, ConnectionState } from "../../lib/types";

function metadataForNode(node: Node<ClusterGraphNodeData> | undefined): string[] {
  if (!node) {
    return [];
  }
  return node.data.metadata ?? [];
}

export default function ClusterGraphPage() {
  const [state, setState] = useState<ClusterState | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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

  const graph = useMemo(() => buildClusterGraph(state), [state]);

  const selectedNode = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId),
    [graph.nodes, selectedNodeId]
  );

  const relatedNodeIds = useMemo(() => {
    const related = new Set<string>();
    if (!selectedNodeId) {
      return related;
    }

    related.add(selectedNodeId);
    for (const edge of graph.edges) {
      if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
        related.add(edge.source);
        related.add(edge.target);
      }
    }
    return related;
  }, [graph.edges, selectedNodeId]);

  const displayNodes = useMemo(() => {
    return graph.nodes.map((node) => {
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
  }, [graph.nodes, relatedNodeIds, selectedNodeId]);

  const displayEdges = useMemo(() => {
    return graph.edges.map((edge) => {
      const isRelated = selectedNodeId
        ? edge.source === selectedNodeId || edge.target === selectedNodeId
        : true;
      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: isRelated ? 1 : 0.15
        }
      } as Edge<ClusterGraphEdgeData>;
    });
  }, [graph.edges, selectedNodeId]);

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
              nodes={displayNodes}
              edges={displayEdges}
              fitView
              fitViewOptions={{ padding: 0.16, minZoom: 0.4, maxZoom: 1.2 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelectedNodeId(null)}
              minZoom={0.35}
              maxZoom={1.5}
            >
              <Background color="#d3dee8" gap={20} />
              <MiniMap pannable zoomable />
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
