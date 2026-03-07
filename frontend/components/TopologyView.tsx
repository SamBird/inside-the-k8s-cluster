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

  const nodeList = state.nodes.length
    ? state.nodes
    : [
        {
          name: "worker (pending discovery)",
          role: "worker",
          ready: false,
          kubelet_version: null
        }
      ];

  const grouped = podsByNode(nodeList, state.pods);
  const readyPods = state.pods.filter((pod) => pod.ready).length;

  return (
    <section className="panel topology-panel">
      <div className="panel-header-row">
        <h2>Topology View</h2>
        <p className="panel-subtitle">
          Readiness controls Service endpoints. Unready pods can still run but should not receive traffic.
        </p>
      </div>

      <div className="topology-grid">
        <div className="cluster-block">
          <div className="cluster-title-row">
            <h3>Cluster</h3>
            <StatusBadge
              tone={state.deployment.exists ? "ok" : "warn"}
              label={state.deployment.exists ? "Deployment Present" : "Deployment Missing"}
            />
          </div>
          <p className="cluster-meta">Namespace: {state.namespace}</p>

          <div className="service-box">
            <h4>Service: {state.service.name}</h4>
            <p>
              Type: {state.service.type ?? "unknown"} | Ready endpoints: {readyPods}/{state.pods.length}
            </p>
            <p>Cluster IP: {state.service.cluster_ip ?? "n/a"}</p>
          </div>

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
                          <span>{pod.image ?? "image unavailable"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
