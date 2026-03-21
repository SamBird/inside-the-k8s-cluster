import { ClusterState, PodState, ReplicaSetState } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

interface WorkloadResourcesPanelProps {
  state: ClusterState | null;
}

function podsByReplicaSet(pods: PodState[]): Map<string, PodState[]> {
  const grouped = new Map<string, PodState[]>();
  for (const pod of pods) {
    if (!pod.owner_name) continue;
    const existing = grouped.get(pod.owner_name) ?? [];
    existing.push(pod);
    grouped.set(pod.owner_name, existing);
  }
  return grouped;
}

function replicaSetTone(replicaSet: ReplicaSetState, ownedPods: PodState[]): "ok" | "warn" | "neutral" {
  if (replicaSet.replicas === 0 && ownedPods.length === 0) return "neutral";
  if (replicaSet.ready_replicas === replicaSet.replicas) return "ok";
  return "warn";
}

function isActiveReplicaSet(replicaSet: ReplicaSetState, ownedPods: PodState[]): boolean {
  return replicaSet.replicas > 0 || replicaSet.available_replicas > 0 || ownedPods.length > 0;
}

export function WorkloadResourcesPanel({ state }: WorkloadResourcesPanelProps) {
  if (!state) {
    return (
      <section className="panel loading-panel">
        <h2>Ownership</h2>
        <p>Waiting for backend state.</p>
      </section>
    );
  }

  const ownedPods = podsByReplicaSet(state.pods);
  const activeReplicaSets = state.replica_sets.filter((rs) =>
    isActiveReplicaSet(rs, ownedPods.get(rs.name) ?? [])
  );

  return (
    <section className="panel lineage-panel reveal-4">
      <div className="panel-header-row">
        <h2>Ownership</h2>
        <p className="panel-subtitle">Deployment → ReplicaSet → Pod</p>
      </div>

      <div className="lineage-root">
        <div className="lineage-step-card lineage-step-root">
          <div className="resource-card-header">
            <strong>{state.deployment.name}</strong>
            <StatusBadge tone={state.deployment.exists ? "ok" : "warn"} label="Deployment" />
          </div>
        </div>

        <div className="ownership-arrow-chip">owns</div>

        {activeReplicaSets.length === 0 ? (
          <div className="lineage-empty">
            <p className="muted">No active ReplicaSet yet.</p>
          </div>
        ) : (
          <div className="ownership-branch-list">
            {activeReplicaSets.map((rs) => {
              const pods = ownedPods.get(rs.name) ?? [];
              return (
                <article className="ownership-branch" key={rs.name}>
                  <div className="lineage-step-card ownership-step-card">
                    <div className="resource-card-header">
                      <strong>{rs.name}</strong>
                      <StatusBadge tone={replicaSetTone(rs, pods)} label={`${rs.ready_replicas}/${rs.replicas} ready`} />
                    </div>
                    <p className="replicaset-meta">
                      {rs.revision ? `rev ${rs.revision} · ` : ""}{rs.image ?? "unknown"}
                    </p>
                  </div>

                  <div className="ownership-arrow-chip">creates</div>

                  <div className="ownership-pod-grid">
                    {pods.length === 0 ? (
                      <p className="muted">No pods yet.</p>
                    ) : (
                      pods.map((pod) => (
                        <div className="lineage-pod-pill ownership-pod-pill" key={pod.name}>
                          <div className="resource-card-header">
                            <strong>{pod.name}</strong>
                            <StatusBadge tone={pod.ready ? "ok" : "warn"} label={pod.ready ? "Ready" : "Not Ready"} />
                          </div>
                          <p className="replicaset-meta">{pod.node_name ?? "pending"}</p>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
