import { ClusterState, NodeState, PodState } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

interface TopologyViewProps {
  state: ClusterState | null;
}

function classifyPhase(phase?: string | null): "ok" | "warn" | "bad" | "neutral" {
  if (!phase) {
    return "neutral";
  }
  if (phase === "Running") {
    return "ok";
  }
  if (phase === "Pending") {
    return "warn";
  }
  return "bad";
}

function podsByNode(nodes: NodeState[], pods: PodState[]): Map<string, PodState[]> {
  const map = new Map<string, PodState[]>();
  for (const node of nodes) {
    map.set(node.name, []);
  }
  for (const pod of pods) {
    const nodeName = pod.node_name ?? "unscheduled";
    if (!map.has(nodeName)) {
      map.set(nodeName, []);
    }
    map.get(nodeName)?.push(pod);
  }
  return map;
}

export function TopologyView({ state }: TopologyViewProps) {
  if (!state) {
    return (
      <section className="panel topology-panel loading-panel">
        <h2>Topology View</h2>
        <p>Waiting for backend state.</p>
      </section>
    );
  }

  const workerNodes = state.nodes.filter((node) => node.role !== "control-plane");
  const nodeList = workerNodes.length
    ? workerNodes
    : state.nodes.length
    ? state.nodes
    : [];

  const grouped = podsByNode(nodeList, state.pods);
  const workerNodeSet = new Set(nodeList.map((node) => node.name));
  const scheduledOnWorkers = state.pods.filter((pod) => pod.node_name && workerNodeSet.has(pod.node_name)).length;

  return (
    <section className="panel topology-panel">
      <div className="panel-header-row">
        <h2>Worker Nodes</h2>
        <p className="panel-subtitle">
          Pod placement by node. Control plane and workload resource details are shown in dedicated sections.
        </p>
      </div>

      <div className="topology-grid">
        <div className="cluster-block">
          <div className="cluster-title-row">
            <h3>Cluster Topology</h3>
            <StatusBadge
              tone={nodeList.some((node) => node.ready) ? "ok" : "warn"}
              label={`${scheduledOnWorkers} Pods Scheduled`}
            />
          </div>
          <p className="cluster-meta">Namespace: {state.namespace}</p>

          {nodeList.length === 0 ? (
            <p className="muted">No worker nodes discovered yet.</p>
          ) : (
          <div className="node-columns">
            {nodeList.map((node) => {
              const pods = grouped.get(node.name) ?? [];
              return (
                <article className="node-card" key={node.name}>
                  <header className="node-header">
                    <strong>{node.name}</strong>
                    <div className="node-tags">
                      <StatusBadge tone={node.ready ? "ok" : "bad"} label={node.ready ? "Node Ready" : "Node NotReady"} />
                      <StatusBadge tone="neutral" label={node.role} />
                    </div>
                  </header>

                  <div className="pod-list">
                    {pods.length === 0 ? <p className="muted">No demo pods on this node.</p> : null}
                    {pods.map((pod) => (
                      <div key={pod.name} className="pod-chip">
                        <div className="pod-chip-top">
                          <strong>{pod.name}</strong>
                          <StatusBadge tone={classifyPhase(pod.phase)} label={pod.phase ?? "Unknown"} />
                        </div>
                        <div className="pod-chip-bottom">
                          <StatusBadge tone={pod.ready ? "ok" : "bad"} label={pod.ready ? "Ready" : "Not Ready"} />
                          <span>Restarts: {pod.restart_count}</span>
                          <span className="pod-chip-image" title={pod.image ?? undefined}>{pod.image ?? "image unavailable"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
          )}
        </div>
      </div>
    </section>
  );
}
