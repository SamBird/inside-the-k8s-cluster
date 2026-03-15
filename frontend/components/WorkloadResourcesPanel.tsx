import { ClusterState, PodState, ReplicaSetState, ServiceEndpointState } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

interface WorkloadResourcesPanelProps {
  state: ClusterState | null;
}

function sortPodsByAge(pods: PodState[]): PodState[] {
  return [...pods].sort((left, right) => {
    const leftCreated = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightCreated = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightCreated - leftCreated || left.name.localeCompare(right.name);
  });
}

function podsByReplicaSet(pods: PodState[]): Map<string, PodState[]> {
  const grouped = new Map<string, PodState[]>();
  for (const pod of pods) {
    if (!pod.owner_name) {
      continue;
    }
    const existing = grouped.get(pod.owner_name) ?? [];
    existing.push(pod);
    grouped.set(pod.owner_name, existing);
  }

  for (const [key, value] of grouped) {
    grouped.set(key, sortPodsByAge(value));
  }

  return grouped;
}

function replicaSetTone(replicaSet: ReplicaSetState, ownedPods: PodState[]): "ok" | "warn" | "neutral" {
  if (replicaSet.replicas === 0 && ownedPods.length === 0) {
    return "neutral";
  }
  if (replicaSet.ready_replicas === replicaSet.replicas) {
    return "ok";
  }
  return "warn";
}

function endpointTone(endpoint: ServiceEndpointState): "ok" | "warn" {
  return endpoint.ready ? "ok" : "warn";
}

function isActiveReplicaSet(replicaSet: ReplicaSetState, ownedPods: PodState[]): boolean {
  return replicaSet.replicas > 0 || replicaSet.available_replicas > 0 || ownedPods.length > 0;
}

export function WorkloadResourcesPanel({ state }: WorkloadResourcesPanelProps) {
  if (!state) {
    return (
      <section className="panel loading-panel">
        <h2>Lineage & Endpoints</h2>
        <p>Waiting for backend state.</p>
      </section>
    );
  }

  const ownedPods = podsByReplicaSet(state.pods);
  const orphanPods = sortPodsByAge(
    state.pods.filter((pod) => !pod.owner_name || !state.replica_sets.some((replicaSet) => replicaSet.name === pod.owner_name))
  );
  const activeReplicaSets = state.replica_sets.filter((replicaSet) =>
    isActiveReplicaSet(replicaSet, ownedPods.get(replicaSet.name) ?? [])
  );
  const inactiveReplicaSets = state.replica_sets.filter(
    (replicaSet) => !isActiveReplicaSet(replicaSet, ownedPods.get(replicaSet.name) ?? [])
  );
  const readyPods = state.pods.filter((pod) => pod.ready).length;
  const readyEndpoints = state.service_endpoints.filter((endpoint) => endpoint.ready);
  const blockedEndpoints = state.service_endpoints.filter((endpoint) => !endpoint.ready);

  return (
    <section className="panel lineage-panel reveal-4">
      <div className="panel-header-row">
        <h2>Lineage & Endpoints</h2>
        <p className="panel-subtitle">
          Live Deployment -&gt; ReplicaSet -&gt; Pod ownership plus the exact Service endpoints Kubernetes is exposing now.
        </p>
      </div>

      <div className="resource-grid lineage-summary-grid">
        <article className="resource-card">
          <div className="resource-card-header">
            <h3>Deployment</h3>
            <StatusBadge tone={state.deployment.exists ? "ok" : "warn"} label={state.deployment.exists ? "Present" : "Missing"} />
          </div>
          <p>Name: {state.deployment.name}</p>
          <p>Desired replicas: {state.deployment.replicas}</p>
          <p>Ready replicas: {state.deployment.ready_replicas}</p>
        </article>

        <article className="resource-card">
          <div className="resource-card-header">
            <h3>ReplicaSets</h3>
            <StatusBadge tone={state.replica_sets.length > 0 ? "ok" : "neutral"} label={`${state.replica_sets.length} observed`} />
          </div>
          <p>{activeReplicaSets.length || 0} active in the current path.</p>
          <p>Older ones matter mainly when explaining rollouts.</p>
        </article>

        <article className="resource-card">
          <div className="resource-card-header">
            <h3>Pods</h3>
            <StatusBadge tone={readyPods === state.pods.length ? "ok" : "warn"} label={`${readyPods}/${state.pods.length} ready`} />
          </div>
          <p>Total demo pods: {state.pods.length}</p>
          <p>Pods still running old ReplicaSets stay visible here during rollout.</p>
        </article>

        <article className="resource-card">
          <div className="resource-card-header">
            <h3>Service Endpoints</h3>
            <StatusBadge tone={readyEndpoints.length > 0 ? "ok" : "warn"} label={`${readyEndpoints.length} ready`} />
          </div>
          <p>Blocked endpoints: {blockedEndpoints.length}</p>
          <p>Service: {state.service.name}</p>
          <p>ClusterIP: {state.service.cluster_ip ?? "n/a"}</p>
        </article>
      </div>

      <div className="lineage-layout">
        <article className="lineage-card">
          <div className="resource-card-header">
            <h3>Current Ownership Path</h3>
            <StatusBadge
              tone={activeReplicaSets.length > 0 ? "ok" : "neutral"}
              label={`${activeReplicaSets.length || 0} active ${activeReplicaSets.length === 1 ? "path" : "paths"}`}
            />
          </div>
          <p className="replicaset-meta">
            Start here for the simple story: the Deployment owns the active ReplicaSet, and that ReplicaSet creates the running Pods.
          </p>

          <div className="lineage-root">
            <div className="lineage-step-card lineage-step-root">
              <div className="resource-card-header">
                <strong>{state.deployment.name}</strong>
                <StatusBadge tone={state.deployment.exists ? "ok" : "warn"} label="Deployment" />
              </div>
              <p className="muted">This is the desired state object. It owns the ReplicaSet that should create the running Pods.</p>
            </div>

            <div className="ownership-arrow-chip">owns</div>

            {activeReplicaSets.length === 0 ? (
              <div className="lineage-empty">
                <p className="muted">No active ReplicaSet is creating Pods yet.</p>
              </div>
            ) : (
              <div className="ownership-branch-list">
                {activeReplicaSets.map((replicaSet) => {
                  const pods = ownedPods.get(replicaSet.name) ?? [];
                  const tone = replicaSetTone(replicaSet, pods);
                  return (
                    <article className="ownership-branch" key={replicaSet.name}>
                      <div className="lineage-step-card ownership-step-card">
                        <div className="resource-card-header">
                          <strong>{replicaSet.name}</strong>
                          <div className="lineage-badges">
                            <StatusBadge tone={tone} label={`${replicaSet.ready_replicas}/${replicaSet.replicas} ready`} />
                          </div>
                        </div>
                        <p className="replicaset-meta">
                          ReplicaSet {replicaSet.revision ? `rev ${replicaSet.revision}` : ""} running image{" "}
                          {replicaSet.image ?? "unknown"}.
                        </p>
                      </div>

                      <div className="ownership-arrow-chip">creates</div>

                      <div className="lineage-pod-list">
                        {pods.length === 0 ? <p className="muted">No live Pods currently owned by this ReplicaSet.</p> : null}
                        <div className="ownership-pod-grid">
                          {pods.map((pod) => (
                            <div className="lineage-pod-pill ownership-pod-pill" key={pod.name}>
                              <div className="resource-card-header">
                                <strong>{pod.name}</strong>
                                <div className="lineage-badges">
                                  <StatusBadge tone={pod.ready ? "ok" : "warn"} label={pod.ready ? "Ready" : "Not Ready"} />
                                  <StatusBadge tone={pod.phase === "Running" ? "ok" : "warn"} label={pod.phase ?? "Unknown"} />
                                </div>
                              </div>
                              <p className="replicaset-meta">Node: {pod.node_name ?? "pending"}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {inactiveReplicaSets.length > 0 ? (
              <div className="lineage-history">
                <div className="resource-card-header">
                  <h4>Older ReplicaSets</h4>
                  <StatusBadge tone="neutral" label={`${inactiveReplicaSets.length} kept for rollouts`} />
                </div>
                <p className="muted">You can mostly ignore these in the first demo. They matter when explaining rollout history.</p>
                <div className="lineage-history-list">
                  {inactiveReplicaSets.map((replicaSet) => (
                    <div className="lineage-history-row" key={replicaSet.name}>
                      <strong>{replicaSet.name}</strong>
                      <span className="lineage-history-meta">
                        {replicaSet.revision ? `rev ${replicaSet.revision}` : "rev ?"} | {replicaSet.image ?? "unknown"}
                      </span>
                      <StatusBadge tone="neutral" label={`${replicaSet.ready_replicas}/${replicaSet.replicas} ready`} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {orphanPods.length > 0 ? (
              <div className="lineage-empty">
                <strong>Pods without a discovered ReplicaSet owner</strong>
                <p className="muted">{orphanPods.map((pod) => pod.name).join(", ")}</p>
              </div>
            ) : null}
          </div>
        </article>

        <article className="lineage-card">
          <div className="resource-card-header">
            <h3>Service Endpoint Set</h3>
            <StatusBadge tone={state.service.exists ? "ok" : "warn"} label={state.service.exists ? "Service Present" : "Service Missing"} />
          </div>

          <p className="replicaset-meta">
            Ports: {state.service.ports.map((port) => `${port.port}/${port.protocol}`).join(", ") || "n/a"} | Ready endpoints:{" "}
            {readyEndpoints.length} | Blocked endpoints: {blockedEndpoints.length}
          </p>

          <div className="endpoint-list">
            {state.service_endpoints.length === 0 ? (
              <div className="endpoint-row endpoint-row-empty">
                <strong>No endpoints published right now.</strong>
                <p className="muted">This happens when the Service is missing or no pods are passing readiness.</p>
              </div>
            ) : null}

            {state.service_endpoints.map((endpoint) => (
              <div className="endpoint-row" key={`${endpoint.pod_name ?? endpoint.ip}-${endpoint.ready ? "ready" : "blocked"}`}>
                <div className="resource-card-header">
                  <strong>{endpoint.pod_name ?? endpoint.ip}</strong>
                  <StatusBadge tone={endpointTone(endpoint)} label={endpoint.ready ? "Traffic Allowed" : "Blocked"} />
                </div>
                <p className="replicaset-meta">
                  IP: {endpoint.ip} | Node: {endpoint.node_name ?? "unknown"} | Target: {endpoint.target_ref_kind ?? "unknown"}
                </p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
